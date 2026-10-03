import { store, getLastUpdateStr } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, fmt, toast, swalInfo, openModal, closeModal, registerRenderer, exposeGlobal, verNotasVersion, EMOJIS_CAT } from '../lib/ui';
import { fmtL, fmtDate } from '../lib/format';
import { waLink, contactFooter } from '../config';
import type { Venta, VentaItem, ComboItem, Producto, Combo } from '../types';

export function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `<button class="btn btn-sm btn-outline" onclick="verNotasVersion()">📋 Notas</button>`;

  const tv = store.ventas.reduce((s, v) => s + v.total, 0);
  const tc = store.compras.reduce((s, c) => s + c.total, 0);
  const ganancia = tv - tc;
  const stockBajo = store.productos.filter(
    (p) => p.tipo === 'accesorio'
      ? (p.stockUnidades || 0) <= (p.stockMinUnidades || 0)
      : (p.stockLitros || 0) <= (p.stockMinLitros || 0),
  ).length;

  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    meses.push({ label: d.toLocaleString('es-AR', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
  }
  const vm = meses.map((m) => ({
    label: m.label,
    val: store.ventas.filter((v) => { const d = new Date(v.fecha); return d.getMonth() === m.month && d.getFullYear() === m.year; }).reduce((s, v) => s + v.total, 0),
  }));
  const maxV = Math.max(...vm.map((m) => m.val), 1);

  const ult = [...store.ventas].sort((a, b) => b.fecha - a.fecha).slice(0, 5);

  el.innerHTML = `
    <div class="dash-topbar"><div></div><div id="dashLastUpdate" class="dash-live-dot"><span></span> Actualizado ${getLastUpdateStr()}</div></div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--accent-soft);color:var(--accent);">💰</div><div class="kpi-label">Ventas</div><div class="kpi-value">${fmt(tv)}</div><div class="kpi-sub">${store.ventas.length} ventas</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--purple-soft);color:var(--purple);">📦</div><div class="kpi-label">Compras</div><div class="kpi-value">${fmt(tc)}</div><div class="kpi-sub">${store.compras.length} compras</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:${ganancia >= 0 ? 'var(--green-soft)' : 'var(--danger-soft)'};color:${ganancia >= 0 ? 'var(--green)' : 'var(--danger)'};">${ganancia >= 0 ? '📈' : '📉'}</div><div class="kpi-label">Ganancia neta</div><div class="kpi-value">${fmt(ganancia)}</div><div class="kpi-sub">Margen: ${tv > 0 ? ((ganancia / tv) * 100).toFixed(1) : 0}%</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--warning-soft);color:var(--warning);">⚠️</div><div class="kpi-label">Stock crítico</div><div class="kpi-value">${stockBajo}</div><div class="kpi-sub">productos</div></div>
    </div>

    <div class="card mb-16"><div class="section-title">📊 Ventas últimos 6 meses</div>
      <div class="chart-wrap" style="height:220px;">${vm.map((m) => `<div class="chart-bar" style="height:${(m.val / maxV) * 100}%;" title="${m.label}: ${fmt(m.val)}"><span class="chart-label">${m.label}</span><span class="chart-value">${fmt(m.val)}</span></div>`).join('')}</div>
    </div>

    <div class="card"><div class="section-title">🕒 Últimas 5 ventas</div>
      ${ult.length ? `<div class="mobile-card-list">${ult.map((v) => `<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${escapeHTML(v.clienteNombre || '—')}</div></div><div style="font-family:var(--font-display);font-weight:800;" class="text-gradient">${fmt(v.total)}</div></div><div class="m-card-body"><div class="m-card-row"><span class="m-card-row-label">Fecha</span><span class="m-card-row-value">${fmtDate(v.fecha)}</span></div><div class="m-card-row"><span class="m-card-row-label">Estado</span><span class="m-card-row-value">${v.estado}</span></div></div></div>`).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">📭</div><p>Sin ventas recientes</p></div>`}
    </div>`;
}

function calcularCostoVenta(venta: Venta): number {
  let costoTotal = 0;
  venta.items.forEach((item) => {
    if (item.costoUnitario != null && item.costoUnitario > 0) {
      costoTotal += item.costoUnitario * item.cantidad;
      return;
    }
    if (item.esCombo) {
      const combo = store.combos.find((c) => c.id === item.comboId);
      if (combo) {
        (combo.items || []).forEach((ci) => {
          const p = store.productos.find((x) => x.id === ci.productoId);
          if (!p) return;
          if (ci.esAcc) {
            costoTotal += (p.costoUnidad || 0) * ci.cantidad * item.cantidad;
          } else {
            const pr = (p.presentaciones || []).find((x) => x.id === ci.presId);
            const costoL = p.costoLitro || 0;
            const litros = pr ? pr.litros : (ci.litrosPorUnidad || 0);
            const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
            costoTotal += (costoL * litros + costoEnvase) * ci.cantidad * item.cantidad;
          }
        });
      }
    } else if (item.esAcc) {
      const p = store.productos.find((x) => x.id === item.productoId);
      if (p) costoTotal += (p.costoUnidad || 0) * item.cantidad;
    } else {
      const p = store.productos.find((x) => x.id === item.productoId);
      if (!p) return;
      const pr = (p.presentaciones || []).find((x) => x.id === item.presId);
      const costoL = p.costoLitro || 0;
      const litros = pr ? pr.litros : (item.litrosPorUnidad || 0);
      const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
      costoTotal += (costoL * litros + costoEnvase) * item.cantidad;
    }
  });
  return costoTotal;
}

function renderReportes() {
  const el = document.getElementById('page-reportes');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `<button class="btn btn-sm btn-outline" onclick="wspReporte()">📲 WSP</button>`;

  const tipoFiltro = (document.getElementById('repFiltro') as HTMLSelectElement)?.value || 'todo';
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59).getTime();
  const inicioAno = new Date(hoy.getFullYear(), 0, 1).getTime();
  const finAno = new Date(hoy.getFullYear(), 11, 31, 23, 59, 59).getTime();

  const ventasFiltradas = [...store.ventas].filter((v) => {
    if (tipoFiltro === 'mes') return v.fecha >= inicioMes && v.fecha <= finMes;
    if (tipoFiltro === 'ano') return v.fecha >= inicioAno && v.fecha <= finAno;
    return true;
  }).sort((a, b) => b.fecha - a.fecha);

  const total = ventasFiltradas.reduce((s, v) => s + v.total, 0);
  const costo = ventasFiltradas.reduce((s, v) => s + calcularCostoVenta(v), 0);
  const ganancia = total - costo;

  const porCliente = ventasFiltradas.reduce((acc, v) => {
    const key = v.clienteNombre || '—';
    acc[key] = (acc[key] || 0) + v.total;
    return acc;
  }, {} as Record<string, number>);
  const topClientes = Object.entries(porCliente).sort(([, a], [, b]) => b - a).slice(0, 10);

  const porProducto = ventasFiltradas.reduce((acc, v) => {
    v.items.forEach((it) => {
      acc[it.nombre] = (acc[it.nombre] || 0) + it.subtotal;
    });
    return acc;
  }, {} as Record<string, number>);
  const topProductos = Object.entries(porProducto).sort(([, a], [, b]) => b - a).slice(0, 10);

  el.innerHTML = `
    <div class="flex flex-center gap-8 mb-16 flex-wrap">
      <select id="repFiltro" onchange="renderReportes()" style="max-width:160px;">
        <option value="mes" ${tipoFiltro === 'mes' ? 'selected' : ''}>Este mes</option>
        <option value="ano" ${tipoFiltro === 'ano' ? 'selected' : ''}>Este año</option>
        <option value="todo" ${tipoFiltro === 'todo' ? 'selected' : ''}>Todo</option>
      </select>
      <button class="btn btn-sm btn-outline" onclick="limpiarFiltroReportes()">🔄</button>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Ventas</div><div class="kpi-value">${fmt(total)}</div><div class="kpi-sub">${ventasFiltradas.length} transacciones</div></div>
      <div class="kpi-card"><div class="kpi-label">Costo est.</div><div class="kpi-value">${fmt(costo)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ganancia neta</div><div class="kpi-value">${fmt(ganancia)}</div><div class="kpi-sub">Margen: ${total > 0 ? ((ganancia / total) * 100).toFixed(1) : 0}%</div></div>
    </div>

    <div class="card mb-16"><div class="section-title">🏆 Top 10 Clientes</div>
      <div class="table-wrap hide-mobile"><table><thead><tr><th>Cliente</th><th>Total</th></tr></thead><tbody>${
        Object.entries(porCliente).sort(([, a], [, b]) => b - a).map(([nombre, val]) => `<tr><td>${escapeHTML(nombre)}</td><td class="fw-700">${fmt(val)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="empty-state">Sin datos</div></td></tr>'
      }</tbody></table></div></div>

    <div class="card mb-16"><div class="section-title">📦 Top 10 Productos</div>
      <div class="table-wrap hide-mobile"><table><thead><tr><th>Producto</th><th>Total</th></tr></thead><tbody>${
        Object.entries(porProducto).sort(([, a], [, b]) => b - a).map(([nombre, val]) => `<tr><td>${escapeHTML(nombre)}</td><td class="fw-700">${fmt(val)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="empty-state">Sin datos</div></td></tr>'
      }</tbody></table></div></div>

    <div class="card"><div class="section-title">📋 Ventas detalladas</div>
      <div class="table-wrap hide-mobile"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Total</th><th>Estado</th></tr></tbody><tbody>${
        ventasFiltradas.map((v) => `<tr><td>${fmtDate(v.fecha)}</td><td>${escapeHTML(v.clienteNombre || '—')}</td><td>${v.items.length}</td><td class="fw-700">${fmt(v.total)}</td><td>${v.estado}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">Sin ventas</div></td></tr>'
      }</tbody></table></div></div>`;
}

function renderMisReportes() {
  if (!store.ventas.length) {
    document.getElementById('page-misreportes')!.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Sin datos de ventas</p></div>`;
    return;
  }
  document.getElementById('topbarActions')!.innerHTML = `<button class="btn btn-sm btn-outline" onclick="wspReporte()">📲 WSP</button>`;

  const miVentas = [...store.ventas].filter((v) => Sesion.esVendedor() ? v.vendedorId === Sesion.uid() : true).sort((a, b) => b.fecha - a.fecha);
  const total = miVentas.reduce((s, v) => s + v.total, 0);
  const ganancia = miVentas.reduce((s, v) => s + v.items.reduce((s2, i) => s2 + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0), 0);

  document.getElementById('page-misreportes')!.innerHTML = `
    <div class="kpi-grid mb-16">
      <div class="kpi-card"><div class="kpi-label">Mis ventas</div><div class="kpi-value">${fmt(total)}</div><div class="kpi-sub">${miVentas.length} ventas</div></div>
      <div class="kpi-card"><div class="kpi-label">Mi ganancia</div><div class="kpi-value">${fmt(ganancia)}</div></div>
    </div>
    <div class="card"><div class="section-title">Mis últimas ventas</div>
      <div class="mobile-card-list">${[...miVentas].sort((a, b) => b.fecha - a.fecha).slice(0, 20).map((v) => `<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${escapeHTML(v.clienteNombre || '—')}</div></div><div style="font-family:var(--font-display);font-weight:800;" class="text-gradient">${fmt(v.total)}</div></div><div class="m-card-body"><div class="m-card-row"><span class="m-card-row-label">Fecha</span><span class="m-card-row-value">${fmtDate(v.fecha)}</span></div><div class="m-card-row"><span class="m-card-row-label">Ganancia</span><span class="m-card-row-value">${fmt(v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))}</span></div></div></div>`).join('')}</div></div>`;
}

export function wspReporte() {
  if (!store.productos.length) { swalInfo('Sin productos', 'No hay productos en el catálogo.'); return; }
  let msg = `*🌿 NURA — Catálogo*\n\n`;
  const cats = [...new Set(store.productos.map((p) => p.categoria))];
  cats.forEach((cat) => {
    msg += `*${(EMOJIS_CAT as Record<string, string>)[cat] || '🧴'} ${cat}*\n`;
    store.productos.filter((p) => p.categoria === cat).forEach((p) => {
      if (p.tipo === 'accesorio') msg += `  • ${p.nombre}${p.codigo ? ' #' + p.codigo : ''} — ${fmt(p.precioVenta)}\n`;
      else (p.presentaciones || []).forEach((pr) => { msg += `  • ${p.nombre} ${pr.nombre}${p.codigo ? ' #' + p.codigo : ''} — ${fmt(pr.precioVenta)}\n`; });
    });
    msg += '\n';
  });
  if (store.combos.length) {
    msg += `*🎁 Combos*\n`;
    store.combos.forEach((c) => { msg += `  • ${c.nombre} — ${fmt(c.precio)}\n`; });
    msg += '\n';
  }
  msg += `${contactFooter()}\n📷 @nura.neco | 📲 2262 240512`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function limpiarFiltroReportes() {
  (document.getElementById('repFiltro') as HTMLSelectElement).value = 'todo';
  renderReportes();
}

registerRenderer('dashboard', renderDashboard);
registerRenderer('reportes', renderReportes);
registerRenderer('misreportes', renderMisReportes);
exposeGlobal({ wspReporte, limpiarFiltroReportes, verNotasVersion });