document.addEventListener('alpine:init', () => {
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
      const isHealthReturn = params.get('health') === '1';

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
      if (isHealthReturn) {
        history.replaceState(null, '', '/');
        // ไปหน้าเกม + อัปเดตสถานะ Google Health
        Alpine.store('ui').setTab('game');
        Alpine.store('game').checkHealth();
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
      if (Alpine.store('logs')) Alpine.store('logs').log('workspace', 'เชื่อมต่อ', service);
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
      if (Alpine.store('logs')) Alpine.store('logs').log('workspace', 'ยกเลิกการเชื่อมต่อ', service);
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
});
