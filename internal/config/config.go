package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	Port          string
	DBPath        string
	OpenClawURL   string
	OpenClawModel string
	SiteBaseURL   string

	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURI  string
	TrelloAPIKey       string
}

func Load() Config {
	loadEnv()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/app.db"
	}
	openClawURL := os.Getenv("OPENCLAW_URL")
	if openClawURL == "" {
		openClawURL = "http://localhost:11434"
	}
	openClawModel := os.Getenv("OPENCLAW_MODEL")
	if openClawModel == "" {
		openClawModel = "openclaw"
	}
	siteBaseURL := os.Getenv("SITE_BASE_URL")
	if siteBaseURL == "" {
		siteBaseURL = "https://thanpisit.online"
	}

	googleRedirect := os.Getenv("GOOGLE_REDIRECT_URI")
	if googleRedirect == "" {
		googleRedirect = siteBaseURL + "/api/workspace/oauth2/google/callback"
	}

	return Config{
		Port:               port,
		DBPath:             dbPath,
		OpenClawURL:        openClawURL,
		OpenClawModel:      openClawModel,
		SiteBaseURL:        siteBaseURL,
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURI:  googleRedirect,
		TrelloAPIKey:       os.Getenv("TRELLO_API_KEY"),
	}
}

func loadEnv() {
	file, err := os.Open(".env")
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		if (strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"")) ||
			(strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'")) {
			val = val[1 : len(val)-1]
		}
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}
