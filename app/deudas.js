// ===== NURA — deudas.js: Cuenta Corriente y Pagos =====
'use strict';

function getSaldoVenta(venta) {
  const pagado = (venta.pagos || []).reduce((s, p) => s + p.monto, 0);
  return { pagado, saldo: Math.max(0, venta.total - pagado) };
}

function getTotalDeudaCliente(clienteKey) {
  return DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado' && v.estado !== 'pagado')
    .reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
}

function renderDeudas() {
  const el = document.getElementById('page-deudas');
  if (!el) return;
  document.getElementById('topbarActions').innerHTML = '';

  const clientesConDeuda = [];
  const vistos = new Set();
  DB.ventas.forEach(v => {
    if (v.estado === 'pagado') return;
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

  const cards = clientesConDeuda.map(key => {
    const cl = DB.clientes.find(c => c.id === key);
    const nombre = cl ? cl.nombre : (DB.ventas.find(v => v.clienteId === key || v.clienteNombre === key)?.clienteNombre || '—');
    const deuda = getTotalDeudaCliente(key);
    const ventasConSaldo = DB.ventas.filter(v =>
      (v.clienteId === key || v.clienteNombre === key) &&
      v.estado !== 'cancelado' &&
      v.estado !== 'pagado' &&
      getSaldoVenta(v).saldo > 0.01
    );
    const masAntigua = Math.min(...ventasConSaldo.map(v => v.fecha));
    const dias = Math.floor((Date.now() - masAntigua) / 86400000);
    const colorBorde = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--border)';
    const colorDias = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--text-muted)';

    return `<div class="m-card" style="border-left:4px solid ${colorBorde};">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">👤 ${nombre}</div>
          <div class="m-card-subtitle">${ventasConSaldo.length} pedido(s) con saldo · <span style="color:${colorDias};">${dias} día(s)</span></div>
          ${cl?.telefono ? `<div class="m-card-subtitle">📲 ${cl.telefono}</div>` : ''}
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

  el.innerHTML = `
    <div class="card mb-16" style="border-left:4px solid var(--danger);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="section-title">💳 Total adeudado</div>
          <div class="stat-sub" style="margin-top:4px;">${clientesConDeuda.length} cliente(s) con deuda</div>
        </div>
        <div style="font-family:var(--font-display);font-size:32px;font-weight:900;color:var(--danger);">${fmt(totalGlobal)}</div>
      </div>
    </div>
    <div class="mobile-card-list deuda-container">${cards}</div>`;
}

window.verCuentaCorriente = function(clienteKey) {
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : (DB.ventas.find(v => v.clienteId === clienteKey)?.clienteNombre || '—');

  const todasVentas = DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado')
    .sort((a, b) => b.fecha - a.fecha);

  const totalDeuda = todasVentas.reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
  const totalPagado = todasVentas.reduce((s, v) => s + getSaldoVenta(v).pagado, 0);
  const totalFacturado = todasVentas.reduce((s, v) => s + v.total, 0);

  const ventasHTML = todasVentas.map(v => {
    const { pagado, saldo } = getSaldoVenta(v);
    const pct = v.total > 0 ? Math.round((pagado / v.total) * 100) : 100;
    const esSaldado = saldo <= 0.01;

    const itemsList = v.items.map(i =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid var(--border);">
        <span style="color:var(--text-muted);">${i.nombre}${i.detalle && i.detalle!=='Unidad'?' '+i.detalle:''} × ${i.cantidad}</span>
        <span style="font-weight:600;">${fmt(i.subtotal)}</span>
      </div>`
    ).join('');

    const pagosHTML = (v.pagos || []).length > 0
      ? `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border);">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">PAGOS REGISTRADOS</div>
          ${(v.pagos || []).map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;">
              <span>${fmtDate(p.fecha)} · ${p.medio==='transferencia'?'📱 Transferencia':'💵 Efectivo'}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:var(--accent-dark);font-weight:700;">+${fmt(p.monto)}</span>
                <button class="btn btn-danger btn-sm btn-icon" style="padding:2px 6px;font-size:10px;" onclick="eliminarPago('${v.id}','${p.id}','${clienteKey}')">✕</button>
              </div>
            </div>`).join('')}
        </div>`
      : '';

    return `<div style="background:var(--surface2);border:1px solid ${esSaldado?'var(--border)':'rgba(244,63,94,0.3)'};border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;${esSaldado?'opacity:0.75':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:12px;color:var(--text-muted);">📅 ${fmtDate(v.fecha)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${v.items.length} ítem(s)${v.esMayorista?' · <span style="color:var(--accent-dark)">Mayorista</span>':''}</div>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-${esSaldado?'green':'red'}" style="font-size:10px;">${esSaldado?'✅ Saldado':'⏳ Con deuda'}</span>
          <div style="font-weight:800;font-size:15px;margin-top:4px;">${fmt(v.total)}</div>
        </div>
      </div>
      <div style="margin-bottom:8px;">${itemsList}</div>
      ${v.descuento ? `<div style="font-size:11px;color:var(--danger);">🔖 Descuento: -${fmt(v.descuento)}</div>` : ''}
      <div style="background:var(--surface);border-radius:4px;height:5px;margin:8px 0;">
        <div style="height:100%;width:${pct}%;background:${esSaldado?'var(--accent-dark)':'var(--warning)'};border-radius:4px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
        <span style="color:var(--accent-dark);">Pagado: ${fmt(pagado)} (${pct}%)</span>
        ${!esSaldado ? `<span style="color:var(--danger);font-weight:700;">Saldo: ${fmt(saldo)}</span>` : '<span style="color:var(--accent-dark);font-weight:700;">Saldado ✅</span>'}
      </div>
      ${pagosHTML}
      ${!esSaldado ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px;" onclick="modalRegistrarPago('${v.id}','${clienteKey}')">💰 Registrar pago</button>` : ''}
    </div>`;
  }).join('');

  openModal(`📋 Cuenta corriente — ${nombre}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;text-align:center;">
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-size:10px;color:var(--text-muted);">FACTURADO</div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:16px;">${fmt(totalFacturado)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-size:10px;color:var(--text-muted);">PAGADO</div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:16px;color:var(--accent-dark);">${fmt(totalPagado)}</div>
      </div>
      <div style="background:rgba(244,63,94,0.08);border-radius:var(--radius-sm);padding:10px;border:1px solid rgba(244,63,94,0.2);">
        <div style="font-size:10px;color:var(--danger);">ADEUDA</div>
        <div style="font-family:var(--font-display);font-weight:900;font-size:16px;color:var(--danger);">${fmt(totalDeuda)}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      ${cl?.telefono ? `<button class="btn btn-wsp-sm" style="flex:1;" onclick="wspDeudaCliente('${clienteKey}')">📲 Enviar estado de cuenta</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="navigate('deudas');closeModal()">← Volver</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Todos los pedidos — del más reciente al más antiguo</div>
    <div style="max-height:440px;overflow-y:auto;">${ventasHTML}</div>
  `, null, true);
};

window.modalRegistrarPago = function(ventaId, clienteKey) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return;
  const { saldo } = getSaldoVenta(v);

  Swal.fire({
    title: '💰 Registrar pago',
    html: `
      <div style="text-align:left;font-size:13px;color:#64748b;margin-bottom:10px;">
        Saldo pendiente: <strong style="color:#ef4444;">${fmt(saldo)}</strong>
      </div>
      <input id="swal-monto" type="number" min="1" max="${Math.ceil(saldo)}" step="1"
        value="${Math.ceil(saldo)}" class="swal2-input" placeholder="Monto" style="margin:0 0 10px 0;" />
      <select id="swal-medio" class="swal2-input" style="margin:0;">
        <option value="efectivo">💵 Efectivo</option>
        <option value="transferencia">📱 Transferencia</option>
      </select>`,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Cancelar',
    focusConfirm: false,
    didOpen: () => { const i = document.getElementById('swal-monto'); if(i){i.focus();i.select();} },
    preConfirm: () => {
      const monto = parseFloat(document.getElementById('swal-monto').value) || 0;
      const medio = document.getElementById('swal-medio').value;
      if (!monto || monto <= 0) { Swal.showValidationMessage('Ingresá un monto válido'); return false; }
      if (monto > saldo + 0.01) { Swal.showValidationMessage(`No puede superar el saldo (${fmt(saldo)})`); return false; }
      return { monto, medio };
    }
  }).then(async result => {
    if (!result.isConfirmed) return;
    const { monto, medio } = result.value;
    v.pagos = [...(v.pagos || []), { id: genId(), fecha: Date.now(), monto, medio }];
    if (getSaldoVenta(v).saldo <= 0.01) v.estado = 'pagado';
    await fbSave('ventas', v);
    toast(`Pago de ${fmt(monto)} registrado ✅`);
    window.verCuentaCorriente(clienteKey);
  });
};

window.eliminarPago = async function(ventaId, pagoId, clienteKey) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return;
  const pago = (v.pagos || []).find(p => p.id === pagoId);
  if (!pago) return;
  const res = await swalConfirm('¿Eliminar pago?', `Se eliminará el pago de <strong>${fmt(pago.monto)}</strong>`);
  if (!res.isConfirmed) return;
  v.pagos = v.pagos.filter(p => p.id !== pagoId);
  if (getSaldoVenta(v).saldo > 0.01 && v.estado === 'pagado') v.estado = 'pendiente';
  await fbSave('ventas', v);
  toast('Pago eliminado');
  window.verCuentaCorriente(clienteKey);
};

