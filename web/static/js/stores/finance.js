document.addEventListener('alpine:init', () => {
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
        const wasEdit = !!this.editingIncomeId;
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
        if (Alpine.store('logs')) Alpine.store('logs').log('finance', wasEdit ? 'แก้ไขรายได้' : 'เพิ่มรายได้', payload.name + ' ' + (payload.amount || 0) + ' บาท');
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
        if (Alpine.store('logs')) Alpine.store('logs').log('finance', 'เพิ่มรายจ่าย', payload.name + ' ' + (payload.amount || 0) + ' บาท');
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
});
