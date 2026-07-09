// ===== NURA — productos.js: Catálogo, Productos, Presentaciones, Mayorista =====
'use strict';

let catalogoSearch='', catalogoFiltro='', catalogoView='grid';

function renderCatalogo() {
 const el = document.getElementById('page-catalogo');
  document.getElementById('topbarActions').innerHTML = Sesion.esAdmin()
    ? `<button class="btn btn-outline btn-sm" onclick="listaMayoristaModal()">🏪 Mayorista</button>
       <button class="btn btn-outline btn-sm" onclick="exportarCatalogo()">📄 Exportar</button>
       <button class="btn btn-primary" onclick="formProducto(null)">+ Producto</button>`
    : `<button class="btn btn-outline btn-sm" onclick="listaMayoristaModal()">🏪 Mayorista</button>`;
  el.innerHTML=`
    <div class="flex flex-center gap-8 mb-16 flex-wrap">
      <div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar nombre, código..." id="catSearch" value="${catalogoSearch.replace(/"/g,'&quot;')}" /></div>
      <select id="catFiltro" style="max-width:180px;"><option value="">Todas</option>${CATEGORIAS.map(c=>`<option value="${c}" ${catalogoFiltro===c?'selected':''}>${c}</option>`).join('')}</select>
      <div class="flex gap-6" style="margin-left:auto;">
        <button class="btn btn-${catalogoView==='grid'?'primary':'secondary'} btn-sm" onclick="catalogoView='grid';refreshCat()">⊞</button>
        <button class="btn btn-${catalogoView==='list'?'primary':'secondary'} btn-sm" onclick="catalogoView='list';refreshCat()">☰</button>
      </div>
    </div>
    <div id="catRes">${catHTML()}</div>`;
  document.getElementById('catSearch').oninput=e=>{catalogoSearch=e.target.value;refreshCat();};
  document.getElementById('catFiltro').onchange=e=>{catalogoFiltro=e.target.value;refreshCat();};
}
function refreshCat(){const r=document.getElementById('catRes');if(r)r.innerHTML=catHTML();}
function filtrarProds(){return DB.productos.filter(p=>(!catalogoSearch||p.nombre.toLowerCase().includes(catalogoSearch.toLowerCase())||(p.codigo||'').toLowerCase().includes(catalogoSearch.toLowerCase())||p.categoria.toLowerCase().includes(catalogoSearch.toLowerCase()))&&(!catalogoFiltro||p.categoria===catalogoFiltro));}
function catHTML(){return catalogoView==='grid'?catGrid(filtrarProds()):catList(filtrarProds());}

function catGrid(prods) {
  if(!prods.length) return `<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos. ¡Agregá el primero!</p></div>`;
  return `<div class="product-grid">${prods.map(p => {
    const esAcc = p.tipo == 'accesorio',
          sv = esAcc ? (p.stockUnidades || 0) : (p.stockLitros || 0),
          sm = esAcc ? (p.stockMinUnidades || 0) : (p.stockMinLitros || 0);
    const bajo = sv <= sm,
          pres = !esAcc ? (p.presentaciones || []) : [];
    const pMin = esAcc ? p.precioVenta : (pres.length ? Math.min(...pres.map(x => x.precioVenta)) : 0);
    const pMax = esAcc ? p.precioVenta : (pres.length ? Math.max(...pres.map(x => x.precioVenta)) : 0);
    const pMayMin = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.min(...pres.map(x => x.precioMayorista || x.precioVenta)) : 0);
    const pMayMax = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.max(...pres.map(x => x.precioMayorista || x.precioVenta)) : 0);

    const gananciaMin = esAcc
      ? (p.precioVenta - (p.precioMayorista || 0))
      : (pres.length ? Math.min(...pres.map(x => x.precioVenta - (x.precioMayorista || x.precioVenta))) : 0);
    const gananciaMax = esAcc
      ? (p.precioVenta - (p.precioMayorista || 0))
      : (pres.length ? Math.max(...pres.map(x => x.precioVenta - (x.precioMayorista || x.precioVenta))) : 0);

    return `<div class="product-card">
      <div class="product-card-img">${EMOJIS_CAT[p.categoria] || '🧴'}<div class="product-card-badge">${bajo ? '<span class="badge badge-red">⚠️</span>' : ''}</div></div>
      <div class="product-card-body">
        ${p.codigo ? `<div class="product-card-code">#${p.codigo}</div>` : ''}
        <div class="product-card-name">${p.nombre}</div>
        <div class="product-card-cat">${p.categoria}</div>
        ${esAcc
          ? `<div class="product-card-price">${fmt(p.precioVenta)}</div>
             <div class="product-card-unit">por unidad</div>
             ${p.precioMayorista ? `<div style="font-size:11px;color:var(--accent-dark);margin-top:2px;">Mayor: ${fmt(p.precioMayorista)}</div>` : ''}
             ${Sesion.esVendedor() ? `<div style="font-size:11px;color:var(--violet-dark);margin-top:2px;">Ganancia: ${fmt(gananciaMin)}</div>` : ''}`
          : pres.length
            ? `<div class="product-card-price">${pMin === pMax ? fmt(pMin) : `${fmt(pMin)}–${fmt(pMax)}`}</div>
              <div class="product-card-unit">${pres.length} presentación(es)</div>
              ${pMayMin > 0 ? `<div style="font-size:11px;color:var(--accent-dark);margin-top:2px;">Mayor: ${pMayMin === pMayMax ? fmt(pMayMin) : `${fmt(pMayMin)}–${fmt(pMayMax)}`}</div>` : ''}
              ${Sesion.esVendedor() ? `<div style="font-size:11px;color:var(--violet-dark);margin-top:2px;">Ganancia: ${gananciaMin === gananciaMax ? fmt(gananciaMin) : `${fmt(gananciaMin)}–${fmt(gananciaMax)}`}</div>` : ''}`
            : `<div class="product-card-unit" style="color:var(--warning);">Sin presentaciones</div>`
        }
        <div class="flex-center gap-8 mt-8">
          <div class="stock-bar-wrap" style="flex:1;">
            <div class="stock-bar"><div class="stock-bar-fill ${sv > sm*2 ? 'high' : sv > sm ? 'med' : 'low'}" style="width:${Math.min(100, sm > 0 ? (sv/(sm*3))*100 : 100)}%"></div></div>
            <span class="stock-qty">${esAcc ? `${sv} un` : `${fmtL(sv)} L`}</span>
          </div>
        </div>
      </div>
 <div class="product-card-footer">
  ${Sesion.esAdmin() ? `
    <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️</button>
    <button class="btn btn-outline btn-sm" style="flex:1;" onclick="duplicarProducto('${p.id}')">📋</button>
    <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
    <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
  ` : `
    <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspProducto('${p.id}')">📲</button>
    <button class="btn btn-outline btn-sm" style="flex:1;" onclick="verDetalleProducto('${p.id}')">ℹ️</button>
  `}
</div>
    </div>`;
  }).join('')}</div>`;
}

