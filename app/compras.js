// ===== NURA — compras.js: Compras y Actualización de Stock =====
'use strict';

function renderCompras(){
  const el=document.getElementById('page-compras');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="formCompra()">+ Compra</button>`;
  const compras=[...DB.compras].sort((a,b)=>a.fecha-b.fecha).map((c,i)=>({...c,num:i+1})).sort((a,b)=>b.fecha-a.fecha);
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Trans.</th><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Cantidad</th><th>Costo unit.</th><th>Total</th><th></th></tr></thead><tbody>${compras.length===0?`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🚚</div><p>Sin compras</p></div></td></tr>`:compras.map(c=>`<tr><td><span class="badge badge-green">#${c.num}</span></td><td>${fmtDate(c.fecha)}</td><td class="fw-700">${c.productoNombre}</td><td>${c.proveedor||'—'}</td><td>${c.tipo==='accesorio'?c.cantidad+' un':fmtL(c.cantidad)+' L'}</td><td>${fmt(c.precioUnit)}/${c.tipo==='accesorio'?'un':'L'}</td><td class="fw-700">${fmt(c.total)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCompra('${c.id}')">🗑</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${compras.map(c=>`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title"><span class="badge badge-green" style="margin-right:6px;">#${c.num}</span> ${c.productoNombre}</div><div class="m-card-subtitle">${fmtDate(c.fecha)}${c.proveedor?' · '+c.proveedor:''}</div></div><span class="fw-700 text-gradient" style="font-family:var(--font-display);font-size:18px;">${fmt(c.total)}</span></div><div class="m-card-body"><div class="m-card-row"><span class="m-card-row-label">Cantidad</span><span class="m-card-row-value">${c.tipo==='accesorio'?c.cantidad+' un':fmtL(c.cantidad)+' L'}</span></div><div class="m-card-row"><span class="m-card-row-label">Costo/unit.</span><span class="m-card-row-value">${fmt(c.precioUnit)}</span></div></div><div class="m-card-footer"><button class="btn btn-danger btn-sm" onclick="eliminarCompra('${c.id}')">🗑 Eliminar</button></div></div>`).join('')}</div>`;
  el.innerHTML=compras.length===0?`<div class="empty-state"><div class="empty-icon">🚚</div><p>No hay compras registradas</p></div>`:tbl+cards;
}

function formCompra(){
  openModal('Nueva Compra',`<div class="form-grid">
    <div class="form-group full"><label>Producto</label><select id="cpProducto" onchange="onCpProdChange()"><option value="">Seleccioná...</option>${DB.productos.map(p=>`<option value="${p.id}">${p.nombre} (${p.tipo==='accesorio'?'accesorio':'líquido'})${p.codigo?' #'+p.codigo:''}</option>`).join('')}</select></div>
    <div class="form-group"><label>Proveedor</label><input id="cpProveedor" placeholder="Nombre del proveedor" /></div>
    <div class="form-group"><label>Fecha</label><input id="cpFecha" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="form-group"><label id="cpCantLabel">Cantidad (L)</label>${unitInput('cpCantidad','1','L','0.001','calcCompra()')}</div>
    <div class="form-group"><label id="cpPrecioLabel">Precio por L ($)</label>${moneyInput('cpPrecioUnit','','calcCompra()')}</div>
    <div class="cost-calc-box"><h4>Total</h4><div class="cost-row total"><span>Total</span><span id="cpTotal">$0.00</span></div></div>
    <div class="form-group full"><label>Notas</label><textarea id="cpNotas" rows="2"></textarea></div>
  </div>`,guardarCompra);
}

window.calcCompra=function(){const c=parseFloat(document.getElementById('cpCantidad')?.value)||0,p=parseFloat(document.getElementById('cpPrecioUnit')?.value)||0;const t=document.getElementById('cpTotal');if(t)t.textContent=fmt(c*p);};
window.onCpProdChange=function(){const p=DB.productos.find(x=>x.id===document.getElementById('cpProducto').value);if(!p)return;const esAcc=p.tipo==='accesorio';document.getElementById('cpCantLabel').textContent=esAcc?'Cantidad (un)':'Cantidad (L)';document.getElementById('cpPrecioLabel').textContent=esAcc?'Precio por unidad ($)':'Precio por litro ($)';const inp=document.getElementById('cpCantidad');const suf=inp.closest('.input-unit-wrap')?.querySelector('.unit-label');if(suf)suf.textContent=esAcc?'un':'L';inp.step=esAcc?'1':'0.001';calcCompra();};

async function guardarCompra(){
  const prodId=document.getElementById('cpProducto').value;if(!prodId){await swalError('Seleccioná un producto');return;}
  const p=DB.productos.find(x=>x.id===prodId),cant=parseFloat(document.getElementById('cpCantidad').value)||0,pu=parseFloat(document.getElementById('cpPrecioUnit').value)||0;
  if(!cant||!pu){await swalError('Completá cantidad y precio');return;}
  if(p.tipo==='accesorio'){p.stockUnidades=(p.stockUnidades||0)+cant;p.costoUnidad=pu;}else{p.stockLitros=(p.stockLitros||0)+cant;p.costoLitro=pu;}
  const compra={id:genId(),fecha:new Date(document.getElementById('cpFecha').value).getTime()||Date.now(),productoId:prodId,productoNombre:p.nombre,tipo:p.tipo,proveedor:document.getElementById('cpProveedor').value.trim(),cantidad:cant,precioUnit:pu,total:cant*pu,notas:document.getElementById('cpNotas').value.trim()};
  closeModal();
  await Promise.all([fbSave('productos',p),fbSave('compras',compra)]);
  swalSuccess('¡Compra registrada!',`Stock de <strong>${p.nombre}</strong> actualizado.`);
}

async function eliminarCompra(id){const res=await swalConfirm('¿Eliminar compra?','No se puede deshacer.');if(!res.isConfirmed)return;await fbRemove('compras',id);toast('Compra eliminada');}
