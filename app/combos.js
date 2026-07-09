// ===== NURA — combos.js: Combos de Productos =====
'use strict';

function renderCombos() {
  const el = document.getElementById('page-combos');
  if (!el) return;

  const combos = DB.combos.filter(c => Sesion.esAdmin() || c.vendedorId === Sesion.user.id);

  document.getElementById('topbarActions').innerHTML = Sesion.esAdmin()
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
         <button class="btn btn-primary" onclick="formCombo(null)">+ Combo</button>
         <button class="btn btn-secondary" onclick="imprimirCombos(false)">📄 Actual</button>
         <button class="btn btn-wsp-sm" onclick="imagenCombosWsp(false)">📲 Actual</button>
         <button class="btn btn-secondary" onclick="imprimirCombos(true)">📄 Mayorista</button>
         <button class="btn btn-wsp-sm" onclick="imagenCombosWsp(true)">📲 Mayorista</button>
       </div>`
    : `<button class="btn btn-primary" onclick="formCombo(null)">+ Combo</button>`;

  if (!combos.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎁</div>
        <p>No hay combos creados aún</p>
        <button class="btn btn-primary mt-8" onclick="formCombo(null)">Crear primer combo</button>
      </div>`;
    return;
  }

  const cards = combos.map(c => {
    const itemsList = (c.items || [])
      .map(i => `<span class="badge badge-violet" style="margin:2px;">${i.nombre} x${i.cantidad}</span>`)
      .join('');

    return `
      <div class="m-card" style="border-left:4px solid var(--accent);">
        <div class="m-card-header">
          <div>
            <div class="m-card-title">🎁 ${c.nombre}</div>
            ${c.descripcion ? `<div class="m-card-subtitle">${c.descripcion}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(c.precio)}</div>
            ${c.precioMayorista ? `<div style="font-size:12px;color:var(--accent-dark);">Mayor: ${fmt(c.precioMayorista)}</div>` : ''}
          </div>
        </div>
        <div style="margin:8px 0; flex-wrap:wrap; display:flex; gap:4px;">${itemsList}</div>
        <div class="m-card-footer">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCombo('${c.id}')">✏️ Editar</button>
          <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCombo('${c.id}')">📲 WhatsApp</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCombo('${c.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px;">${cards}</div>`;
}

let _comboItems = [];
function formCombo(id) {
  const c = id ? DB.combos.find(x => x.id === id) : null;
  _comboItems = c ? c.items.map(x => ({...x})) : [];

  const vendibles = buildVendibles();
  const esVendedor = Sesion.esVendedor();
  const precioMayHTML = esVendedor
    ? `<div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);">
         <span id="cbCostoMay" style="font-weight:700;color:var(--accent-dark);">${fmt(c ? c.precioMayorista || 0 : 0)}</span>
       </div>`
    : moneyInput('cbPrecioMay', c ? c.precioMayorista || '' : '');

  const html = `<div style="display:flex;flex-direction:column;gap:14px;">
    <div class="form-grid">
      <div class="form-group full"><label>Nombre del combo</label><input id="cbNombre" value="${c ? c.nombre : ''}" placeholder="Ej: Kit Baño Completo" /></div>
      <div class="form-group full"><label>Descripción (opcional)</label><input id="cbDesc" value="${c ? c.descripcion || '' : ''}" placeholder="Ej: Lavandina + Desengrasante + Limpiavidrios" /></div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
      <label style="display:block;margin-bottom:8px;font-weight:700;">Agregar productos al combo</label>
      <div class="flex gap-8 flex-wrap">
        <select id="cbItemSel" style="flex:2;min-width:0;"><option value="">Seleccioná producto...</option>${vendibles.map(v => `<option value="${v.key}">${v.label}</option>`).join('')}</select>
        <input id="cbCantidad" type="number" min="1" step="1" value="1" style="width:70px;flex-shrink:0;" />
        <button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarItemCombo()">+ Agregar</button>
      </div>
    </div>
    <div id="comboItemsWrap">${renderComboItems()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Precio combo Actual ($)</label>${moneyInput('cbPrecio', c ? c.precio || '' : '')}<span class="form-note">Precio especial del combo</span></div>
      <div class="form-group">
        <label>${esVendedor ? 'Costo real de producción' : 'Precio combo mayorista ($)'}</label>
        ${precioMayHTML}
        ${!esVendedor ? '<span class="form-note">Para vendedores/distribuidores</span>' : ''}
      </div>
    </div>
    <div id="cbSugerido" style="font-size:12px;color:var(--text-muted);"></div>
  </div>`;

  openModal(c ? 'Editar Combo' : 'Nuevo Combo', html, guardarCombo.bind(null, id), true);
  setTimeout(actualizarSugeridoCombo, 100);
}

function renderComboItems() {
  if (!_comboItems.length) return `<div class="empty-state" style="padding:12px;"><div class="empty-icon">📦</div><p>Agregá productos</p></div>`;
  return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">
    ${_comboItems.map((item,i) => `
      <div style="padding:10px 14px;background:${i%2===0?'var(--surface)':'var(--surface2)'};display:flex;align-items:center;gap:10px;">
        <span style="flex:1;font-weight:600;font-size:13px;">${item.nombre}</span>
        <span class="badge badge-violet">${item.detalle}</span>
        <input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:4px 6px;" onchange="_comboItems[${i}].cantidad=+this.value;actualizarSugeridoCombo();" />
        <button class="btn btn-danger btn-sm btn-icon" onclick="_comboItems.splice(${i},1);document.getElementById('comboItemsWrap').innerHTML=renderComboItems();actualizarSugeridoCombo();">✕</button>
      </div>`).join('')}
  </div>`;
}

