document.addEventListener('alpine:init', () => {
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
});
