document.addEventListener('alpine:init', () => {
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
});
