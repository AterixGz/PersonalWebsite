package model

type IncomeConfig struct {
	ID            int     `json:"id"`
	ActiveIncome  float64 `json:"active_income"`
	PassiveIncome float64 `json:"passive_income"`
	PassiveGoal   float64 `json:"passive_goal"`
	UpdatedAt     string  `json:"updated_at"`
}

type Expense struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	Amount    float64 `json:"amount"`
	Category  string  `json:"category"`
	DueDay    int     `json:"due_day"`
	IsPaid    bool    `json:"is_paid"`
	PaidMonth string  `json:"paid_month"`
	CreatedAt string  `json:"created_at"`
	SortOrder int     `json:"sort_order"`
}

type ReorderExpensesRequest struct {
	ExpenseIDs []int `json:"expense_ids"`
}

type ChatMessage struct {
	ID        int    `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

type ChatRequest struct {
	Message string `json:"message"`
}

type ExpenseRequest struct {
	Name     string  `json:"name"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	DueDay   int     `json:"due_day"`
}

type ToggleRequest struct {
	Month string `json:"month"`
}
