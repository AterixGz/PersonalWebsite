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

const (
	googleHealthAPI         = "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints"
	googleHealthDistanceAPI = "https://health.googleapis.com/v4/users/me/dataTypes/distance/dataPoints"
)

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

// GET /api/runquest/runs?user=... → รายการวิ่งทั้งหมด (ย้อนหลัง)
func HandleRunQuestRuns(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runs, err := st.ListRunQuestRuns(1000)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"runs": runs})
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

		// ดึง exercise ตั้งแต่ 1 ปีที่แล้ว — paginate ให้ครบทุกหน้า (API ตัดหน้าแรกแค่ 25 จุด)
		from := time.Now().AddDate(-1, 0, 0).Format("2006-01-02T15:04:05")
		type exPt struct {
			Exercise struct {
				Interval struct {
					StartTime string `json:"startTime"`
					EndTime   string `json:"endTime"`
				} `json:"interval"`
				ExerciseType string `json:"exerciseType"`
				Metrics      struct {
					CaloriesKcal  float64 `json:"caloriesKcal"`
					AvgHR         string  `json:"averageHeartRateBeatsPerMinute"`
					ActiveZoneMin string  `json:"activeZoneMinutes"`
				} `json:"metricsSummary"`
			} `json:"exercise"`
		}
		var allEx []exPt
		pageToken := ""
		for {
			eq := url.Values{}
			eq.Set("filter", `exercise.interval.civil_start_time >= "`+from+`"`)
			eu := googleHealthAPI + "?" + eq.Encode()
			if pageToken != "" {
				eu += "&pageToken=" + url.QueryEscape(pageToken)
			}
			eReq, _ := http.NewRequest("GET", eu, nil)
			eReq.Header.Set("Authorization", "Bearer "+token)
			eReq.Header.Set("Accept", "application/json")
			eResp, err := http.DefaultClient.Do(eReq)
			if err != nil {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "เชื่อม Google Health ไม่ได้: " + err.Error()})
				return
			}
			eRaw, _ := io.ReadAll(eResp.Body)
			eResp.Body.Close()
			if eResp.StatusCode != 200 {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "Google Health API (HTTP " + strconv.Itoa(eResp.StatusCode) + "): " + string(eRaw)})
				return
			}
			var ep struct {
				DataPoints    []exPt `json:"dataPoints"`
				NextPageToken string `json:"nextPageToken"`
			}
			if err := json.Unmarshal(eRaw, &ep); err != nil {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "parse Google Health response ล้มเหลว"})
				return
			}
			allEx = append(allEx, ep.DataPoints...)
			if ep.NextPageToken == "" || len(allEx) > 50000 {
				break
			}
			pageToken = ep.NextPageToken
		}

		// ดึง distance dataPoints (Google Health เก็บระยะทางแยก data type) — paginate
		// มีหลายแหล่งซ้อนกัน (นาฬิกา + Apple Health passive) → ต้องเลือกแหล่งที่ถูกต้อง กันนับซ้ำ
		type distPt struct {
			Start  time.Time
			End    time.Time
			Mm     float64
			Source string
			Method string
		}
		distPts := []distPt{}
		pageToken = ""
		for {
			dq := url.Values{}
			dq.Set("filter", `distance.interval.civil_start_time >= "`+from+`"`)
			du := googleHealthDistanceAPI + "?" + dq.Encode()
			if pageToken != "" {
				du += "&pageToken=" + url.QueryEscape(pageToken)
			}
			dreq, _ := http.NewRequest("GET", du, nil)
			dreq.Header.Set("Authorization", "Bearer "+token)
			dreq.Header.Set("Accept", "application/json")
			dresp, err := http.DefaultClient.Do(dreq)
			if err != nil {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "ดึง distance ไม่ได้: " + err.Error()})
				return
			}
			draw, _ := io.ReadAll(dresp.Body)
			dresp.Body.Close()
			if dresp.StatusCode != 200 {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "Google Health distance API (HTTP " + strconv.Itoa(dresp.StatusCode) + "): " + string(draw)})
				return
			}
			var dparsed struct {
				DataPoints []struct {
					DataSource struct {
						RecordingMethod string `json:"recordingMethod"`
						Application     struct {
							PackageName string `json:"packageName"`
						} `json:"application"`
					} `json:"dataSource"`
					Distance struct {
						Interval struct {
							StartTime string `json:"startTime"`
							EndTime   string `json:"endTime"`
						} `json:"interval"`
						Millimeters string `json:"millimeters"`
					} `json:"distance"`
				} `json:"dataPoints"`
				NextPageToken string `json:"nextPageToken"`
			}
			if err := json.Unmarshal(draw, &dparsed); err != nil {
				writeJSON(w, http.StatusBadGateway, map[string]any{"error": "parse distance response ล้มเหลว"})
				return
			}
			for _, dp := range dparsed.DataPoints {
				s, err1 := time.Parse(time.RFC3339, dp.Distance.Interval.StartTime)
				e, err2 := time.Parse(time.RFC3339, dp.Distance.Interval.EndTime)
				if err1 != nil || err2 != nil {
					continue
				}
				mm, _ := strconv.ParseFloat(dp.Distance.Millimeters, 64)
				distPts = append(distPts, distPt{
					Start: s, End: e, Mm: mm,
					Source: dp.DataSource.Application.PackageName,
					Method: dp.DataSource.RecordingMethod,
				})
			}
			if dparsed.NextPageToken == "" || len(distPts) > 50000 {
				break
			}
			pageToken = dparsed.NextPageToken
		}

		// เลือกแหล่ง distance: ใช้นาฬิกา/อุปกรณ์ (ไม่ใช่ PASSIVELY_MEASURED) ก่อน
		// เพราะ Apple Health passive วัดทั้งวัน รวมเดินก่อน/หลังวิ่ง → นับเกิน
		preferredSource := ""
		for _, d := range distPts {
			if d.Method != "PASSIVELY_MEASURED" && d.Source != "" {
				preferredSource = d.Source
				break
			}
		}

		// รวมระยะทางของ distance points ที่ทับซ้อนกับช่วงวิ่งของแต่ละ exercise
		var runs []model.RunQuestRun
		for _, dp := range allEx {
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
			var km float64
			for _, d := range distPts {
				if preferredSource != "" && d.Source != preferredSource {
					continue
				}
				if d.End.After(start) && d.Start.Before(end) { // ช่วงทับซ้อน
					km += d.Mm / 1_000_000
				}
			}
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

