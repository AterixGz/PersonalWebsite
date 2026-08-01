package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/AterixGz/PersonalWebsite/internal/model"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

func HandleChat(st *store.Store, openclawURL, modelName string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req model.ChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := st.SaveChatMessage("user", req.Message); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		hist, err := st.GetChatHistory(20)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		type OMessage struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}

		var messages []OMessage
		for _, m := range hist {
			messages = append(messages, OMessage{Role: m.Role, Content: m.Content})
		}

		payload := map[string]any{
			"model":    modelName,
			"messages": messages,
			"stream":   true,
		}
		payloadBytes, _ := json.Marshal(payload)

		resp, err := http.Post(fmt.Sprintf("%s/api/chat", openclawURL), "application/json", bytes.NewBuffer(payloadBytes))
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "ขออภัย AI ไม่พร้อมให้บริการในขณะนี้",
			})
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		var fullResponse strings.Builder
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			var chunk struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
				Done bool `json:"done"`
			}
			
			if err := json.Unmarshal([]byte(line), &chunk); err == nil {
				content := chunk.Message.Content
				if content != "" {
					fullResponse.WriteString(content)
					sseData, _ := json.Marshal(map[string]string{"content": content})
					fmt.Fprintf(w, "data: %s\n\n", sseData)
					flusher.Flush()
				}
			}
		}

		st.SaveChatMessage("assistant", fullResponse.String())
	}
}

func HandleChatHistory(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limitStr := r.URL.Query().Get("limit")
		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit <= 0 {
			limit = 50
		}

		hist, err := st.GetChatHistory(limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if hist == nil {
			hist = []model.ChatMessage{}
		}

		writeJSON(w, http.StatusOK, hist)
	}
}
