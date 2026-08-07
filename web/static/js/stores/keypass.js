document.addEventListener('alpine:init', () => {
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
});
