import { store, saveVenta } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, fmt, fmtDate, toast, swalConfirm, swalError, swalSuccess, openModal, closeModal, registerRenderer, exposeGlobal } from '../lib/ui';
import { waLink } from '../config';
import type { Venta, VentaPago } from '../types';

function getSaldoVenta(venta: Venta) {
  const pagado = (venta.pagos || []).reduce((s, p) => s + p.monto, 0);
  return { pagado, saldo: Math.max(0, venta.total - pagado) };
}

function getTotalDeudaCliente(clienteKey: string) {
  return store.ventas
    .filter((v) => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado' && v.estado !== 'pagado')
    .reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
}

export function renderDeudas() {
  const el = document.getElementById('page-deudas');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = '';

  const clientesConDeuda: string[] = [];
  const vistos = new Set<string>();
  store.ventas.forEach((v) => {
    if (v.estado === 'pagado' || v.estado === 'cancelado') return;
    const key = v.clienteId || v.clienteNombre || '—';
    if (vistos.has(key)) return;
    vistos.add(key);
    const deuda = getTotalDeudaCliente(key);
    if (deuda > 0.01) clientesConDeuda.push(key);
  });

  if (!clientesConDeuda.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>¡Sin deudas pendientes!</p><div class="stat-sub" style="margin-top:8px;">Todos los clientes están al día</div></div>`;
    return;
  }

  const totalGlobal = clientesConDeuda.reduce((s, k) => s + getTotalDeudaCliente(k), 0);
  clientesConDeuda.sort((a, b) => getTotalDeudaCliente(b) - getTotalDeudaCliente(a));

  const cards = clientesConDeuda.map((key) => {
    const cl = store.clientes.find((c) => c.id === key);
    const nombre = cl ? cl.nombre : (store.ventas.find((v) => v.clienteId === key || v.clienteNombre === key)?.clienteNombre || '—');
    const deuda = getTotalDeudaCliente(key);
    const ventasConSaldo = store.ventas.filter((v) =>
      (v.clienteId === key || v.clienteNombre === key) &&
      v.estado !== 'cancelado' && v.estado !== 'pagado' &&
      getSaldoVenta(v).saldo > 0.01,
    );
    const masAntigua = Math.min(...ventasConSaldo.map((v) => v.fecha));
    const dias = Math.floor((Date.now() - masAntigua) / 86400000);
    const colorBorde = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--border)';
    const colorDias = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--text-muted)';

    return `<div class="m-card" style="border-left:4px solid ${colorBorde};">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">👤 ${escapeHTML(nombre)}</div>
          <div class="m-card-subtitle">${ventasConSaldo.length} pedido(s) con saldo · <span style="color:${colorDias};">${dias} día(s)</span></div>
          ${cl?.telefono ? `<div class="m-card-subtitle">📲 ${escapeHTML(cl.telefono)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-display);font-size:24px;font-weight:900;color:var(--danger);">${fmt(deuda)}</div>
          <div style="font-size:10px;color:var(--text-muted);">adeudado</div>
        </div>
      </div>
      <div class="m-card-footer">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="verCuentaCorriente('${key}')">📋 Cuenta corriente</button>
        ${cl?.telefono ? `<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspDeudaCliente('${key}')">📲 WS</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const totalGlobalEl = `<div class="card mb-16" style="border-left:4px solid var(--danger);"><div style="display:flex;justify-content:space-between;align-items:center;">
    <div><div class="section-title">💳 Total adeudado</div><div class="stat-sub" style="margin-top:4px;">${clientesConDeuda.length} cliente(s) con deuda</div></div>
    <div style="font-family:var(--font-display);font-size:28px;font-weight:900;color:var(--danger);">${fmt(totalGlobal)}</div>
  </div></div>`;

  document.getElementById('page-deudas')!.innerHTML = totalGlobalEl + `<div class="mobile-card-list">${cards}</div>`;
}

function verCuentaCorriente(key: string) {
  const cl = store.clientes.find((c) => c.id === key);
  const ventas = store.ventas.filter((v) =>
    (v.clienteId === key || v.clienteNombre === key) &&
    v.estado !== 'cancelado' && v.estado !== 'pagado' &&
    getSaldoVenta(v).saldo > 0.01,
  );
  const totalDeuda = getTotalDeudaCliente(key);
  const clNombre = cl ? cl.nombre : (ventas[0]?.clienteNombre || '—');
  const clTel = cl?.telefono || '';

  const items = ventas.map((v) => {
    const { pagado, saldo } = getSaldoVenta(v);
    return `<div style="border-bottom:1px solid var(--border);padding:8px 0;">
      <div style="display:flex;justify-content:space-between;"><strong>${escapeHTML(clNombre)}</strong> <span>${fmtDate(v.fecha)}</span></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Pedido: ${v.items.map((i) => `${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} x${i.cantidad}`).join(', ')}</div>
      ${v.descuento ? `<div style="font-size:12px;color:var(--violet);margin-top:2px;">🔖 Desc: ${fmt(v.descuento)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:4px;"><span>Total: ${fmt(v.total)}</span><span>${pagado > 0 ? `Pagado: ${fmt(pagado)}` : ''}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:2px;font-weight:700;color:var(--danger);"><span>Saldo: ${fmt(saldo)}</span></div>
    </div>`;
  }).join('');

  openModal(`📋 Cuenta corriente — ${escapeHTML(clNombre)}`, `
    <div style="margin-bottom:12px;">
      <div class="m-card-row"><span class="m-card-row-label">Cliente</span><span class="m-card-row-value">${escapeHTML(clNombre)}</span></div>
      ${clTel ? `<div class="m-card-row"><span class="m-card-row-label">Teléfono</span><span class="m-card-row-value">${escapeHTML(clTel)}</span></div>` : ''}
      <div class="m-card-row"><span class="m-card-row-label">Deuda total</span><span class="m-card-row-value" style="color:var(--danger);font-weight:700;">${fmt(getTotalDeudaCliente(key))}</span></div>
    </div>
    <div style="max-height:400px;overflow:auto;">${items || '<div class="empty-state" style="padding:16px;">Sin pagos pendientes</div>'}</div>
  `, null);
}

export async function modalRegistrarPago(key: string) {
  const deuda = getTotalDeudaCliente(key);
  openModal('💰 Registrar pago', `<div class="form-grid">
    <div class="form-group"><label>Monto</label>${moneyInput('pagoMonto', String(deuda))}</div>
    <div class="form-group"><label>Medio</label><select id="pagoMedio"><option value="efectivo">💵 Efectivo</option><option value="transferencia">🏦 Transferencia</option></select></div>
    <div class="form-group"><label>Fecha</label><input id="pagoFecha" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="form-group full"><label>Observaciones</label><textarea id="pagoObs" rows="2"></textarea></div>
  </div>`, async () => {
    const monto = parseFloat((document.getElementById('pagoMonto') as HTMLInputElement).value) || 0;
    if (!monto) { swalError('Ingresá un monto'); return; }
    const medio = (document.getElementById('pagoMedio') as HTMLSelectElement).value;
    const fecha = new Date((document.getElementById('pagoFecha') as HTMLInputElement).value).getTime() || Date.now();
    const obs = (document.getElementById('pagoObs') as HTMLTextAreaElement).value.trim();

    const venta = store.ventas.find((v) => (v.clienteId === key || v.clienteNombre === key) && getSaldoVenta(v).saldo > 0);
    if (!venta) { swalError('No hay deuda pendiente'); return; }

    const pago = { id: genId(), fecha: new Date((document.getElementById('pagoFecha') as HTMLInputElement).value).getTime() || Date.now(), monto, medio, obs };
    venta.pagos = [...(venta.pagos || []), pago];
    closeModal();
    await saveVenta(venta);
    swalSuccess('Pago registrado', `Se registraron ${fmt(monto)} en ${medio}.`);
  });
}

export async function eliminarPago(key: string, pagoId: string) {
  const res = await swalConfirm('¿Eliminar pago?', 'Esta acción no se puede deshacer.');
  if (!res.isConfirmed) return;
  const venta = store.ventas.find((v) => (v.clienteId === key || v.clienteNombre === key) && (v.pagos || []).some((p) => p.id === pagoId));
  if (!venta) return;
  venta.pagos = (venta.pagos || []).filter((p) => p.id !== pagoId);
  await saveVenta(venta);
  toast('Pago eliminado');
}

export function wspDeudaCliente(key: string) {
  const cl = store.clientes.find((c) => c.id === key);
  const tel = cl?.telefono;
  if (!tel) return;
  const deuda = getTotalDeudaCliente(key);
  const ventas = store.ventas.filter((v) =>
    (v.clienteId === key || v.clienteNombre === key) &&
    v.estado !== 'cancelado' && v.estado !== 'pagado' &&
    getSaldoVenta(v).saldo > 0.01,
  );
  let msg = `*💳 CUENTA CORRIENTE — ${cl?.nombre || 'Cliente'}*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-AR')}\n--------------------------\n\n`;
  ventas.forEach((v, idx) => {
    const { pagado, saldo } = getSaldoVenta(v);
    msg += `*Pedido ${idx + 1}* — ${fmtDate(v.fecha)}\n`;
    v.items.forEach((i) => { msg += `  • ${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} x${i.cantidad} = ${fmt(i.subtotal)}\n`; });
    if (v.descuento) msg += `  🔖 Desc: -${fmt(v.descuento)}\n`;
    msg += `  Total: ${fmt(v.total)}`;
    if (pagado > 0) msg += ` · Pagado: ${fmt(pagado)}`;
    msg += `\n  💰 *Saldo: ${fmt(saldo)}*\n\n`;
  });
  msg += `--------------------------\n💰 *TOTAL ADEUDADO: ${fmt(deuda)}*\n\nPodés pagar por efectivo o transferencia.\n📷 @nura.neco`;
  const telNum = tel.replace(/\D/g, '');
  window.open(`https://wa.me/${telNum}?text=${encodeURIComponent(msg)}`, '_blank');
}

function getTotalDeudaCliente(key: string) {
  return store.ventas
    .filter((v) => (v.clienteId === key || v.clienteNombre === key) && v.estado !== 'cancelado' && v.estado !== 'pagado')
    .reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
}

function getSaldoVenta(venta: any) {
  const pagado = (venta.pagos || []).reduce((s, p) => s + p.monto, 0);
  return { pagado, saldo: Math.max(0, venta.total - pagado) };
}

registerRenderer('deudas', renderDeudas);
exposeGlobal({ verCuentaCorriente, modalRegistrarPago, eliminarPago, wspDeudaCliente });