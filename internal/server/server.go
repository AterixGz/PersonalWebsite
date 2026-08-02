package server

import (
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/AterixGz/PersonalWebsite/internal/config"
	"github.com/AterixGz/PersonalWebsite/internal/handler"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

type Server struct {
	store     *store.Store
	config    config.Config
	templates *template.Template
	staticFS  fs.FS
}

func New(cfg config.Config, st *store.Store, tmplFS fs.FS, staticFS fs.FS) (*Server, error) {
	tmpl, err := template.ParseFS(tmplFS, "web/templates/*.html")
	if err != nil {
		return nil, err
	}

	// Sub the staticFS to strip "web" prefix so files are accessible at "static/..."
	subFS, err := fs.Sub(staticFS, "web")
	if err != nil {
		return nil, err
	}

	return &Server{
		store:     st,
		config:    cfg,
		templates: tmpl,
		staticFS:  subFS,
	}, nil
}

func (s *Server) SetupRoutes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", handler.HandlePage(s.templates, s.store))

	// Static files — serve with cache control for sw.js
	staticHandler := http.FileServer(http.FS(s.staticFS))
	mux.Handle("GET /static/", http.StripPrefix("/", staticHandler))

	// API routes
	mux.HandleFunc("GET /api/finance/config", handler.HandleGetConfig(s.store))
	mux.HandleFunc("PUT /api/finance/config", handler.HandleUpdateConfig(s.store))
	mux.HandleFunc("GET /api/finance/expenses", handler.HandleListExpenses(s.store))
	mux.HandleFunc("POST /api/finance/expenses", handler.HandleCreateExpense(s.store))
	mux.HandleFunc("PUT /api/finance/expenses/reorder", handler.HandleReorderExpenses(s.store))
	mux.HandleFunc("PUT /api/finance/expenses/{id}", handler.HandleUpdateExpense(s.store))
	mux.HandleFunc("DELETE /api/finance/expenses/{id}", handler.HandleDeleteExpense(s.store))
	mux.HandleFunc("PATCH /api/finance/expenses/{id}/toggle", handler.HandleToggleExpense(s.store))

	mux.HandleFunc("POST /api/chat", handler.HandleChat(s.store, s.config.OpenClawURL, s.config.OpenClawModel))
	mux.HandleFunc("GET /api/chat/history", handler.HandleChatHistory(s.store))

	// AI Usage API routes
	mux.HandleFunc("GET /api/ai-usage", handler.HandleListAIUsage(s.store))
	mux.HandleFunc("POST /api/ai-usage", handler.HandleSaveAIUsage(s.store))

	// Workspace stubs
	mux.HandleFunc("GET /api/workspace/trello", handler.HandleTrello())
	mux.HandleFunc("GET /api/workspace/calendar", handler.HandleCalendar())
	mux.HandleFunc("GET /api/workspace/gmail", handler.HandleGmail())

	// Cloudflare Turnstile verification
	mux.HandleFunc("POST /api/auth/turnstile-verify", handler.HandleTurnstileVerify())

	// Middleware
	return middleware(recoverPanic(mux))
}

func middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Limit request body to 1MB (DoS protection)
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

		// Cache control: never cache SW / HTML / app assets (prevents stale PWA)
		switch {
		case strings.HasPrefix(r.URL.Path, "/static/sw.js"):
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		case r.URL.Path == "/" || r.URL.Path == "/index.html":
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		case strings.HasPrefix(r.URL.Path, "/static/app.js") || strings.HasPrefix(r.URL.Path, "/static/app.css"):
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		}

		// CORS — specific origin only
		w.Header().Set("Access-Control-Allow-Origin", "https://thanpisit.online")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Block TRACE/TRACK (XST attack prevention)
		if r.Method == "TRACE" || r.Method == "TRACK" {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// recoverPanic catches panics in handler chain
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC: %v %s %s", err, r.Method, r.URL.Path)
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
