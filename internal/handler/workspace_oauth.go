package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/config"
	"github.com/AterixGz/PersonalWebsite/internal/model"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
	calendarAPI    = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
	gmailListAPI   = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
	gmailGetAPI    = "https://gmail.googleapis.com/gmail/v1/users/me/messages/%s"
	trelloAPI      = "https://api.trello.com/1/members/me/cards"
	trelloAuthURL  = "https://trello.com/1/authorize"
	googleScopes   = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly"
)

func userEmail(r *http.Request) string {
	u := r.URL.Query().Get("user")
	if u == "" {
		u = "admin@myfinance.app"
	}
	return u
}

// GET /api/workspace/status?user=...
func HandleWorkspaceStatus(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		out := map[string]bool{"trello": false, "calendar": false, "gmail": false}
		for _, p := range []string{"trello", "google"} {
			if _, err := st.GetOAuthToken(p, u); err == nil {
				if p == "google" {
					out["calendar"] = true
					out["gmail"] = true
				} else {
					out["trello"] = true
				}
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /api/workspace/connect/trello?user=...  → redirect to Trello authorize
func HandleWorkspaceConnectTrello(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.TrelloAPIKey == "" {
			http.Error(w, "Trello API key not configured", http.StatusServiceUnavailable)
			return
		}
		u := userEmail(r)
		params := url.Values{}
		params.Set("key", cfg.TrelloAPIKey)
		params.Set("name", "MyFinance")
		params.Set("expiration", "never")
		params.Set("scope", "read")
		params.Set("response_type", "token")
		params.Set("callback_method", "fragment")
		params.Set("return_url", cfg.SiteBaseURL+"/?trello_token=1&user="+url.QueryEscape(u))
		http.Redirect(w, r, trelloAuthURL+"?"+params.Encode(), http.StatusFound)
	}
}

// GET /api/workspace/connect/google?user=... → redirect to Google auth
func HandleWorkspaceConnectGoogle(cfg config.Config) http.HandlerFunc {
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
		params.Set("scope", googleScopes)
		params.Set("access_type", "offline")
		params.Set("prompt", "consent")
		params.Set("state", u)
		http.Redirect(w, r, googleAuthURL+"?"+params.Encode(), http.StatusFound)
	}
}

// GET /api/workspace/oauth2/google/callback?code=...&state=...
func HandleGoogleOAuthCallback(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		u := r.URL.Query().Get("state")
		if u == "" {
			u = "admin@myfinance.app"
		}
		if code == "" {
			http.Error(w, "missing code", http.StatusBadRequest)
			return
		}
		form := url.Values{}
		form.Set("code", code)
		form.Set("client_id", cfg.GoogleClientID)
		form.Set("client_secret", cfg.GoogleClientSecret)
		form.Set("redirect_uri", cfg.GoogleRedirectURI)
		form.Set("grant_type", "authorization_code")

		resp, err := http.PostForm(googleTokenURL, form)
		if err != nil {
			http.Error(w, "token exchange failed", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		var tr struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			ExpiresIn    int64  `json:"expires_in"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil || tr.AccessToken == "" {
			http.Error(w, "invalid token response", http.StatusBadGateway)
			return
		}
		tok := model.OAuthToken{
			Provider:     "google",
			UserEmail:    u,
			AccessToken:  tr.AccessToken,
			RefreshToken: tr.RefreshToken,
			Scope:        googleScopes,
			ExpiresAt:    time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second).Unix(),
		}
		st.UpsertOAuthToken(tok)
		http.Redirect(w, r, cfg.SiteBaseURL+"/?oauth=google&user="+url.QueryEscape(u), http.StatusFound)
	}
}

// POST /api/workspace/trello/token {token, user} — Trello returns token in URL fragment
func HandleTrelloToken(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Token string `json:"token"`
			User  string `json:"user"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		if req.User == "" {
			req.User = "admin@myfinance.app"
		}
		tok := model.OAuthToken{
			Provider:    "trello",
			UserEmail:   req.User,
			AccessToken: req.Token,
			ExpiresAt:   time.Now().Add(365 * 24 * time.Hour).Unix(),
		}
		st.UpsertOAuthToken(tok)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

// DELETE /api/workspace/{provider}?user=...
func HandleWorkspaceDisconnect(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provider := r.PathValue("provider")
		u := userEmail(r)
		if provider == "calendar" || provider == "gmail" {
			provider = "google"
		}
		st.DeleteOAuthToken(provider, u)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

func googleAccessToken(st *store.Store, cfg config.Config, u string) (string, error) {
	tok, err := st.GetOAuthToken("google", u)
	if err != nil {
		return "", err
	}
	// Refresh if expired (or within 5 min)
	if tok.ExpiresAt > 0 && time.Now().Unix() < tok.ExpiresAt-300 {
		return tok.AccessToken, nil
	}
	if tok.RefreshToken == "" {
		return tok.AccessToken, nil
	}
	form := url.Values{}
	form.Set("client_id", cfg.GoogleClientID)
	form.Set("client_secret", cfg.GoogleClientSecret)
	form.Set("refresh_token", tok.RefreshToken)
	form.Set("grant_type", "refresh_token")
	resp, err := http.PostForm(googleTokenURL, form)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil || tr.AccessToken == "" {
		return "", fmt.Errorf("refresh failed")
	}
	tok.AccessToken = tr.AccessToken
	tok.ExpiresAt = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second).Unix()
	st.UpsertOAuthToken(*tok)
	return tr.AccessToken, nil
}

// GET /api/workspace/trello?user=... — cards near due date (next 7 days / overdue)
func HandleTrelloData(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		tok, err := st.GetOAuthToken("trello", u)
		if err != nil {
			http.Error(w, "not connected", http.StatusUnauthorized)
			return
		}
		req, _ := http.NewRequest("GET", trelloAPI, nil)
		q := req.URL.Query()
		q.Set("key", cfg.TrelloAPIKey)
		q.Set("token", tok.AccessToken)
		q.Set("fields", "name,due,dueComplete,url")
		q.Set("filter", "all")
		q.Set("board", "true")
		q.Set("board_fields", "name")
		req.URL.RawQuery = q.Encode()

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "trello api error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 200 {
			http.Error(w, "trello api: "+string(body), resp.StatusCode)
			return
		}
		var cards []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Due         string `json:"due"`
			DueComplete bool   `json:"dueComplete"`
			Board       struct {
				Name string `json:"name"`
			} `json:"board"`
		}
		json.Unmarshal(body, &cards)

		now := time.Now()
		var out []map[string]any
		for _, c := range cards {
			if c.Due == "" || c.DueComplete {
				continue
			}
			due, err := time.Parse(time.RFC3339, c.Due)
			if err != nil {
				continue
			}
			days := int(due.Sub(now).Hours() / 24)
			if days > 7 {
				continue
			}
			status := "อีก " + fmt.Sprint(days) + " วัน"
			level := "normal"
			if days < 0 {
				status = "เกินกำหนด"
				level = "overdue"
			} else if days == 0 {
				status = "ครบกำหนดวันนี้"
				level = "soon"
			} else if days <= 2 {
				level = "soon"
			}
			out = append(out, map[string]any{"id": c.ID, "name": c.Name, "status": status, "level": level, "board": c.Board.Name})
			if len(out) >= 10 {
				break
			}
		}
		if out == nil {
			out = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /api/workspace/calendar?user=... — upcoming events
func HandleCalendarData(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		token, err := googleAccessToken(st, cfg, u)
		if err != nil {
			http.Error(w, "not connected", http.StatusUnauthorized)
			return
		}
		req, _ := http.NewRequest("GET", calendarAPI, nil)
		q := req.URL.Query()
		q.Set("maxResults", "10")
		q.Set("orderBy", "startTime")
		q.Set("singleEvents", "true")
		q.Set("timeMin", time.Now().Format(time.RFC3339))
		q.Set("timeMax", time.Now().Add(7*24*time.Hour).Format(time.RFC3339))
		req.URL.RawQuery = q.Encode()
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "calendar api error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 200 {
			http.Error(w, "calendar api: "+string(body), resp.StatusCode)
			return
		}
		var ev struct {
			Items []struct {
				ID      string `json:"id"`
				Summary string `json:"summary"`
				Start   struct {
					DateTime string `json:"dateTime"`
					Date     string `json:"date"`
				} `json:"start"`
			} `json:"items"`
		}
		json.Unmarshal(body, &ev)

		var out []map[string]any
		for _, it := range ev.Items {
			t := it.Start.DateTime
			if t == "" {
				t = it.Start.Date
			}
			label := t
			if pt, err := time.Parse(time.RFC3339, t); err == nil {
				label = pt.Format("02/01 15:04")
			}
			out = append(out, map[string]any{"id": it.ID, "name": it.Summary, "time": label})
		}
		if out == nil {
			out = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /api/workspace/gmail?user=... — unread inbox emails
func HandleGmailData(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		token, err := googleAccessToken(st, cfg, u)
		if err != nil {
			http.Error(w, "not connected", http.StatusUnauthorized)
			return
		}
		req, _ := http.NewRequest("GET", gmailListAPI, nil)
		q := req.URL.Query()
		q.Set("q", "in:inbox is:unread")
		q.Set("maxResults", "5")
		req.URL.RawQuery = q.Encode()
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "gmail api error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != 200 {
			http.Error(w, "gmail api: "+string(body), resp.StatusCode)
			return
		}
		var list struct {
			Messages []struct {
				ID string `json:"id"`
			} `json:"messages"`
		}
		json.Unmarshal(body, &list)

		var out []map[string]any
		for _, m := range list.Messages {
			greq, _ := http.NewRequest("GET", fmt.Sprintf(gmailGetAPI, m.ID), nil)
			gq := greq.URL.Query()
			gq.Set("format", "metadata")
			gq.Set("metadataHeaders", "From")
			gq.Set("metadataHeaders", "Subject")
			greq.URL.RawQuery = gq.Encode()
			greq.Header.Set("Authorization", "Bearer "+token)

			gresp, err := http.DefaultClient.Do(greq)
			if err != nil {
				continue
			}
			gbody, _ := io.ReadAll(gresp.Body)
			gresp.Body.Close()
			var msg struct {
				ID      string `json:"id"`
				Snippet string `json:"snippet"`
				Payload struct {
					Headers []struct {
						Name  string `json:"name"`
						Value string `json:"value"`
					} `json:"headers"`
				} `json:"payload"`
			}
			json.Unmarshal(gbody, &msg)
			sender, subject := "", ""
			for _, h := range msg.Payload.Headers {
				switch h.Name {
				case "From":
					sender = h.Value
				case "Subject":
					subject = h.Value
				}
			}
			// parse display name + email, fallback to domain as company name
			displayName, emailAddr := sender, ""
			if i, j := strings.Index(sender, "<"), strings.Index(sender, ">"); i >= 0 && j > i {
				displayName = strings.TrimSpace(sender[:i])
				emailAddr = sender[i+1 : j]
			} else if strings.Contains(sender, "@") {
				emailAddr = sender
				displayName = ""
			}
			sender = strings.Trim(displayName, `"' `)
			if sender == "" && emailAddr != "" {
				if at := strings.Index(emailAddr, "@"); at >= 0 {
					domain := emailAddr[at+1:]
					if domain != "" {
						sender = domain
					}
				}
			}
			if sender == "" {
				sender = "ไม่ทราบผู้ส่ง"
			}
			out = append(out, map[string]any{
				"id":      msg.ID,
				"sender":  sender,
				"subject": subject,
				"preview": msg.Snippet,
			})
		}
		if out == nil {
			out = []map[string]any{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