window.wspDeudaCliente = function(clienteKey) {
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : '—';
  const ventas = DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado' && getSaldoVenta(v).saldo > 0.01)
    .sort((a,b) => a.fecha - b.fecha);

  const totalDeuda = ventas.reduce((s,v) => s + getSaldoVenta(v).saldo, 0);
  let msg = `*🧾 NURA — Estado de cuenta*\n`;
  msg += `👤 ${nombre}\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-AR')}\n`;
  msg += `--------------------------\n\n`;

  ventas.forEach((v, idx) => {
    const { pagado, saldo } = getSaldoVenta(v);
    msg += `*Pedido ${idx+1}* — ${fmtDate(v.fecha)}\n`;
    v.items.forEach(i => { msg += `  • ${i.nombre}${i.detalle&&i.detalle!=='Unidad'?' '+i.detalle:''} x${i.cantidad} = ${fmt(i.subtotal)}\n`; });
    if (v.descuento) msg += `  🔖 Desc: -${fmt(v.descuento)}\n`;
    msg += `  Total: ${fmt(v.total)}`;
    if (pagado > 0) msg += ` · Pagado: ${fmt(pagado)}`;
    msg += `\n  💰 *Saldo: ${fmt(saldo)}*\n\n`;
  });

  msg += `--------------------------\n`;
  msg += `💰 *TOTAL ADEUDADO: ${fmt(totalDeuda)}*\n\n`;
  msg += `Podés pagar por efectivo o transferencia.\n📷 @nura.neco`;

  const tel = cl?.telefono?.replace(/\D/g,'');
  window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`, '_blank');
};
