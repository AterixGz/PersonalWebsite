package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/config"
	"github.com/AterixGz/PersonalWebsite/internal/server"
	"github.com/AterixGz/PersonalWebsite/internal/store"
)

//go:embed web/templates/*.html
var templatesFS embed.FS

//go:embed web/static
var staticFS embed.FS

func main() {
	cfg := config.Load()

	// create data dir if not exists since default is ./data/app.db
	os.MkdirAll("./data", 0755)

	st, err := store.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer st.Close()

	srv, err := server.New(cfg, st, templatesFS, staticFS)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}

	httpServer := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: srv.SetupRoutes(),
	}

	go func() {
		log.Printf("Starting server on port %s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown error: %v", err)
	}
	log.Println("Server stopped")
}
