// Genera IDs opacos únicos (base36, formato compatible con el data existente).
// Usa crypto.getRandomValues en lugar de Math.random (más entropía, sin colisiones predecibles).

export function genId(): string {
  const t = Date.now().toString(36);
  const buf = new Uint8Array(7);
  crypto.getRandomValues(buf);
  let r = '';
  for (const b of buf) r += b.toString(36).padStart(2, '0');
  return t + r;
}
