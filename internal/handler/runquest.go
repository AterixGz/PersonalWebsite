package handler

import (
	"encoding/json"
	"net/http"

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
