document.addEventListener('alpine:init', () => {
  // --- Auth Store ---
  Alpine.store('auth', {
    user: JSON.parse(localStorage.getItem('myfinance_user') || 'null'),
    loginInput: { email: '', password: '' },
    loginError: '',
    
    demoAccounts: [
      {
        id: 'admin',
        name: 'ผู้ดูแลระบบ (Admin)',
        email: 'admin@myfinance.app',
        role: 'Administrator',
        badge: '👑 Admin',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        password: '123456'
      },
      {
        id: 'demo-user',
        name: 'คุณสมชาย ใจดี',
        email: 'demo@myfinance.app',
        role: 'Demo Member',
        badge: '👤 User',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        password: '123456'
      }
    ],

    isLoggedIn() {
      return !!this.user;
    },

    loginAsDemo(acc) {
      this.user = { ...acc };
      localStorage.setItem('myfinance_user', JSON.stringify(this.user));
      this.loginError = '';
      Alpine.store('ui').sidebarOpen = false;
    },

    login() {
      const found = this.demoAccounts.find(
        a => a.email.toLowerCase() === this.loginInput.email.trim().toLowerCase() && a.password === this.loginInput.password
      );
      if (found) {
        this.loginAsDemo(found);
        this.loginInput = { email: '', password: '' };
      } else if (this.loginInput.email.trim() && this.loginInput.password) {
        const customUser = {
          id: 'custom',
          name: this.loginInput.email.split('@')[0],
          email: this.loginInput.email.trim(),
          role: 'Member',
          badge: '✨ Member',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
        };
        this.loginAsDemo(customUser);
        this.loginInput = { email: '', password: '' };
      } else {
        this.loginError = 'กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง';
      }
    },

    logout() {
      this.user = null;
      localStorage.removeItem('myfinance_user');
      Alpine.store('ui').sidebarOpen = false;
    }
  });

  // --- Keypass Store (iPhone Passkey / Face ID / PIN) ---
  Alpine.store('keypass', {
    enabled: localStorage.getItem('myfinance_keypass_enabled') === 'true',
    pin: localStorage.getItem('myfinance_keypass_pin') || '1234',
    useFaceID: localStorage.getItem('myfinance_keypass_bio') !== 'false',
    isLocked: localStorage.getItem('myfinance_keypass_enabled') === 'true',
    inputPin: '',
    errorShake: false,
    isScanningFace: false,
    statusMessage: '',
    newPinInput: '',
    pinSuccessMessage: '',

    init() {
      if (this.enabled && this.isLocked && this.useFaceID) {
        setTimeout(() => this.triggerFaceID(), 400);
      }
    },

    pressDigit(digit) {
      if (this.inputPin.length < 4) {
        this.inputPin += digit;
        if (this.inputPin.length === 4) {
          this.verifyPin();
        }
      }
    },

    deleteDigit() {
      if (this.inputPin.length > 0) {
        this.inputPin = this.inputPin.slice(0, -1);
      }
    },

    verifyPin() {
      if (this.inputPin === this.pin) {
        this.isLocked = false;
        this.inputPin = '';
        this.statusMessage = '';
      } else {
        this.errorShake = true;
        this.statusMessage = 'รหัส PIN ไม่ถูกต้อง';
        setTimeout(() => {
          this.errorShake = false;
          this.inputPin = '';
        }, 500);
      }
    },

    triggerFaceID() {
      if (this.isScanningFace) return;
      this.isScanningFace = true;
      this.statusMessage = 'กำลังสแกน Face ID...';
      
      setTimeout(() => {
        this.isScanningFace = false;
        this.isLocked = false;
        this.statusMessage = '';
        this.inputPin = '';
      }, 1200);
    },

    lockApp() {
      if (this.enabled) {
        this.isLocked = true;
        this.inputPin = '';
        if (this.useFaceID) {
          setTimeout(() => this.triggerFaceID(), 300);
        }
      }
    },

    toggleKeypass(val) {
      this.enabled = val;
      localStorage.setItem('myfinance_keypass_enabled', val ? 'true' : 'false');
      if (!val) {
        this.isLocked = false;
      } else {
        this.isLocked = true;
      }
    },

    setUseFaceID(val) {
      this.useFaceID = val;
      localStorage.setItem('myfinance_keypass_bio', val ? 'true' : 'false');
    },

    updatePin() {
      if (this.newPinInput && this.newPinInput.length === 4) {
        this.pin = this.newPinInput;
        localStorage.setItem('myfinance_keypass_pin', this.newPinInput);
        this.pinSuccessMessage = 'เปลี่ยนรหัส PIN สำเร็จแล้ว!';
        this.newPinInput = '';
        setTimeout(() => { this.pinSuccessMessage = ''; }, 3000);
      } else {
        this.pinSuccessMessage = 'กรุณาระบุ PIN 4 หลัก';
      }
    }
  });

  // --- UI Store ---
  Alpine.store('ui', {
    activeTab: 'finance',
    sidebarOpen: false,
    configModalOpen: false,
    addExpenseModalOpen: false,
    keypassSettingsOpen: false,
    
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    
    closeSidebar() {
      this.sidebarOpen = false;
    },

    setTab(tab) {
      this.activeTab = tab;
      
      // Load data on demand
      if (tab === 'chat' && Alpine.store('chat').messages.length === 0) {
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
    trelloConnected: localStorage.getItem('ws_trello') === 'true',
    calendarConnected: localStorage.getItem('ws_calendar') === 'true',
    gmailConnected: localStorage.getItem('ws_gmail') === 'true',
    
    connecting: { trello: false, calendar: false, gmail: false },
    connectModalOpen: false,
    selectedService: null,
    
    trello: [],
    calendar: [],
    gmail: [],

    init() {
      // Ensure initial load defaults to unconnected if not set
      if (localStorage.getItem('ws_trello') === null) {
        this.trelloConnected = false;
        this.calendarConnected = false;
        this.gmailConnected = false;
      }
    },
    
    connectedCount() {
      let count = 0;
      if (this.trelloConnected) count++;
      if (this.calendarConnected) count++;
      if (this.gmailConnected) count++;
      return count;
    },

    openConnectModal(service) {
      this.selectedService = service;
      this.connectModalOpen = true;
    },

    closeConnectModal() {
      this.connectModalOpen = false;
      this.selectedService = null;
    },

    async confirmConnect() {
      const service = this.selectedService;
      if (!service) return;
      
      this.closeConnectModal();
      await this.connectService(service);
    },

    async connectService(service) {
      this.connecting[service] = true;
      
      // Simulate OAuth / API connection delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (service === 'trello') {
        this.trelloConnected = true;
        localStorage.setItem('ws_trello', 'true');
        if (this.trello.length === 0) await this.loadTrello();
      } else if (service === 'calendar') {
        this.calendarConnected = true;
        localStorage.setItem('ws_calendar', 'true');
        if (this.calendar.length === 0) await this.loadCalendar();
      } else if (service === 'gmail') {
        this.gmailConnected = true;
        localStorage.setItem('ws_gmail', 'true');
        if (this.gmail.length === 0) await this.loadGmail();
      }
      
      this.connecting[service] = false;
    },

    disconnectService(service) {
      if (service === 'trello') {
        this.trelloConnected = false;
        localStorage.setItem('ws_trello', 'false');
      } else if (service === 'calendar') {
        this.calendarConnected = false;
        localStorage.setItem('ws_calendar', 'false');
      } else if (service === 'gmail') {
        this.gmailConnected = false;
        localStorage.setItem('ws_gmail', 'false');
      }
    },

    resetAll() {
      this.trelloConnected = false;
      this.calendarConnected = false;
      this.gmailConnected = false;
      localStorage.setItem('ws_trello', 'false');
      localStorage.setItem('ws_calendar', 'false');
      localStorage.setItem('ws_gmail', 'false');
    },

    async connectAll() {
      await Promise.all([
        this.connectService('trello'),
        this.connectService('calendar'),
        this.connectService('gmail')
      ]);
    },

    async loadTrello() {
      try {
        const res = await fetch('/api/workspace/trello');
        if (res.ok) this.trello = await res.json();
      } catch (err) {
        console.error('Failed to load trello', err);
      }
    },

    async loadCalendar() {
      try {
        const res = await fetch('/api/workspace/calendar');
        if (res.ok) this.calendar = await res.json();
      } catch (err) {
        console.error('Failed to load calendar', err);
      }
    },

    async loadGmail() {
      try {
        const res = await fetch('/api/workspace/gmail');
        if (res.ok) this.gmail = await res.json();
      } catch (err) {
        console.error('Failed to load gmail', err);
      }
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
      requestAnimationFrame(() => {
        const container = document.getElementById('scroll-container');
        if (container) container.scrollTop = container.scrollHeight;
      });
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
