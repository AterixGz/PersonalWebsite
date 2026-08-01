package handler

import (
	"bytes"
	"encoding/json"
	"html/template"
	"net/http"
	"sync"
	"time"

	"github.com/AterixGz/PersonalWebsite/internal/store"
)

var bufPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

type PageData struct {
	ConfigJSON   template.JS
	ExpensesJSON template.JS
	CurrentMonth string
}

func HandlePage(tmpl *template.Template, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg, err := st.GetIncomeConfig()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		month := time.Now().Format("2006-01")
		expenses, err := st.ListExpenses(month)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		cfgJSON, _ := json.Marshal(cfg)
		expJSON, _ := json.Marshal(expenses)
		if expenses == nil {
			expJSON = []byte("[]")
		}

		data := PageData{
			ConfigJSON:   template.JS(cfgJSON),
			ExpensesJSON: template.JS(expJSON),
			CurrentMonth: month,
		}

		buf := bufPool.Get().(*bytes.Buffer)
		buf.Reset()
		defer func() {
			if buf.Cap() <= 64*1024 {
				bufPool.Put(buf)
			}
		}()

		if err := tmpl.ExecuteTemplate(buf, "base.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		buf.WriteTo(w)
	}
}
