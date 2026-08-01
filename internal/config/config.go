package config

import "os"

type Config struct {
	Port          string
	DBPath        string
	OpenClawURL   string
	OpenClawModel string
}

func Load() Config {
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

	return Config{
		Port:          port,
		DBPath:        dbPath,
		OpenClawURL:   openClawURL,
		OpenClawModel: openClawModel,
	}
}
