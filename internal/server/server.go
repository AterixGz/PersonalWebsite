package server

import (
	"html/template"
	"io/fs"
	"net/http"

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

	// Workspace stubs
	mux.HandleFunc("GET /api/workspace/trello", handler.HandleTrello())
	mux.HandleFunc("GET /api/workspace/calendar", handler.HandleCalendar())
	mux.HandleFunc("GET /api/workspace/gmail", handler.HandleGmail())

	// Cloudflare Turnstile verification
	mux.HandleFunc("POST /api/auth/turnstile-verify", handler.HandleTurnstileVerify())

	// Middleware
	return middleware(mux)
}

func middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
