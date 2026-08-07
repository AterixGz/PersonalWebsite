package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/config"
	"github.com/AterixGz/PersonalWebsite/internal/model"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

// HandleRunQuestSync รับข้อมูลการวิ่งจาก iOS Shortcut (Apple Health) หรือเพิ่มด้วยมือในเว็บ
// - ถ้าส่ง header X-RunQuest-Key: ต้องตรงกับ key (ใช้จาก Shortcut)
// - ถ้าไม่ส่ง key: อนุญาต (เพิ่มด้วยมือจากหน้าเว็บ)
func HandleRunQuestSync(st *store.Store, apiKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-RunQuest-Key")
		if key != "" && key != apiKey {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid api key"})
			return
		}
		var req model.RunQuestSyncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		if err := st.AddRunQuestRuns(req.Runs); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(req.Runs)})
	}
}

// HandleRunQuestStats ส่งสถิติรวมที่คำนวณจากข้อมูลจริง
func HandleRunQuestStats(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		stats, err := st.GetRunQuestStats()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, stats)
	}
}

// --- Google Health API (health.googleapis.com — Fitbit Web API รุ่นใหม่) ---

const googleHealthAPI = "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints"

// GET /api/runquest/health/connect?user=... → redirect ไป Google OAuth (googlehealth scope)
func HandleRunQuestHealthConnect(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.GoogleClientID == "" || cfg.GoogleClientSecret == "" {
			http.Error(w, "Google OAuth not configured", http.StatusServiceUnavailable)
			return
		}
		u := userEmail(r)
		params := url.Values{}
		params.Set("client_id", cfg.GoogleClientID)
		params.Set("redirect_uri", cfg.GoogleRedirectURI)
		params.Set("response_type", "code")
		params.Set("scope", googleHealthScopes)
		params.Set("access_type", "offline")
		params.Set("prompt", "consent")
		params.Set("state", "health:"+u)
		http.Redirect(w, r, googleAuthURL+"?"+params.Encode(), http.StatusFound)
	}
}

// GET /api/runquest/health/status?user=... → {connected: bool}
func HandleRunQuestHealthStatus(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		_, err := st.GetOAuthToken("google_health", u)
		writeJSON(w, http.StatusOK, map[string]bool{"connected": err == nil})
	}
}

// GET /api/runquest/health/disconnect?user=... → ลบ token (ยกเลิกการเชื่อมต่อ)
func HandleRunQuestHealthDisconnect(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		st.DeleteOAuthToken("google_health", u)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

// GET /api/runquest/health/sync?user=... → ดึง exercise (Running) จาก Google Health API แล้ว import
func HandleRunQuestHealthSync(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		token, err := googleProviderAccessToken(st, cfg, u, "google_health")
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "ยังไม่ได้เชื่อม Google Health — กด 'เชื่อม Google Health' ก่อน"})
			return
		}

		// ดึง exercise ตั้งแต่ 1 ปีที่แล้ว (URL-encode filter ให้ถูกต้อง)
		from := time.Now().AddDate(-1, 0, 0).Format("2006-01-02T15:04:05")
		q := url.Values{}
		q.Set("filter", `exercise.interval.civil_start_time >= "`+from+`"`)
		req, _ := http.NewRequest("GET", googleHealthAPI+"?"+q.Encode(), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "เชื่อม Google Health ไม่ได้: " + err.Error()})
			return
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 200 {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "Google Health API (HTTP " + strconv.Itoa(resp.StatusCode) + "): " + string(raw)})
			return
		}

		var parsed struct {
			DataPoints []struct {
				Exercise struct {
					Interval struct {
						StartTime string `json:"startTime"`
						EndTime   string `json:"endTime"`
					} `json:"interval"`
					ExerciseType string `json:"exerciseType"`
					Metrics      struct {
						CaloriesKcal     float64 `json:"caloriesKcal"`
						DistanceMm       float64 `json:"distanceMillimiters"`
						AvgHR            string  `json:"averageHeartRateBeatsPerMinute"`
						ActiveZoneMin    string  `json:"activeZoneMinutes"`
					} `json:"metricsSummary"`
				} `json:"exercise"`
			} `json:"dataPoints"`
		}
		if err := json.Unmarshal(raw, &parsed); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "parse Google Health response ล้มเหลว"})
			return
		}

		var runs []model.RunQuestRun
		for _, dp := range parsed.DataPoints {
			ex := dp.Exercise
			if !strings.Contains(strings.ToUpper(ex.ExerciseType), "RUN") {
				continue
			}
			start, err := time.Parse(time.RFC3339, ex.Interval.StartTime)
			if err != nil {
				continue
			}
			end, err := time.Parse(time.RFC3339, ex.Interval.EndTime)
			if err != nil {
				continue
			}
			km := ex.Metrics.DistanceMm / 1_000_000
			dur := end.Sub(start).Seconds()
			if km <= 0 || dur <= 0 {
				continue
			}
			hr := 0.0
			if ex.Metrics.AvgHR != "" {
				if v, err := strconv.ParseFloat(ex.Metrics.AvgHR, 64); err == nil {
					hr = v
				}
			}
			runs = append(runs, model.RunQuestRun{
				StartDate:   start.UTC().Format(time.RFC3339),
				DistanceKm:  km,
				DurationSec: dur,
				Calories:    ex.Metrics.CaloriesKcal,
				AvgHR:       hr,
			})
		}

		imported, skipped, err := st.ImportRunQuestRuns(runs)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "imported": imported, "skipped": skipped, "found": len(runs)})
	}
}

