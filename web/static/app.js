document.addEventListener('alpine:init', () => {
  // --- UI Store ---
  Alpine.store('ui', {
    activeTab: 'finance',
    configModalOpen: false,
    addExpenseModalOpen: false,
    
    setTab(tab) {
      this.activeTab = tab;
      
      // Load data on demand
      if (tab === 'workspace' && Alpine.store('workspace').trello.length === 0) {
        Alpine.store('workspace').loadAll();
      } else if (tab === 'chat' && Alpine.store('chat').messages.length === 0) {
        Alpine.store('chat').loadHistory();
      }
      
      // Scroll to top
      const scrollContainer = document.getElementById('scroll-container');
      if (scrollContainer) scrollContainer.scrollTop = 0;
    }
  });

  // --- Finance Store ---
  Alpine.store('finance', {
    config: window.__INITIAL_DATA__?.config || { active_income: 0, passive_income: 0, passive_goal: 100000 },
    expenses: window.__INITIAL_DATA__?.expenses || [],
    currentMonth: window.__INITIAL_DATA__?.currentMonth || '2026-08',
    
    editConfig: { active_income: 0, passive_income: 0, passive_goal: 0 },
    newExpense: { name: '', amount: 0, category: 'housing', due_day: 1 },
    
    init() {
      this.editConfig = { ...this.config };
    },
    
    formatMoney(amount) {
      return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
    },
    
    totalExpenses() {
      return this.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    },
    
    formattedNetBalance() {
      const net = (this.config.active_income + this.config.passive_income) - this.totalExpenses();
      return this.formatMoney(net);
    },
    
    activeIncomePercent() {
      const total = this.config.active_income + this.config.passive_income;
      if (total === 0) return 0;
      return (this.config.active_income / total) * 100;
    },
    
    passiveIncomePercent() {
      const total = this.config.active_income + this.config.passive_income;
      if (total === 0) return 0;
      return (this.config.passive_income / total) * 100;
    },
    
    freedomPercent() {
      if (this.config.passive_goal === 0) return 0;
      const p = (this.config.passive_income / this.config.passive_goal) * 100;
      return p > 100 ? 100 : Math.round(p);
    },
    
    getEmoji(category) {
      const map = {
        'housing': '🏠', 'utilities': '⚡', 'internet': '🌐', 
        'subscription': '📺', 'phone': '📱', 'food': '🍔', 
        'transport': '🚗', 'other': '📦'
      };
      return map[category] || '📦';
    },
    
    async updateConfig() {
      try {
        const response = await fetch('/api/finance/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editConfig)
        });
        if (response.ok) {
          this.config = { ...this.editConfig };
          Alpine.store('ui').configModalOpen = false;
        }
      } catch (err) {
        console.error('Failed to update config', err);
        // Optimistic update for local dev without backend
        this.config = { ...this.editConfig };
        Alpine.store('ui').configModalOpen = false;
      }
    },
    
    async addExpense() {
      try {
        const payload = { ...this.newExpense };
        const response = await fetch('/api/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          const added = await response.json();
          // Assuming backend returns created item with ID
          this.expenses.push({...payload, id: added.id || Date.now(), is_paid: false});
        } else {
          throw new Error('Failed');
        }
      } catch (err) {
        console.error('Failed to add expense', err);
        this.expenses.push({...this.newExpense, id: Date.now(), is_paid: false});
      }
      this.newExpense = { name: '', amount: 0, category: 'housing', due_day: 1 };
      Alpine.store('ui').addExpenseModalOpen = false;
    },
    
    async deleteExpense(id) {
      try {
        await fetch(`/api/finance/expenses/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error(err);
      }
      this.expenses = this.expenses.filter(e => e.id !== id);
    },
    
    async togglePaid(id) {
      const exp = this.expenses.find(e => e.id === id);
      if (exp) {
        exp.is_paid = !exp.is_paid;
        try {
          await fetch(`/api/finance/expenses/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month: this.currentMonth })
          });
        } catch (err) {
          console.error(err);
        }
      }
    }
  });

  // --- Workspace Store ---
  Alpine.store('workspace', {
    loading: false,
    trello: [],
    calendar: [],
    gmail: [],
    
    async loadAll() {
      this.loading = true;
      try {
        const [trelloRes, calendarRes, gmailRes] = await Promise.all([
          fetch('/api/workspace/trello').then(r => r.ok ? r.json() : []),
          fetch('/api/workspace/calendar').then(r => r.ok ? r.json() : []),
          fetch('/api/workspace/gmail').then(r => r.ok ? r.json() : [])
        ]);
        this.trello = trelloRes;
        this.calendar = calendarRes;
        this.gmail = gmailRes;
      } catch (err) {
        console.error('Failed to load workspace data', err);
        this.trello = [];
        this.calendar = [];
        this.gmail = [];
      }
      this.loading = false;
    }
  });

  // --- Chat Store ---
  Alpine.store('chat', {
    messages: [],
    input: '',
    streaming: false,
    currentStreamContent: '',
    
    formatMessage(text) {
      // Basic formatting to convert newlines to <br> for HTML rendering
      if (!text) return '';
      return text.replace(/\n/g, '<br>');
    },

    scrollToBottom() {
      setTimeout(() => {
        const container = document.getElementById('scroll-container');
        const chatContainer = document.getElementById('chat-messages');
        if (container && chatContainer) {
            container.scrollTop = container.scrollHeight;
        }
      }, 50);
    },

    async loadHistory() {
      try {
        const res = await fetch('/api/chat/history?limit=50');
        if (res.ok) {
          this.messages = await res.json();
          this.scrollToBottom();
        } else {
            this.messages = [
                {id: 0, role: 'assistant', content: 'สวัสดี! ฉันคือผู้ช่วย AI ของคุณ มีอะไรให้ช่วยไหม?'}
            ];
        }
      } catch (err) {
        this.messages = [
            {id: 0, role: 'assistant', content: 'สวัสดี! ฉันคือผู้ช่วย AI ของคุณ มีอะไรให้ช่วยไหม?'}
        ];
      }
    },
    
    async send() {
      if (!this.input.trim() || this.streaming) return;
      
      const userMsg = { id: Date.now(), role: 'user', content: this.input };
      this.messages.push(userMsg);
      const textToSend = this.input;
      this.input = '';
      this.streaming = true;
      this.currentStreamContent = '';
      this.scrollToBottom();
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: textToSend })
        });
        
        if (!response.body) throw new Error('No readable stream');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          
          // Basic SSE parsing logic (assuming 'data: ...\n\n' format)
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                // Adjust this depending on your actual SSE JSON payload structure
                if (parsed.text || parsed.content) {
                  this.currentStreamContent += (parsed.text || parsed.content);
                  this.scrollToBottom();
                }
              } catch (e) {
                // If not JSON, just append raw text
                this.currentStreamContent += data;
                this.scrollToBottom();
              }
            } else if (!line.startsWith('event:') && line.trim() !== '') {
                // fallback if backend doesn't send SSE but raw text chunks
                this.currentStreamContent += line;
                this.scrollToBottom();
            }
          }
        }
        
        this.messages.push({
          id: Date.now(),
          role: 'assistant',
          content: this.currentStreamContent || 'ขออภัย ฉันไม่สามารถตอบได้ในขณะนี้'
        });
        
      } catch (err) {
        console.error('Chat error', err);
        // Simulate fake response for dev if API fails
        setTimeout(() => {
          this.currentStreamContent = 'ระบบตอบกลับอัตโนมัติ: การเชื่อมต่อมีปัญหา';
          setTimeout(() => {
            this.messages.push({ id: Date.now(), role: 'assistant', content: this.currentStreamContent });
            this.streaming = false;
            this.currentStreamContent = '';
            this.scrollToBottom();
          }, 500);
        }, 1000);
        return;
      }
      
      this.streaming = false;
      this.currentStreamContent = '';
      this.scrollToBottom();
    }
  });
});
