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
  const el=document.getElementById('page-dashboard');
  if (!el) return;
  const tv=DB.ventas.reduce((s,v)=>s+v.total,0);
  const tc=DB.ventas.reduce((s,v)=>s+calcularCostoVenta(v),0);
  const ganancia=tv-tc;
  const margen=tv>0?Math.round((ganancia/tv)*100):0;
  const ticketProm=DB.ventas.length>0?Math.round(tv/DB.ventas.length):0;
  const sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;
  const meses=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);meses.push({label:d.toLocaleString('es-AR',{month:'short'}),year:d.getFullYear(),month:d.getMonth()});}
  const vm=meses.map(m=>({label:m.label,val:DB.ventas.filter(v=>{const d=new Date(v.fecha);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,v)=>s+v.total,0)}));
  const maxV=Math.max(...vm.map(m=>m.val),1);
  const ult=[...DB.ventas].sort((a,b)=>a.fecha-b.fecha).map((v,i)=>({...v,num:i+1})).sort((a,b)=>b.fecha-a.fecha).slice(0,5);
  const lastUpdateStr = typeof getLastUpdateStr === 'function' ? getLastUpdateStr() : '';
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div></div>
      <div id="dashLastUpdate" style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--accent-dark);animation:pulse 2s infinite;"></span>
        Actualizado ${lastUpdateStr}
      </div>
    </div>
    <div class="grid-4 mb-16">
      <div class="stat-card dash-stat" data-stat="ventas"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Ingresos</div><div class="stat-value">${fmt(tv)}</div><div class="stat-sub">${DB.ventas.length} ventas · Ticket ${fmt(ticketProm)}</div></div></div>
      <div class="stat-card dash-stat" data-stat="costos"><div class="stat-icon orange">📦</div><div class="stat-info"><div class="stat-label">Costo vendido</div><div class="stat-value">${fmt(tc)}</div></div></div>
      <div class="stat-card dash-stat" data-stat="ganancia"><div class="stat-icon ${ganancia>=0?'green':'red'}">${ganancia>=0?'📈':'📉'}</div><div class="stat-info"><div class="stat-label">Ganancia</div><div class="stat-value">${fmt(ganancia)}</div><div class="stat-sub">Margen ${margen}%</div></div></div>
      <div class="stat-card dash-stat" data-stat="stock"><div class="stat-icon ${sb>0?'red':'green'}">${sb>0?'⚠️':'✅'}</div><div class="stat-info"><div class="stat-label">Stock bajo</div><div class="stat-value">${sb}</div></div></div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-header"><div class="section-title">Ventas por mes</div></div>
        <div class="mini-chart">${vm.map(m=>`<div class="bar-wrap"><div class="bar" style="height:${Math.round((m.val/maxV)*90)}px" title="${fmt(m.val)}"></div><div class="bar-label">${m.label}</div></div>`).join('')}</div>
      </div>
      <div class="card"><div class="section-header"><div class="section-title">Resumen</div></div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
          <div class="cost-row"><span>Ingresos</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(tv)}</span></div>
          <div class="cost-row"><span>Costo de lo vendido</span><span style="color:var(--danger)">-${fmt(tc)}</span></div>
          <div class="cost-row total"><span>Ganancia</span><span style="color:${ganancia>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(ganancia)} (${margen}%)</span></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="section-header"><div class="section-title">Últimas ventas</div><button class="btn btn-secondary btn-sm" onclick="navigate('ventas')">Ver todas →</button></div>
      ${ult.length===0?`<div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas aún</p></div>`:dashVentas(ult)}
    </div>`;
}

function dashVentas(items) {
  const tbl=`<div class="table-wrap hide-mobile" style="margin-top:10px;"><table><thead><tr><th>Trans.</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead><tbody>
    ${items.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<tr><td><span class="badge badge-blue">#${v.num}</span></td><td>${fmtDate(v.fecha)}</td><td>${cl?cl.nombre:v.clienteNombre||'—'}</td><td class="fw-700">${fmt(v.total)}</td><td><span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></td></tr>`;}).join('')}
    </tbody></table></div>`;
  const cards=`<div class="mobile-card-list" style="margin-top:10px;">
    ${items.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title"><span class="badge badge-blue" style="margin-right:6px;">#${v.num}</span> ${cl?cl.nombre:v.clienteNombre||'Sin cliente'}</div><div class="m-card-subtitle">${fmtDate(v.fecha)}</div></div><span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></div><div style="font-family:var(--font-display);font-size:20px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div></div>`;}).join('')}
  </div>`;
  return tbl+cards;
}

// ══════════════════════════════════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════════════════════════════════
function renderReportes(){
  const el=document.getElementById('page-reportes');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-wsp-sm" onclick="wspReporte()">📲 Compartir</button>`;

  const tv=DB.ventas.reduce((s,v)=>s+v.total,0);
  const tc=DB.ventas.reduce((s,v)=>s+calcularCostoVenta(v),0);
  const ganancia=tv-tc;
  const margenPct=tv>0?Math.round((ganancia/tv)*100):0;
  const ticketProm=DB.ventas.length>0?Math.round(tv/DB.ventas.length):0;
  const cobrado=DB.ventas.filter(v=>v.estado==='pagado').reduce((s,v)=>s+v.total,0);
  const pendiente=DB.ventas.filter(v=>v.estado==='pendiente').reduce((s,v)=>s+v.total,0);
  const costoPagadas=DB.ventas.filter(v=>v.estado==='pagado').reduce((s,v)=>s+calcularCostoVenta(v),0);
  const gananciaNeta=cobrado-costoPagadas;
  const vtaMay=DB.ventas.filter(v=>v.esMayorista).reduce((s,v)=>s+v.total,0);
  const vtaMin=DB.ventas.filter(v=>!v.esMayorista).reduce((s,v)=>s+v.total,0);

  const invValorizado=DB.productos.reduce((s,p)=>{
    if(p.tipo==='accesorio') return s+(p.costoUnidad||0)*(p.stockUnidades||0);
    return s+(p.costoLitro||0)*(p.stockLitros||0);
  },0);

  const topP={};
  DB.ventas.forEach(v=>v.items.forEach(i=>{
    const key=i.nombre;
    if(!topP[key]) topP[key]={ingreso:0,costo:0,cant:0};
    topP[key].ingreso+=i.subtotal;
    topP[key].costo+=(i.costoUnitario||0)*i.cantidad;
    topP[key].cant+=i.cantidad;
  }));
  const topProdByMargin=Object.entries(topP)
    .filter(([,v])=>v.ingreso>0&&v.costo>0)
    .map(([n,v])=>({n,ingreso:v.ingreso,costo:v.costo,ganancia:v.ingreso-v.costo,margen:Math.round(((v.ingreso-v.costo)/v.ingreso)*100),cant:v.cant}))
    .sort((a,b)=>b.margen-a.margen);

  const topCl={};
  DB.ventas.forEach(v=>{
    const cl=DB.clientes.find(c=>c.id===v.clienteId);
    const n=cl?cl.nombre:v.clienteNombre||'?';
    if(!topCl[n]) topCl[n]={ingreso:0,costo:0,ventas:0};
    topCl[n].ingreso+=v.total;
    topCl[n].costo+=calcularCostoVenta(v);
    topCl[n].ventas++;
  });
  const topClientes=Object.entries(topCl)
    .map(([n,v])=>({n,ingreso:v.ingreso,costo:v.costo,ganancia:v.ingreso-v.costo,margen:v.ingreso>0?Math.round(((v.ingreso-v.costo)/v.ingreso)*100):0,ventas:v.ventas}))
    .sort((a,b)=>b.ganancia-a.ganancia);

  const lowMargin=topProdByMargin.filter(p=>p.margen<30).slice(0,5);

  const pct=(v,tot)=>tot>0?Math.round((v/tot)*100):0;

  el.innerHTML=`
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Ingresos totales</div><div class="stat-value">${fmt(tv)}</div><div class="stat-sub">${DB.ventas.length} ventas · Ticket ${fmt(ticketProm)}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">📦</div><div class="stat-info"><div class="stat-label">Costo vendido</div><div class="stat-value">${fmt(tc)}</div><div class="stat-sub">${pct(tc,tv)}% de ingresos</div></div></div>
      <div class="stat-card"><div class="stat-icon ${ganancia>=0?'green':'red'}">📈</div><div class="stat-info"><div class="stat-label">Ganancia bruta</div><div class="stat-value">${fmt(ganancia)}</div><div class="stat-sub">Margen ${margenPct}%</div></div></div>
      <div class="stat-card"><div class="stat-icon blue">🏦</div><div class="stat-info"><div class="stat-label">Cobrado</div><div class="stat-value">${fmt(cobrado)}</div><div class="stat-sub">${pct(cobrado,tv)}% del total</div></div></div>
    </div>

    <div class="card mb-16" style="border-left:4px solid var(--accent-dark);">
      <div class="section-title mb-12">📊 P&L simplificado</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="cost-row"><span>Ingresos por ventas</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(tv)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Mayorista</span><span style="color:var(--text-muted);font-size:13px;">${fmt(vtaMay)} (${pct(vtaMay,tv)}%)</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Actual</span><span style="color:var(--text-muted);font-size:13px;">${fmt(vtaMin)} (${pct(vtaMin,tv)}%)</span></div>
        <div class="cost-row"><span>Costo de lo vendido (COGS)</span><span style="color:var(--danger)">-${fmt(tc)}</span></div>
        <div class="cost-row total" style="font-size:16px;"><span>🏆 Ganancia bruta</span><span style="color:${ganancia>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(ganancia)} (${margenPct}%)</span></div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="cost-row"><span>Cobrado efectivo</span><span style="color:var(--accent-dark)">${fmt(cobrado)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— COGS cobrado</span><span style="color:var(--danger)">-${fmt(costoPagadas)}</span></div>
        <div class="cost-row"><span>✅ Ganancia neta cobrada</span><span style="color:${gananciaNeta>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(gananciaNeta)}</span></div>
        <div class="cost-row"><span>⏳ Pendiente de cobro</span><span style="color:var(--warning)">${fmt(pendiente)}</span></div>
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">📦 Inventario valorizado</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          <div class="cost-row"><span>Valor a costo real</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(invValorizado)}</span></div>
          <div class="cost-row"><span>Productos</span><span>${DB.productos.length}</span></div>
          <div class="cost-row"><span>Stock bajo</span><span style="color:var(--warning)">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length}</span></div>
          <div class="cost-row"><span>Sin stock</span><span style="color:var(--danger)">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)===0:(p.stockLitros||0)===0).length}</span></div>
        </div>
      </div>
      <div class="card"><div class="section-title mb-12">🛍️ Ventas por tipo</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          <div class="cost-row"><span>🛍️ Actual</span><span class="fw-700 text-gradient">${fmt(vtaMin)}</span></div>
          <div class="cost-row"><span>🏪 Mayorista</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(vtaMay)}</span></div>
          <div class="cost-row total"><span>Total</span><span>${fmt(tv)}</span></div>
        </div>
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">🏆 Top productos por margen</div>
        ${topProdByMargin.length===0?'<div class="empty-state" style="padding:20px;"><p>Sin datos de costo</p></div>':topProdByMargin.slice(0,5).map((p,i)=>`
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
            <span style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--text-light);width:22px;">${i+1}</span>
            <span style="flex:1;font-weight:500;font-size:13px;">${p.n}</span>
            <span style="font-size:12px;color:var(--text-muted);">${p.cant} u.</span>
            <span style="font-size:12px;color:var(--text-muted);">${fmt(p.ingreso)}</span>
            <span class="fw-700" style="color:${p.margen>=30?'var(--accent-dark)':'var(--danger)'}">${p.margen}%</span>
          </div>`).join('')}
      </div>
      <div class="card"><div class="section-title mb-12">👑 Top clientes por ganancia</div>
        ${topClientes.length===0?'<div class="empty-state" style="padding:20px;"><p>Sin ventas</p></div>':topClientes.slice(0,5).map((c,i)=>`
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);">
            <span style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--text-light);width:22px;">${i+1}</span>
            <span style="flex:1;font-weight:500;font-size:13px;">${c.n}</span>
            <span style="font-size:12px;color:var(--text-muted);">${c.ventas} v.</span>
            <span style="font-size:12px;color:var(--text-muted);">${fmt(c.ingreso)}</span>
            <span class="fw-700" style="color:${c.ganancia>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(c.ganancia)}</span>
          </div>`).join('')}
      </div>
    </div>

    ${lowMargin.length>0?`
    <div class="card mb-16" style="border-left:4px solid var(--danger);">
      <div class="section-title mb-12" style="color:var(--danger);">⚠️ Productos con margen bajo (&lt;30%)</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${lowMargin.map(p=>`
          <div class="cost-row">
            <span>${p.n} <span style="font-size:12px;color:var(--text-muted);">(${p.cant} vendidos)</span></span>
            <span style="color:var(--danger)">${p.margen}% · ${fmt(p.ganancia)}</span>
          </div>`).join('')}
      </div>
    </div>`:''}`;
}

function wspReporte(){const tv=DB.ventas.reduce((s,v)=>s+v.total,0),tc=DB.ventas.reduce((s,v)=>s+calcularCostoVenta(v),0),ganancia=tv-tc,sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;window.open('https://wa.me/?text='+encodeURIComponent(`*📊 Resumen NURA — ${new Date().toLocaleDateString('es-AR')}*\n\n💰 Ingresos: ${fmt(tv)}\n📦 Costo vendido: ${fmt(tc)}\n📈 Ganancia: ${fmt(ganancia)}\n📦 Productos: ${DB.productos.length} | 👥 Clientes: ${DB.clientes.length}\n⚠️ Stock bajo: ${sb}\n\n_NURA Gestión_`),'_blank');}

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
