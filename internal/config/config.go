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

	return Config{
		Port:          port,
		DBPath:        dbPath,
		OpenClawURL:   openClawURL,
		OpenClawModel: openClawModel,
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
