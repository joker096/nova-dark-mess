/**
 * Premium checkout for Mess&Anger landing.
 *
 * Flow: POST /api/premium/checkout -> redirect to PaymentO gateway.
 * After payment, PaymentO IPN hits our server, which issues a license key.
 * The success page (/premium.html) polls /api/premium/order/:id and shows
 * the license key + "open in app" link.
 *
 * No dev fallback: premium is only granted by the server after a verified
 * payment.
 */
(function () {
  'use strict';

  var PRICE = '$3.90';
  var PERIOD = '30 days';

  function deviceId() {
    try {
      var k = 'nova_premium_device';
      var v = localStorage.getItem(k);
      if (!v) {
        v = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return 'dev-' + Date.now().toString(36);
    }
  }

  function apiBase() {
    return ''; // same origin
  }

  async function startCheckout() {
    var btns = document.querySelectorAll('#paymento-checkout, #paymento-checkout-2');
    btns.forEach(function (b) { b.disabled = true; b.classList.add('is-pending'); });
    try {
      var res = await fetch(apiBase() + '/api/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'premium', device: deviceId() }),
      });
      var data = await res.json();
      if (!res.ok || !data || !data.url) {
        throw new Error((data && data.error) || 'checkout failed');
      }
      // remember order id for the success page
      try { sessionStorage.setItem('nova_premium_order', data.orderId); } catch (e) {}
      window.location.href = data.url;
    } catch (err) {
      btns.forEach(function (b) { b.disabled = false; b.classList.remove('is-pending'); });
      alert('Не удалось открыть оплату: ' + (err && err.message ? err.message : err));
    }
  }

  function bind() {
    var btns = document.querySelectorAll('#paymento-checkout, #paymento-checkout-2');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        startCheckout();
      });
      btn.textContent = 'Unlock Premium — ' + PRICE + '/mo';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();