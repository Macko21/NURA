// ── Supabase config — reemplaza Firebase ──────────────────────────────────────
(async function() {
  // Cargar SDK de Supabase
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  window._supabase = window.supabase.createClient(
    'https://niwikufqwwpcsoqxifbe.supabase.co',
    'sb_publishable_Gp_4lmWZhyB8ZUbFwgCKfw_aKo3Rbbj'
  );

  // Disparar evento equivalente al fb-ready de Firebase
  window._FB_READY = true; // compatibilidad con código existente
  document.dispatchEvent(new CustomEvent('fb-ready'));
  console.log('✅ Supabase NURA listo');
})();