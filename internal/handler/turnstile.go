package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const turnstileSecretKey = "0x4AAAAAAED23eYnf00kJvP0FNuIQedm_HY"
const turnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type TurnstileVerifyRequest struct {
	Token string `json:"token"`
}

type TurnstileVerifyResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

type CloudflareSiteverifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTs string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	ErrorCodes  []string `json:"error-codes"`
}

// HandleTurnstileVerify verifies a Cloudflare Turnstile token server-side
func HandleTurnstileVerify() http.HandlerFunc {
	client := &http.Client{Timeout: 10 * time.Second}

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		body, err := io.ReadAll(r.Body)
		if err != nil {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: "ไม่สามารถอ่านข้อมูลได้"})
			return
		}
		defer r.Body.Close()

		var req TurnstileVerifyRequest
		if err := json.Unmarshal(body, &req); err != nil || req.Token == "" {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: "Token ไม่ถูกต้อง"})
			return
		}

		// Call Cloudflare siteverify API
		formData := url.Values{}
		formData.Set("secret", turnstileSecretKey)
		formData.Set("response", req.Token)

		// Extract client IP
		remoteIP := r.Header.Get("CF-Connecting-IP")
		if remoteIP == "" {
			remoteIP = r.Header.Get("X-Forwarded-For")
			if remoteIP != "" {
				remoteIP = strings.Split(remoteIP, ",")[0]
			}
		}
		if remoteIP == "" {
			remoteIP = strings.Split(r.RemoteAddr, ":")[0]
		}
		if remoteIP != "" {
			formData.Set("remoteip", remoteIP)
		}

		resp, err := client.PostForm(turnstileVerifyURL, formData)
		if err != nil {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: "ไม่สามารถเชื่อมต่อ Cloudflare ได้"})
			return
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: "ไม่สามารถอ่านผลการตรวจสอบได้"})
			return
		}

		var cfResp CloudflareSiteverifyResponse
		if err := json.Unmarshal(respBody, &cfResp); err != nil {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: "รูปแบบการตอบกลับไม่ถูกต้อง"})
			return
		}

		if cfResp.Success {
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: true, Message: "ยืนยันตัวตนสำเร็จ"})
		} else {
			msg := "การยืนยันตัวตนล้มเหลว"
			if len(cfResp.ErrorCodes) > 0 {
				msg += " (" + strings.Join(cfResp.ErrorCodes, ", ") + ")"
			}
			json.NewEncoder(w).Encode(TurnstileVerifyResponse{Success: false, Message: msg})
		}
	}
}
