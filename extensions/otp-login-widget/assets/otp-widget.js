/**
 * OTP Login Pro — Vanilla JS Widget
 *
 * No framework dependencies. Compatible with all Shopify themes.
 * Reads per-block config from window.OTPLoginProConfig[blockId].
 *
 * Flow:
 *   1. Phone/Email input → POST /api/otp/generate
 *   2. OTP digit input   → POST /api/otp/verify  (receives loginUrl)
 *   3. Redirect to loginUrl → server-side customer login → /account
 *
 * States: idle | loading | otp-entry | success | error
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ENDPOINTS = {
    generate: '/api/otp/generate',
    verify: '/api/otp/verify',
    resend: '/api/otp/resend',
  };

  var STATE = {
    IDLE: 'idle',
    LOADING: 'loading',
    OTP_ENTRY: 'otp-entry',
    SUCCESS: 'success',
  };

  var DEFAULT_RESEND_DELAY = 30; // seconds, overridden by server response

  // ─── Widget Factory ──────────────────────────────────────────────────────────

  function OTPWidget(blockId, cfg) {
    this.blockId = blockId;
    this.cfg = cfg;
    this.state = STATE.IDLE;
    this.requestId = null;
    this.expiresAt = null;
    this.maskedDestination = null;
    this.resendDelay = DEFAULT_RESEND_DELAY;
    this.resendTimer = null;
    this.resendInterval = null;

    this._root = document.getElementById('otp-lp-root-' + blockId);
    this._content = document.getElementById('otp-lp-content-' + blockId);

    if (!this._root || !this._content) return;

    this._applyBrandColor();
    this._render();
    this._bindTrigger();
  }

  // ─── Brand Color ────────────────────────────────────────────────────────────

  OTPWidget.prototype._applyBrandColor = function () {
    var color = this.cfg.brandColor;
    if (!color) return;

    // Derive a darker hover shade from hex
    var hover = this._darken(color, 15);
    this._root.style.setProperty('--otp-lp-primary', color);
    this._root.style.setProperty('--otp-lp-primary-hover', hover);
  };

  OTPWidget.prototype._darken = function (hex, pct) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    r = Math.max(0, Math.floor(r * (1 - pct / 100)));
    g = Math.max(0, Math.floor(g * (1 - pct / 100)));
    b = Math.max(0, Math.floor(b * (1 - pct / 100)));
    return '#' + [r, g, b].map(function (c) {
      return c.toString(16).padStart(2, '0');
    }).join('');
  };

  // ─── Popup Open / Close ─────────────────────────────────────────────────────

  OTPWidget.prototype._bindTrigger = function () {
    var self = this;
    var trigger = document.getElementById('otp-lp-trigger-' + this.blockId);
    var overlay = document.getElementById('otp-lp-overlay-' + this.blockId);
    var closeBtn = document.getElementById('otp-lp-close-' + this.blockId);

    if (trigger && overlay) {
      trigger.addEventListener('click', function () { self.open(); });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { self.close(); });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) self.close();
      });
    }

    // Inline widget: render immediately into content area
    if (this.cfg.widgetType === 'inline') {
      this._renderPhoneStep();
    }

    // Keyboard: Escape closes popup
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') self.close();
    });
  };

  OTPWidget.prototype.open = function () {
    var overlay = document.getElementById('otp-lp-overlay-' + this.blockId);
    if (overlay) overlay.classList.add('otp-lp-open');
    this._renderPhoneStep();
    // Focus first input after transition
    var self = this;
    setTimeout(function () {
      var inp = self._content.querySelector('input');
      if (inp) inp.focus();
    }, 220);
  };

  OTPWidget.prototype.close = function () {
    var overlay = document.getElementById('otp-lp-overlay-' + this.blockId);
    if (overlay) overlay.classList.remove('otp-lp-open');
    this._clearTimers();
    // Reset to idle after animation
    var self = this;
    setTimeout(function () {
      self.state = STATE.IDLE;
      self.requestId = null;
      if (self.cfg.widgetType !== 'inline') {
        self._content.innerHTML = '';
      }
    }, 220);
  };

  // ─── Render: Phone/Email Step ────────────────────────────────────────────────

  OTPWidget.prototype._renderPhoneStep = function () {
    this.state = STATE.IDLE;
    var self = this;
    var channel = this.cfg.channel;
    var isEmail = channel === 'email';
    var isBoth = channel === 'both';

    var html = '';

    // Channel tabs when "both"
    if (isBoth) {
      html += '<div class="otp-lp-tabs" id="otp-lp-tabs-' + this.blockId + '">' +
        '<button type="button" class="otp-lp-tab otp-lp-tab-active" data-channel="sms">SMS</button>' +
        '<button type="button" class="otp-lp-tab" data-channel="email">Email</button>' +
        '</div>';
    }

    var inputLabel = isBoth ? 'Phone number' : (isEmail ? 'Email address' : 'Phone number');
    var inputType = isEmail ? 'email' : 'tel';
    var inputPlaceholder = isEmail ? 'you@example.com' : '+1 555 0100';
    var inputAutoComplete = isEmail ? 'email' : 'tel';

    html += '<h2 class="otp-lp-title">Sign in</h2>' +
      '<p class="otp-lp-subtitle">We\'ll send a one-time code to verify your identity.</p>' +
      '<div class="otp-lp-error" id="otp-lp-err-' + this.blockId + '" role="alert"></div>' +
      '<div class="otp-lp-field">' +
        '<label class="otp-lp-label" for="otp-lp-phone-' + this.blockId + '">' + inputLabel + '</label>' +
        '<div class="otp-lp-input-wrap" id="otp-lp-phone-wrap-' + this.blockId + '">' +
          '<input ' +
            'class="otp-lp-input" ' +
            'id="otp-lp-phone-' + this.blockId + '" ' +
            'type="' + inputType + '" ' +
            'placeholder="' + inputPlaceholder + '" ' +
            'autocomplete="' + inputAutoComplete + '" ' +
            'inputmode="' + (isEmail ? 'email' : 'tel') + '" ' +
            'aria-label="' + inputLabel + '" ' +
          '/>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="otp-lp-btn" id="otp-lp-send-' + this.blockId + '">' +
        'Send OTP' +
      '</button>';

    this._content.innerHTML = html;

    // Bind tab switches when "both"
    if (isBoth) {
      var tabs = this._content.querySelectorAll('.otp-lp-tab');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (t) { t.classList.remove('otp-lp-tab-active'); });
          tab.classList.add('otp-lp-tab-active');
          var ch = tab.getAttribute('data-channel');
          var inp = document.getElementById('otp-lp-phone-' + self.blockId);
          if (ch === 'email') {
            inp.type = 'email';
            inp.placeholder = 'you@example.com';
            inp.inputMode = 'email';
            inp.autocomplete = 'email';
            inp.setAttribute('aria-label', 'Email address');
          } else {
            inp.type = 'tel';
            inp.placeholder = '+1 555 0100';
            inp.inputMode = 'tel';
            inp.autocomplete = 'tel';
            inp.setAttribute('aria-label', 'Phone number');
          }
          self._clearError();
        });
      });
    }

    // Submit on Enter
    var phoneInput = document.getElementById('otp-lp-phone-' + this.blockId);
    if (phoneInput) {
      phoneInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') self._handleSend();
      });
    }

    var sendBtn = document.getElementById('otp-lp-send-' + this.blockId);
    if (sendBtn) {
      sendBtn.addEventListener('click', function () { self._handleSend(); });
    }
  };

  // ─── Handle Send OTP ────────────────────────────────────────────────────────

  OTPWidget.prototype._handleSend = function () {
    if (this.state === STATE.LOADING) return;

    var phoneInput = document.getElementById('otp-lp-phone-' + this.blockId);
    var value = phoneInput ? phoneInput.value.trim() : '';

    if (!value) {
      this._showError('Please enter your ' + (this.cfg.channel === 'email' ? 'email address' : 'phone number') + '.');
      if (phoneInput) phoneInput.focus();
      return;
    }

    // Determine channel from active tab if "both"
    var channel = this.cfg.channel;
    if (channel === 'both') {
      var activeTab = this._content.querySelector('.otp-lp-tab-active');
      channel = activeTab ? activeTab.getAttribute('data-channel') : 'sms';
    }

    this._clearError();
    this._setLoading('otp-lp-send-' + this.blockId, true, 'Sending...');
    this.state = STATE.LOADING;

    var payload = { shop: this.cfg.shop, channel: channel };
    if (channel === 'email') {
      payload.email = value;
    } else {
      payload.phone = value;
    }

    var self = this;
    this._post(ENDPOINTS.generate, payload)
      .then(function (data) {
        self.state = STATE.OTP_ENTRY;
        self.requestId = data.requestId;
        self.expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
        self.maskedDestination = data.maskedDestination || value;
        self.resendDelay = data.resendDelay || DEFAULT_RESEND_DELAY;
        // Use server-returned otpLength so widget boxes match what was actually generated
        if (data.otpLength) self.cfg.otpLength = data.otpLength;
        self._currentChannel = channel;
        self._currentValue = value;
        self._renderOtpStep();
      })
      .catch(function (err) {
        self.state = STATE.IDLE;
        self._setLoading('otp-lp-send-' + self.blockId, false, 'Send OTP');
        self._showError(err.message || 'Failed to send OTP. Please try again.');
      });
  };

  // ─── Render: OTP Entry Step ──────────────────────────────────────────────────

  OTPWidget.prototype._renderOtpStep = function () {
    var len = parseInt(this.cfg.otpLength, 10) || 6;
    var masked = this.maskedDestination || 'your device';
    var self = this;

    // Build digit inputs
    var digits = '';
    for (var i = 0; i < len; i++) {
      digits += '<input ' +
        'class="otp-lp-digit" ' +
        'type="text" ' +
        'inputmode="numeric" ' +
        'maxlength="1" ' +
        'pattern="[0-9]" ' +
        'autocomplete="' + (i === 0 ? 'one-time-code' : 'off') + '" ' +
        'aria-label="Digit ' + (i + 1) + '" ' +
        'data-index="' + i + '" ' +
        '/>';
    }

    var html = '<h2 class="otp-lp-title">Enter code</h2>' +
      '<p class="otp-lp-subtitle">We sent a ' + len + '-digit code to <strong>' + this._escape(masked) + '</strong>.</p>' +
      '<div class="otp-lp-error" id="otp-lp-err-' + this.blockId + '" role="alert"></div>' +
      '<div class="otp-lp-digits" id="otp-lp-digits-' + this.blockId + '" data-length="' + len + '">' +
        digits +
      '</div>' +
      '<button type="button" class="otp-lp-btn" id="otp-lp-verify-' + this.blockId + '" disabled>' +
        'Verify' +
      '</button>' +
      '<div class="otp-lp-resend-row" id="otp-lp-resend-row-' + this.blockId + '">' +
        'Resend code in <span id="otp-lp-countdown-' + this.blockId + '">' + this.resendDelay + 's</span>' +
      '</div>' +
      '<button type="button" class="otp-lp-back" id="otp-lp-back-' + this.blockId + '">&larr; Change ' +
        (this._currentChannel === 'email' ? 'email' : 'number') +
      '</button>';

    this._content.innerHTML = html;

    this._bindDigitInputs();
    this._startResendCountdown();

    var verifyBtn = document.getElementById('otp-lp-verify-' + this.blockId);
    if (verifyBtn) {
      verifyBtn.addEventListener('click', function () { self._handleVerify(); });
    }

    var backBtn = document.getElementById('otp-lp-back-' + this.blockId);
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        self._clearTimers();
        self._renderPhoneStep();
      });
    }

    // Auto-focus first digit
    setTimeout(function () {
      var first = self._content.querySelector('.otp-lp-digit');
      if (first) first.focus();
    }, 50);
  };

  // ─── Digit Input Bindings ────────────────────────────────────────────────────

  OTPWidget.prototype._bindDigitInputs = function () {
    var self = this;
    var container = document.getElementById('otp-lp-digits-' + this.blockId);
    if (!container) return;

    var inputs = container.querySelectorAll('.otp-lp-digit');
    var len = inputs.length;

    inputs.forEach(function (input, idx) {
      // Handle paste on any digit (paste full OTP)
      input.addEventListener('paste', function (e) {
        e.preventDefault();
        var pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        for (var i = 0; i < len && i < pasted.length; i++) {
          inputs[i].value = pasted[i];
          inputs[i].classList.add('otp-lp-filled');
        }
        var nextFocus = Math.min(pasted.length, len - 1);
        inputs[nextFocus].focus();
        self._updateVerifyButton();
        if (self._isComplete()) self._handleVerify();
      });

      input.addEventListener('input', function (e) {
        // Allow only single digit
        var val = e.target.value.replace(/\D/g, '').slice(-1);
        e.target.value = val;
        e.target.classList.toggle('otp-lp-filled', val !== '');

        if (val && idx < len - 1) {
          inputs[idx + 1].focus();
        }
        self._updateVerifyButton();
        if (self._isComplete()) {
          setTimeout(function () { self._handleVerify(); }, 100);
        }
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace') {
          if (!e.target.value && idx > 0) {
            inputs[idx - 1].value = '';
            inputs[idx - 1].classList.remove('otp-lp-filled');
            inputs[idx - 1].focus();
          } else {
            e.target.value = '';
            e.target.classList.remove('otp-lp-filled');
          }
          self._updateVerifyButton();
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          inputs[idx - 1].focus();
          e.preventDefault();
        } else if (e.key === 'ArrowRight' && idx < len - 1) {
          inputs[idx + 1].focus();
          e.preventDefault();
        } else if (e.key === 'Enter' && self._isComplete()) {
          self._handleVerify();
          e.preventDefault();
        }
      });

      // Select all text on focus for easy re-entry
      input.addEventListener('focus', function () {
        e.target && e.target.select && e.target.select();
        // Cannot use e.target here since e is not in scope — use input directly
        input.select && input.select();
      });
    });
  };

  OTPWidget.prototype._getOtpCode = function () {
    var container = document.getElementById('otp-lp-digits-' + this.blockId);
    if (!container) return '';
    var inputs = container.querySelectorAll('.otp-lp-digit');
    var code = '';
    inputs.forEach(function (inp) { code += inp.value; });
    return code;
  };

  OTPWidget.prototype._isComplete = function () {
    var code = this._getOtpCode();
    var len = parseInt(this.cfg.otpLength, 10) || 6;
    return code.length === len && /^\d+$/.test(code);
  };

  OTPWidget.prototype._updateVerifyButton = function () {
    var btn = document.getElementById('otp-lp-verify-' + this.blockId);
    if (btn) btn.disabled = !this._isComplete();
  };

  // ─── Handle Verify OTP ──────────────────────────────────────────────────────

  OTPWidget.prototype._handleVerify = function () {
    if (this.state === STATE.LOADING || !this._isComplete()) return;

    var code = this._getOtpCode();
    this._clearError();
    this._setLoading('otp-lp-verify-' + this.blockId, true, 'Verifying...');
    this.state = STATE.LOADING;

    var self = this;
    this._post(ENDPOINTS.verify, {
      shop: this.cfg.shop,
      requestId: this.requestId,
      code: code,
    }).then(function (data) {
      self._clearTimers();
      self.state = STATE.SUCCESS;
      self._renderSuccess(data.loginUrl);
    }).catch(function (err) {
      self.state = STATE.OTP_ENTRY;
      self._setLoading('otp-lp-verify-' + self.blockId, false, 'Verify');
      self._clearDigits();

      var msg = err.message || 'Invalid code. Please try again.';
      if (err.remainingAttempts !== undefined) {
        msg += ' ' + err.remainingAttempts + ' attempt' + (err.remainingAttempts !== 1 ? 's' : '') + ' remaining.';
      }
      if (err.code === 'OTP_EXPIRED') {
        msg = 'Your code has expired. Please request a new one.';
        self._renderPhoneStep();
        self._showError(msg);
        return;
      }
      self._showError(msg);

      // Re-focus first digit
      var firstDigit = self._content.querySelector('.otp-lp-digit');
      if (firstDigit) firstDigit.focus();
    });
  };

  OTPWidget.prototype._clearDigits = function () {
    var container = document.getElementById('otp-lp-digits-' + this.blockId);
    if (!container) return;
    container.querySelectorAll('.otp-lp-digit').forEach(function (inp) {
      inp.value = '';
      inp.classList.remove('otp-lp-filled');
    });
    this._updateVerifyButton();
  };

  // ─── Resend Countdown ────────────────────────────────────────────────────────

  OTPWidget.prototype._startResendCountdown = function () {
    this._clearTimers();
    var self = this;
    var remaining = this.resendDelay;
    var countdownEl = document.getElementById('otp-lp-countdown-' + this.blockId);
    var resendRow = document.getElementById('otp-lp-resend-row-' + this.blockId);

    this.resendInterval = setInterval(function () {
      remaining--;
      if (countdownEl) countdownEl.textContent = remaining + 's';

      if (remaining <= 0) {
        clearInterval(self.resendInterval);
        if (resendRow) {
          resendRow.innerHTML = '<button type="button" class="otp-lp-resend-btn" id="otp-lp-resend-' + self.blockId + '">Resend code</button>';
          var resendBtn = document.getElementById('otp-lp-resend-' + self.blockId);
          if (resendBtn) {
            resendBtn.addEventListener('click', function () { self._handleResend(); });
          }
        }
      }
    }, 1000);
  };

  OTPWidget.prototype._handleResend = function () {
    var self = this;
    var resendRow = document.getElementById('otp-lp-resend-row-' + this.blockId);
    if (resendRow) {
      resendRow.innerHTML = '<span style="color:var(--otp-lp-muted)">Sending...</span>';
    }
    this._clearError();

    this._post(ENDPOINTS.resend, {
      shop: this.cfg.shop,
      requestId: this.requestId,
    }).then(function (data) {
      self.requestId = data.requestId;
      self.expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
      self.maskedDestination = data.maskedDestination || self.maskedDestination;
      self.resendDelay = data.resendDelay || DEFAULT_RESEND_DELAY;
      self._clearDigits();

      // Reset countdown
      var countdownHtml = 'Resend code in <span id="otp-lp-countdown-' + self.blockId + '">' + self.resendDelay + 's</span>';
      if (resendRow) resendRow.innerHTML = countdownHtml;
      self._startResendCountdown();
    }).catch(function (err) {
      if (resendRow) {
        resendRow.innerHTML = '<button type="button" class="otp-lp-resend-btn" id="otp-lp-resend-' + self.blockId + '">Resend code</button>';
        var resendBtn = document.getElementById('otp-lp-resend-' + self.blockId);
        if (resendBtn) {
          resendBtn.addEventListener('click', function () { self._handleResend(); });
        }
      }
      self._showError(err.message || 'Could not resend code. Please try again.');
    });
  };

  // ─── Render: Success Step ────────────────────────────────────────────────────

  OTPWidget.prototype._renderSuccess = function (loginUrl) {
    this._content.innerHTML =
      '<div class="otp-lp-success-icon" aria-hidden="true">&#10003;</div>' +
      '<p class="otp-lp-success-title">Verified!</p>' +
      '<p class="otp-lp-success-msg">Logging you in&hellip;</p>';

    if (loginUrl) {
      window.location.href = loginUrl;
    } else {
      // Fallback: redirect to redirect URL from config
      var target = this.cfg.redirectUrl || '/account';
      window.location.href = target;
    }
  };

  // ─── Error Helpers ───────────────────────────────────────────────────────────

  OTPWidget.prototype._showError = function (msg) {
    var el = document.getElementById('otp-lp-err-' + this.blockId);
    if (el) {
      el.textContent = msg;
      el.classList.add('otp-lp-visible');
    }
  };

  OTPWidget.prototype._clearError = function () {
    var el = document.getElementById('otp-lp-err-' + this.blockId);
    if (el) {
      el.textContent = '';
      el.classList.remove('otp-lp-visible');
    }
  };

  // ─── Loading State ───────────────────────────────────────────────────────────

  OTPWidget.prototype._setLoading = function (btnId, loading, label) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.innerHTML = '<span class="otp-lp-spinner" aria-hidden="true"></span>' + label;
    } else {
      btn.innerHTML = label;
    }
  };

  // ─── Timer Cleanup ───────────────────────────────────────────────────────────

  OTPWidget.prototype._clearTimers = function () {
    if (this.resendInterval) { clearInterval(this.resendInterval); this.resendInterval = null; }
    if (this.resendTimer) { clearTimeout(this.resendTimer); this.resendTimer = null; }
  };

  // ─── HTTP Utility ────────────────────────────────────────────────────────────

  OTPWidget.prototype._post = function (endpoint, body) {
    var url = this.cfg.apiBase + endpoint;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed');
          err.code = data.code;
          err.remainingAttempts = data.remainingAttempts;
          err.statusCode = res.status;
          throw err;
        }
        return data;
      });
    });
  };

  // ─── Utility ─────────────────────────────────────────────────────────────────

  OTPWidget.prototype._escape = function (str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // ─── Initial Render Placeholder ──────────────────────────────────────────────

  OTPWidget.prototype._render = function () {
    // For popup type: content is empty until trigger is clicked.
    // For inline type: _bindTrigger() calls _renderPhoneStep() directly.
  };

  // ─── Boot: Initialize All Blocks ─────────────────────────────────────────────

  function boot() {
    var configs = window.OTPLoginProConfig;
    if (!configs) return;

    Object.keys(configs).forEach(function (blockId) {
      var cfg = configs[blockId];
      if (cfg.customerLoggedIn) return; // Already logged in
      if (!cfg._initialized) {
        cfg._initialized = true;
        new OTPWidget(blockId, cfg);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Shopify Theme Editor: re-init when blocks are added/updated
  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('shopify:block:select', function () {
      setTimeout(boot, 100);
    });
    document.addEventListener('shopify:section:load', function () {
      setTimeout(boot, 100);
    });
  }

})();
