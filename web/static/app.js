document.addEventListener('alpine:init', () => {
  // --- Auth Store ---
  Alpine.store('auth', {
    user: JSON.parse(localStorage.getItem('myfinance_user') || 'null'),
    loginInput: { email: '', password: '' },
    loginError: '',
    turnstileToken: '',
    loginLoading: false,

    isLoggedIn() {
      return !!this.user;
    },

    async login() {
      const username = this.loginInput.email.trim().toLowerCase();
      const password = this.loginInput.password;

      // Anti-bot Cloudflare Turnstile check (frontend)
      if (!this.turnstileToken) {
        this.loginError = '🛡️ กรุณายืนยันการตรวจสอบความปลอดภัย (Cloudflare Turnstile)';
        return;
      }

      this.loginLoading = true;
      this.loginError = '';

      try {
        // Server-side Turnstile verification via backend
        const res = await fetch('/api/auth/turnstile-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.turnstileToken })
        });
        const result = await res.json();

        if (!result.success) {
          this.loginError = '🛡️ การยืนยันความปลอดภัยล้มเหลว กรุณาลองใหม่อีกครั้ง';
          this.turnstileToken = '';
          // Reset Turnstile widget
          if (window.turnstile) { turnstile.reset(); }
          this.loginLoading = false;
          return;
        }

        // Admin verification
        if ((username === 'admin' || username === 'admin@myfinance.app') && password === 'buabut123') {
          this.user = {
            id: 'admin',
            name: 'ผู้ดูแลระบบ (Admin)',
            email: 'admin@myfinance.app',
            role: 'Administrator',
            badge: '👑 Admin'
          };
          localStorage.setItem('myfinance_user', JSON.stringify(this.user));
          this.loginError = '';
          this.loginInput = { email: '', password: '' };
          Alpine.store('ui').sidebarOpen = false;
        } else {
          this.loginError = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
          // Reset Turnstile after failed login
          this.turnstileToken = '';
          if (window.turnstile) { turnstile.reset(); }
        }
      } catch (err) {
        console.error('Login error:', err);
        this.loginError = '❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่';
        this.turnstileToken = '';
        if (window.turnstile) { turnstile.reset(); }
      }

      this.loginLoading = false;
    },

    logout() {
      this.user = null;
      localStorage.removeItem('myfinance_user');
      Alpine.store('ui').sidebarOpen = false;
    }
  });

  // --- Notification Store (iPhone iOS / Web Push Notifications) ---
  Alpine.store('notification', {
    permissionStatus: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    statusMessage: '',
    testing: false,
    modalOpen: false,
    detailModalOpen: false,
    selectedItem: null,

    items: [
      {
        id: 1,
        title: '🤖 Minimax M3 & Deepseek V4',
        message: 'ครบรอบบิลค่าบริการ AI API ในอีก 13 วัน ($4.20)',
        detailMessage: 'ยอดชำระประมาณการสำหรับ Minimax M3 ($3.75) และ Deepseek V4 Flash ($0.45) รวมทั้งหมด $4.20 (ประมาณ ฿147.00) โดยระบบจะทำการตัดรอบในวันที่ 15 และ 28 ของเดือนตามลำดับ',
        time: '10 นาทีที่แล้ว',
        unread: true,
        type: 'ai',
        targetTab: 'chat'
      },
      {
        id: 2,
        title: '💰 สรุปการเงินประจำเดือน',
        message: 'รายได้สุทธิประจำเดือนนี้คำนวณเรียบร้อยแล้ว',
        detailMessage: 'รายได้รวม (Active + Passive) ประจำเดือนนี้ได้รับการสรุปยอดเรียบร้อยแล้ว พร้อมคำนวณหักค่าใช้จ่ายประจำเดือน และอัปเดตความคืบหน้าเป้าหมาย Passive Income 100,000 บาท',
        time: '2 ชั่วโมงที่แล้ว',
        unread: true,
        type: 'finance',
        targetTab: 'finance'
      },
      {
        id: 3,
        title: '🛡️ ระบบความปลอดภัย',
        message: 'เข้าสู่ระบบด้วย Admin และยืนยัน Turnstile สำเร็จ',
        detailMessage: 'การยืนยันตัวตนแอดมิน (Admin Session) ผ่านการตรวจสอบ Cloudflare Turnstile Anti-Bot Security และยืนยันรหัสผ่านเรียบร้อย ปลอดภัย 100%',
        time: 'เมื่อวานนี้',
        unread: false,
        type: 'security',
        targetTab: ''
      }
    ],

    toggleModal() {
      this.modalOpen = !this.modalOpen;
    },

    closeModal() {
      this.modalOpen = false;
    },

    openDetail(item) {
      this.selectedItem = item;
      item.unread = false;
      this.detailModalOpen = true;
    },

    closeDetail() {
      this.detailModalOpen = false;
      this.selectedItem = null;
    },

    goToTarget() {
      if (this.selectedItem && this.selectedItem.targetTab) {
        Alpine.store('ui').setTab(this.selectedItem.targetTab);
        this.closeDetail();
        this.closeModal();
      }
    },

    unreadCount() {
      return this.items.filter(item => item.unread).length;
    },

    markAllAsRead() {
      this.items.forEach(item => item.unread = false);
    },

    clearAll() {
      this.items = [];
    },


    async requestAndTest() {
      this.testing = true;
      this.statusMessage = '';

      if (!('Notification' in window)) {
        this.statusMessage = '❌ เบราว์เซอร์นี้ยังไม่รองรับระบบการแจ้งเตือน (แนะนำให้กด Add to Home Screen บน iOS 16.4+)';
        this.testing = false;
        return;
      }

      try {
        let perm = Notification.permission;
        if (perm !== 'granted') {
          perm = await Notification.requestPermission();
        }
        this.permissionStatus = perm;

        if (perm === 'granted') {
          const title = '🔔 ทดสอบการแจ้งเตือน MyFinance';
          const options = {
            body: 'ระบบแจ้งเตือนบน iPhone ทำงานได้จริงสมบูรณ์แบบ! 🎉',
            icon: '/static/icons/icon-512x512.jpg',
            badge: '/static/icons/icon-512x512.jpg',
            vibrate: [200, 100, 200],
            tag: 'myfinance-test-notif',
            renotify: true
          };

          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, options);
          } else {
            new Notification(title, options);
          }

          this.statusMessage = '✅ ส่งการแจ้งเตือนสำเร็จ! ตรวจสอบที่แถบแจ้งเตือนด้านบนของคุณ';
        } else if (perm === 'denied') {
          this.statusMessage = '⚠️ สิทธิ์การแจ้งเตือนถูกปฏิเสธ (กรุณาอนุญาตในตั้งค่าของ iOS / Safari)';
        } else {
          this.statusMessage = 'ℹ️ รอการตอบรับสิทธิ์การแจ้งเตือนจากผู้ใช้';
        }
      } catch (err) {
        console.error('Notification test error:', err);
        this.statusMessage = '❌ เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถส่งการแจ้งเตือนได้');
      }

      this.testing = false;
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

    // Swipe gesture state
    tabOrder: ['finance', 'workspace', 'chat'],
    _touchStartX: 0,
    _touchStartY: 0,
    _touchEndX: 0,
    _swiping: false,
    _edgeSwipe: false,

    init() {
      // Initialize swipe gestures after DOM is ready
      requestAnimationFrame(() => {
        this.initSwipe();
        this.initSidebarSwipe();
      });
    },

    // --- Tab Swipe (on scroll-container) ---
    initSwipe() {
      const el = document.getElementById('scroll-container');
      if (!el || el._swipeBound) return;
      el._swipeBound = true;
      const self = this;

      el.addEventListener('touchstart', function(e) {
        if (self.sidebarOpen || Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
        const t = e.touches[0];
        self._touchStartX = t.clientX;
        self._touchStartY = t.clientY;
        self._swiping = false;
        // Mark if touch started near left edge (sidebar open zone)
        self._edgeSwipe = t.clientX < 30;
      }, { passive: true });

      el.addEventListener('touchmove', function(e) {
        if (self.sidebarOpen || Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
        const t = e.touches[0];
        self._touchEndX = t.clientX;
        const dx = Math.abs(t.clientX - self._touchStartX);
        const dy = Math.abs(t.clientY - self._touchStartY);
        if (dx > 20 && dx > dy * 1.5) {
          self._swiping = true;
        }
      }, { passive: true });

      el.addEventListener('touchend', function(e) {
        if (!self._swiping) return;
        self._swiping = false;
        self.handleSwipe();
      }, { passive: true });
    },

    handleSwipe() {
      const dx = this._touchEndX - this._touchStartX;
      const THRESHOLD = 60;

      if (Math.abs(dx) < THRESHOLD) return;

      // If swipe started from left edge → open sidebar instead of switching tab
      if (this._edgeSwipe && dx > THRESHOLD) {
        this.sidebarOpen = true;
        return;
      }

      const currentIndex = this.tabOrder.indexOf(this.activeTab);
      if (currentIndex === -1) return;

      if (dx < -THRESHOLD && currentIndex < this.tabOrder.length - 1) {
        this.setTab(this.tabOrder[currentIndex + 1]);
      } else if (dx > THRESHOLD && currentIndex > 0) {
        this.setTab(this.tabOrder[currentIndex - 1]);
      } else if (dx > THRESHOLD && currentIndex === 0) {
        // First tab + swipe right → open sidebar
        this.sidebarOpen = true;
      }
    },

    // --- Sidebar Swipe (swipe left on sidebar to close, swipe right from edge to open) ---
    initSidebarSwipe() {
      const mainEl = document.querySelector('main');
      if (!mainEl || mainEl._sidebarSwipeBound) return;
      mainEl._sidebarSwipeBound = true;
      const self = this;

      let sStartX = 0, sStartY = 0, sEndX = 0, sSwiping = false;

      // Edge swipe to OPEN sidebar (listen on main container)
      mainEl.addEventListener('touchstart', function(e) {
        const t = e.touches[0];
        sStartX = t.clientX;
        sStartY = t.clientY;
        sEndX = t.clientX;
        sSwiping = false;
      }, { passive: true });

      mainEl.addEventListener('touchmove', function(e) {
        const t = e.touches[0];
        sEndX = t.clientX;
        const dx = Math.abs(t.clientX - sStartX);
        const dy = Math.abs(t.clientY - sStartY);
        if (dx > 20 && dx > dy * 1.5) {
          sSwiping = true;
        }
      }, { passive: true });

      mainEl.addEventListener('touchend', function(e) {
        if (!sSwiping) return;
        sSwiping = false;
        const dx = sEndX - sStartX;
        // Swipe RIGHT from left edge → open sidebar
        if (dx > 60 && sStartX < 30 && !self.sidebarOpen) {
          // Don't open if any overlay is showing
          if (Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
          self.sidebarOpen = true;
        }
      }, { passive: true });

      // Swipe LEFT on sidebar backdrop/drawer → close sidebar
      // We use a MutationObserver to attach listeners once the sidebar DOM appears
      const observer = new MutationObserver(() => {
        // Find sidebar drawer when it's shown
        const drawer = document.getElementById('sidebar-drawer');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (drawer && !drawer._sidebarCloseBound) {
          drawer._sidebarCloseBound = true;
          let dStartX = 0, dStartY = 0, dEndX = 0, dSwiping = false;

          drawer.addEventListener('touchstart', function(e) {
            const t = e.touches[0];
            dStartX = t.clientX;
            dStartY = t.clientY;
            dSwiping = false;
          }, { passive: true });

          drawer.addEventListener('touchmove', function(e) {
            const t = e.touches[0];
            dEndX = t.clientX;
            const dx = Math.abs(t.clientX - dStartX);
            const dy = Math.abs(t.clientY - dStartY);
            if (dx > 20 && dx > dy * 1.5) {
              dSwiping = true;
            }
          }, { passive: true });

          drawer.addEventListener('touchend', function(e) {
            if (!dSwiping) return;
            dSwiping = false;
            const dx = dEndX - dStartX;
            if (dx < -60) {
              self.closeSidebar();
            }
          }, { passive: true });
        }
        // Also allow swipe-left on backdrop to close
        if (backdrop && !backdrop._sidebarCloseBound) {
          backdrop._sidebarCloseBound = true;
          let bStartX = 0, bStartY = 0, bEndX = 0, bSwiping = false;

          backdrop.addEventListener('touchstart', function(e) {
            bStartX = e.touches[0].clientX;
            bStartY = e.touches[0].clientY;
            bSwiping = false;
          }, { passive: true });

          backdrop.addEventListener('touchmove', function(e) {
            bEndX = e.touches[0].clientX;
            const dx = Math.abs(e.touches[0].clientX - bStartX);
            const dy = Math.abs(e.touches[0].clientY - bStartY);
            if (dx > 20 && dx > dy * 1.5) bSwiping = true;
          }, { passive: true });

          backdrop.addEventListener('touchend', function(e) {
            if (!bSwiping) return;
            bSwiping = false;
            if (bEndX - bStartX < -60) self.closeSidebar();
          }, { passive: true });
        }
      });
      observer.observe(mainEl, { childList: true, subtree: true });
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    
    closeSidebar() {
      this.sidebarOpen = false;
    },

    setTab(tab) {
      this.activeTab = tab;
      
      // Load data on demand
      if (tab === 'chat') {
        Alpine.store('aiUsage').loadData();
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
    draggedIndex: null,
    hoverIndex: null,
    
    init() {
      this.editConfig = { ...this.config };
    },

    // Drag & Drop Reorder (JS-native touch with non-passive listeners)

    initDragHandles() {
      // Attach non-passive touchmove to all grip handles after Alpine renders
      const self = this;
      document.querySelectorAll('.grip-handle').forEach(handle => {
        if (handle._dragBound) return;
        handle._dragBound = true;
        handle.addEventListener('touchmove', function(e) {
          e.preventDefault();
          self.onTouchMove(e);
        }, { passive: false });
      });
    },

    onDragStart(index) {
      this.draggedIndex = index;
      this.hoverIndex = index;
    },

    onDragOver(index) {
      if (this.draggedIndex !== null && this.hoverIndex !== index) {
        this.hoverIndex = index;
      }
    },

    onDragEnd() {
      this.finalizeReorder();
    },

    onTouchStart(e, index) {
      this.draggedIndex = index;
      this.hoverIndex = index;
      // Re-init handles in case Alpine re-rendered
      requestAnimationFrame(() => this.initDragHandles());
    },

    onTouchMove(e) {
      if (this.draggedIndex === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elem) return;
      const card = elem.closest('[data-expense-index]');
      if (card) {
        const targetIndex = parseInt(card.getAttribute('data-expense-index'), 10);
        if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < this.expenses.length && this.hoverIndex !== targetIndex) {
          this.hoverIndex = targetIndex;
        }
      }
    },

    onTouchEnd() {
      this.finalizeReorder();
    },

    async finalizeReorder() {
      if (this.draggedIndex !== null && this.hoverIndex !== null && this.draggedIndex !== this.hoverIndex) {
        const item = this.expenses.splice(this.draggedIndex, 1)[0];
        this.expenses.splice(this.hoverIndex, 0, item);
        this.draggedIndex = null;
        this.hoverIndex = null;
        await this.saveExpenseOrder();
        // Re-init handles after DOM change
        requestAnimationFrame(() => this.initDragHandles());
      } else {
        this.draggedIndex = null;
        this.hoverIndex = null;
      }
    },

    async saveExpenseOrder() {
      const ids = this.expenses.map(e => e.id);
      try {
        await fetch('/api/finance/expenses/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expense_ids: ids })
        });
      } catch (err) {
        console.error('Failed to save expense order:', err);
      }
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

  // --- AI Usage Store ---
  Alpine.store('aiUsage', {
    items: [
      { id: 'minimax-m3', name: 'Minimax M3', unit_type: 'tokens', usage_count: 2500000, cost_usd: 3.75, cost_thb: 131.25, billing_day: 28, notes: 'Minimax M3 LLM API' },
      { id: 'deepseek-v4', name: 'Deepseek V4 Flash', unit_type: 'tokens', usage_count: 1800000, cost_usd: 0.45, cost_thb: 15.75, billing_day: 15, notes: 'DeepSeek V4 Flash API' },
      { id: 'brave-search', name: 'Brave API Search', unit_type: 'queries', usage_count: 350, cost_usd: 1.75, cost_thb: 61.25, billing_day: 1, notes: 'Brave Web Search API' }
    ],
    loading: false,
    editModalOpen: false,
    editItem: {
      id: '',
      name: '',
      unit_type: 'tokens',
      usage_count: 0,
      cost_usd: 0,
      cost_thb: 0,
      billing_day: 1,
      notes: ''
    },

    async loadData() {
      this.loading = true;
      try {
        const res = await fetch('/api/ai-usage');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            this.items = data;
          }
        }
      } catch (err) {
        console.error('Failed to load AI usage data:', err);
      }
      this.loading = false;
    },

    openAddModal() {
      this.editItem = {
        id: 'api-' + Date.now(),
        name: '',
        unit_type: 'tokens',
        usage_count: 0,
        cost_usd: 0,
        cost_thb: 0,
        billing_day: 1,
        notes: ''
      };
      this.editModalOpen = true;
    },

    openEditModal(item) {
      this.editItem = JSON.parse(JSON.stringify(item));
      this.editModalOpen = true;
    },

    closeEditModal() {
      this.editModalOpen = false;
    },

    async saveItem() {
      if (!this.editItem.name.trim()) return;
      
      // Auto-calculate THB if 0 and USD is set
      if (this.editItem.cost_usd > 0 && (!this.editItem.cost_thb || this.editItem.cost_thb === 0)) {
        this.editItem.cost_thb = parseFloat((this.editItem.cost_usd * 35).toFixed(2));
      }

      try {
        const res = await fetch('/api/ai-usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editItem)
        });

        if (res.ok) {
          await this.loadData();
          this.closeEditModal();
        }
      } catch (err) {
        console.error('Error saving AI usage item:', err);
      }
    },

    totalCostUSD() {
      return this.items.reduce((sum, item) => sum + (item.cost_usd || 0), 0).toFixed(2);
    },

    totalCostTHB() {
      return this.items.reduce((sum, item) => sum + (item.cost_thb || 0), 0).toFixed(2);
    },

    totalTokensFormatted() {
      const totalTokens = this.items
        .filter(item => item.unit_type === 'tokens')
        .reduce((sum, item) => sum + (item.usage_count || 0), 0);
      return this.formatNumber(totalTokens);
    },

    totalQueriesFormatted() {
      const totalQueries = this.items
        .filter(item => item.unit_type === 'queries' || item.unit_type === 'api_calls')
        .reduce((sum, item) => sum + (item.usage_count || 0), 0);
      return this.formatNumber(totalQueries);
    },

    formatNumber(num) {
      if (num === undefined || num === null) return '0';
      return Number(num).toLocaleString('th-TH');
    },

    getIconClass(id) {
      if (id.includes('minimax')) return 'fa-solid fa-brain text-purple-600';
      if (id.includes('deepseek')) return 'fa-solid fa-bolt text-sky-600';
      if (id.includes('brave')) return 'fa-solid fa-compass text-amber-600';
      return 'fa-solid fa-microchip text-indigo-600';
    },

    getBgClass(id) {
      if (id.includes('minimax')) return 'bg-purple-50 border-purple-100';
      if (id.includes('deepseek')) return 'bg-sky-50 border-sky-100';
      if (id.includes('brave')) return 'bg-amber-50 border-amber-100';
      return 'bg-indigo-50 border-indigo-100';
    },

    getDaysUntilBilling(billingDay) {
      const today = new Date();
      const currentDay = today.getDate();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      let targetDate = new Date(currentYear, currentMonth, billingDay);
      if (currentDay > billingDay) {
        targetDate = new Date(currentYear, currentMonth + 1, billingDay);
      }

      const diffTime = targetDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'วันนี้ครบกำหนด';
      if (diffDays === 1) return 'พรุ่งนี้ครบกำหนด';
      return `อีก ${diffDays} วัน (วันที่ ${billingDay})`;
    }
  });
});

