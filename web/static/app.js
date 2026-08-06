document.addEventListener('alpine:init', () => {
  // --- Haptic feedback (light tap like iPhone keyboard) ---
  // iOS Safari ไม่มี Web Haptics API → ใช้ navigator.vibrate (Android) + CSS press animation (ทั้งคู่)
  function hapticTap() {
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  }
  document.addEventListener('pointerdown', function(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, [role="button"], a, label') : null;
    if (t) hapticTap();
  }, true);

  // --- Auth Store ---
  Alpine.store('auth', {
    user: JSON.parse(localStorage.getItem('myfinance_user') || 'null'),
    loginInput: { email: '', password: '' },
    loginError: '',
    turnstileToken: '',
    loginLoading: false,
    SESSION_TTL: 24 * 60 * 60 * 1000, // 24h

    isLoggedIn() {
      return !!this.user && !this.isSessionExpired();
    },

    isSessionExpired() {
      if (!this.user || !this.user.expiresAt) return false;
      return Date.now() > this.user.expiresAt;
    },

    // Force logout (called on session expiry or API 401)
    forceLogout() {
      this.user = null;
      localStorage.removeItem('myfinance_user');
      Alpine.store('ui').sidebarOpen = false;
    },

    checkSession() {
      if (this.user && this.isSessionExpired()) {
        this.forceLogout();
        return true;
      }
      return false;
    },

    init() {
      // Auto-logout when session expires (check every 30s + on visibility)
      setInterval(() => this.checkSession(), 30 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.checkSession();
      });
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
            badge: '👑 Admin',
            expiresAt: Date.now() + this.SESSION_TTL
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
      this.forceLogout();
    }
  });

  // Global: any API 401 → session expired → force logout
  (function() {
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await origFetch.apply(this, args);
      if (res.status === 401 && window.Alpine && Alpine.store('auth')) {
        Alpine.store('auth').forceLogout();
      }
      return res;
    };
  })();

  // --- Notification Store (iPhone iOS / Web Push Notifications) ---
  Alpine.store('notification', {
    permissionStatus: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    statusMessage: '',
    testing: false,
    modalOpen: false,
    detailModalOpen: false,
    selectedItem: null,

    init() {
      this.loadReadMap();
      // Swipe right on notification modal → go back (close)
      requestAnimationFrame(() => {
        const modal = document.getElementById('notification-modal');
        if (!modal || modal._notifSwipeBound) return;
        modal._notifSwipeBound = true;
        let sx = 0, swiping = false;
        modal.addEventListener('pointerdown', function(e) { sx = e.clientX; swiping = false; });
        modal.addEventListener('pointermove', function(e) {
          if (!sx) return;
          if (Math.abs(e.clientX - sx) > 15) swiping = true;
        });
        modal.addEventListener('pointerup', function(e) {
          if (!swiping) { sx = 0; return; }
          const dx = e.clientX - sx;
          sx = 0; swiping = false;
          if (dx > 70) Alpine.store('notification').closeModal();
        });
        modal.addEventListener('pointercancel', function() { sx = 0; swiping = false; });
      });
    },

    // Build notification items from workspace data (Trello / Calendar / Gmail)
    refreshFromWorkspace() {
      const ws = Alpine.store('workspace');
      if (!ws) return;
      const seen = new Set(this.items.map(i => i.id));
      const built = [];

      // Trello: overdue or near due
      (ws.trello || []).forEach(t => {
        if (t.level === 'overdue' || t.level === 'soon') {
          const id = 'trello-' + t.id;
          if (!seen.has(id) && !this.readIds.includes(id)) {
            built.push({
              id,
              title: '📋 Trello: ' + t.name,
              message: t.status + (t.board ? ' · ' + t.board : ''),
              detailMessage: 'การ์ด Trello "' + t.name + '" ' + t.status + (t.board ? ' (บอร์ด ' + t.board + ')' : '') + ' — กดเพื่อไปยังหน้างาน',
              time: t.status,
              unread: true,
              type: 'trello',
              targetTab: 'workspace'
            });
          }
        }
      });

      // Calendar: today / upcoming (days <= 1)
      (ws.calendar || []).forEach(ev => {
        if (typeof ev.days === 'number' && ev.days <= 1) {
          const id = 'cal-' + ev.id;
          if (!seen.has(id) && !this.readIds.includes(id)) {
            built.push({
              id,
              title: '📅 ' + ev.name,
              message: ev.time + (ev.days === 0 ? ' (วันนี้)' : ''),
              detailMessage: 'กิจกรรม "' + ev.name + '" ตามกำหนด ' + ev.time + (ev.days === 0 ? ' (วันนี้)' : '') + ' — กดเพื่อไปยังหน้างาน',
              time: ev.time,
              unread: true,
              type: 'calendar',
              targetTab: 'workspace'
            });
          }
        }
      });

      // Gmail: new unread emails
      (ws.gmail || []).forEach(m => {
        const id = 'gmail-' + m.id;
        if (!seen.has(id) && !this.readIds.includes(id)) {
          built.push({
            id,
            title: '✉️ ' + m.sender,
            message: m.subject || '(ไม่มีหัวเรื่อง)',
            detailMessage: 'จาก ' + m.sender + '\n' + (m.preview || m.subject || ''),
            time: 'ใหม่',
            unread: true,
            type: 'gmail',
            targetTab: 'workspace'
          });
        }
      });

      if (built.length) {
        this.items = [...built, ...this.items];
        // best-effort web push for new items
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const title = built.length === 1 ? built[0].title : 'FinFlow: มี ' + built.length + ' รายการใหม่';
            const body = built.length === 1 ? built[0].message : 'ตรวจสอบศูนย์การแจ้งเตือน';
            const opts = { body, icon: '/static/icons/icon-512x512.png', badge: '/static/icons/icon-512x512.png', tag: 'finflow-new', renotify: true };
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => {});
            } else {
              new Notification(title, opts);
            }
          } catch (e) { console.error('notify error', e); }
        }
      }
    },

    // Refresh latest notifications from workspace data (notification center button)
    async refreshLatest() {
      this.statusMessage = '';
      // request push permission on first use
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          this.permissionStatus = await Notification.requestPermission();
        } catch (e) { console.error(e); }
      }
      const before = this.items.length;
      const ws = Alpine.store('workspace');
      if (ws) {
        await Promise.allSettled([ws.loadTrello(), ws.loadCalendar(), ws.loadGmail()]);
      }
      this.refreshFromWorkspace();
      const added = this.items.length - before;
      this.showToast(added > 0 ? '🔔 มีแจ้งเตือนใหม่ ' + added + ' รายการ' : '✅ ข้อมูลล่าสุดแล้ว');
    },

    typeClass(type) {
      const map = {
        ai: 'bg-purple-50 text-purple-600 border-purple-100',
        finance: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        trello: 'bg-sky-50 text-sky-600 border-sky-100',
        calendar: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        gmail: 'bg-red-50 text-red-500 border-red-100',
        security: 'bg-blue-50 text-blue-600 border-blue-100'
      };
      return map[type] || map.security;
    },

    typeIcon(type) {
      const map = {
        ai: 'fa-solid fa-robot',
        finance: 'fa-solid fa-wallet',
        trello: 'fa-brands fa-trello',
        calendar: 'fa-regular fa-calendar-check',
        gmail: 'fa-regular fa-envelope',
        security: 'fa-solid fa-shield-halved'
      };
      return map[type] || map.security;
    },

    typeLabel(type) {
      const map = {
        ai: 'AI & Token',
        finance: 'ระบบการเงิน',
        trello: 'Trello งาน',
        calendar: 'Google Calendar',
        gmail: 'Gmail',
        security: 'ความปลอดภัย'
      };
      return map[type] || 'อื่นๆ';
    },

    items: [],
    readIds: [],
    readMap: {},        // id → readAt timestamp (persisted)
    toast: '',
    _toastTimer: null,

    // --- Read-state persistence (บันทึกว่าอ่านอันไหนไปแล้ว) ---
    loadReadMap() {
      try {
        const raw = localStorage.getItem('finflow_notif_read');
        if (raw) {
          this.readMap = JSON.parse(raw);
          this.readIds = Object.keys(this.readMap);
        }
      } catch (e) { console.error('loadReadMap', e); }
    },

    persistReadMap() {
      try {
        localStorage.setItem('finflow_notif_read', JSON.stringify(this.readMap));
      } catch (e) { console.error('persistReadMap', e); }
    },

    markRead(id) {
      if (!this.readMap[id]) {
        this.readMap[id] = Date.now();
        this.readIds.push(id);
        this.persistReadMap();
      }
    },

    showToast(msg) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toast = ''; }, 2200);
    },

    toggleModal() {
      this.modalOpen = !this.modalOpen;
    },

    closeModal() {
      this.modalOpen = false;
    },

    openDetail(item) {
      this.selectedItem = item;
      item.unread = false;
      this.markRead(item.id);
      this.items = this.items.filter(i => i.id !== item.id);
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
      this.items.forEach(item => {
        item.unread = false;
        this.markRead(item.id);
      });
      this.items = [];
    },

    clearAll() {
      this.items.forEach(item => this.markRead(item.id));
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
          const title = '🔔 ทดสอบการแจ้งเตือน FinFlow';
          const options = {
            body: 'ระบบแจ้งเตือนบน iPhone ทำงานได้จริงสมบูรณ์แบบ! 🎉',
            icon: '/static/icons/icon-512x512.png',
            badge: '/static/icons/icon-512x512.png',
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
    addIncomeModalOpen: false,
    keypassSettingsOpen: false,

    // Swipe gesture state
    tabOrder: ['finance', 'workspace', 'chat', 'game'],
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
        this.initPullToRefresh();
      });
    },

    // --- Pull-to-refresh (workspace + AI token tabs) ---
    initPullToRefresh() {
      const el = document.getElementById('scroll-container');
      if (!el || el._ptrBound) return;
      el._ptrBound = true;
      const self = this;
      let startY = 0, pulling = false, dist = 0;
      const THRESHOLD = 70;
      const inner = document.getElementById('ptr-indicator-inner');
      const outer = document.getElementById('ptr-indicator');

      const reset = () => {
        pulling = false; dist = 0;
        if (outer) outer.style.opacity = '0';
        if (inner) { inner.style.transform = 'translateY(-70px)'; inner.style.transition = 'transform .2s ease, opacity .2s ease'; }
      };

      el.addEventListener('touchstart', (e) => {
        if (self.sidebarOpen || Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
        const t = self.activeTab;
        if (t !== 'workspace' && t !== 'chat') return;
        if (el.scrollTop > 0) { startY = 0; return; }
        startY = e.touches[0].clientY;
        pulling = true;
        dist = 0;
        if (inner) inner.style.transition = 'none';
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (!pulling || !startY) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0 || el.scrollTop > 0) { reset(); return; }
        dist = Math.min(dy * 0.5, 80);
        if (outer) outer.style.opacity = dist > 8 ? 1 : 0;
        if (inner) inner.style.transform = `translateY(${dist - 70}px)`;
        if (dist > 8) e.preventDefault();
      }, { passive: false });

      el.addEventListener('touchend', async () => {
        if (!pulling) return;
        const willRefresh = dist >= THRESHOLD;
        pulling = false; startY = 0;
        if (willRefresh) {
          if (inner) {
            const icon = inner.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
            inner.style.transform = 'translateY(0px)';
            inner.style.transition = 'transform .2s ease, opacity .2s ease';
          }
          if (outer) outer.style.opacity = '1';
          try {
            await self.pullRefresh();
          } catch (err) { console.error('pull refresh failed', err); }
          if (inner) { const icon = inner.querySelector('i'); if (icon) icon.className = 'fa-solid fa-arrow-down'; }
        }
        reset();
        dist = 0;
      });

      el.addEventListener('touchcancel', reset);
    },

    async pullRefresh() {
      const t = this.activeTab;
      if (t === 'workspace') {
        const ws = Alpine.store('workspace');
        await Promise.allSettled([ws.loadTrello(), ws.loadCalendar(), ws.loadGmail()]);
      } else if (t === 'chat') {
        await Alpine.store('aiUsage').loadData();
      }
    },

    // --- Tab Swipe (pointer events + touch-action: pan-y) ---
    initSwipe() {
      const el = document.getElementById('scroll-container');
      if (!el || el._swipeBound) return;
      el._swipeBound = true;
      const self = this;

      let sx = 0, sy = 0, swiping = false, edge = false;

      el.addEventListener('pointerdown', function(e) {
        if (self.sidebarOpen || Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
        sx = e.clientX; sy = e.clientY; swiping = false;
        edge = e.clientX < 30;
      });

      el.addEventListener('pointermove', function(e) {
        if (!sx) return;
        const dx = Math.abs(e.clientX - sx);
        const dy = Math.abs(e.clientY - sy);
        if (dx > 15 && dx > dy * 1.5) swiping = true;
      });

      el.addEventListener('pointerup', function(e) {
        if (!sx) { sx = 0; return; }
        const dx = e.clientX - sx;
        const wasSwiping = swiping;
        sx = 0; sy = 0; swiping = false;
        if (!wasSwiping) return;

        const THRESHOLD = 60;
        if (Math.abs(dx) < THRESHOLD) return;

        // Swipe right from left edge → open sidebar
        if (edge && dx > THRESHOLD) { self.sidebarOpen = true; return; }

        const i = self.tabOrder.indexOf(self.activeTab);
        if (i === -1) return;
        if (dx < -THRESHOLD && i < self.tabOrder.length - 1) {
          self.setTab(self.tabOrder[i + 1]);
        } else if (dx > THRESHOLD && i > 0) {
          self.setTab(self.tabOrder[i - 1]);
        } else if (dx > THRESHOLD && i === 0) {
          self.sidebarOpen = true;
        }
      });

      el.addEventListener('pointercancel', function() { sx = 0; swiping = false; });
    },

    // --- Sidebar Swipe (edge right to open, swipe left on drawer/backdrop to close) ---
    initSidebarSwipe() {
      const mainEl = document.querySelector('main');
      if (!mainEl || mainEl._sidebarSwipeBound) return;
      mainEl._sidebarSwipeBound = true;
      const self = this;

      let sx = 0, swiping = false;

      // Edge swipe to OPEN sidebar
      mainEl.addEventListener('pointerdown', function(e) {
        sx = e.clientX; swiping = false;
      });
      mainEl.addEventListener('pointermove', function(e) {
        if (sx && Math.abs(e.clientX - sx) > 15) swiping = true;
      });
      mainEl.addEventListener('pointerup', function(e) {
        if (!swiping) { sx = 0; return; }
        const dx = e.clientX - sx;
        sx = 0; swiping = false;
        if (dx > 60 && e.clientX - dx < 30 && !self.sidebarOpen) {
          if (Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
          self.sidebarOpen = true;
        }
      });
      mainEl.addEventListener('pointercancel', function() { sx = 0; swiping = false; });

      // Swipe LEFT on drawer → close
      const drawer = document.getElementById('sidebar-drawer');
      if (drawer && !drawer._sidebarCloseBound) {
        drawer._sidebarCloseBound = true;
        let dsx = 0, dswiping = false;
        drawer.addEventListener('pointerdown', function(e) { dsx = e.clientX; dswiping = false; });
        drawer.addEventListener('pointermove', function(e) { if (dsx && Math.abs(e.clientX - dsx) > 15) dswiping = true; });
        drawer.addEventListener('pointerup', function(e) {
          if (!dswiping) { dsx = 0; return; }
          const dx = e.clientX - dsx;
          dsx = 0; dswiping = false;
          if (dx < -60) self.closeSidebar();
        });
        drawer.addEventListener('pointercancel', function() { dsx = 0; dswiping = false; });
      }

      // Swipe LEFT on backdrop → close
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop && !backdrop._sidebarCloseBound) {
        backdrop._sidebarCloseBound = true;
        let bsx = 0, bswiping = false;
        backdrop.addEventListener('pointerdown', function(e) { bsx = e.clientX; bswiping = false; });
        backdrop.addEventListener('pointermove', function(e) { if (bsx && Math.abs(e.clientX - bsx) > 15) bswiping = true; });
        backdrop.addEventListener('pointerup', function(e) {
          if (!bswiping) { bsx = 0; return; }
          const dx = e.clientX - bsx;
          bsx = 0; bswiping = false;
          if (dx < -60) self.closeSidebar();
        });
        backdrop.addEventListener('pointercancel', function() { bsx = 0; bswiping = false; });
      }
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
    editingExpenseId: null,
    draggedIndex: null,
    hoverIndex: null,
    incomeDraggedIndex: null,
    incomeHoverIndex: null,
    incomes: [],
    newIncome: { name: '', amount: 0, category: 'active', sub_category: '' },
    editingIncomeId: null,
    incomeExpanded: false,
    passiveSubCategories: [
      { value: 'dividend', label: 'หุ้นปันผล', emoji: '💰' },
      { value: 'reit', label: 'REIT/กองทุนอสังหา', emoji: '🏢' },
      { value: 'rent', label: 'ค่าเช่า', emoji: '🏠' },
      { value: 'interest', label: 'ดอกเบี้ย/พันธบัตร', emoji: '🏦' },
      { value: 'affiliate', label: 'Affiliate', emoji: '🤝' },
      { value: 'youtube', label: 'YouTube/คอนเทนต์', emoji: '🎬' },
      { value: 'online', label: 'ขายของออนไลน์', emoji: '🛒' },
      { value: 'crypto', label: 'คริปโต', emoji: '🪙' },
      { value: 'royalty', label: 'ค่าลิขสิทธิ์', emoji: '📚' },
      { value: 'other', label: 'อื่นๆ', emoji: '📦' }
    ],
    
    init() {
      this.editConfig = { ...this.config };
      this.loadIncomes();
    },

    async loadIncomes() {
      try {
        const res = await fetch('/api/finance/incomes');
        if (res.ok) this.incomes = await res.json();
      } catch (err) {
        console.error('Failed to load incomes', err);
      }
    },

    totalIncome() {
      return this.activeIncomeTotal() + this.passiveIncomeTotal();
    },

    activeIncomeTotal() {
      const sum = this.incomes.filter(i => i.category === 'active').reduce((s, inc) => s + inc.amount, 0);
      return sum > 0 ? sum : (this.config.active_income || 0);
    },

    passiveIncomeTotal() {
      const sum = this.incomes.filter(i => i.category === 'passive').reduce((s, inc) => s + inc.amount, 0);
      return sum > 0 ? sum : (this.config.passive_income || 0);
    },

    passiveSubLabel(value) {
      const t = this.passiveSubCategories.find(t => t.value === value);
      return t ? t.label : 'อื่นๆ';
    },

    passiveSubEmoji(value) {
      const t = this.passiveSubCategories.find(t => t.value === value);
      return t ? t.emoji : '📦';
    },

    // Group passive income by business type → [{key,label,emoji,total}]
    passiveBreakdown() {
      const map = {};
      this.incomes.filter(i => i.category === 'passive').forEach(inc => {
        const key = inc.sub_category || 'other';
        if (!map[key]) map[key] = 0;
        map[key] += inc.amount;
      });
      return Object.entries(map).map(([key, total]) => ({
        key,
        label: this.passiveSubLabel(key),
        emoji: this.passiveSubEmoji(key),
        total
      })).sort((a, b) => b.total - a.total);
    },

    passiveColors: {
      dividend: 'bg-emerald-500',
      reit: 'bg-sky-500',
      rent: 'bg-violet-500',
      interest: 'bg-amber-500',
      affiliate: 'bg-rose-500',
      youtube: 'bg-teal-500',
      online: 'bg-indigo-500',
      crypto: 'bg-orange-500',
      royalty: 'bg-fuchsia-500',
      other: 'bg-slate-400'
    },

    passiveColor(value) {
      return this.passiveColors[value] || 'bg-slate-400';
    },

    // Stacked bar segments — each passive type = its own color, width ∝ its share of total income
    passiveBarSegments() {
      const total = this.totalIncome();
      if (total <= 0) return [];
      return this.passiveBreakdown().map(item => ({
        key: item.key,
        label: item.label,
        emoji: item.emoji,
        total: item.total,
        color: this.passiveColor(item.key),
        pct: (item.total / total) * 100
      }));
    },

    incomeEmoji(income) {
      if (income.category === 'passive') return this.passiveSubEmoji(income.sub_category);
      return '💼';
    },

    incomeCategoryLabel(income) {
      if (income.category === 'passive') return '📈 ' + this.passiveSubLabel(income.sub_category);
      return '💼 รายได้ประจำ (Active)';
    },

    toggleIncome() {
      this.incomeExpanded = !this.incomeExpanded;
    },

    async addIncome() {
      try {
        const payload = { ...this.newIncome };
        if (this.editingIncomeId) {
          const res = await fetch(`/api/finance/incomes/${this.editingIncomeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            this.incomes = this.incomes.map(i => i.id === this.editingIncomeId ? { ...i, ...payload } : i);
          } else {
            throw new Error('Failed');
          }
        } else {
          const res = await fetch('/api/finance/incomes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const added = await res.json();
            this.incomes.push({ ...payload, id: added.id || Date.now() });
          } else {
            throw new Error('Failed');
          }
        }
      } catch (err) {
        console.error('Failed to save income', err);
        if (!this.editingIncomeId) this.incomes.push({ ...this.newIncome, id: Date.now() });
      }
      this.newIncome = { name: '', amount: 0, category: 'active', sub_category: '' };
      this.editingIncomeId = null;
      Alpine.store('ui').addIncomeModalOpen = false;
    },

    openAddIncome() {
      this.editingIncomeId = null;
      this.newIncome = { name: '', amount: 0, category: 'active', sub_category: '' };
      Alpine.store('ui').addIncomeModalOpen = true;
    },

    openEditIncome(income) {
      this.editingIncomeId = income.id;
      this.newIncome = { name: income.name, amount: income.amount, category: income.category, sub_category: income.sub_category || '' };
      Alpine.store('ui').addIncomeModalOpen = true;
    },

    async deleteIncome(id) {
      try {
        await fetch(`/api/finance/incomes/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error(err);
      }
      this.incomes = this.incomes.filter(i => i.id !== id);
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

    // --- Income Drag & Drop Reorder ---
    initIncomeDragHandles() {
      const self = this;
      document.querySelectorAll('.income-grip-handle').forEach(handle => {
        if (handle._incomeDragBound) return;
        handle._incomeDragBound = true;
        handle.addEventListener('touchmove', function(e) {
          e.preventDefault();
          self.onIncomeTouchMove(e);
        }, { passive: false });
      });
    },

    onIncomeDragStart(index) {
      this.incomeDraggedIndex = index;
      this.incomeHoverIndex = index;
    },

    onIncomeDragOver(index) {
      if (this.incomeDraggedIndex !== null && this.incomeHoverIndex !== index) {
        this.incomeHoverIndex = index;
      }
    },

    onIncomeDragEnd() {
      this.finalizeIncomeReorder();
    },

    onIncomeTouchStart(e, index) {
      this.incomeDraggedIndex = index;
      this.incomeHoverIndex = index;
      requestAnimationFrame(() => this.initIncomeDragHandles());
    },

    onIncomeTouchMove(e) {
      if (this.incomeDraggedIndex === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elem) return;
      const row = elem.closest('[data-income-index]');
      if (row) {
        const targetIndex = parseInt(row.getAttribute('data-income-index'), 10);
        if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < this.incomes.length && this.incomeHoverIndex !== targetIndex) {
          this.incomeHoverIndex = targetIndex;
        }
      }
    },

    onIncomeTouchEnd() {
      this.finalizeIncomeReorder();
    },

    async finalizeIncomeReorder() {
      if (this.incomeDraggedIndex !== null && this.incomeHoverIndex !== null && this.incomeDraggedIndex !== this.incomeHoverIndex) {
        const item = this.incomes.splice(this.incomeDraggedIndex, 1)[0];
        this.incomes.splice(this.incomeHoverIndex, 0, item);
        this.incomeDraggedIndex = null;
        this.incomeHoverIndex = null;
        await this.saveIncomeOrder();
        requestAnimationFrame(() => this.initIncomeDragHandles());
      } else {
        this.incomeDraggedIndex = null;
        this.incomeHoverIndex = null;
      }
    },

    async saveIncomeOrder() {
      const ids = this.incomes.map(i => i.id);
      try {
        await fetch('/api/finance/incomes/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ income_ids: ids })
        });
      } catch (err) {
        console.error('Failed to save income order:', err);
      }
    },
    
    formatMoney(amount) {
      return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
    },
    
    totalExpenses() {
      return this.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    },
    
    formattedNetBalance() {
      const net = (this.activeIncomeTotal() + this.passiveIncomeTotal()) - this.totalExpenses();
      return this.formatMoney(net);
    },
    
    activeIncomePercent() {
      const total = this.activeIncomeTotal() + this.passiveIncomeTotal();
      if (total === 0) return 0;
      return (this.activeIncomeTotal() / total) * 100;
    },
    
    passiveIncomePercent() {
      const total = this.activeIncomeTotal() + this.passiveIncomeTotal();
      if (total === 0) return 0;
      return (this.passiveIncomeTotal() / total) * 100;
    },
    
    freedomPercent() {
      if (this.config.passive_goal === 0) return 0;
      const p = (this.passiveIncomeTotal() / this.config.passive_goal) * 100;
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

    // ตั้งเป้าหมายอิสรภาพทางการเงินตามรายจ่ายต่อเดือน (เติมค่าใน modal ให้ยืนยัน)
    quickSetGoalFromExpenses() {
      this.editConfig = { ...this.editConfig, passive_goal: this.totalExpenses() };
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
      this.editingExpenseId = null;
      Alpine.store('ui').addExpenseModalOpen = false;
    },

    // Tap icon/name → open edit modal with existing values
    openEditExpense(expense) {
      this.editingExpenseId = expense.id;
      this.newExpense = { name: expense.name, amount: expense.amount, category: expense.category, due_day: expense.due_day };
      Alpine.store('ui').addExpenseModalOpen = true;
    },

    async updateExpense() {
      const id = this.editingExpenseId;
      if (id == null) return;
      try {
        const payload = { ...this.newExpense };
        const response = await fetch(`/api/finance/expenses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed');
        const idx = this.expenses.findIndex(e => e.id === id);
        if (idx !== -1) this.expenses[idx] = { ...this.expenses[idx], ...payload };
      } catch (err) {
        console.error('Failed to update expense', err);
        const idx = this.expenses.findIndex(e => e.id === id);
        if (idx !== -1) this.expenses[idx] = { ...this.expenses[idx], ...this.newExpense };
      }
      this.newExpense = { name: '', amount: 0, category: 'housing', due_day: 1 };
      this.editingExpenseId = null;
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
    loadingTrello: false,
    loadingCalendar: false,
    loadingGmail: false,
    trelloConnected: localStorage.getItem('ws_trello') === 'true',
    calendarConnected: localStorage.getItem('ws_calendar') === 'true',
    gmailConnected: localStorage.getItem('ws_gmail') === 'true',
    lastUpdated: null,

    // display order (settings)
    order: (() => { try { const o = JSON.parse(localStorage.getItem('ws_order')); return Array.isArray(o) && o.length === 3 ? o : ['trello', 'calendar', 'gmail']; } catch (e) { return ['trello', 'calendar', 'gmail']; } })(),
    settingsOpen: false,

    // disconnect confirmation
    disconnectConfirm: null,

    connecting: { trello: false, calendar: false, gmail: false },
    connectModalOpen: false,
    selectedService: null,
    
    trello: [],
    calendar: [],
    gmail: [],

    currentUser() {
      return (Alpine.store('auth').user && Alpine.store('auth').user.email) || 'admin@myfinance.app';
    },

    init() {
      // Handle OAuth return callbacks
      const params = new URLSearchParams(window.location.search);
      const isTrelloReturn = params.get('trello_token') === '1';
      const isGoogleReturn = params.get('oauth') === 'google';

      if (isTrelloReturn && window.location.hash && window.location.hash.startsWith('#token=')) {
        const token = window.location.hash.slice(7);
        this.saveTrelloToken(token);
        // Clean URL
        history.replaceState(null, '', '/');
        return;
      }
      if (isGoogleReturn) {
        history.replaceState(null, '', '/');
        this.reloadStatus();
        return;
      }

      // Normal load: verify real connection status from server
      this.reloadStatus();
    },

    async reloadStatus() {
      try {
        const res = await fetch('/api/workspace/status?user=' + encodeURIComponent(this.currentUser()));
        if (res.ok) {
          const s = await res.json();
          this.trelloConnected = !!s.trello;
          this.calendarConnected = !!s.calendar;
          this.gmailConnected = !!s.gmail;
          localStorage.setItem('ws_trello', this.trelloConnected ? 'true' : 'false');
          localStorage.setItem('ws_calendar', this.calendarConnected ? 'true' : 'false');
          localStorage.setItem('ws_gmail', this.gmailConnected ? 'true' : 'false');
          if (this.trelloConnected && this.trello.length === 0) this.loadTrello();
          if (this.calendarConnected && this.calendar.length === 0) this.loadCalendar();
          if (this.gmailConnected && this.gmail.length === 0) this.loadGmail();
        }
      } catch (err) {
        console.error('Failed to load workspace status', err);
      }
    },

    async saveTrelloToken(token) {
      try {
        await fetch('/api/workspace/trello/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, user: this.currentUser() })
        });
        this.trelloConnected = true;
        localStorage.setItem('ws_trello', 'true');
        await this.loadTrello();
      } catch (err) {
        console.error('Failed to save trello token', err);
      }
    },

    connectedCount() {
      let count = 0;
      if (this.trelloConnected) count++;
      if (this.calendarConnected) count++;
      if (this.gmailConnected) count++;
      return count;
    },

    lastUpdatedLabel() {
      if (!this.lastUpdated) return '';
      const d = new Date(this.lastUpdated);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    orderIndex(provider) { return this.order.indexOf(provider); },

    moveUp(provider) {
      const i = this.order.indexOf(provider);
      if (i <= 0) return;
      [this.order[i - 1], this.order[i]] = [this.order[i], this.order[i - 1]];
      localStorage.setItem('ws_order', JSON.stringify(this.order));
    },

    moveDown(provider) {
      const i = this.order.indexOf(provider);
      if (i < 0 || i >= this.order.length - 1) return;
      [this.order[i + 1], this.order[i]] = [this.order[i], this.order[i + 1]];
      localStorage.setItem('ws_order', JSON.stringify(this.order));
    },

    // --- Drag & Drop reorder with grip handle ---
    wsDraggedIndex: null,
    wsHoverIndex: null,

    initWsDragHandles() {
      const self = this;
      document.querySelectorAll('.ws-grip-handle').forEach(handle => {
        if (handle._wsDragBound) return;
        handle._wsDragBound = true;
        handle.addEventListener('touchmove', function(e) {
          e.preventDefault();
          self.onWsTouchMove(e);
        }, { passive: false });
      });
    },

    onWsDragStart(index) {
      this.wsDraggedIndex = index;
      this.wsHoverIndex = index;
    },

    onWsDragOver(index) {
      if (this.wsDraggedIndex !== null && this.wsHoverIndex !== index) {
        this.wsHoverIndex = index;
      }
    },

    onWsDragEnd() {
      this.finalizeWsReorder();
    },

    onWsTouchStart(e, index) {
      this.wsDraggedIndex = index;
      this.wsHoverIndex = index;
      requestAnimationFrame(() => this.initWsDragHandles());
    },

    onWsTouchMove(e) {
      if (this.wsDraggedIndex === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elem) return;
      const row = elem.closest('[data-ws-index]');
      if (row) {
        const targetIndex = parseInt(row.getAttribute('data-ws-index'), 10);
        if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < this.order.length && this.wsHoverIndex !== targetIndex) {
          this.wsHoverIndex = targetIndex;
        }
      }
    },

    onWsTouchEnd() {
      this.finalizeWsReorder();
    },

    finalizeWsReorder() {
      if (this.wsDraggedIndex !== null && this.wsHoverIndex !== null && this.wsDraggedIndex !== this.wsHoverIndex) {
        const item = this.order.splice(this.wsDraggedIndex, 1)[0];
        this.order.splice(this.wsHoverIndex, 0, item);
        localStorage.setItem('ws_order', JSON.stringify(this.order));
      }
      this.wsDraggedIndex = null;
      this.wsHoverIndex = null;
      requestAnimationFrame(() => this.initWsDragHandles());
    },

    openSettings() { this.settingsOpen = true; },
    closeSettings() { this.settingsOpen = false; },

    requestDisconnect(service) { this.disconnectConfirm = service; },
    cancelDisconnect() { this.disconnectConfirm = null; },

    async confirmDisconnect() {
      const service = this.disconnectConfirm;
      this.disconnectConfirm = null;
      if (service) await this.disconnectService(service);
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
      const user = encodeURIComponent(this.currentUser());
      if (service === 'trello') {
        window.location.href = '/api/workspace/connect/trello?user=' + user;
      } else {
        // calendar & gmail both use Google OAuth
        window.location.href = '/api/workspace/connect/google?user=' + user;
      }
      this.connecting[service] = false;
    },

    async disconnectService(service) {
      const provider = service;
      try {
        await fetch('/api/workspace/' + provider + '?user=' + encodeURIComponent(this.currentUser()), { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to disconnect', err);
      }
      if (provider === 'trello') {
        this.trelloConnected = false;
        this.trello = [];
        localStorage.setItem('ws_trello', 'false');
      } else if (provider === 'calendar') {
        this.calendarConnected = false;
        this.calendar = [];
        localStorage.setItem('ws_calendar', 'false');
      } else if (provider === 'gmail') {
        this.gmailConnected = false;
        this.gmail = [];
        localStorage.setItem('ws_gmail', 'false');
      }
      this.lastUpdated = Date.now();
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
      // Connect sequentially: Google first (covers calendar+gmail), then Trello
      if (!this.calendarConnected && !this.gmailConnected) {
        window.location.href = '/api/workspace/connect/google?user=' + encodeURIComponent(this.currentUser());
      } else if (!this.trelloConnected) {
        window.location.href = '/api/workspace/connect/trello?user=' + encodeURIComponent(this.currentUser());
      }
    },

    async loadTrello() {
      this.loadingTrello = true;
      try {
        const res = await fetch('/api/workspace/trello');
        if (res.ok) { this.trello = await res.json(); this.lastUpdated = Date.now(); }
        if (Alpine.store('notification')) Alpine.store('notification').refreshFromWorkspace();
      } catch (err) {
        console.error('Failed to load trello', err);
      } finally {
        this.loadingTrello = false;
      }
    },

    async loadCalendar() {
      this.loadingCalendar = true;
      try {
        const res = await fetch('/api/workspace/calendar');
        if (res.ok) { this.calendar = await res.json(); this.lastUpdated = Date.now(); }
        if (Alpine.store('notification')) Alpine.store('notification').refreshFromWorkspace();
      } catch (err) {
        console.error('Failed to load calendar', err);
      } finally {
        this.loadingCalendar = false;
      }
    },

    async loadGmail() {
      this.loadingGmail = true;
      try {
        const res = await fetch('/api/workspace/gmail');
        if (res.ok) { this.gmail = await res.json(); this.lastUpdated = Date.now(); }
        if (Alpine.store('notification')) Alpine.store('notification').refreshFromWorkspace();
      } catch (err) {
        console.error('Failed to load gmail', err);
      } finally {
        this.loadingGmail = false;
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
    lastUpdated: null,
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
          this.lastUpdated = Date.now();
        }
      } catch (err) {
        console.error('Failed to load AI usage data:', err);
      }
      this.loading = false;
    },

    lastUpdatedLabel() {
      if (!this.lastUpdated) return '';
      const d = new Date(this.lastUpdated);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  // --- RunQuest MMO Store (Mockup Demo — ยังไม่เชื่อมต่อ Apple Health จริง) ---
  // เลเวล = ระดับฝีเท้าจริง เทียบมาตรฐานนักวิ่งทั้งโลก (อ้างอิงสถิติโลกจริง)
  // 4 คลาส: สปรินเตอร์ / นักวิ่งกลาง / นักวิ่งไกล / อัลตร้า + Overall
  Alpine.store('game', {
    // ฝีเท้าจริงต่อคลาส (วินาที/กม., mock — อนาคต: คำนวณจาก Apple Health)
    paces: { sprint: 235, mid: 340, long: 390 }, // 3:55 / 5:40 / 6:30
    longestKm: 21.1, // ระยะไกลสุดที่เคยวิ่ง (ฮาล์ฟ)
    stats: {
      totalKm: 186.4,
      runs: 42,
      calories: 12480,
    },
    classOrder: ['sprint', 'mid', 'long', 'ultra'],
    classMeta: {
      sprint: { icon: 'fa-bolt', name: 'สปรินเตอร์', desc: 'ระยะสั้น 400m–1K' },
      mid: { icon: 'fa-person-running', name: 'นักวิ่งกลาง', desc: 'มาตรฐาน 5K–10K' },
      long: { icon: 'fa-water', name: 'นักวิ่งไกล', desc: 'ฮาล์ฟ–มาราธอน' },
      ultra: { icon: 'fa-mountain', name: 'อัลตร้า', desc: 'ระยะไกลสุด + ปริมาณสะสม' },
    },
    // มาตรฐาน 20 ระดับ อ้างอิงสถิติโลกจริง (fast = ขอบเร็ว, slow = ขอบช้า; วินาที/กม.)
    levels: [
      { lv: 1,  title: '🌱 มือใหม่หัดวิ่ง',        fast: 540, slow: 9999, ref: 'วิ่งต่อเนื่อง 2–3 km',            note: 'เพิ่งเข้าวงการ' },
      { lv: 2,  title: '🐣 ผู้เริ่มต้น',            fast: 510, slow: 540,  ref: '5K ใน ~45 นาที',                 note: '' },
      { lv: 3,  title: '🌿 นักวิ่งเพื่อสุขภาพ',     fast: 480, slow: 510,  ref: '5K ใน ~42 นาที',                 note: '' },
      { lv: 4,  title: '🍃 นักวิ่งสายฟิต',          fast: 450, slow: 480,  ref: '5K ใน ~40 นาที',                 note: '' },
      { lv: 5,  title: '⚡ ฟิตเนสรันเนอร์',         fast: 420, slow: 450,  ref: '5K ใน ~37 นาที / 10K เริ่มได้',  note: '' },
      { lv: 6,  title: '💪 นักวิ่งกลาง',            fast: 390, slow: 420,  ref: '5K ใน ~35 นาที / 10K ได้',       note: '' },
      { lv: 7,  title: '🏃 นักวิ่งมาตรฐาน',         fast: 360, slow: 390,  ref: '5K ใน ~32 นาที',                 note: '' },
      { lv: 8,  title: '🏃‍♂️ ผ่านมาตรฐาน 5K 30 นาที', fast: 336, slow: 360, ref: '5K ≤ 30:00 (pace 6:00)',       note: 'ซ้อมจริงจัง 3–6 เดือน' },
      { lv: 9,  title: '🔥 นักแข่งสมัครเล่น',       fast: 312, slow: 336,  ref: '5K ~28:00 / 10K ~58 นาที',       note: 'top ~15%' },
      { lv: 10, title: '🎯 นักวิ่งแข่ง',            fast: 300, slow: 312,  ref: '5K ≤ 25:00 / 10K ~52 นาที',      note: 'top ~10%' },
      { lv: 11, title: '🏅 แข่งระดับจังหวัด',       fast: 276, slow: 300,  ref: '5K ~23:00 / 10K ~48 นาที',      note: '' },
      { lv: 12, title: '🇹🇭 แข่งระดับประเทศ',      fast: 252, slow: 276,  ref: '5K ~21:00 / 10K ~44 นาที / ฮาล์ฟ ~1:35', note: 'top ~2%' },
      { lv: 13, title: '⚔️ ตัวแทนทีม',             fast: 240, slow: 252,  ref: '5K ≤ 20:00 / 10K ~41 นาที',     note: 'top 1%' },
      { lv: 14, title: '🚀 นักวิ่งอาชีพสายใหม่',    fast: 222, slow: 240,  ref: '10K ~38 นาที / ฮาล์ฟ ~1:25',    note: '' },
      { lv: 15, title: '🏆 นักกีฬาอาชีพ',          fast: 204, slow: 222,  ref: '10K ~35 นาที / ฮาล์ฟ ~1:18',    note: 'ระดับทีมชาติ' },
      { lv: 16, title: '🎖️ ระดับทีมชาติ',          fast: 186, slow: 204,  ref: '5K ~16:00 / 10K ~33 นาที',     note: '' },
      { lv: 17, title: '🌍 ระดับนานาชาติ',          fast: 174, slow: 186,  ref: '5K ~14:30 / 10K ~30 นาที',     note: 'ระดับ Asian Games' },
      { lv: 18, title: '🌟 ระดับโลก',               fast: 162, slow: 174,  ref: '5K ~13:45 / 10K ~28 นาที',     note: 'ระดับ Olympic' },
      { lv: 19, title: '👑 ตำนาน',                 fast: 154, slow: 162,  ref: '5K ~13:00',                     note: 'ใกล้สถิติโลก' },
      { lv: 20, title: '💎 ผู้ทำลายสถิติโลก',       fast: 0,   slow: 154,  ref: '5K < 12:49',                    note: 'WR จริง: 12:49 (Aregawi)' },
    ],
    // อัลตร้า: เกณฑ์จากระยะไกลสุด (กม.) — 20 ระดับ
    distThresholds: [2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21.1, 25, 30, 35, 42.2, 50, 60, 80, 100],
    quests: [
      { icon: 'fa-route', name: 'วิ่งสะสม 5 km', pct: 64, coin: 50 },
      { icon: 'fa-bolt', name: 'ทำ Pace เฉลี่ย < 6:00 นาที/กม. (3 ครั้ง)', pct: 67, coin: 100 },
      { icon: 'fa-sun', name: 'วิ่งช่วงเช้า 06:00–09:00', pct: 0, coin: 80 },
      { icon: 'fa-calendar-week', name: 'วิ่งครบ 3 ครั้ง/สัปดาห์', pct: 67, coin: 150 },
      { icon: 'fa-flag-checkered', name: 'วิ่งสะสม 20 km/สัปดาห์', pct: 92, coin: 200 },
    ],
    zones: [
      { emoji: '🌲', name: 'ป่าต้นกล้า', minLevel: 1 },
      { emoji: '🏘️', name: 'หมู่บ้านฟินฟลาว', minLevel: 3 },
      { emoji: '⛰️', name: 'เขามังกรลม', minLevel: 5 },
      { emoji: '🏜️', name: 'ทะเลทรายทมิฬ', minLevel: 8 },
      { emoji: '🌊', name: 'ชายฝั่งสายลม', minLevel: 10 },
      { emoji: '❄️', name: 'ยอดเขาน้ำแข็ง', minLevel: 12 },
      { emoji: '🌋', name: 'หลุมอัคคี', minLevel: 15 },
      { emoji: '🏰', name: 'ปราสาทราชา', minLevel: 18 },
      { emoji: '🌌', name: 'ดินแดนเทพ', minLevel: 20 },
    ],
    leaderboard: [
      { rank: 1, name: 'RunnerNoi', km: 32.4, level: 10, medal: '🥇' },
      { rank: 2, name: 'AterixGz (คุณ)', km: 24.6, level: 8, medal: '🥈', me: true },
      { rank: 3, name: 'Benz_slow', km: 21.1, level: 7, medal: '🥉' },
      { rank: 4, name: 'Ploy วิ่งเช้า', km: 19.8, level: 8, medal: '4' },
      { rank: 5, name: 'DriftBike', km: 15.2, level: 6, medal: '5' },
    ],
    recentRuns: [
      { date: 'วันนี้ 19:02 น.', km: 5.2, pace: '6:05', dur: '32 นาที' },
      { date: 'เมื่อวาน', km: 8.4, pace: '5:48', dur: '49 นาที' },
      { date: '3 วันที่แล้ว', km: 3.1, pace: '6:40', dur: '21 นาที' },
      { date: '5 วันที่แล้ว', km: 10.0, pace: '5:52', dur: '59 นาที' },
    ],
    syncing: false,
    lastSync: '—',
    standardsOpen: false,
    toast: '',
    _toastTimer: null,

    fmtPace(sec) {
      const m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + String(s).padStart(2, '0');
    },
    paceLabel(l) {
      if (l.lv === 1) return 'pace > 9:00';
      if (l.lv === 20) return 'pace < 2:34';
      return 'pace ' + this.fmtPace(l.fast) + '–' + this.fmtPace(l.slow);
    },
    best5kLabel() {
      return this.fmtPace(this.paces.mid * 5);
    },
    levelFromPace(sec) {
      return this.levels.find(l => sec <= l.slow && sec > l.fast) || this.levels[19];
    },
    // เลเวลรายคลาส: sprint/mid/long วัดจาก pace, ultra วัดจากระยะไกลสุด
    classLevel(key) {
      if (key === 'ultra') {
        const th = this.distThresholds;
        const below = th.filter(t => this.longestKm >= t);
        const level = Math.min(20, below.length + 1);
        const prevT = below.length ? below[below.length - 1] : 0;
        const nextT = below.length < th.length ? th[below.length] : th[th.length - 1] + 20;
        const pct = Math.min(99, Math.max(2, Math.round(((this.longestKm - prevT) / (nextT - prevT)) * 100)));
        return { level: level, pct: pct, metric: this.longestKm + ' km (ไกลสุด)' };
      }
      const sec = this.paces[key];
      const lvObj = this.levelFromPace(sec);
      const span = lvObj.slow - lvObj.fast;
      const pct = Math.min(99, Math.max(2, Math.round(((lvObj.slow - sec) / span) * 100)));
      return { level: lvObj.lv, pct: pct, metric: this.fmtPace(sec) + '/กม.' };
    },
    // Overall = ค่าเฉลี่ยเลเวลทั้ง 4 คลาส
    overall() {
      const cs = this.classOrder.map(k => this.classLevel(k));
      const level = Math.round(cs.reduce((s, c) => s + c.level, 0) / cs.length);
      const pct = Math.round(cs.reduce((s, c) => s + c.pct, 0) / cs.length);
      return { level: level, lvObj: this.levels[Math.min(level, 20) - 1], pct: Math.max(2, Math.min(99, pct)) };
    },
    zoneLocked(z) {
      return this.overall().level < z.minLevel;
    },
    syncNow() {
      if (this.syncing) return;
      this.syncing = true;
      setTimeout(() => {
        const types = ['sprint', 'mid', 'long', 'ultra'];
        const type = types[Math.floor(Math.random() * types.length)];
        const km = Math.round(({ sprint: 0.3 + Math.random() * 0.3, mid: 3 + Math.random() * 4, long: 10 + Math.random() * 11, ultra: 25 + Math.random() * 17 }[type]) * 10) / 10;
        const before = {
          sprint: this.classLevel('sprint').level,
          mid: this.classLevel('mid').level,
          long: this.classLevel('long').level,
          ultra: this.classLevel('ultra').level,
          overall: this.overall().level,
        };
        if (type === 'ultra') {
          this.longestKm = Math.round(Math.max(this.longestKm, km) * 10) / 10;
        } else {
          const floor = { sprint: 170, mid: 300, long: 330 }[type];
          this.paces[type] = Math.max(floor, this.paces[type] - (Math.floor(Math.random() * 3) + 1));
        }
        this.stats.totalKm = Math.round((this.stats.totalKm + km) * 10) / 10;
        this.stats.runs += 1;
        this.recentRuns.unshift({
          date: 'ตอนนี้ (ซิงก์สด)',
          km: km,
          pace: type === 'ultra' ? 'เทรนยาว' : this.fmtPace(this.paces[type]),
          dur: 'รอ Apple Health',
        });
        const ups = this.classOrder.filter(k => this.classLevel(k).level > before[k]);
        let msg = `✅ ซิงก์ +${km} km (${this.classMeta[type].name})`;
        if (type !== 'ultra') msg += ` • ${this.fmtPace(this.paces[type])}/กม.`;
        if (ups.length) msg += ` 🎉 ${ups.map(k => this.classMeta[k].icon + ' ' + this.classMeta[k].name + ' Lv.' + this.classLevel(k).level).join(' · ')}`;
        if (this.overall().level > before.overall) msg += ` 🏆 Overall Lv.${this.overall().level}`;
        this.lastSync = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        this.syncing = false;
        this.showToast(msg);
      }, 1600);
    },
    showToast(msg) {
      this.toast = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toast = ''; }, 3500);
    },
  });
});

