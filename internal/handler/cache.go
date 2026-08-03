package handler

import (
	"bytes"
	"net/http"
	"sync"
	"time"
)

// cacheEntry holds a cached HTTP response body until expiry.
type cacheEntry struct {
	body    []byte
	status  int
	expires time.Time
}

// responseCache is a minimal in-memory TTL cache keyed by URL path + user.
type responseCache struct {
	mu    sync.Mutex
	items map[string]*cacheEntry
}

var workspaceDataCache = &responseCache{items: make(map[string]*cacheEntry)}

// recorder captures the handler response so it can be cached.
type recorder struct {
	http.ResponseWriter
	body   bytes.Buffer
	status int
}

func (r *recorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

// Cache wraps a GET handler with an in-memory TTL cache so repeated
// refreshes within ttl are served from memory instead of hitting the
// upstream API (Trello / Google Calendar / Gmail rate limits).
func Cache(ttl time.Duration, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			h(w, r)
			return
		}
		key := r.URL.Path + "?" + r.URL.Query().Get("user")
		now := time.Now()

		workspaceDataCache.mu.Lock()
		e, ok := workspaceDataCache.items[key]
		if ok && now.Before(e.expires) {
			body, status := e.body, e.status
			workspaceDataCache.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			w.WriteHeader(status)
			w.Write(body)
			return
		}
		workspaceDataCache.mu.Unlock()

		rec := &recorder{ResponseWriter: w}
		h(rec, r)

		// Only cache successful, non-empty responses.
		if rec.status >= 200 && rec.status < 300 && rec.body.Len() > 0 {
			workspaceDataCache.mu.Lock()
			workspaceDataCache.items[key] = &cacheEntry{
				body:    append([]byte(nil), rec.body.Bytes()...),
				status:  rec.status,
				expires: now.Add(ttl),
			}
			workspaceDataCache.mu.Unlock()
		}
	}
}

// InvalidateWorkspaceCache drops cached entries for a user (e.g. after
// disconnect or a new token is saved) so the next fetch is fresh.
func InvalidateWorkspaceCache(user string) {
	workspaceDataCache.mu.Lock()
	defer workspaceDataCache.mu.Unlock()
	for k := range workspaceDataCache.items {
		// keys look like "/api/workspace/trello?user=<email>"
		if len(k) >= len(user) && k[len(k)-len(user):] == user {
			delete(workspaceDataCache.items, k)
		}
	}
}
