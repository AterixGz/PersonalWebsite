package store

import (
	"database/sql"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/model"
	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func New(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	_, err = db.Exec("PRAGMA journal_mode=WAL;")
	if err != nil {
		return nil, err
	}

	err = runMigrations(db)
	if err != nil {
		return nil, err
	}

	return &Store{db: db}, nil
}

func runMigrations(db *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS income_config (
			id INTEGER PRIMARY KEY,
			active_income REAL,
			passive_income REAL,
			passive_goal REAL,
			updated_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS expenses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT,
			amount REAL,
			category TEXT,
			due_day INTEGER,
			paid_month TEXT,
			created_at TEXT,
			sort_order INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS incomes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT,
			amount REAL,
			category TEXT,
			created_at TEXT,
			sort_order INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			role TEXT,
			content TEXT,
			created_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS ai_usage (
			id TEXT PRIMARY KEY,
			name TEXT,
			unit_type TEXT,
			usage_count REAL,
			cost_usd REAL,
			cost_thb REAL,
			billing_day INTEGER,
			notes TEXT,
			updated_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS oauth_tokens (
			provider TEXT NOT NULL,
			user_email TEXT NOT NULL,
			access_token TEXT,
			refresh_token TEXT,
			scope TEXT,
			expires_at INTEGER,
			updated_at TEXT,
			PRIMARY KEY (provider, user_email)
		)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}

	// Safe migration: Add sort_order column if upgrading existing DB
	db.Exec("ALTER TABLE expenses ADD COLUMN sort_order INTEGER DEFAULT 0;")

	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM income_config WHERE id = 1").Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		_, err = db.Exec("INSERT INTO income_config (id, active_income, passive_income, passive_goal, updated_at) VALUES (1, 0, 0, 100000, ?)", time.Now().Format(time.RFC3339))
		if err != nil {
			return err
		}
	}

	// Seed AI Usage default services if empty
	var aiCount int
	err = db.QueryRow("SELECT COUNT(*) FROM ai_usage").Scan(&aiCount)
	if err == nil && aiCount == 0 {
		now := time.Now().Format(time.RFC3339)
		seeds := []struct {
			id, name, unitType   string
			usageCount, usd, thb float64
			billingDay           int
			notes                string
		}{
			{"minimax-m3", "Minimax M3", "tokens", 2500000, 3.75, 131.25, 28, "Minimax M3 LLM API"},
			{"deepseek-v4", "Deepseek V4 Flash", "tokens", 1800000, 0.45, 15.75, 15, "DeepSeek V4 Flash API"},
			{"brave-search", "Brave API Search", "queries", 350, 1.75, 61.25, 1, "Brave Web Search API"},
		}
		for _, s := range seeds {
			db.Exec("INSERT INTO ai_usage (id, name, unit_type, usage_count, cost_usd, cost_thb, billing_day, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				s.id, s.name, s.unitType, s.usageCount, s.usd, s.thb, s.billingDay, s.notes, now)
		}
	}
	return nil
}

func (s *Store) GetIncomeConfig() (model.IncomeConfig, error) {
	var c model.IncomeConfig
	err := s.db.QueryRow("SELECT id, active_income, passive_income, passive_goal, updated_at FROM income_config WHERE id = 1").
		Scan(&c.ID, &c.ActiveIncome, &c.PassiveIncome, &c.PassiveGoal, &c.UpdatedAt)
	return c, err
}

func (s *Store) UpdateIncomeConfig(active, passive, goal float64) error {
	_, err := s.db.Exec("UPDATE income_config SET active_income=?, passive_income=?, passive_goal=?, updated_at=? WHERE id=1",
		active, passive, goal, time.Now().Format(time.RFC3339))
	return err
}

func (s *Store) ListExpenses(month string) ([]model.Expense, error) {
	rows, err := s.db.Query("SELECT id, name, amount, category, due_day, paid_month, created_at, sort_order FROM expenses ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expenses []model.Expense
	for rows.Next() {
		var e model.Expense
		var paidMonth sql.NullString
		if err := rows.Scan(&e.ID, &e.Name, &e.Amount, &e.Category, &e.DueDay, &paidMonth, &e.CreatedAt, &e.SortOrder); err != nil {
			return nil, err
		}
		if paidMonth.Valid {
			e.PaidMonth = paidMonth.String
		}
		e.IsPaid = e.PaidMonth == month
		expenses = append(expenses, e)
	}
	return expenses, nil
}

func (s *Store) CreateExpense(req model.ExpenseRequest) (model.Expense, error) {
	now := time.Now().Format(time.RFC3339)
	var maxOrder int
	_ = s.db.QueryRow("SELECT COALESCE(MAX(sort_order), 0) FROM expenses").Scan(&maxOrder)
	newOrder := maxOrder + 1

	res, err := s.db.Exec("INSERT INTO expenses (name, amount, category, due_day, paid_month, created_at, sort_order) VALUES (?, ?, ?, ?, '', ?, ?)",
		req.Name, req.Amount, req.Category, req.DueDay, now, newOrder)
	if err != nil {
		return model.Expense{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return model.Expense{}, err
	}
	return model.Expense{
		ID:        int(id),
		Name:      req.Name,
		Amount:    req.Amount,
		Category:  req.Category,
		DueDay:    req.DueDay,
		IsPaid:    false,
		PaidMonth: "",
		CreatedAt: now,
		SortOrder: newOrder,
	}, nil
}

func (s *Store) ReorderExpenses(expenseIDs []int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE expenses SET sort_order=? WHERE id=?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for order, id := range expenseIDs {
		if _, err := stmt.Exec(order, id); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) UpdateExpense(id int, req model.ExpenseRequest) error {
	_, err := s.db.Exec("UPDATE expenses SET name=?, amount=?, category=?, due_day=? WHERE id=?",
		req.Name, req.Amount, req.Category, req.DueDay, id)
	return err
}

func (s *Store) DeleteExpense(id int) error {
	_, err := s.db.Exec("DELETE FROM expenses WHERE id=?", id)
	return err
}

func (s *Store) ListIncomes() ([]model.Income, error) {
	rows, err := s.db.Query("SELECT id, name, amount, category, created_at, sort_order FROM incomes ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var incomes []model.Income
	for rows.Next() {
		var inc model.Income
		if err := rows.Scan(&inc.ID, &inc.Name, &inc.Amount, &inc.Category, &inc.CreatedAt, &inc.SortOrder); err != nil {
			return nil, err
		}
		incomes = append(incomes, inc)
	}
	return incomes, nil
}

func (s *Store) CreateIncome(req model.IncomeRequest) (model.Income, error) {
	now := time.Now().Format(time.RFC3339)
	var maxOrder int
	_ = s.db.QueryRow("SELECT COALESCE(MAX(sort_order), 0) FROM incomes").Scan(&maxOrder)
	newOrder := maxOrder + 1

	res, err := s.db.Exec("INSERT INTO incomes (name, amount, category, created_at, sort_order) VALUES (?, ?, ?, ?, ?)",
		req.Name, req.Amount, req.Category, now, newOrder)
	if err != nil {
		return model.Income{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return model.Income{}, err
	}
	return model.Income{
		ID:        int(id),
		Name:      req.Name,
		Amount:    req.Amount,
		Category:  req.Category,
		CreatedAt: now,
		SortOrder: newOrder,
	}, nil
}

func (s *Store) DeleteIncome(id int) error {
	_, err := s.db.Exec("DELETE FROM incomes WHERE id=?", id)
	return err
}

func (s *Store) ToggleExpensePaid(id int, month string) error {
	var currentPaidMonth string
	err := s.db.QueryRow("SELECT paid_month FROM expenses WHERE id=?", id).Scan(&currentPaidMonth)
	if err != nil {
		return err
	}

	newMonth := month
	if currentPaidMonth == month {
		newMonth = ""
	}

	_, err = s.db.Exec("UPDATE expenses SET paid_month=? WHERE id=?", newMonth, id)
	return err
}

func (s *Store) SaveChatMessage(role, content string) error {
	_, err := s.db.Exec("INSERT INTO chat_messages (role, content, created_at) VALUES (?, ?, ?)",
		role, content, time.Now().Format(time.RFC3339))
	return err
}

func (s *Store) GetChatHistory(limit int) ([]model.ChatMessage, error) {
	rows, err := s.db.Query("SELECT id, role, content, created_at FROM chat_messages ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []model.ChatMessage
	for rows.Next() {
		var m model.ChatMessage
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}

	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	return msgs, nil
}

func (s *Store) ListAIUsage() ([]model.AIUsageItem, error) {
	rows, err := s.db.Query("SELECT id, name, unit_type, usage_count, cost_usd, cost_thb, billing_day, notes, updated_at FROM ai_usage ORDER BY billing_day ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.AIUsageItem
	for rows.Next() {
		var item model.AIUsageItem
		if err := rows.Scan(&item.ID, &item.Name, &item.UnitType, &item.UsageCount, &item.CostUSD, &item.CostTHB, &item.BillingDay, &item.Notes, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Store) UpsertAIUsage(item model.AIUsageItem) error {
	now := time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO ai_usage (id, name, unit_type, usage_count, cost_usd, cost_thb, billing_day, notes, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name,
			unit_type=excluded.unit_type,
			usage_count=excluded.usage_count,
			cost_usd=excluded.cost_usd,
			cost_thb=excluded.cost_thb,
			billing_day=excluded.billing_day,
			notes=excluded.notes,
			updated_at=excluded.updated_at
	`, item.ID, item.Name, item.UnitType, item.UsageCount, item.CostUSD, item.CostTHB, item.BillingDay, item.Notes, now)
	return err
}

func (s *Store) UpsertOAuthToken(t model.OAuthToken) error {
	now := time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO oauth_tokens (provider, user_email, access_token, refresh_token, scope, expires_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(provider, user_email) DO UPDATE SET
			access_token=excluded.access_token,
			refresh_token=excluded.refresh_token,
			scope=excluded.scope,
			expires_at=excluded.expires_at,
			updated_at=excluded.updated_at
	`, t.Provider, t.UserEmail, t.AccessToken, t.RefreshToken, t.Scope, t.ExpiresAt, now)
	return err
}

func (s *Store) GetOAuthToken(provider, userEmail string) (*model.OAuthToken, error) {
	var t model.OAuthToken
	err := s.db.QueryRow("SELECT provider, user_email, access_token, refresh_token, scope, expires_at, updated_at FROM oauth_tokens WHERE provider=? AND user_email=?",
		provider, userEmail).Scan(&t.Provider, &t.UserEmail, &t.AccessToken, &t.RefreshToken, &t.Scope, &t.ExpiresAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *Store) DeleteOAuthToken(provider, userEmail string) error {
	_, err := s.db.Exec("DELETE FROM oauth_tokens WHERE provider=? AND user_email=?", provider, userEmail)
	return err
}

func (s *Store) Close() error {
	return s.db.Close()
}
