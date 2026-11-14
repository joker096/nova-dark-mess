/**
 * PaymentO checkout integration for Mess&Anger promo.
 *
 * - Loads the PaymentO widget if available at `window.paymento` (injected by
 *   the merchant's <script> tag on the host page, OR by this file when
 *   `PAYMENTO_STORE_ID` is defined).
 * - Wires up "Unlock Premium" buttons (#paymento-checkout, #paymento-checkout-2).
 * - On success, persists a local premium receipt (used by the desktop app's
 *   `src/lib/premium.ts` when the user opens the app on the same device).
 * - On IPN receipt from PaymentO (server-side), the user can redeem via the
 *   `/api/paymento/redeem` endpoint (handled by `server.js`).
 *
 * This is intentionally lightweight: the landing never calls PaymentO directly
 * for IPN — only the desktop app's backend does (see `server.js` in the repo).
 */
(function () {
  'use strict';

  // Store ID is configured per environment. In production this is the
  // "Mess&Anger user" store ID from PaymentO admin.
  var STORE_ID = (location.hostname === 'mess.cvr.name')
    ? 'mess-anger-user'           // production
    : 'mess-anger-test';           // dev / local

  var PREMIUM_KEY = 'nova_premium_active';
  var PREMIUM_EXPIRY_KEY = 'nova_premium_expiry';
  var RECEIPT_KEY = 'nova_premium_receipt';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var PLAN = {
    id: 'premium',
    amount: 49,
    currency: 'usd',
    periodDays: 30,
  };

  function markPremiumActive(untilMs) {
    try {
      localStorage.setItem(PREMIUM_KEY, 'true');
      if (untilMs) localStorage.setItem(PREMIUM_EXPIRY_KEY, String(untilMs));
      localStorage.setItem(RECEIPT_KEY, JSON.stringify({
        at: Date.now(),
        plan: PLAN.id,
        amount: PLAN.amount,
        currency: PLAN.currency,
      }));
    } catch (e) { /* ignore */ }
  }

  function isPremiumActive() {
    try {
      var flag = localStorage.getItem(PREMIUM_KEY);
      var expiry = localStorage.getItem(PREMIUM_EXPIRY_KEY);
      if (flag !== 'true') return false;
      if (expiry) {
        var exp = parseInt(expiry, 10);
        if (!isNaN(exp) && Date.now() > exp) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function refreshButtonLabels() {
    var active = isPremiumActive();
    var btns = document.querySelectorAll(
      '#paymento-checkout, #paymento-checkout-2'
    );
    btns.forEach(function (btn) {
      btn.disabled = active;
      btn.textContent = active
        ? 'Premium active'
        : 'Unlock Premium — $0.49/mo';
    });
  }

  function onCheckoutClick() {
    var paymento = window.paymento;
    if (!paymento || typeof paymento.checkout !== 'function') {
      // Dev fallback: no widget loaded. Activate premium locally so the
      // user can test the flow. In production this path should be unreachable.
      markPremiumActive(Date.now() + PLAN.periodDays * DAY_MS);
      refreshButtonLabels();
      return;
    }
    return paymento
      .checkout({
        storeId: STORE_ID,
        plan: PLAN.id,
        amount: PLAN.amount,
        currency: PLAN.currency,
        metadata: {
          app: 'mess-andanger',
          version: '1.0.0',
        },
      })
      .then(function (result) {
        if (result && result.ok) {
          markPremiumActive(Date.now() + PLAN.periodDays * DAY_MS);
          refreshButtonLabels();
        }
        return !!result;
      })
      .catch(function () {
        return false;
      });
  }

  function bind() {
    var btns = document.querySelectorAll(
      '#paymento-checkout, #paymento-checkout-2'
    );
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        onCheckoutClick();
      });
    });
    refreshButtonLabels();
  }

  // Load the PaymentO widget if not already present. The merchant's
  // <script src="https://widget.paymento.io/v2/paymento.js"> tag is the
  // canonical way; this is a fallback for when the host page does not
  // include it (e.g. when the landing is served without the widget).
  function ensureWidget() {
    if (window.paymento && typeof window.paymento.checkout === 'function') {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://widget.paymento.io/v2/paymento.js';
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
      // Timeout so the page is never blocked on a slow widget.
      setTimeout(resolve, 4000);
    });
  }

  function boot() {
    ensureWidget().then(function () {
      bind();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
