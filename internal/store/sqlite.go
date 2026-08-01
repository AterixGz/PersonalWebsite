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
		`CREATE TABLE IF NOT EXISTS chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			role TEXT,
			content TEXT,
			created_at TEXT
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

func (s *Store) Close() error {
	return s.db.Close()
}
