document.addEventListener('alpine:init', () => {
Alpine.store('logs', {
    items: [],
    filter: 'all',
    categories: [
      { key: 'all', label: 'ทั้งหมด', icon: 'fa-layer-group' },
      { key: 'system', label: 'ระบบ', icon: 'fa-gear' },
      { key: 'finance', label: 'การเงิน', icon: 'fa-chart-pie' },
      { key: 'workspace', label: 'งาน', icon: 'fa-list-check' },
      { key: 'game', label: 'เกม', icon: 'fa-gamepad' },
      { key: 'ai', label: 'AI', icon: 'fa-microchip' }
    ],
    catMeta: {
      system: 'bg-slate-100 text-slate-600',
      finance: 'bg-emerald-50 text-emerald-600',
      workspace: 'bg-sky-50 text-sky-600',
      game: 'bg-violet-50 text-violet-600',
      ai: 'bg-rose-50 text-rose-600'
    },
    init() {
      try { this.items = JSON.parse(localStorage.getItem('app_logs') || '[]'); } catch (e) { this.items = []; }
    },
    save() {
      try { localStorage.setItem('app_logs', JSON.stringify(this.items.slice(0, 500))); } catch (e) {}
    },
    log(cat, action, detail) {
      this.items.unshift({ ts: Date.now(), cat, action, detail: detail || '' });
      if (this.items.length > 500) this.items = this.items.slice(0, 500);
      this.save();
    },
    clear() { this.items = []; this.save(); },
    catLabel(key) { const c = this.categories.find(c => c.key === key); return c ? c.label : key; },
    catIcon(key) { const c = this.categories.find(c => c.key === key); return c ? c.icon : 'fa-circle'; },
    catColor(key) { return this.catMeta[key] || 'bg-slate-100 text-slate-500'; },
    countByCat(key) { return key === 'all' ? this.items.length : this.items.filter(l => l.cat === key).length; },
    todayCount() {
      const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return this.items.filter(l => l.ts >= start).length;
    },
    filtered() {
      return this.filter === 'all' ? this.items : this.items.filter(l => l.cat === this.filter);
    },
    fmtTime(ts) {
      const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  });
});
