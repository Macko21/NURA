import { getSettings, whatsappMessage } from '../lib/settings';
import { dinero } from './precios';
import { navIcon } from '../lib/nav-icons';
import { store, registrarVentaNueva, loadAll, actualizarEstadoVenta, removeVenta, descontarStock, reponerStock } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, fmt, toast, swalConfirm, swalError, swalSuccess, swalInfo, openModal, closeModal, moneyInput, unitInput, registerRenderer, exposeGlobal, currentPage, renderPage } from '../lib/ui';
import { fmtDate, redondearPesos } from '../lib/format';
import { genId } from '../lib/id';
import { waLink } from '../config';
import type { Venta, VentaItem, VentaPago, Cliente, Combo, Producto, Presentacion } from '../types';

let ventaItems: VentaItem[] = [];
let guardandoVenta = false;
let ventaEnCurso: { venta: Venta; filas: string[] } | null = null;

const moneda = redondearPesos;

export function renderVentas() {
  const el = document.getElementById('page-ventas');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `
    ${Sesion.esAdmin() ? `<button class="btn btn-outline btn-sm" onclick="resumenPendientesModal()">📋 Pendientes</button>` : ''}
    <button class="btn btn-primary" onclick="formVenta()">+ Venta</button>`;

  const ventas = [...store.ventas]
    .sort((a, b) => a.fecha - b.fecha)
    .map((v, i) => ({ ...v, num: i + 1 }))
    .filter((v) => Sesion.esAdmin() || v.vendedorId === Sesion.uid())
    .sort((a, b) => b.fecha - a.fecha);

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Trans.</th><th>Fecha</th><th>Cliente</th>${Sesion.esAdmin() ? '<th>Vendedor</th>' : ''}<th>Items</th><th>Total</th><th>Estado</th><th class="actions-col">Acciones</th>
  </tr></thead><tbody>${
    ventas.length === 0
      ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div></td></tr>`
      : ventas.map((v) => {
          const cl = store.clientes.find((c) => c.id === v.clienteId);
          const gananciaVendedor = Sesion.esVendedor()
            ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
            : null;
          return `<tr>
            <td><span class="badge badge-blue">#${v.num}</span></td>
            <td>${fmtDate(v.fecha)}</td>
            <td>${cl ? escapeHTML(cl.nombre) : escapeHTML(v.clienteNombre || '—')} ${cl?.esMayorista ? '<span class="badge badge-violet" style="font-size:10px;">Mayor.</span>' : ''}</td>
            ${Sesion.esAdmin() ? `<td>${escapeHTML(v.vendedorNombre || '—')}</td>` : ''}
            <td>${v.items.length}</td>
            <td class="fw-700">${fmt(v.total)}</td>
            <td>${estadoSelect(v)}</td>
            <td class="actions-col"><div class="table-actions">
              <button class="btn icon-action is-violet" title="Ver venta" aria-label="Ver venta" onclick="verVenta('${v.id}')">${navIcon('eye')}</button>
              <button class="btn icon-action is-teal" title="Compartir venta" aria-label="Compartir venta" onclick="wspVenta('${v.id}')">${navIcon('share')}</button>
              ${Sesion.esAdmin() ? `<button class="btn icon-action is-danger" title="Eliminar venta" aria-label="Eliminar venta" onclick="eliminarVenta('${v.id}')">${navIcon('trash')}</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list record-list">${ventas.map((v) => {
    const cl = store.clientes.find((c) => c.id === v.clienteId);
    const gananciaVendedor = Sesion.esVendedor()
      ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
      : null;
    return `<article class="m-card record-card">
      <div class="record-card-heading">
        <span class="record-card-icon sale-icon">${navIcon('ventas')}</span>
        <div class="record-card-identity"><span class="m-card-subtitle">Venta #${v.num} · ${fmtDate(v.fecha)}</span>
          <h3 class="m-card-title">${escapeHTML(cl?.nombre || v.clienteNombre || 'Sin cliente')}</h3>
          <p class="m-card-subtitle">${v.items.length} ${v.items.length === 1 ? 'ítem' : 'ítems'}${cl?.esMayorista ? ' · Mayorista' : ''}</p>
        </div>
        <strong class="record-card-total">${fmt(v.total)}</strong>
      </div>
      ${gananciaVendedor !== null ? `<p class="m-card-subtitle">Ganancia: ${fmt(gananciaVendedor)}</p>` : ''}
      <div class="m-card-footer record-card-actions">
        ${estadoSelect(v)}
        <button type="button" class="btn icon-action is-violet" title="Ver venta" aria-label="Ver venta" onclick="verVenta('${v.id}')">${navIcon('eye')}</button>
        <button type="button" class="btn icon-action is-teal" title="Compartir venta" aria-label="Compartir venta" onclick="wspVenta('${v.id}')">${navIcon('share')}</button>
        ${Sesion.esAdmin() ? `<button type="button" class="btn icon-action is-danger" title="Eliminar venta" aria-label="Eliminar venta" onclick="eliminarVenta('${v.id}')">${navIcon('trash')}</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;

  el.innerHTML = `<div class="card"><div class="section-header"><div class="section-title">Ventas</div></div>${ventas.length === 0 ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div>` : tbl + cards}</div>`;
}

const estadosVenta = { pendiente: 'Pendiente', pagado: 'Pagado', cancelado: 'Cancelado' } satisfies Record<Venta['estado'], string>;

function estadoSelect(v: Venta) {
  return `<select class="sale-status" data-sale-status="${escapeHTML(v.id)}" data-estado="${escapeHTML(v.estado)}"
    aria-label="Cambiar estado de la venta" title="Cambiar estado de la venta"
    onchange="cambiarEstadoVenta(this.dataset.saleStatus, this.value)">${
    Object.entries(estadosVenta).map(([estado, nombre]) => `<option value="${estado}" ${v.estado === estado ? 'selected' : ''}>${nombre}</option>`).join('')
  }</select>`;
}

const ventasActualizando = new Set<string>();
export async function cambiarEstadoVenta(id: string, estado: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v || ventasActualizando.has(id) || v.estado === estado) return;
  if (estado !== 'pagado' && estado !== 'pendiente' && estado !== 'cancelado') return;

  const controles = [...document.querySelectorAll<HTMLSelectElement>('[data-sale-status]')]
    .filter((select) => select.dataset.saleStatus === id);
  ventasActualizando.add(id);
  controles.forEach((select) => select.disabled = true);
  try {
    await actualizarEstadoVenta(id, estado, v.estado);
    const actual = store.ventas.find((venta) => venta.id === id);
    if (actual) actual.estado = estado;
    toast(`Estado actualizado: ${estadosVenta[estado]}`);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la venta', 'error');
  } finally {
    const actual = store.ventas.find((venta) => venta.id === id)?.estado ?? v.estado;
    controles.forEach((select) => {
      select.value = actual;
      select.dataset.estado = actual;
      select.disabled = false;
    });
    ventasActualizando.delete(id);
  }
}

export function buildVendibles(): any[] {
  const vendibles: any[] = [];
  store.productos.forEach((p) => {
    if (p.tipo === 'accesorio') {
      vendibles.push({ id: p.id, productoId: p.id, litrosPorUnidad: 0, nombre: p.nombre, codigo: p.codigo, precio: p.precioVenta, precioMayorista: p.precioMayorista, esAcc: true, esCombo: false, stock: p.stockUnidades, costoUnitario: p.costoUnidad, detalle: 'Unidad' });
    } else {
      (p.presentaciones || []).forEach((pr) => {
        vendibles.push({ id: pr.id, productoId: p.id, nombre: p.nombre, codigo: p.codigo, precio: pr.precioVenta, precioMayorista: pr.precioMayorista, esAcc: false, esCombo: false, stock: Math.floor((p.stockLitros || 0) / pr.litros), costoUnitario: (p.costoLitro || 0) * pr.litros + (pr.costoEnvase || 0) + (pr.costoEtiqueta || 0), detalle: pr.nombre, litrosPorUnidad: pr.litros, presId: pr.id });
      });
    }
  });
  store.combos.forEach((c) => {
    vendibles.push({ id: c.id, comboId: c.id, litrosPorUnidad: 0, nombre: c.nombre, precio: c.precio, precioMayorista: c.precioMayorista, esAcc: false, esCombo: true, stock: 1, costoUnitario: 0, detalle: 'Combo' });
  });
  return vendibles;
}

function buildVentaModalContent() {
  const vendibles = buildVendibles();
  const combos = vendibles.filter((v) => v.esCombo);
  return `<div class="venta-layout" id="ventaDraft">
    <section class="venta-col" aria-label="Cliente y artículos">
      <div class="form-group"><label for="vCliente">Cliente</label>
        <select id="vCliente" data-buscar="Buscar por nombre, teléfono o email"><option value="">Seleccioná...</option>
          ${store.clientes.map((c) => `<option value="${escapeHTML(c.id)}" data-codigo="${escapeHTML([c.telefono, c.email].filter(Boolean).join(' '))}">
            ${escapeHTML(c.nombre)}${c.esMayorista ? ' (Mayorista)' : ''}</option>`).join('')}
        </select>
      </div>
      <div id="ventaClienteInfo" class="venta-cliente-info" aria-live="polite" hidden></div>
      <div class="form-group"><label for="vObs">Observaciones</label><textarea id="vObs" rows="2"></textarea></div>
      <div class="form-group"><label for="vItemSel">Agregar artículos</label>
        <div class="venta-selector">
          <select id="vItemSel" data-buscar="Buscar artículo o medida"><option value="">Producto / presentación...</option>${vendibles.filter((v) => !v.esCombo).map((v) =>
            `<option value="${escapeHTML(v.id)}" data-codigo="${escapeHTML(v.codigo)}">${escapeHTML(v.nombre)} · ${escapeHTML(v.detalle)} · ${dinero.format(v.precio)} (Stock: ${v.stock})</option>`).join('')}</select>
          <input id="vCant" type="number" min="1" step="1" value="1" aria-label="Cantidad de artículos">
          <button type="button" class="btn btn-primary" onclick="agregarItemVenta()">Agregar</button>
        </div>
        ${combos.length ? `<div class="venta-selector">
          <select id="vComboSel" data-buscar="Buscar combo"><option value="">Combo...</option>${combos.map((c) =>
            `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)} · ${dinero.format(c.precio)}</option>`).join('')}</select>
          <input id="vCantCombo" type="number" min="1" step="1" value="1" aria-label="Cantidad de combos">
          <button type="button" class="btn btn-secondary" onclick="agregarComboVenta()">Agregar</button>
        </div>` : ''}
      </div>
    </section>
    <section class="venta-col venta-resumen" aria-label="Resumen y cobro">
      <h4>Artículos de la venta</h4>
      <div id="ventaItemsWrap" class="venta-items">${renderVentaItems()}</div>
      <div class="venta-importes">
        <div class="form-group"><label for="vDescuento">Descuento total</label>${moneyInput('vDescuento', '', 'updateVentaTotals()')}</div>
      </div>
      <div class="venta-totales" aria-live="polite">
        <div><span>Subtotal</span><strong id="vSubtotal">${dinero.format(0)}</strong></div>
        <div id="vRecargoRow" hidden><span>Recargo de envío</span><strong id="vRecargo"></strong></div>
        <div><span>Total</span><strong id="vTotal">${dinero.format(0)}</strong></div>
      </div>
      <div class="venta-margen" aria-live="polite"><span>Ganancia estimada</span><strong id="vGanancia"></strong>
        <span>Margen sobre venta</span><strong id="vMargen"></strong></div>
      <h4>Formas de pago</h4>
      <div class="venta-importes">
        <div class="form-group"><label for="vEfectivo">Efectivo</label>${moneyInput('vEfectivo', '', 'updateVentaTotals()')}</div>
        <div class="form-group"><label for="vTransferencia">Transferencia</label>${moneyInput('vTransferencia', '', 'updateVentaTotals()')}</div>
      </div>
      <div class="venta-saldo" aria-live="polite"><span id="vSaldoEtiqueta">Saldo pendiente</span><strong id="vSaldo">${dinero.format(0)}</strong></div>
    </section>
  </div>`;
}

function renderVentaItems() {
  if (!ventaItems.length) return '<p class="empty-state venta-items-vacia">Todavía no agregaste artículos.</p>';
  return ventaItems.map((it, i) => `<div class="venta-item">
    <div class="venta-item-desc"><strong>${escapeHTML(it.nombre)}</strong><small>${escapeHTML(it.detalle)}</small></div>
    <label class="form-group">Cantidad${unitInput('viCant' + i, it.cantidad, 'un', '1', 'updateVentaTotals()')}</label>
    <label class="form-group">Precio${moneyInput('viPrecio' + i, it.precioAplicado, 'updateVentaTotals()')}</label>
    <strong class="venta-item-subtotal" id="viSubtotal${i}">${dinero.format(it.subtotal)}</strong>
    <button type="button" class="btn icon-action is-danger" onclick="eliminarVentaItem(${i})" title="Quitar artículo" aria-label="Quitar artículo">${navIcon('trash')}</button>
  </div>`).join('');
}

function inputVenta(id: string) {
  return document.getElementById(id) as HTMLInputElement;
}

function mostrarClienteVenta() {
  const info = document.getElementById('ventaClienteInfo');
  if (!info) return;
  const cliente = store.clientes.find((c) => c.id === inputVenta('vCliente').value);
  info.hidden = !cliente;
  if (!cliente) { info.replaceChildren(); return; }
  const campos = [
    ['Teléfono / WhatsApp', cliente.telefono], ['Email', cliente.email], ['Dirección', cliente.direccion],
    ['Tipo', cliente.esMayorista ? 'Mayorista' : 'Minorista'], ['Notas', cliente.notas],
  ];
  info.innerHTML = `<strong>${escapeHTML(cliente.nombre)}</strong><dl>${campos.map(([nombre, valor]) =>
    `<div><dt>${nombre}</dt><dd>${escapeHTML(valor || '—')}</dd></div>`).join('')}</dl>`;
}

export function formVenta() {
  if (guardandoVenta) return;
  if (!ventaEnCurso) ventaItems = [];
  openModal('Nueva venta', buildVentaModalContent(), guardarVenta, 1060);
  inputVenta('vCliente').addEventListener('change', mostrarClienteVenta);
  if (ventaEnCurso) {
    const v = ventaEnCurso.venta;
    const cliente = inputVenta('vCliente');
    cliente.value = v.clienteId ?? '';
    cliente.dispatchEvent(new Event('change'));
    inputVenta('vObs').value = v.obs;
    inputVenta('vDescuento').value = String(v.descuento);
    inputVenta('vEfectivo').value = String(v.pagos.find((p) => p.medio === 'efectivo')?.monto ?? '');
    inputVenta('vTransferencia').value = String(v.pagos.find((p) => p.medio === 'transferencia')?.monto ?? '');
    bloquearEdicionVenta();
  }
  document.getElementById('ventaDraft')!.addEventListener('change', (event) => {
    const campo = event.target as HTMLInputElement;
    if (/^(viPrecio\d+|vDescuento|vEfectivo|vTransferencia)$/.test(campo.id) && Number.isFinite(campo.valueAsNumber)) {
      campo.value = String(moneda(campo.valueAsNumber));
      updateVentaTotals();
    }
  });
  updateVentaTotals();
}

function rerenderVentaItems() {
  const wrap = document.getElementById('ventaItemsWrap');
  if (wrap) wrap.innerHTML = renderVentaItems();
  updateVentaTotals();
}

export function agregarItemVenta() {
  const prodId = (document.getElementById('vItemSel') as HTMLSelectElement).value;
  const cant = inputVenta('vCant').valueAsNumber;
  if (!Number.isInteger(cant) || cant <= 0) { toast('Ingresá una cantidad válida', 'error'); return; }
  if (!prodId) { toast('Seleccioná un producto', 'info'); return; }
  const v = buildVendibles().find((x) => x.id === prodId);
  if (!v) return;
  const vendKey = String(v.comboId || v.id || '');
  const exist = ventaItems.find((x) => x.key === vendKey);
  if ((v.stock ?? 0) < (exist?.cantidad ?? 0) + cant) { toast('Stock insuficiente para esa cantidad', 'error'); return; }
  if (exist) {
    exist.cantidad += cant;
    exist.subtotal = exist.cantidad * exist.precioAplicado;
  } else {
    ventaItems.push({ ...v, key: vendKey, cantidad: cant, precioAplicado: moneda(v.precio), subtotal: moneda(v.precio) * cant });
  }
  rerenderVentaItems();
}

export function agregarComboVenta() {
  const comboId = (document.getElementById('vComboSel') as HTMLSelectElement)?.value;
  const cant = inputVenta('vCantCombo').valueAsNumber;
  if (!Number.isInteger(cant) || cant <= 0) { toast('Ingresá una cantidad válida', 'error'); return; }
  if (!comboId) { toast('Seleccioná un combo', 'info'); return; }
  const c = buildVendibles().find((x) => x.id === comboId && x.esCombo);
  if (!c) return;
  const combo = store.combos.find((x) => x.id === comboId);
  const articulos = buildVendibles();
  c.costoUnitario = (combo?.items ?? []).reduce((total, item) => {
    const articulo = articulos.find((v) => !v.esCombo && (item.presId ? v.presId === item.presId : v.productoId === item.productoId));
    return total + (articulo?.costoUnitario ?? 0) * item.cantidad;
  }, 0);
  const vendKey = String(c.comboId || c.id || '');
  const exist = ventaItems.find((x) => x.key === vendKey);
  if (exist) {
    exist.cantidad += cant;
    exist.subtotal = exist.cantidad * exist.precioAplicado;
  } else {
    ventaItems.push({ ...c, key: vendKey, cantidad: cant, esCombo: true, precioAplicado: moneda(c.precio), subtotal: moneda(c.precio) * cant });
  }
  rerenderVentaItems();
}

export function eliminarVentaItem(i: number) {
  ventaItems.splice(i, 1);
  rerenderVentaItems();
}

function valoresVenta() {
  const subtotal = moneda(ventaItems.reduce((s, it) => s + it.subtotal, 0));
  const descuento = moneda(inputVenta('vDescuento').valueAsNumber || 0);
  const neto = moneda(subtotal - descuento);
  const config = getSettings();
  const envio = config.envioModo === 'porcentaje' ? moneda(Math.max(0, neto) * config.envioPorcentaje / 100) : 0;
  const total = moneda(neto + envio);
  const efectivo = moneda(inputVenta('vEfectivo').valueAsNumber || 0);
  const transferencia = moneda(inputVenta('vTransferencia').valueAsNumber || 0);
  const saldo = moneda(total - efectivo - transferencia);
  const costo = ventaItems.reduce((s, it) => s + it.cantidad * (Sesion.esVendedor() ? it.precioMayorista : it.costoUnitario), 0);
  const ganancia = moneda(neto - costo);
  return { subtotal, descuento, envio, total, efectivo, transferencia, saldo, ganancia, margen: neto > 0 ? ganancia / neto : 0 };
}

export function updateVentaTotals() {
  if (!document.getElementById('ventaDraft')) return;
  ventaItems.forEach((it, i) => {
    it.cantidad = inputVenta('viCant' + i).valueAsNumber || 0;
    it.precioAplicado = moneda(inputVenta('viPrecio' + i).valueAsNumber || 0);
    it.subtotal = moneda(it.cantidad * it.precioAplicado);
    document.getElementById('viSubtotal' + i)!.textContent = dinero.format(it.subtotal);
  });
  const v = valoresVenta();
  document.getElementById('vSubtotal')!.textContent = dinero.format(v.subtotal);
  document.getElementById('vTotal')!.textContent = dinero.format(v.total);
  document.getElementById('vRecargoRow')!.hidden = !v.envio;
  document.getElementById('vRecargo')!.textContent = dinero.format(v.envio);
  document.getElementById('vGanancia')!.textContent = dinero.format(v.ganancia);
  document.getElementById('vMargen')!.textContent = v.margen.toLocaleString('es-AR', { style: 'percent', maximumFractionDigits: 1 });
  document.getElementById('vSaldoEtiqueta')!.textContent = v.saldo < 0 ? 'Importe excedido' : 'Saldo pendiente';
  document.getElementById('vSaldo')!.textContent = dinero.format(Math.abs(v.saldo));
}

function movimientosVenta(items: VentaItem[]) {
  const movimientos = new Map<string, { productoId: string; esAcc: boolean; cantidad: number }>();
  for (const it of items) {
    const componentes = it.esCombo ? store.combos.find((c) => c.id === it.comboId)?.items
      : [{ ...it, cantidad: 1 }];
    if (!componentes?.length) throw new Error(`Revisá los componentes de ${it.nombre}`);
    for (const parte of componentes) {
      if (!parte.productoId || (!parte.esAcc && !(parte.litrosPorUnidad > 0))) {
        throw new Error(`Revisá la presentación de ${parte.nombre}`);
      }
      const actual = movimientos.get(parte.productoId);
      const cantidad = it.cantidad * parte.cantidad * (parte.esAcc ? 1 : parte.litrosPorUnidad);
      movimientos.set(parte.productoId, {
        productoId: parte.productoId,
        esAcc: parte.esAcc,
        cantidad: Math.round(((actual?.cantidad ?? 0) + cantidad) * 1000000) / 1000000,
      });
    }
  }
  return [...movimientos.values()].sort((a, b) => a.productoId.localeCompare(b.productoId));
}

function bloquearEdicionVenta(bloquear = true) {
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#ventaDraft input, #ventaDraft textarea, #ventaDraft button, #ventaDraft select')
    .forEach((control) => control.disabled = bloquear);
}

async function guardarVenta() {
  if (guardandoVenta) return;
  const cliente = store.clientes.find((c) => c.id === inputVenta('vCliente').value);
  const modal = document.getElementById('ventaDraft');
  if (!ventaEnCurso) {
    if (!cliente) { toast('Seleccioná un cliente', 'error'); return; }
    if (!ventaItems.length) { toast('Agregá al menos un artículo', 'error'); return; }
    updateVentaTotals();
    if (ventaItems.some((it, i) => !Number.isInteger(it.cantidad) || it.cantidad <= 0 || !Number.isFinite(inputVenta('viPrecio' + i).valueAsNumber) || it.precioAplicado < 0)) {
      toast('Revisá las cantidades y los precios', 'error'); return;
    }
    const { subtotal, descuento, envio, total, efectivo, transferencia, saldo } = valoresVenta();
    if (descuento < 0 || descuento > subtotal) { toast('El descuento tiene que estar entre cero y el subtotal', 'error'); return; }
    if (efectivo < 0 || transferencia < 0 || saldo < 0) { toast('Revisá que los pagos no superen el total de la venta', 'error'); return; }
    const fecha = Date.now();
    const pagos: VentaPago[] = [];
    if (efectivo > 0) pagos.push({ id: genId(), fecha, monto: efectivo, medio: 'efectivo' });
    if (transferencia > 0) pagos.push({ id: genId(), fecha, monto: transferencia, medio: 'transferencia' });
    const venta: Venta = {
      id: genId(), fecha, clienteId: cliente.id, clienteNombre: cliente.nombre, esMayorista: cliente.esMayorista,
      vendedorId: Sesion.esVendedor() ? Sesion.uid() : null, vendedorNombre: Sesion.esVendedor() ? Sesion.user?.nombre ?? '' : '',
      subtotal, descuento, envio, total, estado: saldo === 0 ? 'pagado' : 'pendiente', obs: inputVenta('vObs').value.trim(),
      items: ventaItems.map((it) => ({ ...it, productoId: it.productoId ?? null, presId: it.presId ?? null, comboId: it.comboId ?? null })), pagos,
    };
    let movimientos: ReturnType<typeof movimientosVenta>;
    try { movimientos = movimientosVenta(venta.items); }
    catch (err) { toast(err instanceof Error ? err.message : 'Revisá el stock', 'error'); return; }
    const reservados: typeof movimientos = [];
    const guardar = document.querySelector<HTMLButtonElement>('#btnModalSave');
    guardandoVenta = true;
    if (guardar) guardar.disabled = true;
    bloquearEdicionVenta();
    try {
      for (const m of movimientos) {
        if (!(await descontarStock(m.productoId, m.cantidad, m.esAcc))) throw new Error('No se pudo descontar el stock. Revisá las cantidades disponibles.');
        reservados.push(m);
      }
      ventaEnCurso = { venta, filas: venta.items.map(() => crypto.randomUUID()) };
    } catch (err) {
      if (modal?.isConnected) bloquearEdicionVenta(false);
      for (const m of reservados) await reponerStock(m.productoId, m.cantidad, m.esAcc);
      toast(err instanceof Error ? err.message : 'No se pudo reservar el stock', 'error');
      return;
    } finally {
      guardandoVenta = false;
      if (guardar) guardar.disabled = false;
    }
  }

  const { venta, filas } = ventaEnCurso;
  const guardar = document.querySelector<HTMLButtonElement>('#btnModalSave');
  guardandoVenta = true;
  if (guardar) guardar.disabled = true;
  try {
    await registrarVentaNueva(venta, filas);
    ventaEnCurso = null;
    ventaItems = [];
    if (modal?.isConnected) closeModal();
    toast(`Venta registrada · ${dinero.format(venta.total)}`);
    await loadAll();
    renderPage(currentPage);
  } catch {
    toast('No se pudo completar el registro. Volvé a intentar Guardar para continuar la misma venta.', 'error');
  } finally {
    guardandoVenta = false;
    if (guardar) guardar.disabled = false;
  }
}

export async function verVenta(id: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v) return;
  const num = [...store.ventas].sort((a, b) => a.fecha - b.fecha).findIndex((x) => x.id === id) + 1;
  const cl = store.clientes.find((c) => c.id === v.clienteId);
  openModal(`👁 Venta #${num}`, `<div style="display:flex;flex-direction:column;gap:8px;">
    <div class="m-card-row"><span class="m-card-row-label">Cliente</span><span class="m-card-row-value">${escapeHTML(cl?.nombre || v.clienteNombre || '—')}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Fecha</span><span class="m-card-row-value">${fmtDate(v.fecha)}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Estado</span><span class="m-card-row-value">${v.estado}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Total</span><span class="m-card-row-value">${fmt(v.total)}</span></div>
    <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">${v.items.map((i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>${escapeHTML(i.nombre)}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`).join('')}</div>
    <div style="font-weight:700;font-family:var(--font-display);font-size:18px;text-align:right;">Total: ${fmt(v.total)}</div>
  </div>`, null);
}

export function wspVenta(id: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v) return;
  const cl = store.clientes.find((c) => c.id === v.clienteId);
  if (!cl?.telefono) { toast('El cliente no tiene un teléfono cargado', 'info'); return; }
  const pagado = (v.pagos ?? []).reduce((acum, p) => acum + p.monto, 0);
  const saldo = v.estado === 'pendiente' ? Math.max(0, v.total - pagado) : 0;
  const detalle = [
    ...v.items.map((i) => `• ${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} × ${i.cantidad} · ${fmt(i.subtotal)}`),
    v.descuento ? `Descuento: -${fmt(v.descuento)}` : '',
    v.envio ? `Envío: ${fmt(v.envio)}` : '',
    v.pagos?.length ? `Pagos: ${v.pagos.map((p) => `${fmt(p.monto)} (${p.medio})`).join(', ')}` : '',
    saldo > 0 ? `Saldo pendiente: ${fmt(saldo)}` : '',
  ].filter(Boolean).join('\n');
  const mensaje = whatsappMessage('comprobante', detalle, {
    cliente: cl.nombre, fecha: fmtDate(v.fecha), total: fmt(v.total), saldo: fmt(saldo),
  }, saldo > 0);
  window.open(waLink(mensaje, cl.telefono), '_blank', 'noopener');
}

export async function eliminarVenta(id: string) {
  const res = await swalConfirm('¿Eliminar venta?', 'Se restaurará el stock y no se puede deshacer.');
  if (!res.isConfirmed) return;
  const v = store.ventas.find((x) => x.id === id);
  if (v) {
    let movimientos: ReturnType<typeof movimientosVenta>;
    try { movimientos = movimientosVenta(v.items); }
    catch (err) { toast(err instanceof Error ? err.message : 'No se pudo recuperar el stock de la venta', 'error'); return; }
    for (const m of movimientos) await reponerStock(m.productoId, m.cantidad, m.esAcc);
  }
  await removeVenta(id);
  toast('Venta eliminada y stock restaurado');
}

export function resumenPendientesModal() {
  const pendientes = store.ventas.filter((v) => v.estado === 'pendiente');
  if (!pendientes.length) { swalInfo('Sin pendientes', 'No hay ventas pendientes.'); return; }
  openModal('📋 Ventas pendientes', `<div class="mobile-card-list">${pendientes.map((v) => `<div class="m-card"><div class="m-card-title">${escapeHTML(v.clienteNombre || '—')} · ${fmt(v.total)}</div><div class="m-card-subtitle">${fmtDate(v.fecha)}</div><div class="m-card-footer"><button class="btn btn-primary btn-sm" onclick="cambiarEstadoVenta('${v.id}', 'pagado')">✅ Marcar pagado</button><button class="btn icon-action is-violet" title="Ver venta" aria-label="Ver venta" onclick="verVenta('${v.id}')">${navIcon('eye')}</button></div></div>`).join('')}</div>`, null, true);
}

registerRenderer('ventas', renderVentas);
exposeGlobal({
  formVenta, agregarItemVenta, agregarComboVenta, eliminarVentaItem, updateVentaTotals,
  guardarVenta, verVenta, wspVenta, eliminarVenta,
  resumenPendientesModal, estadoSelect, cambiarEstadoVenta,
});