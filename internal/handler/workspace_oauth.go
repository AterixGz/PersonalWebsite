package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/config"
	"github.com/AterixGz/PersonalWebsite/internal/model"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
	calendarAPI     = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
	calendarListAPI = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
	gmailListAPI   = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
	gmailGetAPI    = "https://gmail.googleapis.com/gmail/v1/users/me/messages/%s"
	trelloAPI      = "https://api.trello.com/1/members/me/cards"
	trelloAuthURL  = "https://trello.com/1/authorize"
	googleScopes   = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly"
	googleHealthScopes = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
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
		params.Set("name", "FinFlow")
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
// state = email ปกติ (workspace) หรือ "health:<email>" (Google Health API)
func HandleGoogleOAuthCallback(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")

		provider := "google"
		scope := googleScopes
		redirect := cfg.SiteBaseURL + "/?oauth=google&user="
		u := state
		if strings.HasPrefix(state, "health:") {
			provider = "google_health"
			scope = googleHealthScopes
			redirect = cfg.SiteBaseURL + "/?health=1&user="
			u = strings.TrimPrefix(state, "health:")
		}
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
			Provider:     provider,
			UserEmail:    u,
			AccessToken:  tr.AccessToken,
			RefreshToken: tr.RefreshToken,
			Scope:        scope,
			ExpiresAt:    time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second).Unix(),
		}
		st.UpsertOAuthToken(tok)
		http.Redirect(w, r, redirect+url.QueryEscape(u), http.StatusFound)
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
		InvalidateWorkspaceCache(req.User)
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
		InvalidateWorkspaceCache(u)
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
	}
}

func googleAccessToken(st *store.Store, cfg config.Config, u string) (string, error) {
	return googleProviderAccessToken(st, cfg, u, "google")
}

// googleProviderAccessToken ดึง access token ของ provider ใดๆ ของ Google (refresh ถ้าหมดอายุ)
func googleProviderAccessToken(st *store.Store, cfg config.Config, u, provider string) (string, error) {
	tok, err := st.GetOAuthToken(provider, u)
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
		// List boards the user belongs to (skip closed ones), then fetch cards per board
		breq, _ := http.NewRequest("GET", "https://api.trello.com/1/members/me/boards", nil)
		bq := breq.URL.Query()
		bq.Set("key", cfg.TrelloAPIKey)
		bq.Set("token", tok.AccessToken)
		bq.Set("fields", "id,name,closed")
		breq.URL.RawQuery = bq.Encode()

		bresp, err := http.DefaultClient.Do(breq)
		if err != nil {
			http.Error(w, "trello api error", http.StatusBadGateway)
			return
		}
		bbody, _ := io.ReadAll(bresp.Body)
		bresp.Body.Close()
		if bresp.StatusCode != 200 {
			http.Error(w, "trello api: "+string(bbody), bresp.StatusCode)
			return
		}
		var boards []struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Closed bool   `json:"closed"`
		}
		json.Unmarshal(bbody, &boards)

		boardNames := map[string]string{}
		var cards []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Due         string `json:"due"`
			DueComplete bool   `json:"dueComplete"`
			IDBoard     string `json:"idBoard"`
		}
		for _, b := range boards {
			if b.Closed {
				continue
			}
			boardNames[b.ID] = b.Name
			creq, _ := http.NewRequest("GET", "https://api.trello.com/1/boards/"+b.ID+"/cards", nil)
			cq := creq.URL.Query()
			cq.Set("key", cfg.TrelloAPIKey)
			cq.Set("token", tok.AccessToken)
			cq.Set("fields", "name,due,dueComplete,url,idBoard")
			cq.Set("filter", "all")
			creq.URL.RawQuery = cq.Encode()

			cresp, err := http.DefaultClient.Do(creq)
			if err != nil {
				continue
			}
			cbody, _ := io.ReadAll(cresp.Body)
			cresp.Body.Close()
			if cresp.StatusCode != 200 {
				continue
			}
			var bcards []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				Due         string `json:"due"`
				DueComplete bool   `json:"dueComplete"`
				IDBoard     string `json:"idBoard"`
			}
			if json.Unmarshal(cbody, &bcards) == nil {
				cards = append(cards, bcards...)
			}
		}

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
			out = append(out, map[string]any{"id": c.ID, "name": c.Name, "status": status, "level": level, "board": boardNames[c.IDBoard]})
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

// GET /api/workspace/calendar?user=... — upcoming events (all calendars, not just primary)
func HandleCalendarData(st *store.Store, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userEmail(r)
		token, err := googleAccessToken(st, cfg, u)
		if err != nil {
			http.Error(w, "not connected", http.StatusUnauthorized)
			return
		}

		// List all calendars — imported calendars (e.g. "ปฏิทิน") hold run/event schedules too
		listReq, _ := http.NewRequest("GET", calendarListAPI, nil)
		listReq.Header.Set("Authorization", "Bearer "+token)
		listResp, err := http.DefaultClient.Do(listReq)
		if err != nil {
			http.Error(w, "calendar list api error", http.StatusBadGateway)
			return
		}
		lbody, _ := io.ReadAll(listResp.Body)
		listResp.Body.Close()
		if listResp.StatusCode != 200 {
			http.Error(w, "calendar list api: "+string(lbody), listResp.StatusCode)
			return
		}
		var cl struct {
			Items []struct {
				ID      string `json:"id"`
				Primary bool   `json:"primary"`
			} `json:"items"`
		}
		json.Unmarshal(lbody, &cl)

		now := time.Now()
		timeMin := now.Format(time.RFC3339)
		timeMax := now.Add(7 * 24 * time.Hour).Format(time.RFC3339)

		type calEvent struct {
			id      string
			name    string
			label   string
			sortKey time.Time
		}
		var events []calEvent
		seen := map[string]bool{}

		for _, c := range cl.Items {
			if c.ID == "" {
				continue
			}
			req, _ := http.NewRequest("GET", "https://www.googleapis.com/calendar/v3/calendars/"+url.PathEscape(c.ID)+"/events", nil)
			q := req.URL.Query()
			q.Set("maxResults", "10")
			q.Set("orderBy", "startTime")
			q.Set("singleEvents", "true")
			q.Set("timeMin", timeMin)
			q.Set("timeMax", timeMax)
			req.URL.RawQuery = q.Encode()
			req.Header.Set("Authorization", "Bearer "+token)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				continue
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode != 200 {
				continue
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

			for _, it := range ev.Items {
				if it.ID == "" || seen[it.ID] {
					continue
				}
				seen[it.ID] = true
				t := it.Start.DateTime
				if t == "" {
					t = it.Start.Date
				}
				label := t
				var sortKey time.Time
				if pt, err := time.Parse(time.RFC3339, t); err == nil {
					label = pt.Format("02/01 15:04")
					sortKey = pt
				} else if pd, err := time.Parse("2006-01-02", t); err == nil {
					label = pd.Format("02/01")
					sortKey = pd
				}
				events = append(events, calEvent{id: it.ID, name: it.Summary, label: label, sortKey: sortKey})
			}
		}

		sort.Slice(events, func(i, j int) bool { return events[i].sortKey.Before(events[j].sortKey) })
		if len(events) > 10 {
			events = events[:10]
		}

		out := []map[string]any{}
		for _, e := range events {
			days := int(e.sortKey.Sub(now).Hours() / 24)
			if days < 0 {
				days = 0
			}
			out = append(out, map[string]any{"id": e.id, "name": e.name, "time": e.label, "days": days})
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
			gq.Add("metadataHeaders", "From")
			gq.Add("metadataHeaders", "Subject")
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
