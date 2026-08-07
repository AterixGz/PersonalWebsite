document.addEventListener('alpine:init', () => {
Alpine.store('ui', {
    activeTab: 'finance',
    sidebarOpen: false,
    sidebarDrag: null,   // px offset while finger-dragging (0..width); null = not dragging
    configModalOpen: false,
    addExpenseModalOpen: false,
    addIncomeModalOpen: false,
    keypassSettingsOpen: false,

    // Swipe gesture state
    tabOrder: ['finance', 'workspace', 'game'],
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
        if (t !== 'workspace' && t !== 'stats') return;
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
      } else if (t === 'stats') {
        await Alpine.store('aiUsage').loadData();
      }
    },

    // --- Tab Swipe (pointer events + touch-action: pan-y) ---
    initSwipe() {
      const el = document.getElementById('scroll-container');
      if (!el || el._swipeBound) return;
      el._swipeBound = true;
      const self = this;

      let sx = 0, sy = 0, swiping = false;

      el.addEventListener('pointerdown', function(e) {
        if (self.sidebarOpen || Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen) return;
        sx = e.clientX; sy = e.clientY; swiping = false;
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

        const i = self.tabOrder.indexOf(self.activeTab);
        if (i === -1) return;
        if (dx < -THRESHOLD && i < self.tabOrder.length - 1) {
          self.setTab(self.tabOrder[i + 1]);
        } else if (dx > THRESHOLD && i > 0) {
          self.setTab(self.tabOrder[i - 1]);
        }
      });

      el.addEventListener('pointercancel', function() { sx = 0; swiping = false; });
    },

    // --- Sidebar Finger-Drag (ติดนิ้ว realtime: edge drag open, drag left close, fling + threshold snap) ---
    _sidebarW() {
      const d = document.getElementById('sidebar-drawer');
      return d ? d.offsetWidth : 312;
    },
    backdropOpacity() {
      if (this.sidebarDrag !== null) {
        const w = this._sidebarW();
        return w ? Math.min(1, this.sidebarDrag / w) : 0;
      }
      return this.sidebarOpen ? 1 : 0;
    },
    initSidebarSwipe() {
      const self = this;
      const drawer = document.getElementById('sidebar-drawer');
      const backdrop = document.getElementById('sidebar-backdrop');
      const zone = document.getElementById('sidebar-edge-zone');
      if (!drawer || !backdrop || !zone || drawer._dragBound) return;
      drawer._dragBound = true;
      if (!backdrop._dragBound) backdrop._dragBound = true;
      if (!zone._dragBound) zone._dragBound = true;

      let startX = 0, startY = 0, startOpen = false, dragging = false;
      let lastX = 0, lastT = 0, velX = 0;
      let suppressClick = false;
      let gestureEl = null;

      const blockModals = () => Alpine.store('notification').modalOpen || Alpine.store('notification').detailModalOpen;

      // กัน click ที่เกิดหลัง drag (ไม่อยากให้โดนปุ่มใน drawer)
      const suppressOnce = (el) => {
        el.addEventListener('click', function(e) {
          if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
        }, true);
      };
      suppressOnce(drawer);
      suppressOnce(backdrop);

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onCancel);
        gestureEl = null;
      };

      const begin = (e) => {
        if (blockModals()) return;
        if (!self.sidebarOpen && e.clientX > 34) return; // ปิดอยู่ → เริ่มได้เฉพาะ edge
        suppressClick = false; // gesture ใหม่ → ปล่อย click ผ่าน (กันกด 2 ที)
        startX = e.clientX; startY = e.clientY;
        startOpen = self.sidebarOpen;
        dragging = false; velX = 0;
        self._dragW = self._sidebarW() || 312;
        lastX = startX; lastT = performance.now();
        gestureEl = e.target;
        // ใช้ window listeners (ไม่ setPointerCapture — capture จะแย่ง click ไปจากปุ่มลูก)
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onCancel);
      };

      const onMove = (e) => {
        if (!gestureEl) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!dragging) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // ยังเป็น tap → ปล่อย click ผ่าน
          if (Math.abs(dx) <= Math.abs(dy)) return;          // ลากแนวตั้ง = scroll ปกติ
          dragging = true;
          suppressClick = true;
          self.sidebarDrag = startOpen ? self._dragW : 0;
        }
        e.preventDefault();
        const w = self._dragW || self._sidebarW() || 312;
        let pos;
        if (startOpen) pos = Math.max(0, Math.min(w, w + dx));
        else pos = Math.max(0, Math.min(w, dx));
        self.sidebarDrag = pos;
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) velX = (e.clientX - lastX) / dt;
        lastX = e.clientX; lastT = now;
      };

      const onEnd = () => {
        cleanup();
        if (!dragging) { suppressClick = false; self.sidebarDrag = null; return; } // tap → ไม่เปลี่ยนสถานะ, click ทำงานปกติ
        const w = self._dragW || self._sidebarW() || 312;
        const pos = self.sidebarDrag;
        const TH = w * 0.3;
        let open;
        if (startOpen) {
          open = pos > w - TH;
          if (velX > 0.4) open = true;
          else if (velX < -0.4) open = false;
        } else {
          open = pos > TH;
          if (velX > 0.4) open = true;
          else if (velX < -0.4) open = false;
        }
        self.sidebarDrag = null;
        self.sidebarOpen = open;
      };

      const onCancel = () => {
        cleanup();
        suppressClick = false;
        if (self.sidebarDrag !== null) self.sidebarDrag = null;
      };

      zone.addEventListener('pointerdown', (e) => begin(e));
      drawer.addEventListener('pointerdown', (e) => { if (self.sidebarOpen) begin(e); });
      backdrop.addEventListener('pointerdown', (e) => { if (self.sidebarOpen) begin(e); });
    },

    toggleSidebar() {
      this.sidebarDrag = null;
      this.sidebarOpen = !this.sidebarOpen;
    },
    
    closeSidebar() {
      this.sidebarDrag = null;
      this.sidebarOpen = false;
    },

    setTab(tab) {
      this.activeTab = tab;
      
      // Load data on demand
      if (tab === 'stats') {
        Alpine.store('aiUsage').loadData();
        if (Alpine.store('logs')) Alpine.store('logs').log('system', 'เปิดแท็บ', 'สถิติการใช้งาน');
      }
      if (tab === 'game') {
        Alpine.store('game').loadRealStats();
        Alpine.store('game').checkHealth();
        if (Alpine.store('logs')) Alpine.store('logs').log('game', 'เปิดแท็บ', 'RunQuest');
      }
      if (tab === 'finance' && Alpine.store('logs')) Alpine.store('logs').log('finance', 'เปิดแท็บ', 'สรุปการเงิน');
      if (tab === 'workspace' && Alpine.store('logs')) Alpine.store('logs').log('workspace', 'เปิดแท็บ', 'พื้นที่ทำงาน');
      
      // Scroll to top
      const scrollContainer = document.getElementById('scroll-container');
      if (scrollContainer) scrollContainer.scrollTop = 0;
    }
  });
});
