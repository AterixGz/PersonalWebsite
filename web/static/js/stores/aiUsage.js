document.addEventListener('alpine:init', () => {
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
          const savedName = this.editItem.name;
          await this.loadData();
          if (Alpine.store('logs')) Alpine.store('logs').log('ai', 'บันทึก API', savedName);
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