window.agregarItemCombo = function() {
  const key = document.getElementById('cbItemSel').value;
  const cant = parseInt(document.getElementById('cbCantidad').value) || 1;
  if (!key) { toast('Seleccioná un producto','info'); return; }
  const v = buildVendibles().find(x => x.key === key);
  if (!v) return;
  const exist = _comboItems.find(x => x.key === key);
  if (exist) { exist.cantidad += cant; }
  else _comboItems.push({...v, cantidad:cant});
  document.getElementById('comboItemsWrap').innerHTML = renderComboItems();
  actualizarSugeridoCombo();
};

function actualizarSugeridoCombo() {
  const total = _comboItems.reduce((s,i) => s + i.precio * i.cantidad, 0);
  let costoReal = 0;
  _comboItems.forEach(item => {
    if (item.esAcc) {
      const p = DB.productos.find(x => x.id === item.productoId);
      costoReal += (p ? (p.costoUnidad || 0) : 0) * item.cantidad;
    } else {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (p) {
        const pr = (p.presentaciones || []).find(x => x.id === item.presId);
        const litros = pr ? pr.litros : (item.litrosPorUnidad || 0);
        const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
        costoReal += ((p.costoLitro || 0) * litros + costoEnvase) * item.cantidad;
      }
    }
  });
  const elSug = document.getElementById('cbSugerido');
  if (elSug) elSug.innerHTML = total > 0
    ? `💡 Suma lista actual: <strong>${fmt(total)}</strong> · Costo real producción: <strong>${fmt(costoReal)}</strong>`
    : '';
  const elCosto = document.getElementById('cbCostoMay');
  if (elCosto) elCosto.textContent = fmt(costoReal);
}

async function guardarCombo(id) {
  const nombre = document.getElementById('cbNombre').value.trim();
  if (!nombre) { await swalError('El nombre es obligatorio'); return; }
  if (!_comboItems.length) { await swalError('Agregá al menos un producto al combo'); return; }
  const precio = parseFloat(document.getElementById('cbPrecio').value) || 0;
  if (!precio) { await swalError('Ingresá el precio del combo'); return; }
  let costoReal = 0;
  _comboItems.forEach(item => {
    if (item.esAcc) {
      const p = DB.productos.find(x => x.id === item.productoId);
      costoReal += (p ? (p.costoUnidad || 0) : 0) * item.cantidad;
    } else {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (p) {
        const pr = (p.presentaciones || []).find(x => x.id === item.presId);
        const litros = pr ? pr.litros : (item.litrosPorUnidad || 0);
        const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
        costoReal += ((p.costoLitro || 0) * litros + costoEnvase) * item.cantidad;
      }
    }
  });
  if (Sesion.esVendedor() && precio < costoReal) {
    await swalError(`El precio no puede ser menor que el costo real de producción (${fmt(costoReal)})`);
    return;
  }
  const precioMayorista = Sesion.esVendedor()
    ? costoReal
    : (parseFloat(document.getElementById('cbPrecioMay').value) || 0);
  const combo = {
    id: id || genId(),
    nombre,
    descripcion: document.getElementById('cbDesc').value.trim(),
    items: _comboItems.map(i => ({ ...i })),
    precio,
    precioMayorista,
    vendedorId: Sesion.esVendedor() ? Sesion.user.id : null
  };
  closeModal();
  if (id) {
    const idx = DB.combos.findIndex(x => x.id === id);
    if (idx >= 0) DB.combos[idx] = combo; else DB.combos.push(combo);
  } else {
    DB.combos.push(combo);
  }
  navigate('combos');
  toast(id ? 'Combo actualizado ✅' : 'Combo creado ✅');
  await fbSave('combos', combo);
}

async function eliminarCombo(id) {
  const c = DB.combos.find(x => x.id === id);
  const res = await swalConfirm('¿Eliminar combo?', `Se eliminará <strong>${escapeHTML(c?.nombre)}</strong>`);
  if (!res.isConfirmed) return;
  DB.combos = DB.combos.filter(x => x.id !== id);
  navigate('combos');
  toast('Combo eliminado');
  await fbRemove('combos', id);
}

