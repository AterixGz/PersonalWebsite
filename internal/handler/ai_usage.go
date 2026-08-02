package handler

import (
	"encoding/json"
	"net/http"

	"github.com/AterixGz/PersonalWebsite/internal/model"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

func HandleListAIUsage(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		items, err := st.ListAIUsage()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if items == nil {
			items = []model.AIUsageItem{}
		}
		json.NewEncoder(w).Encode(items)
	}
}

func HandleSaveAIUsage(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var item model.AIUsageItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, "Invalid request payload", http.StatusBadRequest)
			return
		}
		if item.ID == "" || item.Name == "" {
			http.Error(w, "ID and Name are required", http.StatusBadRequest)
			return
		}
		if err := st.UpsertAIUsage(item); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"item":    item,
		})
	}
}