function catList(prods) {
  if(!prods.length) return `<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos.</p></div>`;

  const tbl = `<div class="table-wrap hide-mobile"><table>
    <thead><tr>
      <th>Cód.</th><th>Nombre</th><th>Categoría</th><th>Stock</th>
      <th>Precio Actual</th><th>Precio mayorista</th>
      ${Sesion.esVendedor() ? '<th>Ganancia</th>' : ''}
      <th>Acciones</th>
    </tr></thead>
    <tbody>${prods.map(p => {
      const esAcc = p.tipo == 'accesorio',
            sv = esAcc ? (p.stockUnidades || 0) : (p.stockLitros || 0),
            sm = esAcc ? (p.stockMinUnidades || 0) : (p.stockMinLitros || 0),
            pres = !esAcc ? (p.presentaciones || []) : [];

      const miniPv = esAcc
        ? fmt(p.precioVenta) + '/un'
        : pres.map(pr => `${pr.nombre}: <strong>${fmt(pr.precioVenta)}</strong>`).join(' · ');

      const miniMay = esAcc
        ? (p.precioMayorista ? fmt(p.precioMayorista) + '/un' : '—')
        : pres.map(pr => `${pr.nombre}: <strong>${fmt(pr.precioMayorista || pr.precioVenta)}</strong>`).join(' · ');

      let miniGanancia = '';
      if (Sesion.esVendedor()) {
        if (esAcc) {
          const gan = p.precioVenta - (p.precioMayorista || 0);
          miniGanancia = fmt(gan) + '/un';
        } else {
          miniGanancia = pres.map(pr => {
            const gan = pr.precioVenta - (pr.precioMayorista || pr.precioVenta);
            return `${pr.nombre}: <strong>${fmt(gan)}</strong>`;
          }).join(' · ');
        }
      }

      return `<tr>
        <td><span class="badge badge-gray">${p.codigo || '—'}</span></td>
        <td class="fw-700">${p.nombre}</td>
        <td>${p.categoria}</td>
        <td><span class="badge badge-${sv > sm ? 'green' : 'red'}">${esAcc ? `${sv} un` : `${fmtL(sv)} L`}</span></td>
        <td style="font-size:12px;">${miniPv}</td>
        <td style="font-size:12px;color:var(--accent-dark);">${miniMay}</td>
        ${Sesion.esVendedor() ? `<td style="font-size:12px;color:var(--violet-dark);">${miniGanancia}</td>` : ''}
        <td><div class="table-actions">
          ${Sesion.esAdmin() ? `
            <button class="btn btn-secondary btn-sm" onclick="formProducto('${p.id}')">✏️</button>
            <button class="btn btn-outline btn-sm" onclick="duplicarProducto('${p.id}')">📋</button>
            <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
          ` : `
            <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
          `}
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${prods.map(p => {
    const esAcc = p.tipo == 'accesorio',
          sv = esAcc ? (p.stockUnidades || 0) : (p.stockLitros || 0),
          sm = esAcc ? (p.stockMinUnidades || 0) : (p.stockMinLitros || 0),
          pres = !esAcc ? (p.presentaciones || []) : [];

    const gananciaHTML = Sesion.esVendedor()
      ? (esAcc
          ? `<div class="m-card-row"><span class="m-card-row-label">Ganancia</span><span class="m-card-row-value fw-700" style="color:var(--violet-dark)">${fmt(p.precioVenta - (p.precioMayorista || 0))}</span></div>`
          : pres.map(pr => {
              const gan = pr.precioVenta - (pr.precioMayorista || pr.precioVenta);
              return `<div class="m-card-row"><span class="m-card-row-label">${pr.nombre}</span><span class="m-card-row-value fw-700" style="color:var(--violet-dark)">${fmt(gan)}</span></div>`;
            }).join('')
        )
      : '';

    return `<div class="m-card">
      <div class="m-card-header">
        <div>
          ${p.codigo ? `<div class="text-muted">#${p.codigo}</div>` : ''}
          <div class="m-card-title">${EMOJIS_CAT[p.categoria] || '🧴'} ${p.nombre}</div>
          <div class="m-card-subtitle">${p.categoria}</div>
        </div>
        <span class="badge badge-${sv > sm ? 'green' : 'red'}">${esAcc ? `${sv} un` : `${fmtL(sv)} L`}</span>
      </div>
      <div class="m-card-body">
        ${esAcc
          ? `<div class="m-card-row"><span class="m-card-row-label">Actual</span><span class="m-card-row-value fw-700 text-gradient">${fmt(p.precioVenta)}</span></div>
             ${p.precioMayorista ? `<div class="m-card-row"><span class="m-card-row-label">Mayorista</span><span class="m-card-row-value fw-700" style="color:var(--accent-dark)">${fmt(p.precioMayorista)}</span></div>` : ''}`
          : pres.map(pr => `<div class="m-card-row"><span class="m-card-row-label">${pr.nombre}</span><span class="m-card-row-value fw-700 text-gradient">${fmt(pr.precioVenta)}${pr.precioMayorista ? ` <span style="color:var(--accent-dark);font-size:10px;">(M:${fmt(pr.precioMayorista)})</span>` : ''}</span></div>`).join('')
        }
        ${gananciaHTML}
      </div>
      <div class="m-card-footer" style="display:flex; gap: 4px; margin-top: 10px;">
        ${Sesion.esAdmin() ? `
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️</button>
          <button class="btn btn-outline btn-sm" style="flex:1;" onclick="duplicarProducto('${p.id}')">📋</button>
          <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
        ` : `
          <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspProducto('${p.id}')">📲</button>
        `}
      </div>
    </div>`;
  }).join('')}</div>`;

  return tbl + cards;
}

// ── Lista mayorista ───────────────────────────────────────────────────
function listaMayoristaModal() {
  if (!DB.productos.length) { swalInfo('Sin productos', 'No hay productos en el catálogo.'); return; }

  openModal('🏪 Lista de precios mayorista', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
      Mostrá solo precios mayoristas. Los productos sin stock aparecen marcados.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-primary" style="flex:1;" onclick="generarPDFMayorista()">📄 Descargar PDF</button>
      <button class="btn btn-wsp-sm" style="flex:1;" onclick="wspMayorista()">📲 Enviar por WhatsApp</button>
      <button class="btn btn-secondary" style="width:100%;" onclick="closeModal()">Cerrar</button>
    </div>
    <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:10px;">VISTA PREVIA</div>
      <div style="max-height:340px;overflow-y:auto;">
        ${(() => {
          const cats = [...new Set(DB.productos.map(p => p.categoria))];
          return cats.map(cat => {
            const prods = DB.productos.filter(p => p.categoria === cat);
            const filas = prods.map(p => {
              const esAcc = p.tipo === 'accesorio';
              const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
              if (esAcc) {
                const precio = p.precioMayorista || p.precioVenta;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:${sinStock?'rgba(244,63,94,0.06)':'transparent'};margin-bottom:3px;">
                  <span style="font-size:13px;color:${sinStock?'var(--danger)':'var(--text)'}">${p.nombre}${sinStock?' <em style="font-size:10px;">(sin stock)</em>':''}</span>
                  <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}/un</span>
                </div>`;
              } else {
                return (p.presentaciones||[]).map(pr => {
                  const precio = pr.precioMayorista || pr.precioVenta;
                  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:${sinStock?'rgba(244,63,94,0.06)':'transparent'};margin-bottom:3px;">
                    <span style="font-size:13px;color:${sinStock?'var(--danger)':'var(--text)'}">  ${p.nombre} <span style="opacity:.6;font-size:11px;">${pr.nombre}</span>${sinStock?' <em style="font-size:10px;">(sin stock)</em>':''}</span>
                    <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}</span>
                  </div>`;
                }).join('');
              }
            }).join('');
            return `<div style="margin-bottom:12px;">
              <div style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:4px 8px;margin-bottom:4px;">${EMOJIS_CAT[cat]||'•'} ${cat}</div>
              ${filas}
            </div>`;
          }).join('');
        })()}
        ${DB.combos.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:4px 8px;margin-bottom:4px;">🎁 Combos</div>
          ${DB.combos.map(c => {
            const precio = c.precioMayorista || c.precio;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;margin-bottom:3px;">
              <span style="font-size:13px;">🎁 ${c.nombre}</span>
              <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}</span>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>
    </div>
  `, null, true);
}

window.generarPDFMayorista = async function() {
  toast('Generando PDF...', 'info');
  const fecha = new Date().toLocaleDateString('es-AR');
  const cats = [...new Set(DB.productos.map(p => p.categoria))];

  let rowsHTML = '';
  cats.forEach(cat => {
    const prods = DB.productos.filter(p => p.categoria === cat);
    let catRows = '';
    prods.forEach(p => {
      const esAcc = p.tipo === 'accesorio';
      const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
      if (esAcc) {
        const precio = p.precioMayorista || p.precioVenta;
        catRows += `<tr style="${sinStock?'background:#fff5f5;':''}">
          <td style="padding:7px 10px;font-size:12px;color:${sinStock?'#ef4444':'#1e293b'};">${p.nombre}${p.codigo?` <span style="color:#94a3b8;font-size:10px;">#${p.codigo}</span>`:''}</td>
          <td style="padding:7px 10px;font-size:11px;color:#64748b;">Unidad</td>
          <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
          <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(p.precioVenta)}</td>
          <td style="padding:7px 10px;text-align:center;">${sinStock?'<span style="color:#ef4444;font-size:10px;font-weight:700;">SIN STOCK</span>':'<span style="color:#22c55e;font-size:10px;">✓</span>'}</td>
        </tr>`;
      } else {
        (p.presentaciones||[]).forEach((pr, pi) => {
          const precio = pr.precioMayorista || pr.precioVenta;
          catRows += `<tr style="${sinStock?'background:#fff5f5;':''}">
            <td style="padding:7px 10px;font-size:12px;color:${sinStock?'#ef4444':'#1e293b'};">${pi===0?p.nombre+(p.codigo?` <span style="color:#94a3b8;font-size:10px;">#${p.codigo}</span>`:''):''}${pi>0?'<span style="color:#94a3b8">└</span>':''}</td>
            <td style="padding:7px 10px;font-size:11px;color:#64748b;">${pr.nombre}</td>
            <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
            <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(pr.precioVenta)}</td>
            <td style="padding:7px 10px;text-align:center;">${sinStock&&pi===0?'<span style="color:#ef4444;font-size:10px;font-weight:700;">SIN STOCK</span>':'<span style="color:#22c55e;font-size:10px;">✓</span>'}</td>
          </tr>`;
        });
      }
    });
    if (catRows) {
      rowsHTML += `<tr><td colspan="5" style="padding:10px 10px 4px;background:#f1f5f9;font-size:11px;font-weight:800;color:#475569;letter-spacing:1px;text-transform:uppercase;">${EMOJIS_CAT[cat]||'•'} ${cat}</td></tr>${catRows}`;
    }
  });

  if (DB.combos.length) {
    rowsHTML += `<tr><td colspan="5" style="padding:10px 10px 4px;background:#f1f5f9;font-size:11px;font-weight:800;color:#475569;letter-spacing:1px;text-transform:uppercase;">🎁 Combos</td></tr>`;
    DB.combos.forEach(c => {
      const precio = c.precioMayorista || c.precio;
      rowsHTML += `<tr>
        <td style="padding:7px 10px;font-size:12px;color:#1e293b;">🎁 ${c.nombre}${c.descripcion?`<div style="font-size:10px;color:#94a3b8;">${c.descripcion}</div>`:''}</td>
        <td style="padding:7px 10px;font-size:11px;color:#64748b;">Combo</td>
        <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
        <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(c.precio)}</td>
        <td style="padding:7px 10px;text-align:center;"><span style="color:#22c55e;font-size:10px;">✓</span></td>
      </tr>`;
    });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1e293b;}
    .header{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:24px 28px;display:flex;align-items:center;gap:18px;}
    .logo{width:60px;height:60px;object-fit:contain;}
    .brand{font-size:26px;font-weight:900;letter-spacing:6px;}.letra-a{color:#a78bfa;}
    .sub{font-size:9px;color:rgba(255,255,255,.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px;}
    .badge-may{display:inline-block;background:#7c3aed;color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:99px;letter-spacing:1px;margin-left:10px;vertical-align:middle;}
    .meta{margin-left:auto;text-align:right;font-size:11px;color:rgba(255,255,255,.4);}
    table{width:100%;border-collapse:collapse;}
    thead tr{background:#0f172a;color:#fff;}
    th{padding:9px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
    tr:nth-child(even){background:#f8fafc;}
    tr:hover{background:#f1f5f9;}
    .footer{margin-top:20px;padding:14px 18px;border-top:2px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;}
    .nota{background:#fef3c7;border-left:3px solid #f59e0b;padding:8px 12px;font-size:11px;color:#92400e;margin:14px 0;border-radius:0 4px 4px 0;}
  </style>
  </head><body>
  <div class="header">
    <img src="logo.png" class="logo" />
    <div>
      <div class="brand">NUR<span class="letra-a">A</span> <span class="badge-may">MAYORISTA</span></div>
      <div class="sub">lista de precios para distribuidores</div>
    </div>
    <div class="meta">Válido al<br><strong style="color:#fff;font-size:13px;">${fecha}</strong></div>
  </div>
  <div class="nota">⚠️ Lista exclusiva para vendedores y distribuidores. No compartir con clientes finales.</div>
  <table>
    <thead><tr><th style="text-align:left;">Producto</th><th style="text-align:left;">Presentación</th><th style="text-align:right;color:#52dad2;">P. Mayorista</th><th style="text-align:right;color:#a78bfa;">P. Recomendado</th><th style="text-align:center;">Stock</th></tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">
    📷 @nura.neco &nbsp;·&nbsp; 📲 2262 240512 &nbsp;·&nbsp; 📲 2262 638838<br>
    <span style="margin-top:4px;display:block;">Precios sujetos a cambios sin previo aviso · NURA Artículos de Limpieza</span>
  </div>
  </body></html>`;

  try {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    await html2pdf().set({
      margin: [0.3, 0.3, 0.3, 0.3],
      filename: `nura-mayorista-${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
    document.body.removeChild(el);
    toast('PDF mayorista descargado ✅');
  } catch(e) {
    swalError('Error al generar el PDF.');
  }
};

window.wspMayorista = function() {
  const fecha = new Date().toLocaleDateString('es-AR');
  const cats = [...new Set(DB.productos.map(p => p.categoria))];
  let msg = `*🏪 NURA — Lista Mayorista*\n📅 ${fecha}\n`;
  msg += `_Precios exclusivos para vendedores_\n`;
  msg += `--------------------------\n\n`;

  cats.forEach(cat => {
    const prods = DB.productos.filter(p => p.categoria === cat);
    let bloque = '';
    prods.forEach(p => {
      const esAcc = p.tipo === 'accesorio';
      const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
      const tag = sinStock ? ' ❌ _sin stock_' : '';
      if (esAcc) {
        const precio = p.precioMayorista || p.precioVenta;
        bloque += `  • ${p.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(p.precioVenta)}/un${tag}\n`;
      } else {
        (p.presentaciones||[]).forEach((pr, i) => {
          const precio = pr.precioMayorista || pr.precioVenta;
          bloque += `  • ${p.nombre} ${pr.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(pr.precioVenta)}${i===0?tag:''}\n`;
        });
      }
    });
    if (bloque) {
      msg += `*${EMOJIS_CAT[cat]||'•'} ${cat}*\n${bloque}\n`;
    }
  });

  if (DB.combos.length) {
    msg += `*🎁 Combos*\n`;
    DB.combos.forEach(c => {
      const precio = c.precioMayorista || c.precio;
      msg += `  • ${c.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(c.precio)}\n`;
    });
    msg += '\n';
  }

  msg += `--------------------------\n`;
  msg += `📷 @nura.neco\n📲 2262 240512 / 2262 638838\n`;
  msg += `_Precios sujetos a cambios sin aviso previo_`;

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  toast('Adjuntá el PDF si lo descargaste 📎');
};

// ── Export catálogo ──────────────────────────────────────────────────
function exportarCatalogo() {
  if(!DB.productos.length){swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:30px;color:#0f172a}.header{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #52dad2}.logo{width:90px;height:90px;object-fit:contain}.brand{font-size:28px;font-weight:900;letter-spacing:8px}.a{color:#7c3aed}.sub{font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-top:4px}.fecha{color:#64748b;font-size:11px;margin-top:8px}.cat{margin-top:22px;margin-bottom:10px;padding-bottom:7px;border-bottom:1.5px solid #e2eaf2}.cat-title{font-size:16px;font-weight:800;color:#1ab8af}.prod{padding-left:18px;margin-bottom:10px}.prod-name{font-weight:700;font-size:13px}.prod-code{font-size:10px;color:#94a3b8;margin-left:6px}.pres{display:flex;justify-content:space-between;padding:2px 0 2px 18px;font-size:12px;color:#475569}.precio{font-weight:800;color:#1ab8af}.mayorista{color:#7c3aed;font-size:10px;}.footer{margin-top:36px;padding-top:18px;border-top:1px solid #e2eaf2;text-align:center;font-size:12px}.contactos{margin-top:10px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;color:#1ab8af;font-size:12px}hr{border:none;border-top:1px dashed #e2eaf2;margin:10px 0}</style></head><body>
    <div class="header"><img src="logo.png" class="logo" /><div class="brand">NUR<span class="a">A</span></div><div class="sub">artículos de limpieza</div><div class="fecha">Catálogo al ${new Date().toLocaleDateString('es-AR')}</div></div>`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{
    html+=`<div class="cat"><div class="cat-title">${EMOJIS_CAT[cat]||'•'} ${cat}</div></div>`;
    DB.productos.filter(p=>p.categoria===cat).forEach(p=>{
      html+=`<div class="prod"><div class="prod-name">${p.nombre}${p.codigo?`<span class="prod-code">#${p.codigo}</span>`:''}</div>`;
      if(p.tipo==='accesorio'){html+=`<div class="pres"><span>Unidad</span><span class="precio">${fmt(p.precioVenta)}${p.precioMayorista?` <span class="mayorista">(Mayor: ${fmt(p.precioMayorista)})</span>`:''}</span></div>`;}
      else{(p.presentaciones||[]).forEach(pr=>{html+=`<div class="pres"><span>${pr.nombre}</span><span class="precio">${fmt(pr.precioVenta)}${pr.precioMayorista?` <span class="mayorista">(Mayor: ${fmt(pr.precioMayorista)})</span>`:''}</span></div>`;});}
      if(p.descripcion)html+=`<div style="padding-left:18px;font-size:10px;color:#94a3b8;">📝 ${p.descripcion}</div>`;
      html+=`</div>`;
    });html+=`<hr>`;
  });
  if(DB.combos.length){html+=`<div class="cat"><div class="cat-title">🎁 Combos</div></div>`;DB.combos.forEach(c=>{html+=`<div class="prod"><div class="prod-name">🎁 ${c.nombre}</div><div class="pres"><span>${c.descripcion||c.items?.map(i=>i.nombre).join(', ')}</span><span class="precio">${fmt(c.precio)}</span></div></div>`;});html+=`<hr>`;}
  html+=`<div class="footer"><div style="font-weight:700;margin-bottom:8px;">📞 ¡Consultanos para hacer tu pedido!</div><div class="contactos"><span>📷 @nura.neco</span><span>📲 2262 240512</span><span>📲 2262 638838</span></div><div style="margin-top:12px;font-size:10px;color:#94a3b8;">🌿 NURA — Productos de limpieza de alta calidad</div></div></body></html>`;
  openModal('📄 Exportar Catálogo',`
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Vista previa del catálogo PDF.</p>
    <iframe id="pdfPreview" style="width:100%;height:340px;border:1px solid var(--border);border-radius:var(--radius-sm);"></iframe>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="descargarPDF()">📄 Descargar PDF</button>
      <button class="btn btn-wsp-sm" onclick="wspCatalogoPDF()">📲 WhatsApp</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
    </div>`,null,true);
  window._pdfHTML=html;
  setTimeout(()=>{const f=document.getElementById('pdfPreview');if(f)f.srcdoc=html;},50);
}

window.descargarPDF=async function(){if(!window._pdfHTML)return;toast('Generando PDF...','info');try{const el=document.createElement('div');el.innerHTML=window._pdfHTML;document.body.appendChild(el);await html2pdf().set({margin:[0.5,0.5,0.5,0.5],filename:`nura-catalogo-${new Date().toISOString().slice(0,10)}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'in',format:'a4',orientation:'portrait'}}).from(el).save();document.body.removeChild(el);toast('PDF descargado ✅');}catch(e){swalError('Error al generar el PDF.');}};
window.wspCatalogoPDF=function(){window.open(`https://wa.me/?text=${encodeURIComponent('*NURA — Artículos de Limpieza*\n\n¡Hola! Te compartimos nuestro catálogo de precios actualizado.\n\n📷 @nura.neco\n📲 2262 240512 / 2262 638838\n\n¡Gracias por elegirnos!')}`,'_blank');toast('Adjuntá el PDF descargado 📎');};

// ── Form Producto ─────────────────────────────────────────────────────
let _presTemp=[];

function formProducto(id) {
  const p=id?DB.productos.find(x=>x.id===id):null;
  _presTemp=p?.presentaciones?p.presentaciones.map(x=>({...x})):[];
  const esAcc=p?.tipo==='accesorio';
  const html=`<div style="display:flex;flex-direction:column;gap:16px;">
    <div class="form-grid">
      <div class="form-group full"><label>Nombre</label><input id="pNombre" value="${p?p.nombre:''}" placeholder="Ej: Lavandina Premium..." /></div>
      <div class="form-group"><label>Código</label><input id="pCodigo" value="${p?p.codigo||'':''}" placeholder="Ej: LAV-001" /></div>
      <div class="form-group"><label>Categoría</label><select id="pCategoria">${CATEGORIAS.map(c=>`<option value="${c}" ${p?.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="form-group"><label>Tipo</label><select id="pTipo" onchange="onTipoChange()"><option value="liquido" ${!esAcc?'selected':''}>💧 Líquido / Granel</option><option value="accesorio" ${esAcc?'selected':''}>🧹 Accesorio / Unidad</option></select></div>
      <div class="form-group full"><label>Descripción</label><textarea id="pDesc" rows="2">${p?p.descripcion||'':''}</textarea></div>
    </div>
    <div id="panelLiquido" style="${esAcc?'display:none':''}">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div class="section-title mb-12">🫙 Stock a granel</div>
        <div class="form-grid">
          <div class="form-group"><label>Stock actual (L)</label>${unitInput('pStockLitros',p?p.stockLitros||0:0,'L','0.001')}</div>
          <div class="form-group"><label>Stock mínimo (L)</label>${unitInput('pStockMinLitros',p?p.stockMinLitros||5:5,'L','0.001')}</div>
          <div class="form-group full"><label>Costo por litro ($)</label>${moneyInput('pCostoLitro',p?p.costoLitro||'':'','recalcTodasPres()')}<span class="form-note">Lo que pagás por litro a granel</span></div>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);margin-top:12px;">
        <div class="section-header"><div class="section-title">📐 Presentaciones</div></div>
        <div style="margin-bottom:12px;"><label style="display:block;margin-bottom:6px;">Agregar rápido</label>
          <div class="flex gap-6 flex-wrap">${PRES_RAPIDAS.map(pr=>`<button class="btn btn-secondary btn-sm" type="button" onclick="agregarPresRapida('${pr.nombre}',${pr.litros})">${pr.nombre}</button>`).join('')}
            <button class="btn btn-violet btn-sm" type="button" onclick="agregarPresPersonalizada()">+ Personalizada</button></div>
        </div>
        <div id="presContainer"></div>
      </div>
    </div>
    <div id="panelAccesorio" style="${!esAcc?'display:none':''}">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div class="section-title mb-12">🧹 Accesorio</div>
        <div class="form-grid">
          <div class="form-group"><label>Stock actual (un)</label><input id="pStockUnidades" type="number" min="0" step="1" value="${p?p.stockUnidades||0:0}" /></div>
          <div class="form-group"><label>Stock mínimo (un)</label><input id="pStockMinUnidades" type="number" min="0" step="1" value="${p?p.stockMinUnidades||2:2}" /></div>
          <div class="form-group"><label>Costo unitario ($)</label>${moneyInput('pCostoUnidad',p?p.costoUnidad||'':'','calcAccesorio()')}</div>
          <div class="form-group"><label>% Ganancia</label><input id="pGananciaAcc" type="number" min="0" max="999" step="1" value="${p?p.gananciaAcc||40:40}" oninput="calcAccesorio()" /></div>
          <div class="cost-calc-box"><h4>💰 Cálculo Actual</h4>
            <div class="cost-row"><span>Costo</span><span id="accCostoU">$0.00</span></div>
            <div class="cost-row"><span id="accGanLabel">Ganancia</span><span id="accGan">$0.00</span></div>
            <div class="cost-row total"><span>Precio sugerido</span><span id="accPrecio">$0.00</span></div></div>
          <div class="form-group"><label>Precio Actual ($)</label>${moneyInput('pPrecioVentaAcc',p?p.precioVenta||'':'')}<span class="form-note">Podés sobreescribir</span></div>
          <div class="form-group"><label>% Descuento mayorista</label><input id="pDescMayAcc" type="number" min="0" max="100" step="1" value="${p?p.descMayorista||20:20}" oninput="calcAccesorio()" /></div>
          <div class="form-group"><label>Precio mayorista ($)</label>${moneyInput('pPrecioMayAcc',p?p.precioMayorista||'':'')}<span class="form-note">Para vendedores/distribuidores</span></div>
        </div>
      </div>
    </div>
  </div>`;
  openModal(p?'Editar Producto':'Nuevo Producto',html,guardarProducto.bind(null,id),true);
  setTimeout(()=>{renderPresContainer();recalcTodasPres();calcAccesorio();},30);
}

window.onTipoChange=function(){const t=document.getElementById('pTipo')?.value;document.getElementById('panelLiquido').style.display=t==='liquido'?'':'none';document.getElementById('panelAccesorio').style.display=t==='accesorio'?'':'none';};
window.calcAccesorio=function(){
  const c=parseFloat(document.getElementById('pCostoUnidad')?.value)||0,g=parseFloat(document.getElementById('pGananciaAcc')?.value)||0,p=c*(1+g/100);
  const descMay=parseFloat(document.getElementById('pDescMayAcc')?.value)||20;
  const pMay=p*(1-descMay/100);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};
  s('accCostoU',c);s('accGan',c*g/100);s('accPrecio',p);
  const gl=document.getElementById('accGanLabel');if(gl)gl.textContent=`Ganancia (${g}%)`;
  const pv=document.getElementById('pPrecioVentaAcc');if(pv&&p>0&&!pv.dataset.manual)pv.value=p.toFixed(2);
  const pm=document.getElementById('pPrecioMayAcc');if(pm&&pMay>0&&!pm.dataset.manual)pm.value=pMay.toFixed(2);
};

function renderPresContainer(){
  const cont=document.getElementById('presContainer');if(!cont)return;
  if(!_presTemp.length){cont.innerHTML=`<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">📐</div><p>Agregá una presentación</p></div>`;return;}
  cont.innerHTML=_presTemp.map((pr,i)=>`
    <div class="pres-card" id="presCard${i}">
      <div class="pres-card-header"><div class="fw-700" style="font-size:13px;">📦 <span id="presTitle${i}">${pr.nombre}</span></div><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarPres(${i})">✕</button></div>
      <div class="form-grid-3">
        <div class="form-group"><label>Nombre</label><input type="text" value="${pr.nombre}" oninput="_presTemp[${i}].nombre=this.value;const t=document.getElementById('presTitle${i}');if(t)t.textContent=this.value;" /></div>
        <div class="form-group"><label>Litros</label>${unitInput(`pL${i}`,pr.litros,'L','0.001',`_presTemp[${i}].litros=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>Costo envase ($)</label>${moneyInput(`pCE${i}`,pr.costoEnvase||0,`_presTemp[${i}].costoEnvase=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>Costo etiqueta ($)</label>${moneyInput(`pCEt${i}`,pr.costoEtiqueta||0,`_presTemp[${i}].costoEtiqueta=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>% Ganancia</label><input type="number" min="0" max="999" step="1" value="${pr.ganancia||40}" oninput="_presTemp[${i}].ganancia=+this.value;recalcPres(${i});" /></div>
        <div class="form-group"><label style="color:var(--accent-dark);">Precio Actual ($)</label>${moneyInput(`pvPres${i}`,(pr.precioVenta||0).toFixed(2),`_presTemp[${i}].precioVenta=+this.value;document.getElementById('pvPres${i}').dataset.manual='1';`)}</div>
        <div class="form-group"><label>% Desc. mayorista</label><input type="number" min="0" max="100" step="1" value="${pr.descMayorista||20}" oninput="_presTemp[${i}].descMayorista=+this.value;recalcPres(${i});" /></div>
        <div class="form-group"><label style="color:#7c3aed;">Precio mayorista ($)</label>${moneyInput(`pvMay${i}`,(pr.precioMayorista||0).toFixed(2),`_presTemp[${i}].precioMayorista=+this.value;document.getElementById('pvMay${i}').dataset.manual='1';`)}</div>
      </div>
      <div class="pres-calc-row">
        <span>Producto: <strong id="pcCP${i}">—</strong></span><span>Env+Etiq: <strong id="pcEE${i}">—</strong></span>
        <span>Total: <strong id="pcCT${i}">—</strong></span><span>Gan.: <strong id="pcG${i}">—</strong></span>
        <span style="color:var(--accent-dark);font-weight:700;">Actual: <strong id="pcPV${i}">—</strong></span>
        <span style="color:#7c3aed;font-weight:700;">Mayorista: <strong id="pcMay${i}">—</strong></span>
      </div>
    </div>`).join('');
  _presTemp.forEach((_,i)=>recalcPres(i));
}
window.recalcPres=function(i){
  const cl=parseFloat(document.getElementById('pCostoLitro')?.value)||0;
  const pr=_presTemp[i];if(!pr)return;
  const cp=cl*pr.litros,ee=(pr.costoEnvase||0)+(pr.costoEtiqueta||0),ct=cp+ee,g=ct*((pr.ganancia||40)/100),pv=ct+g;
  const descMay=pr.descMayorista||20,pmay=pv*(1-descMay/100);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};
  s(`pcCP${i}`,cp);s(`pcEE${i}`,ee);s(`pcCT${i}`,ct);s(`pcG${i}`,g);s(`pcPV${i}`,pv);s(`pcMay${i}`,pmay);
  const pvEl=document.getElementById(`pvPres${i}`);if(pvEl&&!pvEl.dataset.manual){pvEl.value=pv.toFixed(2);_presTemp[i].precioVenta=pv;}
  const pmEl=document.getElementById(`pvMay${i}`);if(pmEl&&!pmEl.dataset.manual){pmEl.value=pmay.toFixed(2);_presTemp[i].precioMayorista=pmay;}
};
window.recalcTodasPres=function(){_presTemp.forEach((_,i)=>recalcPres(i));};
window.agregarPresRapida=function(nombre,litros){if(_presTemp.find(p=>p.nombre===nombre)){toast(`Ya existe ${nombre}`,'info');return;}_presTemp.push({id:genId(),nombre,litros,costoEnvase:0,costoEtiqueta:0,ganancia:40,descMayorista:20,precioVenta:0,precioMayorista:0});renderPresContainer();};
window.agregarPresPersonalizada=function(){_presTemp.push({id:genId(),nombre:'Nueva',litros:1,costoEnvase:0,costoEtiqueta:0,ganancia:40,descMayorista:20,precioVenta:0,precioMayorista:0});renderPresContainer();};
window.eliminarPres=function(i){_presTemp.splice(i,1);renderPresContainer();};

async function guardarProducto(id){
  const nombre=document.getElementById('pNombre').value.trim();
  if(!nombre){await swalError('El nombre es obligatorio');return;}
  const tipo=document.getElementById('pTipo').value,cat=document.getElementById('pCategoria').value;
  const desc=document.getElementById('pDesc').value.trim(),codigo=document.getElementById('pCodigo').value.trim();
  let prod;
  if(tipo==='liquido'){
    if(!_presTemp.length){await swalError('Agregá al menos una presentación');return;}
    const cl=parseFloat(document.getElementById('pCostoLitro').value)||0;
    if(!cl){await swalError('Ingresá el costo por litro');return;}
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockLitros:parseFloat(document.getElementById('pStockLitros').value)||0,stockMinLitros:parseFloat(document.getElementById('pStockMinLitros').value)||5,costoLitro:cl,presentaciones:_presTemp.map(pr=>({id:pr.id||genId(),nombre:pr.nombre,litros:pr.litros||0,costoEnvase:pr.costoEnvase||0,costoEtiqueta:pr.costoEtiqueta||0,ganancia:pr.ganancia||40,descMayorista:pr.descMayorista||20,precioVenta:pr.precioVenta||0,precioMayorista:pr.precioMayorista||0}))};
  } else {
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockUnidades:parseFloat(document.getElementById('pStockUnidades').value)||0,stockMinUnidades:parseFloat(document.getElementById('pStockMinUnidades').value)||2,costoUnidad:parseFloat(document.getElementById('pCostoUnidad').value)||0,gananciaAcc:parseFloat(document.getElementById('pGananciaAcc').value)||40,descMayorista:parseFloat(document.getElementById('pDescMayAcc').value)||20,precioVenta:parseFloat(document.getElementById('pPrecioVentaAcc').value)||0,precioMayorista:parseFloat(document.getElementById('pPrecioMayAcc').value)||0};
  }
  closeModal();
  await fbSave('productos',prod);
  toast(id?'Producto actualizado ✅':'Producto creado ✅');
}

async function eliminarProducto(id){const p=DB.productos.find(x=>x.id===id);const res=await swalConfirm('¿Eliminar producto?',`Se eliminará <strong>${escapeHTML(p?.nombre)}</strong>`);if(!res.isConfirmed)return;await fbRemove('productos',id);toast('Producto eliminado');}
async function duplicarProducto(id){const orig=DB.productos.find(x=>x.id===id);if(!orig)return;const copia=JSON.parse(JSON.stringify(orig));copia.id=genId();copia.nombre=`${orig.nombre} (copia)`;if(copia.presentaciones)copia.presentaciones=copia.presentaciones.map(pr=>({...pr,id:genId()}));await fbSave('productos',copia);toast('Producto duplicado ✅');}
function wspProducto(id){const p=DB.productos.find(x=>x.id===id);if(!p)return;let msg=`*🌿 NURA — ${p.nombre}*\n📦 ${p.categoria}${p.codigo?' | #'+p.codigo:''}\n\n`;if(p.tipo==='accesorio')msg+=`💲 ${fmt(p.precioVenta)} por unidad\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`• ${pr.nombre} → ${fmt(pr.precioVenta)}\n`;});if(p.descripcion)msg+=`\n📝 ${p.descripcion}\n`;msg+='\n¡Consultanos! 🌿';window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');}
window.verDetalleProducto = function(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!p) return;
  let html = '';
  if (p.tipo === 'accesorio') {
    const costoReal = p.costoUnidad || 0;
    const precioMay = p.precioMayorista || 0;
    const sugerido = p.precioVenta;
    const margenReal = sugerido > 0 ? Math.round(((sugerido - costoReal) / sugerido) * 100) : 0;
    html += `<div class="m-card-row"><span class="m-card-row-label">Costo real de producción</span><span class="m-card-row-value">${fmt(costoReal)}</span></div>`;
    html += `<div class="m-card-row"><span class="m-card-row-label">Precio mayorista</span><span class="m-card-row-value">${fmt(precioMay)}</span></div>`;
    html += `<div class="m-card-row"><span class="m-card-row-label">Precio venta sugerido</span><span class="m-card-row-value">${fmt(sugerido)}</span></div>`;
    html += `<div class="m-card-row"><span class="m-card-row-label">Margen real</span><span class="m-card-row-value" style="color:var(--violet-dark)">${margenReal}%</span></div>`;
  } else {
    (p.presentaciones || []).forEach(pr => {
      const costoL = p.costoLitro || 0;
      const litros = pr.litros || 0;
      const costoEnvase = (pr.costoEnvase || 0) + (pr.costoEtiqueta || 0);
      const costoReal = costoL * litros + costoEnvase;
      const precioMay = pr.precioMayorista || 0;
      const sugerido = pr.precioVenta;
      const margenReal = sugerido > 0 ? Math.round(((sugerido - costoReal) / sugerido) * 100) : 0;
      html += `<div style="margin-top:8px;"><strong>${pr.nombre}</strong> (${litros} L)</div>`;
      html += `<div class="m-card-row"><span class="m-card-row-label">Costo real</span><span class="m-card-row-value">${fmt(costoReal)} <span style="font-size:11px;color:var(--text-muted)">(${fmt(costoL)}/L + ${fmt(costoEnvase)} envase)</span></span></div>`;
      html += `<div class="m-card-row"><span class="m-card-row-label">Precio mayorista</span><span class="m-card-row-value">${fmt(precioMay)}</span></div>`;
      html += `<div class="m-card-row"><span class="m-card-row-label">Precio venta sugerido</span><span class="m-card-row-value">${fmt(sugerido)}</span></div>`;
      html += `<div class="m-card-row"><span class="m-card-row-label">Margen real</span><span class="m-card-row-value" style="color:var(--violet-dark)">${margenReal}%</span></div>`;
    });
  }
  openModal(`Detalle de ${p.nombre}`, `<div style="display:flex;flex-direction:column;gap:8px;">${html}</div>`, null);
};
