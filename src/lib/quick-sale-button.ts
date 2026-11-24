type Position = { x: number; y: number };
const storageKey = 'nura.quick-sale.position';

export function installQuickSaleButton(button: HTMLElement, openSale: () => void) {
  let position: Position | undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved && [saved.x, saved.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) position = saved;
  } catch { /* Use the default position if browser storage is unavailable. */ }

  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
  let suppressClick = false;
  const nav = document.getElementById('bottomNav');
  const topbar = document.querySelector<HTMLElement>('.topbar');
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  function bounds() {
    const mobile = Boolean(nav?.offsetHeight);
    const safeLeft = parseFloat(nav ? getComputedStyle(nav).paddingLeft : '') || 0;
    const safeRight = parseFloat(nav ? getComputedStyle(nav).paddingRight : '') || 0;
    const left = safeLeft + 12;
    const top = mobile && topbar ? topbar.getBoundingClientRect().bottom + 12 : 12;
    const bottom = nav?.offsetHeight ? nav.getBoundingClientRect().top : window.innerHeight;
    return {
      left,
      top,
      width: Math.max(0, window.innerWidth - button.offsetWidth - left - safeRight - 12),
      height: Math.max(0, bottom - button.offsetHeight - top - 12),
    };
  }
  function paint() {
    if (!position || !button.offsetWidth) return;
    const { left, top, width, height } = bounds();
    button.style.left = `${left + width * position.x}px`;
    button.style.top = `${top + height * position.y}px`;
    button.style.right = button.style.bottom = 'auto';
  }
  function place(left: number, top: number) {
    const area = bounds();
    position = { x: clamp((left - area.left) / (area.width || 1)), y: clamp((top - area.top) / (area.height || 1)) };
    paint();
  }
  function remember() {
    try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch { /* Keep the position for this session. */ }
  }

  button.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const { left, top } = button.getBoundingClientRect();
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top, moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;
    button.classList.add('fab-dragging');
    place(drag.left + dx, drag.top + dy);
  });
  const finish = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) remember();
    drag = undefined;
    button.classList.remove('fab-dragging');
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('lostpointercapture', finish);
  button.addEventListener('click', (event) => {
    const desdeTeclado = event.detail === 0 && !(event instanceof PointerEvent && event.pointerType);
    if (!suppressClick || desdeTeclado) openSale();
    suppressClick = false;
  });
  button.addEventListener('keydown', (event) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
    const offset = directions[event.key];
    if (!event.altKey || !offset) return;
    event.preventDefault();
    const { left, top } = button.getBoundingClientRect();
    place(left + offset[0], top + offset[1]);
    remember();
  });

  window.addEventListener('resize', paint);
  const observer = new ResizeObserver(paint);
  observer.observe(button);
  if (topbar) observer.observe(topbar);
  paint();
}
