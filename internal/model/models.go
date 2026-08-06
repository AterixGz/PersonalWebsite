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

type ReorderIncomesRequest struct {
	IncomeIDs []int `json:"income_ids"`
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

// --- RunQuest (ข้อมูลการวิ่งจริงจาก Apple Health ผ่าน iOS Shortcut) ---
type RunQuestRun struct {
	ID          int64   `json:"id"`
	StartDate   string  `json:"start_date"`
	DistanceKm  float64 `json:"distance_km"`
	DurationSec float64 `json:"duration_sec"`
	CreatedAt   string  `json:"created_at"`
}

type RunQuestSyncRequest struct {
	Runs []RunQuestRun `json:"runs"`
}

type RunQuestStats struct {
	TotalKm     float64       `json:"total_km"`
	RunCount    int           `json:"run_count"`
	Best5KSec   float64       `json:"best_5k_sec"`
	BestHalfSec float64       `json:"best_half_sec"`
	Sprint400Sec float64      `json:"sprint_400_sec"`
	LongestKm   float64       `json:"longest_km"`
	Recent      []RunQuestRun `json:"recent"`
}

type ExpenseRequest struct {
	Name     string  `json:"name"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	DueDay   int     `json:"due_day"`
}

type Income struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"` // "active" | "passive"
	SubCategory string  `json:"sub_category"`
	CreatedAt   string  `json:"created_at"`
	SortOrder   int     `json:"sort_order"`
}

type IncomeRequest struct {
	Name        string  `json:"name"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	SubCategory string  `json:"sub_category"`
}

type ToggleRequest struct {
	Month string `json:"month"`
}

type AIUsageItem struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	UnitType   string  `json:"unit_type"`   // "tokens", "queries", "api_calls"
	UsageCount float64 `json:"usage_count"` // e.g. 1500000 tokens or 450 queries
	CostUSD    float64 `json:"cost_usd"`
	CostTHB    float64 `json:"cost_thb"`
	BillingDay int     `json:"billing_day"` // day of month (1-31)
	Notes      string  `json:"notes"`
	UpdatedAt  string  `json:"updated_at"`
}

type OAuthToken struct {
	Provider     string `json:"provider"`
	UserEmail    string `json:"user_email"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	ExpiresAt    int64  `json:"expires_at"`
	UpdatedAt    string `json:"updated_at"`
}
