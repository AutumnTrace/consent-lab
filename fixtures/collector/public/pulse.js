/* Pulse: a synthetic analytics tracker for consent-lab. Not a real product.
   init() sets a client id cookie, a session cookie and a localStorage queue;
   pageview() sends an event to the collector it was loaded from. */
(function () {
  var script = document.currentScript;
  var endpoint = (script ? new URL(script.src).origin : '') + '/collect/analytics';
  var started = false;

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }
  function writeCookie(name, value, seconds) {
    document.cookie = name + '=' + value + '; path=/; max-age=' + seconds + '; SameSite=Lax';
  }
  function newId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  var pulse = (window.pulse = window.pulse || {});
  pulse.init = function (options) {
    if (started) return;
    started = true;
    if (!readCookie('_pulse_id')) writeCookie('_pulse_id', newId(), 365 * 24 * 3600);
    writeCookie('_pulse_session', newId(), 30 * 60);
    localStorage.setItem('pulse:queue', '[]');
    pulse.site = options && options.site;
  };
  pulse.send = function (event, props) {
    var body = JSON.stringify({
      event: event,
      page: location.pathname,
      client: readCookie('_pulse_id'),
      site: pulse.site || null,
      at: Date.now(),
      props: props || {},
    });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else fetch(endpoint, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
  };
  pulse.pageview = function (path) {
    if (started) pulse.send('page_view', { path: path || location.pathname });
  };
  pulse.shutdown = function () {
    started = false;
  };
  pulse.ready = true;
})();