function wspCombo(id) {
  const c = DB.combos.find(x => x.id === id);
  if (!c) return;
  let msg = `*🎁 NURA — ${c.nombre}*\n`;
  if (c.descripcion) msg += `📝 ${c.descripcion}\n`;
  msg += `\nIncluye:\n`;
  c.items.forEach(i => { msg += `  • ${i.nombre} x${i.cantidad}\n`; });
  msg += `\n💰 Precio combo: *${fmt(c.precio)}*\n\n¡Consultanos! 🌿`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function generarHTMLCombos(esMayorista = false) {
  const combos = [...DB.combos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const fecha = new Date().toLocaleDateString('es-AR');
  return `
    <div style="font-family:Arial,sans-serif;background:#fff;color:#111;padding:30px;">
      <div style="text-align:center;margin-bottom:30px;">
        <img src="logo.png" style="width:90px;height:90px;object-fit:contain;">
        <h1 style="margin:10px 0 0;color:#1ab8af;font-size:34px;">NURA</h1>
        <div style="color:#777;font-size:13px;letter-spacing:2px;text-transform:uppercase;">artículos de limpieza</div>
        <div style="margin-top:15px;font-weight:700;font-size:16px;">Lista de Combos ${esMayorista ? 'Mayorista' : 'Actual'}</div>
        <div style="font-size:12px;color:#777;">${fecha}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;">
        ${combos.map(c => {
          const precio = esMayorista ? (c.precioMayorista || c.precio) : c.precio;
          return `
            <div style="border:2px solid #e5e7eb;border-radius:18px;padding:18px;break-inside:avoid;">
              <div style="font-size:22px;font-weight:800;margin-bottom:8px;">🎁 ${c.nombre}</div>
              ${c.descripcion ? `<div style="font-size:13px;color:#666;margin-bottom:12px;">${c.descripcion}</div>` : ''}
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${(c.items || []).map(i => `<span style="background:#f3f4f6;border-radius:999px;padding:4px 10px;font-size:12px;">${i.nombre} x${i.cantidad}</span>`).join('')}
              </div>
              <div style="font-size:30px;font-weight:900;color:#1ab8af;text-align:right;">${fmt(precio)}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

async function imprimirCombos(esMayorista = false) {
  try {
    const html = generarHTMLCombos(esMayorista);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-100000px';
    wrapper.style.top = '0';
    wrapper.style.width = '1200px';
    wrapper.style.background = '#ffffff';
    wrapper.style.padding = '20px';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.opacity = '1';
    wrapper.style.zIndex = '-1';
    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 1500));
    const images = wrapper.querySelectorAll('img');
    await Promise.all([...images].map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })));
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    document.body.removeChild(wrapper);
    const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
    const pageWidth = 210, pageHeight = 297, imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    let heightLeft = imgHeight, position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(esMayorista ? 'NURA-Combos-Mayorista.pdf' : 'NURA-Combos-Actual.pdf');
  } catch(err) { console.error(err); alert('Error generando PDF'); }
}

async function imagenCombosWsp(esMayorista = false) {
  const html = generarHTMLCombos(esMayorista);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.style.position = 'fixed';
  wrapper.style.inset = '0';
  wrapper.style.zIndex = '-1';
  wrapper.style.background = '#ffffff';
  wrapper.style.width = '1200px';
  wrapper.style.overflow = 'auto';
  document.body.appendChild(wrapper);
  await new Promise(r => setTimeout(r, 800));
  const imgs = wrapper.querySelectorAll('img');
  await Promise.all([...imgs].map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })));
  const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  wrapper.remove();
  canvas.toBlob(async blob => {
    const file = new File([blob], esMayorista ? 'combos-mayorista.png' : 'combos-Actual.png', { type: 'image/png' });
    if (navigator.canShare && navigator.share) {
      try { await navigator.share({ files: [file], title: 'Combos NURA', text: esMayorista ? 'Lista Mayorista' : 'Lista Actual' }); } catch(e){}
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      window.open('https://wa.me/?text=' + encodeURIComponent(esMayorista ? 'Lista de combos mayoristas' : 'Lista de combos Actuals'), '_blank');
    }
  }, 'image/png');
}

function wspCombos(esMayorista = false) {
  const combos = [...DB.combos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  let msg = '*NURA - COMBOS*\n';
  msg += esMayorista ? '*PRECIOS MAYORISTAS*\n\n' : '*PRECIOS LISTA*\n\n';
  combos.forEach(c => {
    const precio = esMayorista ? (c.precioMayorista || c.precio) : c.precio;
    msg += '--------------------------\n';
    msg += `*${c.nombre}*\n`;
    if (c.descripcion) msg += `${c.descripcion}\n`;
    (c.items || []).forEach(i => { msg += `- ${i.nombre} x${i.cantidad}\n`; });
    msg += `Precio: ${fmt(precio)}\n\n`;
  });
  msg += 'Consultanos por pedidos';
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
