// ===== NURA — ventas.js: Ventas, Carrito, Estados, Pendientes =====
'use strict';

let ventaItems=[];

function renderVentas(){
  const el = document.getElementById('page-ventas');
  document.getElementById('topbarActions').innerHTML = `
    ${Sesion.esAdmin() ? `<button class="btn btn-outline btn-sm" onclick="resumenPendientesModal()">📋 Pendientes</button>` : ''}
    <button class="btn btn-primary" onclick="formVenta()">+ Venta</button>`;

const ventas = [...DB.ventas]
    .sort((a, b) => a.fecha - b.fecha)
    .map((v, i) => ({ ...v, num: i + 1 }))
    .filter(v => Sesion.esAdmin() || v.vendedorId === Sesion.user.id)
    .sort((a,b) => b.fecha - a.fecha);

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Trans.</th><th>Fecha</th><th>Cliente</th>${Sesion.esAdmin() ? '<th>Vendedor</th>' : ''}<th>Items</th><th>Total</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${ventas.length === 0
    ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div></td></tr>`
    : ventas.map(v => {
        const cl = DB.clientes.find(c => c.id === v.clienteId);
        const gananciaVendedor = Sesion.esVendedor()
          ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
          : null;
        return `<tr>
          <td><span class="badge badge-blue">#${v.num}</span></td>
          <td>${fmtDate(v.fecha)}</td>
          <td>${cl ? cl.nombre : v.clienteNombre || '—'} ${cl?.esMayorista ? '<span class="badge badge-violet" style="font-size:10px;">Mayor.</span>' : ''}</td>
          ${Sesion.esAdmin() ? `<td>${v.vendedorNombre || '—'}</td>` : ''}
          <td>${v.items.length}</td>
          <td class="fw-700">${fmt(v.total)}</td>
          <td>${estadoSelect(v)}</td>
          <td><div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="verVenta('${v.id}')">👁</button>
            <button class="btn btn-wsp-sm btn-sm" onclick="wspVenta('${v.id}')">📲</button>
            ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button>` : ''}
          </div></td>
        </tr>`;
      }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${ventas.map(v => {
    const cl = DB.clientes.find(c => c.id === v.clienteId);
    const gananciaVendedor = Sesion.esVendedor()
      ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
      : null;
    return `<div class="m-card">
      <div class="m-card-header">
        <div>
          <div class="m-card-title"><span class="badge badge-blue" style="margin-right:6px;">#${v.num}</span> ${cl ? cl.nombre : v.clienteNombre || 'Sin cliente'}${cl?.esMayorista ? ' <span class="badge badge-violet" style="font-size:10px;">Mayorista</span>' : ''}</div>
          <div class="m-card-subtitle">${fmtDate(v.fecha)} · ${v.items.length} ítem(s)</div>
        </div>
        ${estadoSelect(v)}
      </div>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div>
      ${gananciaVendedor !== null ? `<div style="font-size:12px;color:var(--violet-dark);margin-top:4px;">Ganancia: ${fmt(gananciaVendedor)}</div>` : ''}
      <div class="m-card-footer mt-8">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="verVenta('${v.id}')">👁 Ver</button>
        <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspVenta('${v.id}')">📲</button>
        ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;

  el.innerHTML = ventas.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>No hay ventas registradas</p></div>`
    : tbl + cards;
}

function resumenPendientesModal() {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente');
  if (!pendientes.length) { swalInfo('Sin pendientes', 'No hay ventas pendientes.'); return; }

  const porCliente = {};
  pendientes.forEach(v => {
    const key = v.clienteId || v.clienteNombre || '—';
    if (!porCliente[key]) porCliente[key] = [];
    porCliente[key].push(v);
  });

  const clientes = Object.keys(porCliente).map(key => {
    const cl = DB.clientes.find(c => c.id === key);
    return { key, nombre: cl ? cl.nombre : (porCliente[key][0].clienteNombre || '—'), ventas: porCliente[key], cl };
  }).sort((a,b) => a.nombre.localeCompare(b.nombre));

  openModal('📋 Resumen pendientes por cliente', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      Seleccioná un cliente para ver y enviar todas sus ventas pendientes juntas.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${clientes.map(c => {
        const total = c.ventas.reduce((s,v) => s + v.total, 0);
        return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;font-size:14px;">${escapeHTML(c.nombre)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${c.ventas.length} venta(s) pendiente(s)</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--accent-dark);">${fmt(total)}</div>
            <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="verPendientesCliente('${c.key}')">👁 Ver</button>
              <button class="btn btn-wsp-sm btn-sm" onclick="wspPendientesCliente('${c.key}')">📲 WS</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `, null, true);
}

window.verPendientesCliente = function(clienteKey) {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente' && (v.clienteId === clienteKey || v.clienteNombre === clienteKey));
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : (pendientes[0]?.clienteNombre || '—');
  const totalGral = pendientes.reduce((s,v) => s + v.total, 0);

  const ventasHTML = pendientes.map(v => {
    const itemsRows = v.items.map(i =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">
        <span style="color:var(--text-muted);">${i.nombre} <span style="font-size:10px;">${i.detalle||''}</span> × ${i.cantidad}</span>
        <span style="font-weight:700;">${fmt(i.subtotal)}</span>
      </div>`
    ).join('');
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-muted);">📅 ${fmtDate(v.fecha)}</div>
        <div style="font-family:var(--font-display);font-weight:800;color:var(--accent-dark);">${fmt(v.total)}</div>
      </div>
      ${itemsRows}
      ${v.descuento ? `<div style="font-size:11px;color:var(--danger);margin-top:4px;">Descuento: -${fmt(v.descuento)}</div>` : ''}
      ${v.obs ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">📝 ${escapeHTML(v.obs)}</div>` : ''}
    </div>`;
  }).join('');

  openModal(`📋 Pendientes — ${nombre}`, `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button class="btn btn-wsp-sm" style="flex:1;" onclick="wspPendientesCliente('${clienteKey}')">📲 Enviar por WhatsApp</button>
      <button class="btn btn-secondary btn-sm" onclick="resumenPendientesModal()">← Volver</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:12px;color:var(--text-muted);">${pendientes.length} venta(s) pendiente(s)</div>
        <div style="font-size:11px;color:var(--text-muted);">${cl?.telefono ? '📲 '+cl.telefono : ''}</div>
      </div>
      <div style="font-family:var(--font-display);font-weight:900;font-size:24px;" class="text-gradient">
        ${fmt(totalGral)}
      </div>
    </div>
    <div style="max-height:380px;overflow-y:auto;">
      ${ventasHTML}
    </div>
  `, null, true);
};

window.wspPendientesCliente = function(clienteKey) {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente' && (v.clienteId === clienteKey || v.clienteNombre === clienteKey));
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : '—';
  const totalGral = pendientes.reduce((s,v) => s + v.total, 0);

  let msg = `*🧾 NURA — Resumen de cuenta*\n`;
  msg += `👤 ${nombre}\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-AR')}\n`;
  msg += `--------------------------\n\n`;

  pendientes.forEach((v, idx) => {
    msg += `*Pedido ${idx + 1}* — ${fmtDate(v.fecha)}\n`;
    v.items.forEach(i => {
      msg += `  • ${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} × ${i.cantidad} = ${fmt(i.subtotal)}\n`;
    });
    if (v.descuento) msg += `  🔖 Descuento: -${fmt(v.descuento)}\n`;
    if (v.obs) msg += `  📝 ${v.obs}\n`;
    msg += `  💰 *Subtotal: ${fmt(v.total)}*\n`;
    if (idx < pendientes.length - 1) msg += `\n`;
  });

  msg += `\n--------------------------\n`;
  msg += `💰 *TOTAL A PAGAR: ${fmt(totalGral)}*\n`;
  msg += `_${pendientes.length} pedido(s) pendiente(s)_\n\n`;
  msg += `¡Gracias por elegirnos! 🌿\n📷 @nura.neco`;

  const tel = cl?.telefono?.replace(/\D/g,'');
  window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`, '_blank');
};

function estadoSelect(v){const col=v.estado==='pagado'?'rgba(82,218,210,0.14)':v.estado==='pendiente'?'rgba(245,158,11,0.12)':'rgba(244,63,94,0.1)';const tc=v.estado==='pagado'?'var(--accent-dark)':v.estado==='pendiente'?'#b45309':'var(--danger)';return`<select class="badge" onchange="cambiarEstadoVenta('${v.id}',this.value)" style="border:none;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;background:${col};color:${tc};"><option value="pagado" ${v.estado==='pagado'?'selected':''}>Pagado</option><option value="pendiente" ${v.estado==='pendiente'?'selected':''}>Pendiente</option><option value="cancelado" ${v.estado==='cancelado'?'selected':''}>Cancelado</option></select>`;}

window.cambiarEstadoVenta = async function(id, estado) {
  const v = DB.ventas.find(x => x.id === id);
  if (!v) return;
  v.estado = estado;
  if (estado === 'pagado') {}
  await fbSave('ventas', v);
  toast('Estado actualizado');
  if (currentPage === 'deudas') renderDeudas();
  if (currentPage === 'dashboard') renderDashboard();
};

// ── Build vendibles ───────────────────────────────────────────────────
function buildVendibles(){
  const items=[];
  DB.productos.forEach(p=>{
    if(p.tipo==='accesorio'){
      items.push({key:`${p.id}|acc`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} — unidad — ${fmt(p.precioVenta)} (Mayor: ${fmt(p.precioMayorista||p.precioVenta)})`,productoId:p.id,presId:null,nombre:p.nombre,detalle:'Unidad',precio:p.precioVenta,precioMayorista:p.precioMayorista||p.precioVenta,litrosPorUnidad:0,stockDisp:p.stockUnidades||0,esAcc:true,esCombo:false});
    } else {
      (p.presentaciones||[]).forEach(pr=>{
        const mu=pr.litros>0?Math.floor((p.stockLitros||0)/pr.litros):999;
        items.push({key:`${p.id}|${pr.id}`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} ${pr.nombre} — ${fmt(pr.precioVenta)} (Mayor: ${fmt(pr.precioMayorista||pr.precioVenta)}) stock:${mu}`,productoId:p.id,presId:pr.id,nombre:`${p.nombre} ${pr.nombre}`,detalle:pr.nombre,precio:pr.precioVenta,precioMayorista:pr.precioMayorista||pr.precioVenta,litrosPorUnidad:pr.litros,stockDisp:mu,esAcc:false,esCombo:false});
      });
    }
  });
  DB.combos.forEach(c=>{
    items.push({key:`combo|${c.id}`,label:`🎁 COMBO: ${c.nombre} — ${fmt(c.precio)} (Mayor: ${fmt(c.precioMayorista||c.precio)})`,productoId:null,presId:null,nombre:`🎁 ${c.nombre}`,detalle:'Combo',precio:c.precio,precioMayorista:c.precioMayorista||c.precio,litrosPorUnidad:0,stockDisp:999,esAcc:false,esCombo:true,comboId:c.id,comboItems:c.items});
  });
  return items;
}

function formVenta(){ventaItems=[];renderModalVenta();}
function renderModalVenta(){
  const vendibles = buildVendibles();
  openModal('Nueva Venta', `
    <div class="form-group mb-12">
      <label>Cliente <span style="color:var(--danger)">*</span></label>
      <select id="vCliente" style="border-color:var(--danger);">
        <option value="">— Seleccioná un cliente (obligatorio) —</option>
        ${DB.clientes.map(c => `<option value="${c.id}">${c.nombre}${c.esMayorista ? ' 🏪' : ''}</option>`).join('')}
      </select>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;border:1px solid var(--border);">
      <label style="display:block;margin-bottom:8px;">Agregar producto o combo</label>
      <div class="flex gap-8 flex-wrap">
        <select id="vItemSel" style="flex:2;min-width:0;"><option value="">Seleccioná...</option>${vendibles.map(v => `<option value="${v.key}">${v.label}</option>`).join('')}</select>
        <input id="vCantidad" type="number" min="1" step="1" value="1" style="width:70px;flex-shrink:0;" />
        <button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarItemVenta()">+ Agregar</button>
      </div>
    </div>
    <div id="ventaCartWrap">${renderVentaCart()}</div>
    <div class="form-grid keep-2 mt-12">
      <div class="form-group"><label>Descuento ($)</label>${moneyInput('vDescuento', '0', 'updateVentaTotals()')}</div>
      <div class="form-group"><label>Observaciones</label><input id="vObs" type="text" placeholder="Notas..." /></div>
      <div class="form-group"><label>Costo de envío ($)</label>${moneyInput('vEnvio', '0', 'updateVentaTotals()')}</div>
    </div>
    ${Sesion.esAdmin() ? `
    <div class="form-group mt-8">
      <label style="font-weight:800;">Tipo de precio</label>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <label style="flex:1;display:flex;align-items:center;gap:8px;background:var(--surface2);border:2px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer;">
          <input type="radio" name="vTipoPrecio" value="Actual" checked onchange="recalcPreciosVenta()" style="accent-color:var(--accent);" />
          <span>🛍️ <strong>Actual</strong></span>
        </label>
        <label style="flex:1;display:flex;align-items:center;gap:8px;background:var(--surface2);border:2px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer;">
          <input type="radio" name="vTipoPrecio" value="mayorista" onchange="recalcPreciosVenta()" style="accent-color:var(--accent);" />
          <span>🏪 <strong>Mayorista</strong></span>
        </label>
      </div>
    </div>` : ''}
    <div id="ventaTotalBox"></div>`, guardarVenta, true);
  setTimeout(updateVentaTotals, 30);
}

function esVentaMayorista() {
  if (Sesion.esVendedor()) return true;
  return document.querySelector('input[name="vTipoPrecio"]:checked')?.value === 'mayorista';
}

window.recalcPreciosVenta = function() {
  const esMay = esVentaMayorista();
  ventaItems.forEach(item => {
    item.precioAplicado = esMay ? (item.precioMayorista || item.precio) : item.precio;
    item.subtotal = item.precioAplicado * item.cantidad;
  });
  document.getElementById('ventaCartWrap').innerHTML = renderVentaCart();
  updateVentaTotals();
};

function renderVentaCart() {
  if (!ventaItems.length) return `<div class="empty-state" style="padding:16px;"><div class="empty-icon">🛒</div><p>Agregá productos</p></div>`;

  const esMay = Sesion.esAdmin() ? esVentaMayorista() : true;

  const tbl = `<div class="table-wrap hide-mobile"><table class="cart-table"><thead><tr>
    <th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th>
  </tr></thead><tbody>${ventaItems.map((item, i) => `
    <tr>
      <td class="fw-600">${item.nombre}</td>
      <td>
        <span class="badge ${item.esCombo ? 'badge-green' : 'badge-violet'}">${item.detalle}</span>
        ${esMay && Sesion.esAdmin() ? '<span class="badge badge-violet" style="font-size:9px;margin-left:3px;">Mayor.</span>' : ''}
      </td>
      <td><input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:4px 6px;" onchange="_updVI(${i},+this.value)" /></td>
      <td>
        <input type="number" 
               min="${item.precioMayorista || 0}" 
               step="0.01" 
               value="${(item.precioAplicado || item.precio).toFixed(2)}" 
               style="width:85px;padding:4px 6px;" 
               onchange="cambiarPrecioVenta(${i}, +this.value)" />
      </td>
      <td class="fw-700">${fmt(item.subtotal)}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  const cards = `<div class="mobile-card-list" style="gap:7px;">${ventaItems.map((item, i) => `
    <div class="m-card" style="padding:10px 12px;">
      <div class="m-card-header" style="margin-bottom:7px;">
        <div>
          <div class="m-card-title" style="font-size:13px;">${item.nombre}</div>
          <span class="badge ${item.esCombo ? 'badge-green' : 'badge-violet'}">${item.detalle}</span>
          ${esMay && Sesion.esAdmin() ? '<span class="badge badge-violet" style="font-size:9px;margin-left:3px;">Mayor.</span>' : ''}
        </div>
        <button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button>
      </div>
      <div class="flex-center gap-8" style="flex-wrap:wrap;">
        <label style="font-size:11px;color:var(--text-muted);">Cant.</label>
        <input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:5px 8px;" onchange="_updVI(${i},+this.value)" />
        <label style="font-size:11px;color:var(--text-muted);">Precio</label>
        <input type="number" 
               min="${item.precioMayorista || 0}" 
               step="0.01" 
               value="${(item.precioAplicado || item.precio).toFixed(2)}" 
               style="width:80px;padding:5px 8px;" 
               onchange="cambiarPrecioVenta(${i}, +this.value)" />
        <span style="flex:1;text-align:right;font-family:var(--font-display);font-weight:800;font-size:16px;" class="text-gradient">${fmt(item.subtotal)}</span>
      </div>
    </div>`).join('')}</div>`;

  return tbl + cards;
}

window.cambiarPrecioVenta = function(i, nuevoPrecio) {
  const item = ventaItems[i];
  if (!item) return;
  const min = item.precioMayorista || 0;
  if (nuevoPrecio < min) {
    toast(`El precio no puede ser menor que el costo mayorista (${fmt(min)})`, 'error');
    item.precioAplicado = min;
    document.getElementById('ventaCartWrap').innerHTML = renderVentaCart();
    updateVentaTotals();
    return;
  }
  item.precioAplicado = nuevoPrecio;
  item.subtotal = item.precioAplicado * item.cantidad;
  updateVentaTotals();
  const rows = document.querySelectorAll('#ventaCartWrap tbody tr');
  if (rows[i]) {
    const subtd = rows[i].querySelector('td:last-child');
    if (subtd) subtd.innerHTML = fmt(item.subtotal);
  }
  const cards = document.querySelectorAll('#ventaCartWrap .m-card');
  if (cards[i]) {
    const subSpan = cards[i].querySelector('.text-gradient');
    if (subSpan) subSpan.textContent = fmt(item.subtotal);
  }
};

window._updVI=function(i,v){
  const esMay = esVentaMayorista();
  ventaItems[i].cantidad=v;
  const precio = esMay ? (ventaItems[i].precioMayorista || ventaItems[i].precio) : ventaItems[i].precio;
  ventaItems[i].precioAplicado = precio;
  ventaItems[i].subtotal=v*precio;
  document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();
  updateVentaTotals();
};
window._rmVI=function(i){ventaItems.splice(i,1);document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();updateVentaTotals();};

window.agregarItemVenta=async function(){
  const key=document.getElementById('vItemSel').value;
  const cant=parseInt(document.getElementById('vCantidad').value)||1;
  if(!key){await swalError('Seleccioná un producto o combo');return;}
  const esMay = esVentaMayorista();
  const v=buildVendibles().find(x=>x.key===key);
  if(!v)return;
  if(!v.esCombo && v.stockDisp<cant){await swalError(`Stock insuficiente. Disponible: <strong>${v.stockDisp} un</strong>`);return;}
  const precioAplicado = esMay ? (v.precioMayorista || v.precio) : v.precio;
  const exist=ventaItems.find(x=>x.key===key);
  if(exist){exist.cantidad+=cant;exist.precioAplicado=precioAplicado;exist.subtotal=exist.cantidad*precioAplicado;}
  else ventaItems.push({...v,cantidad:cant,precioAplicado,subtotal:precioAplicado*cant});
  document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();
  updateVentaTotals();
};

window.updateVentaTotals = function() {
  const sub = ventaItems.reduce((s,i) => s + i.subtotal, 0),
        desc = parseFloat(document.getElementById('vDescuento')?.value) || 0,
        envio = parseFloat(document.getElementById('vEnvio')?.value) || 0,
        total = Math.max(0, sub - desc + envio);
  const box = document.getElementById('ventaTotalBox');
  if (box) box.innerHTML = `
    <div class="cost-calc-box mt-12">
      <div class="cost-row"><span>Subtotal</span><span>${fmt(sub)}</span></div>
      ${desc ? `<div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(desc)}</span></div>` : ''}
      ${envio ? `<div class="cost-row"><span>Envío</span><span>${fmt(envio)}</span></div>` : ''}
      <div class="cost-row total"><span>Total</span><span>${fmt(total)}</span></div>
    </div>`;
};

async function guardarVenta(){
  const clienteId = document.getElementById('vCliente')?.value || '';
  if(!clienteId){ await swalError('⚠️ Debés seleccionar un cliente antes de confirmar la venta.'); return; }
  if(!ventaItems.length){ await swalError('Agregá al menos un producto'); return; }
  const esMay = esVentaMayorista();
  const sub = ventaItems.reduce((s,i) => s + i.subtotal, 0);
  const desc = parseFloat(document.getElementById('vDescuento')?.value) || 0;
  const envio = parseFloat(document.getElementById('vEnvio')?.value) || 0;
  const total = Math.max(0, sub - desc + envio);
  const cl = DB.clientes.find(c => c.id === clienteId);

  const itemsGuardados = ventaItems.map(i => {
    let costoUnit = 0;
    if (i.esCombo) {
      const combo = DB.combos.find(c => c.id === i.comboId);
      if (combo) {
        (combo.items || []).forEach(ci => {
          const p = DB.productos.find(x => x.id === ci.productoId);
          if (!p) return;
          if (ci.esAcc) { costoUnit += (p.costoUnidad || 0) * ci.cantidad; }
          else {
            const litros = ci.litrosPorUnidad || 0;
            costoUnit += ((p.costoLitro || 0) * litros) * ci.cantidad;
          }
        });
        costoUnit = i.cantidad > 0 ? costoUnit * i.cantidad : costoUnit;
      }
    } else if (i.esAcc) {
      const p = DB.productos.find(x => x.id === i.productoId);
      costoUnit = p ? (p.costoUnidad || 0) : 0;
    } else {
      const p = DB.productos.find(x => x.id === i.productoId);
      if (p) {
        const pr = (p.presentaciones || []).find(x => x.id === i.presId);
        const litros = pr ? pr.litros : (i.litrosPorUnidad || 0);
        const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
        costoUnit = (p.costoLitro || 0) * litros + costoEnvase;
      }
    }
    return { ...i, costoUnitario: costoUnit };
  });

  const venta = {
    id: genId(),
    fecha: Date.now(),
    clienteId,
    clienteNombre: cl ? cl.nombre : '',
    vendedorId: Sesion.esVendedor() ? Sesion.user.id : null,
    vendedorNombre: Sesion.esVendedor() ? Sesion.user.nombre : '',
    esMayorista: esMay,
    items: itemsGuardados,
    subtotal: sub,
    descuento: desc,
    envio: envio,
    total,
    estado: 'pendiente',
    obs: document.getElementById('vObs')?.value.trim() || ''
  };

  closeModal();

  const stockCalls = [];
  ventaItems.forEach(item => {
    if(item.esCombo){
      (item.comboItems || []).forEach(ci => {
        stockCalls.push(fbDescontarStock(ci.productoId, (ci.litrosPorUnidad || 0) * ci.cantidad * item.cantidad, ci.esAcc));
      });
    } else {
      const cant = item.esAcc ? item.cantidad : (item.litrosPorUnidad || 0) * item.cantidad;
      stockCalls.push(fbDescontarStock(item.productoId, cant, item.esAcc));
    }
  });

  const stockResults = await Promise.all(stockCalls);
  if (stockResults.some(r => !r)) {
    await swalError('⚠️ Stock insuficiente para uno o más productos. Venta no registrada.');
    return;
  }

  await fbSave('ventas', venta);
  await Promise.all(COLS_LIST.map(cargarColeccion));

  swalSuccess('¡Venta registrada!', `Total: <strong>${fmt(total)}</strong>${esMay ? ' <span class="badge badge-violet">Precio mayorista</span>' : ''}`);
}

function verVenta(id){const num=[...DB.ventas].sort((a,b)=>a.fecha-b.fecha).findIndex(x=>x.id===id)+1;const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);const clName=escapeHTML(cl?.nombre||v.clienteNombre||'—');openModal(`Detalle de Venta #${num}`,`<p class="mb-8"><strong>Fecha:</strong> ${fmtDate(v.fecha)}</p><p class="mb-8"><strong>Cliente:</strong> ${clName}${v.esMayorista?' <span class="badge badge-violet">Mayorista</span>':''}</p>${v.obs?`<p class="mb-12"><strong>Obs:</strong> ${escapeHTML(v.obs)}</p>`:''}<p class="mb-12"><strong>Estado:</strong> <span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></p><div class="table-wrap mb-12"><table class="cart-table"><thead><tr><th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${v.items.map(i=>`<tr><td class="fw-600">${escapeHTML(i.nombre)}</td><td><span class="badge badge-violet">${escapeHTML(i.detalle)}</span></td><td>${i.cantidad}</td><td>${fmt(i.precioAplicado||i.precio)}</td><td class="fw-700">${fmt(i.subtotal)}</td></tr>`).join('')}</tbody></table></div><div class="cost-calc-box"><div class="cost-row"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div><div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(v.descuento||0)}</span></div><div class="cost-row total"><span>Total</span><span>${fmt(v.total)}</span></div></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button class="btn btn-wsp-sm" onclick="wspVenta('${v.id}')">📲 WhatsApp</button></div>`,null,true);}

function wspVenta(id){const num=[...DB.ventas].sort((a,b)=>a.fecha-b.fecha).findIndex(x=>x.id===id)+1;const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);let msg=`*🧾 NURA — Comprobante #${num}*\n📅 ${fmtDate(v.fecha)}\n`;if(cl)msg+=`👤 ${cl.nombre}${v.esMayorista?' (Mayorista)':''}\n`;msg+=`\n`;v.items.forEach(i=>msg+=`• ${i.nombre} x${i.cantidad} = ${fmt(i.subtotal)}\n`);if(v.descuento)msg+=`\n🔖 Descuento: -${fmt(v.descuento)}`;msg+=`\n\n💰 *Total: ${fmt(v.total)}*\n\nGracias por elegirnos! 🌿`;const tel=cl?.telefono?.replace(/\D/g,'');window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`,'_blank');}
async function eliminarVenta(id){const res=await swalConfirm('¿Eliminar venta?','Se restaurará el stock de los productos.');if(!res.isConfirmed)return;const v=DB.ventas.find(x=>x.id===id);if(v&&v.items){for(const item of v.items){if(item.esCombo){const combo=DB.combos.find(c=>c.id===item.comboId);if(combo){for(const ci of(combo.items||[])){const p=DB.productos.find(x=>x.id===ci.productoId);if(!p)continue;if(ci.esAcc){p.stockUnidades=(p.stockUnidades||0)+ci.cantidad*item.cantidad;}else{p.stockLitros=(p.stockLitros||0)+(ci.litrosPorUnidad||0)*ci.cantidad*item.cantidad;}}}}else if(item.esAcc){const p=DB.productos.find(x=>x.id===item.productoId);if(p)p.stockUnidades=(p.stockUnidades||0)+item.cantidad;}else{const p=DB.productos.find(x=>x.id===item.productoId);if(p)p.stockLitros=(p.stockLitros||0)+(item.litrosPorUnidad||0)*item.cantidad;}}await Promise.all([...new Set(v.items.map(i=>i.esCombo?i.comboId:i.productoId).filter(Boolean))].map(pid=>{const p=DB.productos.find(x=>x.id===pid);return p?fbSave('productos',p):null;}).filter(Boolean));}await fbRemove('ventas',id);toast('Venta eliminada y stock restaurado');}
