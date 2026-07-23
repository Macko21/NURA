// ===== NURA — reportes.js: Dashboard, Reportes, Estadísticas =====
'use strict';

// ── Cálculo de ganancia neta por ventas ───────────────────────────────
function calcularCostoVenta(venta) {
  let costoTotal = 0;
  venta.items.forEach(item => {
    if (item.costoUnitario != null && item.costoUnitario > 0) {
      costoTotal += item.costoUnitario * item.cantidad;
      return;
    }
    if (item.esCombo) {
      const combo = DB.combos.find(c => c.id === item.comboId);
      if (combo) {
        (combo.items || []).forEach(ci => {
          const p = DB.productos.find(x => x.id === ci.productoId);
          if (!p) return;
          if (ci.esAcc) {
            costoTotal += (p.costoUnidad || 0) * ci.cantidad * item.cantidad;
          } else {
            const pr = (p.presentaciones || []).find(x => x.id === ci.presId);
            const costoL = p.costoLitro || 0;
            const litros = pr ? pr.litros : (ci.litrosPorUnidad || 0);
            const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
            costoTotal += (costoL * litros + costoEnvase) * ci.cantidad * item.cantidad;
          }
        });
      }
    } else if (item.esAcc) {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (p) costoTotal += (p.costoUnidad || 0) * item.cantidad;
    } else {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (!p) return;
      const pr = (p.presentaciones || []).find(x => x.id === item.presId);
      const costoL = p.costoLitro || 0;
      const litros = pr ? pr.litros : (item.litrosPorUnidad || 0);
      const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
      costoTotal += (costoL * litros + costoEnvase) * item.cantidad;
    }
  });
  return costoTotal;
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD — Actualización en tiempo real
// ══════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  if (!el) return;
  const tv = DB.ventas.reduce((s,v) => s+v.total, 0);
  const tc = DB.compras.reduce((s,c) => s+c.total, 0);
  const ganancia = tv - tc;
  const sb = DB.productos.filter(p => p.tipo==='accesorio' ? (p.stockUnidades||0)<=(p.stockMinUnidades||0) : (p.stockLitros||0)<=(p.stockMinLitros||0));
  const meses = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    meses.push({ label: d.toLocaleString('es-AR',{month:'short'}), year: d.getFullYear(), month: d.getMonth() });
  }
  const vm = meses.map(m => ({
    label: m.label,
    val: DB.ventas.filter(v => { const d=new Date(v.fecha); return d.getMonth()===m.month && d.getFullYear()===m.year; }).reduce((s,v) => s+v.total, 0)
  }));
  const maxV = Math.max(...vm.map(m => m.val), 1);
  const ult = [...DB.ventas].sort((a,b) => b.fecha-a.fecha).slice(0,5);
  const lastUpdateStr = typeof getLastUpdateStr === 'function' ? getLastUpdateStr() : '';

  el.innerHTML = `
    <div class="dash-topbar">
      <div></div>
      <div id="dashLastUpdate" class="dash-live-dot">
        <span></span> Actualizado ${lastUpdateStr}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--accent-soft);color:var(--accent);">💰</div><div class="kpi-label">Ventas</div><div class="kpi-value">${fmt(tv)}</div><div class="kpi-sub">${DB.ventas.length} ventas</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--teal-soft);color:var(--teal);">📈</div><div class="kpi-label">Ganancia</div><div class="kpi-value" style="color:${ganancia>=0?'var(--teal)':'var(--red)'}">${fmt(ganancia)}</div><div class="kpi-sub">${tc>0?Math.round((ganancia/tv)*100)+'% margen':'—'}</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--violet-soft);color:var(--violet);">👥</div><div class="kpi-label">Clientes</div><div class="kpi-value">${DB.clientes.length}</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:${sb.length?'var(--red-soft)':'var(--green-soft)'};color:${sb.length?'var(--red)':'var(--green)'};">${sb.length?'⚠️':'✅'}</div><div class="kpi-label">Stock bajo</div><div class="kpi-value">${sb.length}</div><div class="kpi-sub">${sb.length?sb.slice(0,2).map(p=>p.nombre).join(', ')+((sb.length>2)?'...':''):'Todo OK'}</div></div>
    </div>

    <div class="card mb-16">
      <div class="section-title mb-12">Ventas por mes</div>
      <div class="bar-chart">
        ${vm.map(m => `<div class="bar-col"><div class="bar-track"><div class="bar-fill" style="height:${Math.round((m.val/maxV)*100)}%" title="${fmt(m.val)}"></div></div><div class="bar-label">${m.label}</div><div class="bar-val">${fmt(m.val)}</div></div>`).join('')}
      </div>
    </div>

    <div class="card mb-16">
      <div class="section-title mb-12">Últimas ventas</div>
      ${ult.length===0 ? `<div class="empty-state"><p>Sin ventas aún</p></div>` :
        `<ul class="activity-list">
          ${ult.map(v => {
            const cl = DB.clientes.find(c => c.id===v.clienteId);
            const estadoClass = v.estado==='pagado' ? 'pagado' : v.estado==='pendiente' ? 'pendiente' : 'adeuda';
            return `<li class="activity-item" onclick="navigate('ventas')">
              <div class="activity-dot ${estadoClass}"></div>
              <div class="activity-body">
                <div class="activity-title">${cl?cl.nombre:v.clienteNombre||'Sin cliente'}</div>
                <div class="activity-time">${fmtDate(v.fecha)}</div>
              </div>
              <div class="activity-amount">${fmt(v.total)}</div>
            </li>`;
          }).join('')}
        </ul>`}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════════════════════════════════
let _repFiltro = { mes: '', anio: '' };

function aplicarFiltroReportes() {
  _repFiltro.mes = document.getElementById('repMes')?.value || '';
  _repFiltro.anio = document.getElementById('repAnio')?.value || '';
  renderReportes();
}

function limpiarFiltroReportes() {
  _repFiltro = { mes: '', anio: '' };
  renderReportes();
}

function renderReportes(){
  const el=document.getElementById('page-reportes');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-wsp-sm" onclick="wspReporte()">📲 Compartir</button>`;

  // Filtrar ventas por mes/año si hay filtro
  let ventasFiltradas = DB.ventas;
  if (_repFiltro.mes !== '' || _repFiltro.anio !== '') {
    ventasFiltradas = DB.ventas.filter(v => {
      const d = new Date(v.fecha);
      if (_repFiltro.anio !== '' && d.getFullYear() !== parseInt(_repFiltro.anio)) return false;
      if (_repFiltro.mes !== '' && d.getMonth() !== parseInt(_repFiltro.mes)) return false;
      return true;
    });
  }
  const filtrado = _repFiltro.mes !== '' || _repFiltro.anio !== '';

  const tv=ventasFiltradas.reduce((s,v)=>s+v.total,0);
  const tc=comprasFiltradas().reduce((s,c)=>s+c.total,0);
  const cobrado=ventasFiltradas.filter(v=>v.estado==='pagado').reduce((s,v)=>s+v.total,0);
  const pendiente=ventasFiltradas.filter(v=>v.estado==='pendiente').reduce((s,v)=>s+v.total,0);

  const ventasPagadas = ventasFiltradas.filter(v => v.estado === 'pagado');
  const ventasPendientes = ventasFiltradas.filter(v => v.estado === 'pendiente');
  const costoPagadas = ventasPagadas.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const costoPendientes = ventasPendientes.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const gananciaNeta = cobrado - costoPagadas;
  const gananciaTotal = tv - ventasFiltradas.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const margenPct = cobrado > 0 ? Math.round((gananciaNeta / cobrado) * 100) : 0;

  const topP={};ventasFiltradas.forEach(v=>v.items.forEach(i=>{if(!i.esCombo){topP[i.nombre]=(topP[i.nombre]||0)+i.subtotal;}}));
  const topC={};ventasFiltradas.forEach(v=>v.items.forEach(i=>{if(i.esCombo){topC[i.nombre]=(topC[i.nombre]||0)+i.subtotal;}}));
  const topCl={};ventasFiltradas.forEach(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);const n=cl?cl.nombre:v.clienteNombre||'?';topCl[n]=(topCl[n]||0)+v.total;});
  const litV={};ventasFiltradas.forEach(v=>v.items.forEach(i=>{if(!i.esAcc&&!i.esCombo){const b=i.nombre.split(' ').slice(0,-1).join(' ')||i.nombre;litV[b]=(litV[b]||0)+(i.litrosPorUnidad||0)*i.cantidad;}}));
  const vtaMay=ventasFiltradas.filter(v=>v.esMayorista).reduce((s,v)=>s+v.total,0);
  const vtaMin=ventasFiltradas.filter(v=>!v.esMayorista).reduce((s,v)=>s+v.total,0);
  const topCard=(items,vf)=>{if(!items.length)return`<div class="empty-state" style="padding:20px;"><p>Sin datos</p></div>`;return items.map(([n,v],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);"><span style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--text-light);width:22px;">${i+1}</span><span style="flex:1;font-weight:500;font-size:13px;">${n}</span><span class="fw-700 text-gradient">${vf(v)}</span></div>`).join('');};

  // Options para selects
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const anios = [...new Set(DB.ventas.map(v=>new Date(v.fecha).getFullYear()))].sort((a,b)=>b-a);
  const mesOpts = `<option value="">Todos</option>${meses.map((m,i)=>`<option value="${i}" ${String(i)===_repFiltro.mes?'selected':''}>${m}</option>`).join('')}`;
  const anioOpts = `<option value="">Todos</option>${anios.map(a=>`<option value="${a}" ${String(a)===_repFiltro.anio?'selected':''}>${a}</option>`).join('')}`;

  el.innerHTML=`
    <div class="card mb-16" style="padding:12px 16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:13px;color:var(--text-muted);">🔍 Filtrar:</span>
        <select id="repMes" style="padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;" onchange="aplicarFiltroReportes()">
          ${mesOpts}
        </select>
        <select id="repAnio" style="padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;" onchange="aplicarFiltroReportes()">
          ${anioOpts}
        </select>
        ${filtrado ? `<button class="btn btn-secondary btn-sm" onclick="limpiarFiltroReportes()">✕ Limpiar</button>` : ''}
        ${filtrado ? `<span style="font-size:12px;color:var(--accent-dark);">Mostrando: ${meses[parseInt(_repFiltro.mes)]||''} ${_repFiltro.anio||'todos los años'} · ${ventasFiltradas.length} ventas</span>` : ''}
      </div>
    </div>

    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Ventas totales</div><div class="stat-value">${fmt(tv)}</div><div class="stat-sub">${ventasFiltradas.length} ventas</div></div></div>
      <div class="stat-card"><div class="stat-icon violet">✅</div><div class="stat-info"><div class="stat-label">Cobrado</div><div class="stat-value">${fmt(cobrado)}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info"><div class="stat-label">Pendiente</div><div class="stat-value">${fmt(pendiente)}</div></div></div>
      <div class="stat-card"><div class="stat-icon ${gananciaNeta>=0?'green':'red'}">📊</div><div class="stat-info"><div class="stat-label">Ganancia neta</div><div class="stat-value">${fmt(gananciaNeta)}</div><div class="stat-sub">Margen ${margenPct}%</div></div></div>
    </div>

    <div class="card mb-16" style="border-left:4px solid var(--accent-dark);">
      <div class="section-title mb-12">💸 Desglose financiero neto</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="cost-row"><span>Ingresos cobrados</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(cobrado)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Costo de lo vendido (cobrado)</span><span style="color:var(--danger)">-${fmt(costoPagadas)}</span></div>
        <div class="cost-row total"><span>✅ Ganancia neta cobrada</span><span style="color:${gananciaNeta>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(gananciaNeta)}</span></div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="cost-row"><span>Ventas pendientes de cobro</span><span class="fw-700" style="color:var(--warning)">${fmt(pendiente)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Costo de lo pendiente</span><span style="color:var(--danger)">-${fmt(costoPendientes)}</span></div>
        <div class="cost-row"><span>⏳ Ganancia neta pendiente</span><span style="color:var(--warning)">${fmt(pendiente-costoPendientes)}</span></div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="cost-row total" style="font-size:16px;"><span>🏆 Ganancia neta total</span><span style="color:${gananciaTotal>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(gananciaTotal)}</span></div>
        ${costoPagadas===0&&tv>0?`<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">⚠️ Sin datos de costo — cargá el costo por litro y envase en cada producto para ver la ganancia real.</div>`:''}
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">🎁 Top combos ($)</div>${topCard(Object.entries(topC).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
      <div class="card"><div class="section-title mb-12">🏆 Top productos ($)</div>${topCard(Object.entries(topP).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">👑 Mejores clientes</div>${topCard(Object.entries(topCl).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
      <div class="card"><div class="section-title mb-12">💧 Litros vendidos</div>${topCard(Object.entries(litV).sort((a,b)=>b[1]-a[1]).slice(0,5),v=>fmtL(v)+' L')}</div>
    </div>
    <div class="card"><div class="section-title mb-12">📦 Inventario</div>
      <div class="grid-3 keep-2" style="margin-top:8px;text-align:center;">
        <div style="padding:12px;"><div class="fw-800 text-gradient" style="font-family:var(--font-display);font-size:32px;">${DB.productos.length}</div><div class="text-muted">Productos</div></div>
        <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--warning);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length}</div><div class="text-muted">Stock bajo</div></div>
        <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--danger);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)===0:(p.stockLitros||0)===0).length}</div><div class="text-muted">Sin stock</div></div>
      </div>
    </div>`;
}

function comprasFiltradas() {
  if (_repFiltro.mes === '' && _repFiltro.anio === '') return DB.compras;
  return DB.compras.filter(c => {
    const d = new Date(c.fecha);
    if (_repFiltro.anio !== '' && d.getFullYear() !== parseInt(_repFiltro.anio)) return false;
    if (_repFiltro.mes !== '' && d.getMonth() !== parseInt(_repFiltro.mes)) return false;
    return true;
  });
}

function wspReporte(){const tv=DB.ventas.reduce((s,v)=>s+v.total,0),tc=DB.compras.reduce((s,c)=>s+c.total,0),sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;window.open('https://wa.me/?text='+encodeURIComponent(`*📊 Resumen NURA — ${new Date().toLocaleDateString('es-AR')}*\n\n💰 Ventas: ${fmt(tv)}\n🚚 Compras: ${fmt(tc)}\n📈 Ganancia: ${fmt(tv-tc)}\n📦 Productos: ${DB.productos.length} | 👥 Clientes: ${DB.clientes.length}\n⚠️ Stock bajo: ${sb}\n\n_NURA Gestión_`),'_blank');}

// ══════════════════════════════════════════════════════════════════════
// MIS REPORTES (Vendedor)
// ══════════════════════════════════════════════════════════════════════
function renderMisReportes() {
  if (!Sesion.esVendedor()) return navigate('catalogo');
  const el = document.getElementById('page-misreportes');
  const misVentas = DB.ventas.filter(v => v.vendedorId === Sesion.user.id);

  if (misVentas.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Aún no tienes ventas registradas</p></div>`;
    return;
  }

  const totalVendido = misVentas.reduce((s, v) => s + v.total, 0);
  const gananciaBruta = misVentas.reduce((s, v) => {
    const ganV = v.items.reduce((sum, i) => sum + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0);
    return s + ganV + (v.envio || 0);
  }, 0);
  const deudaAdmin = misVentas.reduce((s, v) => {
    const costo = v.items.reduce((sum, i) => sum + (i.precioMayorista || 0) * i.cantidad, 0);
    return s + costo;
  }, 0);

  const topP = {};
  misVentas.forEach(v => v.items.forEach(i => {
    topP[i.nombre] = (topP[i.nombre] || 0) + i.subtotal;
  }));
  const topCl = {};
  misVentas.forEach(v => {
    const cl = DB.clientes.find(c => c.id === v.clienteId);
    const n = cl ? cl.nombre : v.clienteNombre || '?';
    topCl[n] = (topCl[n] || 0) + v.total;
  });

  el.innerHTML = `
    <div class="grid-3 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Total vendido</div><div class="stat-value">${fmt(totalVendido)}</div></div></div>
      <div class="stat-card"><div class="stat-icon violet">💸</div><div class="stat-info"><div class="stat-label">Tu ganancia</div><div class="stat-value">${fmt(gananciaBruta)}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">🧾</div><div class="stat-info"><div class="stat-label">Debés al admin</div><div class="stat-value">${fmt(deudaAdmin)}</div></div></div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">🏆 Tus productos más vendidos</div>
        ${Object.entries(topP).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,v],i)=>`
          <div class="cost-row"><span>${i+1}. ${n}</span><span>${fmt(v)}</span></div>
        `).join('') || '<p class="text-muted">Sin ventas</p>'}
      </div>
      <div class="card"><div class="section-title mb-12">👑 Tus mejores clientes</div>
        ${Object.entries(topCl).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,v],i)=>`
          <div class="cost-row"><span>${i+1}. ${n}</span><span>${fmt(v)}</span></div>
        `).join('') || '<p class="text-muted">Sin ventas</p>'}
      </div>
    </div>
  `;
}

// ── WhatsApp catálogo global ──────────────────────────────────────────
document.getElementById('btnWhatsappGlobal').onclick=async function(){
  if(!DB.productos.length){await swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let msg=`*🌿 NURA — Catálogo*\n\n`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{msg+=`*${EMOJIS_CAT[cat]||'🧴'} ${cat}*\n`;DB.productos.filter(p=>p.categoria===cat).forEach(p=>{if(p.tipo==='accesorio')msg+=`  • ${p.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(p.precioVenta)}\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`  • ${p.nombre} ${pr.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(pr.precioVenta)}\n`;});});msg+='\n';});
  if(DB.combos.length){msg+=`*🎁 Combos*\n`;DB.combos.forEach(c=>{msg+=`  • ${c.nombre} — ${fmt(c.precio)}\n`;});msg+='\n';}
  msg+=`📞 ¡Consultanos!\n📷 @nura.neco | 📲 2262 240512`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
};
