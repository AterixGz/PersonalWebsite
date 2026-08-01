package handler

import (
	"net/http"
)

func HandleTrello() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := []map[string]any{
			{"id": 1, "name": "อัปเดตระบบ Frontend", "status": "กำลังทำ"},
			{"id": 2, "name": "รีวิวเอกสาร API", "status": "รอคิว"},
			{"id": 3, "name": "ประชุมทีมพัฒนา", "status": "เสร็จแล้ว"},
		}
		writeJSON(w, http.StatusOK, data)
	}
}

func HandleCalendar() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := []map[string]any{
			{"id": 1, "name": "ประชุมรายสัปดาห์", "time": "วันนี้, 14:00 - 15:00"},
			{"id": 2, "name": "ตรวจสุขภาพประจำปี", "time": "พรุ่งนี้, 09:00 - 11:00"},
		}
		writeJSON(w, http.StatusOK, data)
	}
}

func HandleGmail() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := []map[string]any{
			{"id": 1, "sender": "Apple", "subject": "Your receipt from Apple", "preview": "You purchased iCloud+ 50GB..."},
			{"id": 2, "sender": "GitHub", "subject": "Action required: Update token", "preview": "Your personal access token will expire..."},
		}
		writeJSON(w, http.StatusOK, data)
	}
}

