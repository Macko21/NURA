(function bootstrapMackoNative() {
  'use strict';

  const API_ORIGIN = 'https://los10mildemacko.onrender.com';
  const WS_ORIGIN = API_ORIGIN.replace(/^http/, 'ws');
  const BACKEND_RE = /^\/(api|ranking)(\/|$)/;

  const capacitor = window.Capacitor;
  const registerPlugin = capacitor?.registerPlugin?.bind(capacitor);
  const App = registerPlugin?.('App');
  const Browser = registerPlugin?.('Browser');
  const Haptics = registerPlugin?.('Haptics');
  const SplashScreen = registerPlugin?.('SplashScreen');
  const StatusBar = registerPlugin?.('StatusBar');

  window.MACKO_NATIVE = true;
  window.MACKO_NATIVE_PLATFORM = capacitor?.getPlatform?.() || 'native';
  window.MACKO_API_ORIGIN = API_ORIGIN;
  window.MACKO_WS_URL = WS_ORIGIN;
  document.documentElement.classList.add('native-app');

  // ── Fetch interceptor ─────────────────────────────────
  // Redirige /api/* y /ranking/* al server de producción
  const _origFetch = window.fetch.bind(window);
  window.fetch = function mackoFetch(input, init) {
    try {
      var url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input?.url;
      if (url && BACKEND_RE.test(url)) {
        // URL relativa → redirigir a Render
        var target = API_ORIGIN + url;
        if (typeof input === 'string') return _origFetch(target, init);
        return _origFetch(new Request(target, input), init);
      }
    } catch (_) {}
    return _origFetch(input, init);
  };

  // ── WebSocket interceptor ─────────────────────────────
  // Redirige WS a wss://los10mildemacko.onrender.com
  var _OrigWS = window.WebSocket;
  window.WebSocket = function mackoWS(url, protocols) {
    try {
      if (url && !url.startsWith('ws://localhost') && !url.startsWith('wss://localhost')) {
        return new _OrigWS(url, protocols);
      }
      // localhost → redirigir a Render
      return new _OrigWS(WS_ORIGIN, protocols);
    } catch (_) {
      return new _OrigWS(url, protocols);
    }
  };
  window.WebSocket.prototype = _OrigWS.prototype;

  // ── External URLs ─────────────────────────────────────
  window.openMackoExternalUrl = async function(url) {
    if (!/^https:\/\//i.test(String(url || ''))) throw new Error('URL inválida');
    if (Browser) return Browser.open({ url, presentationStyle: 'popover' });
    window.open(url, '_blank', 'noopener');
  };

  // ── Haptics ───────────────────────────────────────────
  window.mackoNativeImpact = async function(kind) {
    try { await Haptics?.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); } catch (_) {}
  };
  window.mackoNativeNotify = async function(ok) {
    try { await Haptics?.notification({ type: ok !== false ? 'SUCCESS' : 'ERROR' }); } catch (_) {}
  };

  // ── Chrome setup ──────────────────────────────────────
  async function configureChrome() {
    try { await StatusBar?.setStyle({ style: 'DARK' }); } catch (_) {}
    try { await StatusBar?.setBackgroundColor({ color: '#0c0c14' }); } catch (_) {}
    try { await StatusBar?.setOverlaysWebView({ overlay: false }); } catch (_) {}
    var hide = function() { try { SplashScreen?.hide(); } catch (_) {} };
    hide();
    setTimeout(hide, 500);
    setTimeout(hide, 2000);
    setTimeout(hide, 5000);
  }

  // ── App lifecycle ─────────────────────────────────────
  App?.addListener('appStateChange', function(e) {
    if (e.isActive) window.dispatchEvent(new CustomEvent('macko-native-resume'));
  });
  App?.addListener('appUrlOpen', function(e) {
    window.dispatchEvent(new CustomEvent('macko-native-link', { detail: { url: e.url } }));
    if (/payment|mercadopago|success/i.test(e.url || '')) {
      Browser?.close().catch(function() {});
      window.dispatchEvent(new CustomEvent('macko-native-resume'));
    }
  });

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', configureChrome, { once: true });
  else configureChrome();
})();
