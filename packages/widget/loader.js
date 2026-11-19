/**
 * Mess&Anger widget loader (<2 KB gzip).
 * Embed: <script async src="/widget/loader.js" data-site="SITE_ID"></script>
 * Reads data-site, renders a launcher button in Shadow DOM, opens iframe chat on click.
 */

(function(){
  var script = document.currentScript;
  if (!script) return;
  var siteId = script.getAttribute('data-site');
  if (!siteId) return;
  var gw = script.getAttribute('data-gateway') || (location.protocol + '//' + location.host);

  var css = '#wvc-l{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:#007aff;color:#fff;border:none;cursor:pointer;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif}#wvc-l:focus{outline:2px solid #fff;outline-offset:2px}#wvc-l svg{width:24px;height:24px;fill:#fff}#wvc-if{position:fixed;inset:0;border:none;z-index:2147483646;display:none}#wvc-if.open{display:block}';

  var btn = document.createElement('button');
  btn.id = 'wvc-l';
  btn.setAttribute('aria-label', 'Open chat');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M2 6h15v3H2V6zm0-3h18v2H2V3zm0 7h15v11H2V10zm0-3h15v2H2V7z"/></svg>';

  var shadow = btn.attachShadow({mode:'closed'});
  shadow.innerHTML = '<style>'+css+'</style>'+btn.innerHTML;

  var iframe = document.createElement('iframe');
  iframe.id = 'wvc-if';
  iframe.src = gw + '/widget/chat.html?site=' + encodeURIComponent(siteId);

  btn.addEventListener('click', function(){
    var open = iframe.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    if (open) document.body.appendChild(iframe);
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && iframe.classList.contains('open')) {
      iframe.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.body.appendChild(btn);
})();
