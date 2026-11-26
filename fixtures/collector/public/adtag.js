/* Beacon Ads: a synthetic marketing tag for consent-lab. Not a real product. */
(function () {
  var script = document.currentScript;
  var endpoint = (script ? new URL(script.src).origin : '') + '/collect/ads';
  var started = false;
  var adtag = (window.adtag = window.adtag || {});
  adtag.init = function () {
    if (started) return;
    started = true;
    if (!/(?:^|; )_adtag_uid=/.test(document.cookie)) {
      document.cookie = '_adtag_uid=' + Math.random().toString(36).slice(2) + '; path=/; max-age=7776000; SameSite=Lax';
    }
    adtag.impression();
  };
  adtag.impression = function () {
    if (!started) return;
    var body = JSON.stringify({ event: 'impression', page: location.pathname, at: Date.now() });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else fetch(endpoint, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
  };
  adtag.shutdown = function () {
    started = false;
  };
})();
