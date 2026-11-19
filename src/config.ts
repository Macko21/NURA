// Configuración central de NURA. Solo usa variables expuestas por Vite (VITE_*).

export const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
} as const;

// Datos de contacto del negocio (centralizados; antes duplicados en ~10 lugares).
export const CONTACT = {
  instagram: '@nura.neco',
  phone1: '2262 240512',
  phone2: '2262 638838',
};

export function contactFooter(): string {
  return `📷 ${CONTACT.instagram}\n📲 ${CONTACT.phone1} / ${CONTACT.phone2}`;
}

export function waLink(text: string, phone?: string): string {
  const tel = phone ? phone.replace(/\D/g, '') : '';
  return `https://wa.me/${tel}?text=${encodeURIComponent(text)}`;
}
