/**
 * NOMAI BATCH MANAGER & DATABASE VIEWER
 * Virtual scrolling implementation — renders only visible rows for performance
 * with 150k+ records while giving the feel of one continuous list.
 */

document.addEventListener('DOMContentLoaded', () => {
    initDatabaseViewer();

    document.addEventListener('nomai:batchesUpdated', () => {
        renderBatchesList();
        refreshDatabaseTable();
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link[data-tab="database"]');
        if (link) {
            setTimeout(() => {
                renderBatchesList();
                refreshDatabaseTable();
            }, 150);
        }
    });
});

// ─── Virtual scroll state ────────────────────────────────────────────────────
const VS = {
    ROW_HEIGHT: 44,          // px — height of each <tr>
    BUFFER: 20,              // extra rows above/below viewport to pre-render
    filteredData: [],
    scrollTop: 0,
    containerH: 0,
};

// Function to get Fecha Acumula dynamically (supporting fallback for preloaded data)
function getFechaAcumula(row) {
    if (row.fa) return row.fa;
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mIdx = monthNames.indexOf(row.m);
    const mesNum = mIdx !== -1 ? mIdx + 1 : 1;
    const year = row.a || 2026;
    const isQ2 = row.pa ? (row.pa % 2 === 0) : false;
    const day = isQ2 ? new Date(year, mesNum, 0).getDate() : 15;
    
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(day)}/${pad(mesNum)}/${year}`;
}

let dbFilters = {
    c: '', n: '', fa: '', coc: '', co: '', cant: '', v: '', cc: '', dcc: '', cgc: '', cg: '', tn: '', m: '', pa: '', na: '', t: ''
};

let dbSort = { column: null, direction: 'asc' };

const columnMap = [
    { key: 'c',    label: 'Identificación', width: '105px' },
    { key: 'n',    label: 'Nombre Completo', width: '200px' },
    { key: 'fa',   label: 'Fecha Acumula', width: '110px' },
    { key: 'coc',  label: 'Concepto', width: '80px' },
    { key: 'co',   label: 'Nombre Concepto', width: '200px' },
    { key: 'cant', label: 'Cantidad', isNumber: true, width: '80px' },
    { key: 'v',    label: 'Valor', isNumber: true, width: '120px' },
    { key: 'cc',   label: 'Centro de Costo', width: '110px' },
    { key: 'dcc',  label: 'Nombre Centro de Costo', width: '200px' },
    { key: 'cgc',  label: 'Cargo', width: '90px' },
    { key: 'cg',   label: 'Nombre Cargo', width: '200px' },
    { key: 'tn',   label: 'Tipo de Nómina', width: '110px' },
    { key: 'm',    label: 'Mes Acumulado', width: '115px' },
    { key: 'pa',   label: 'Quincena', width: '90px' },
    { key: 'na',   label: 'Naturaleza', width: '115px' },
    { key: 't',    label: 'Tipo de Concepto', width: '120px' }
];

// ─── Init ─────────────────────────────────────────────────────────────────────
function initDatabaseViewer() {
    renderTableHeaders();
}

// ─── Batches list ─────────────────────────────────────────────────────────────
function renderBatchesList() {
    const el = document.getElementById('nomai-batch-list');
    if (!el) return;
    const batches = window.state?.batches || [];

    if (!batches.length) {
        el.innerHTML = '<div style="color:#9ca3af;font-size:0.875rem;font-style:italic;">No hay lotes cargados actualmente.</div>';
        return;
    }

    const canDelete = window.NomaiAuth ? window.NomaiAuth.hasPermission('delete_data') : true;

    el.innerHTML = batches.map((b, i) => {
        const count = b.data ? b.data.length : (b.recordCount || 0);
        return `
        <div class="batch-item">
            <div>
                <div style="font-weight:600;color:var(--text-primary);font-size:0.875rem;display:flex;align-items:center;gap:0.35rem;">
                    <i data-lucide="layers" style="width:14px;height:14px;color:var(--primary);"></i>
                    Lote ${i + 1}: ${b.name}
                </div>
                <div style="color:var(--text-secondary);font-size:0.75rem;margin-top:4px;padding-left:1.25rem;">
                    Cargado el: ${b.date} &bull; ${count.toLocaleString('es-CO')} registros
                </div>
            </div>
            ${canDelete ? `
            <button class="btn btn-outline"
                    style="color:#ef4444;border-color:#ef4444;padding:0.25rem 0.5rem;font-size:0.75rem;display:flex;align-items:center;"
                    onclick="deleteBatch('${b.id}')">
                <i data-lucide="trash-2" style="width:14px;height:14px;margin-right:4px;"></i> Eliminar lote
            </button>
            ` : ''}
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}
window.renderBatchesList = renderBatchesList;

window.deleteBatch = async function (batchId) {
    if (window.NomaiAuth && !window.NomaiAuth.hasPermission('delete_data')) {
        await window.showNomaiAlert("No tienes permisos para eliminar lotes de datos.");
        return;
    }
    if (!window.state?.batches) return;
    
    const confirmMessage = '¿Estás seguro de que deseas eliminar este lote? Los datos se recalcularán.';
    let proceed = false;
    if (typeof window.showNomaiConfirm === 'function') {
        proceed = await window.showNomaiConfirm(confirmMessage);
    } else {
        proceed = confirm(confirmMessage);
    }
    if (!proceed) return;

    // Si hay sesión de Supabase, eliminar de la base de datos en la nube
    if (window.NomaiAuth && window.NomaiAuth.session) {
        const sb = window.NomaiAuth.supabase;

        // Primero eliminar los registros asociados al lote
        const { error: recordsError } = await sb
            .from('payroll_records')
            .delete()
            .eq('batch_id', batchId);

        if (recordsError) {
            await window.showNomaiAlert("Error al eliminar los registros del lote: " + recordsError.message);
            return;
        }

        // Luego eliminar el lote en sí
        const { error } = await sb
            .from('payroll_batches')
            .delete()
            .eq('id', batchId);

        if (error) {
            await window.showNomaiAlert("Error al eliminar lote en la nube: " + error.message);
            return;
        }

        console.log("[Nomai DB Viewer] Lote eliminado en la nube. Recargando...");
        const freshData = await window.loadPayrollFromSupabase();
        window.state.data = freshData;

        renderBatchesList();
        refreshDatabaseTable();

        if (typeof window.initUniqueValuesCache === 'function') window.initUniqueValuesCache();
        if (typeof window.updateAll === 'function') {
            window.state.filters = { years: [], months: [], types: [], cecos: [], quincenas: [] };
            window.updateAll();
        }
        return;
    }

    window.state.batches = window.state.batches.filter(b => b.id !== batchId);

    let allData = [];
    window.state.batches.forEach(batch => {
        allData = allData.concat(batch.data.filter(d => d.na !== 'BENEFICIO'));
    });
    window.state.data = allData;

    // Limpiar caché para que el próximo refresco use datos frescos
    if (typeof window.clearNomaiCache === 'function') window.clearNomaiCache();

    renderBatchesList();
    refreshDatabaseTable();

    if (typeof window.initUniqueValuesCache === 'function') window.initUniqueValuesCache();
    if (typeof window.updateAll === 'function') {
        window.state.filters = { years: [], months: [], types: [], cecos: [], quincenas: [] };
        window.updateAll();
    }
};

// ─── Eliminar TODA la base de datos (doble confirmación) ──────────────────────
window.deleteAllDatabase = async function() {
    if (window.NomaiAuth && !window.NomaiAuth.hasPermission('delete_data')) {
        await window.showNomaiAlert('No tienes permisos para eliminar la base de datos.');
        return;
    }

    // Primera confirmación
    const first = await window.showNomaiConfirm(
        '⚠️ ¿Estás seguro de que deseas eliminar TODA la base de datos de nómina?\n\nEsta acción eliminará todos los lotes y registros cargados en Supabase.'
    );
    if (!first) return;

    // Segunda confirmación — modal especial de doble confirmación
    const confirmed = await new Promise(resolve => {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif;';
        modal.innerHTML = `
            <div style="background:white;border-radius:1rem;padding:2rem;max-width:420px;width:90%;box-shadow:0 25px 50px rgba(0,0,0,0.25);">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
                    <div style="background:#fee2e2;border-radius:0.5rem;padding:0.6rem;">
                        <i data-lucide="alert-triangle" style="width:22px;height:22px;color:#dc2626;"></i>
                    </div>
                    <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#1e293b;">Confirmar eliminación total</h3>
                </div>
                <p style="color:#475569;font-size:0.9rem;margin-bottom:0.5rem;">Esta es tu <strong>segunda y última confirmación</strong>. Al continuar:</p>
                <ul style="color:#64748b;font-size:0.85rem;margin:0.5rem 0 1.5rem 1.2rem;line-height:1.8;">
                    <li>Se eliminarán <strong>todos los lotes</strong> de tu empresa</li>
                    <li>Se eliminarán <strong>todos los registros</strong> de nómina</li>
                    <li>Se borrará el <strong>caché local</strong> del navegador</li>
                    <li>Esta acción <strong>no se puede deshacer</strong></li>
                </ul>
                <p style="color:#64748b;font-size:0.85rem;margin-bottom:1.25rem;">Escribe <strong>ELIMINAR</strong> para confirmar:</p>
                <input id="delete-confirm-input" type="text" placeholder="ELIMINAR" autocomplete="off"
                    style="width:100%;padding:0.6rem 0.75rem;border:2px solid #e2e8f0;border-radius:0.5rem;font-size:0.9rem;box-sizing:border-box;margin-bottom:1rem;font-family:Outfit,sans-serif;">
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button id="delete-cancel-btn" style="padding:0.5rem 1.25rem;border:1px solid #e2e8f0;background:white;border-radius:0.5rem;cursor:pointer;font-family:Outfit,sans-serif;">Cancelar</button>
                    <button id="delete-confirm-btn" style="padding:0.5rem 1.25rem;background:#dc2626;color:white;border:none;border-radius:0.5rem;cursor:pointer;font-family:Outfit,sans-serif;font-weight:600;opacity:0.4;" disabled>Eliminar Todo</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) window.lucide.createIcons();

        const input = modal.querySelector('#delete-confirm-input');
        const confirmBtn = modal.querySelector('#delete-confirm-btn');
        const cancelBtn = modal.querySelector('#delete-cancel-btn');

        input.addEventListener('input', () => {
            const valid = input.value.trim().toUpperCase() === 'ELIMINAR';
            confirmBtn.disabled = !valid;
            confirmBtn.style.opacity = valid ? '1' : '0.4';
        });
        cancelBtn.addEventListener('click', () => { modal.remove(); resolve(false); });
        confirmBtn.addEventListener('click', () => { modal.remove(); resolve(true); });
        modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); resolve(false); } });
    });
    if (!confirmed) return;

    // Mostrar progreso
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1e1b4b;color:white;padding:1rem 1.5rem;border-radius:0.75rem;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,0.3);min-width:260px;font-family:Outfit,sans-serif;';
    toast.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">Eliminando base de datos...</div><div style="font-size:0.8rem;color:rgba(255,255,255,0.6);">Por favor espera</div>';
    document.body.appendChild(toast);

    try {
        if (window.NomaiAuth && window.NomaiAuth.session) {
            const sb = window.NomaiAuth.supabase;

            // Usar RPC server-side para evitar timeout de RLS en borrado masivo
            const { error } = await sb.rpc('delete_my_payroll_data');
            if (error) throw error;
        }

        // Limpiar estado local y caché
        if (window.state) { window.state.data = []; window.state.batches = []; }
        if (typeof window.clearNomaiCache === 'function') await window.clearNomaiCache();

        // Re-renderizar todo
        renderBatchesList();
        refreshDatabaseTable();
        if (typeof window.initUniqueValuesCache === 'function') window.initUniqueValuesCache();
        if (typeof window.processData === 'function') window.processData();
        if (typeof window.renderActiveTab === 'function') window.renderActiveTab();

        toast.style.background = '#065f46';
        toast.innerHTML = '<div style="font-weight:600;">✓ Base de datos eliminada</div><div style="font-size:0.8rem;color:rgba(255,255,255,0.7);">Todos los datos han sido borrados</div>';
        setTimeout(() => toast.remove(), 3000);

    } catch (e) {
        console.error('[Nomai] Error eliminando base de datos:', e);
        toast.style.background = '#7f1d1d';
        toast.innerHTML = '<div style="font-weight:600;">Error al eliminar</div><div style="font-size:0.8rem;">' + (e.message || '') + '</div>';
        setTimeout(() => toast.remove(), 4000);
    }
};

// ─── Headers ──────────────────────────────────────────────────────────────────
function renderTableHeaders() {
    const headerRow = document.getElementById('db-table-headers');
    const filterRow = document.getElementById('db-table-filters');
    if (!headerRow || !filterRow) return;

    headerRow.innerHTML = columnMap.map(col => {
        const widthStyle = col.width ? `width:${col.width};min-width:${col.width};max-width:${col.width};` : '';
        return `
            <th style="padding:0.75rem 0.4rem;cursor:pointer;user-select:none;${widthStyle}box-sizing:border-box;white-space:normal;vertical-align:middle;"
                onclick="handleDbSort('${col.key}')">
                <div style="display:flex;align-items:center;gap:0.25rem;white-space:normal;line-height:1.1;word-break:break-word;">
                    <span style="white-space:normal;word-break:break-word;">${col.label}</span>
                    <span id="db-sort-icon-${col.key}" style="color:#cbd5e1;font-size:0.75rem;flex-shrink:0;margin-left:2px;">↕</span>
                </div>
            </th>`;
    }).join('');

    filterRow.innerHTML = columnMap.map(col => {
        const widthStyle = col.width ? `width:${col.width};min-width:${col.width};max-width:${col.width};` : '';
        const inputPadding = col.width ? 'padding:0.25rem 0.25rem;' : 'padding:0.25rem 0.5rem;';
        const inputMinW = col.width ? 'min-width:40px;' : 'min-width:70px;';
        return `
            <th style="padding:0.5rem 0.5rem;${widthStyle}box-sizing:border-box;">
                <input type="text" placeholder="Filtrar…"
                       style="width:100%;${inputMinW}${inputPadding}font-size:0.75rem;
                              border:1px solid #d1d5db;border-radius:0.25rem;background:white;box-sizing:border-box;"
                       data-col="${col.key}" onkeyup="handleDbFilter(event)">
            </th>`;
    }).join('');
}

window.handleDbSort = function (key) {
    dbSort.direction = dbSort.column === key && dbSort.direction === 'asc' ? 'desc' : 'asc';
    dbSort.column = key;

    columnMap.forEach(col => {
        const icon = document.getElementById(`db-sort-icon-${col.key}`);
        if (!icon) return;
        if (col.key === key) {
            icon.innerHTML = dbSort.direction === 'asc' ? '↑' : '↓';
            icon.style.color = '#4f46e5';
        } else {
            icon.innerHTML = '↕';
            icon.style.color = '#cbd5e1';
        }
    });

    applyFiltersAndSort();
};

window.handleDbFilter = function (event) {
    const input = event.target;
    dbFilters[input.getAttribute('data-col')] = input.value.toLowerCase();
    applyFiltersAndSort();
};

// ─── Data processing ──────────────────────────────────────────────────────────
function refreshDatabaseTable() {
    applyFiltersAndSort();
}

function applyFiltersAndSort() {
    let data = window.state?.data || [];

    // Filter
    VS.filteredData = data.filter(row => {
        for (const col of columnMap) {
            const fv = dbFilters[col.key];
            if (fv) {
                let val = '';
                if (col.key === 'fa') {
                    val = getFechaAcumula(row);
                } else if (col.key === 'pa') {
                    val = row.pa ? 'Q' + row.pa : 'Q1';
                } else {
                    val = row[col.key];
                }
                if (!String(val ?? '').toLowerCase().includes(fv)) return false;
            }
        }
        return true;
    });

    // Sort
    if (dbSort.column) {
        const isNum = columnMap.find(c => c.key === dbSort.column)?.isNumber;
        VS.filteredData.sort((a, b) => {
            let va, vb;
            if (dbSort.column === 'fa') {
                const parseDateStr = (str) => {
                    const parts = str.split('/');
                    if (parts.length === 3) {
                        return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
                    }
                    return 0;
                };
                va = parseDateStr(getFechaAcumula(a));
                vb = parseDateStr(getFechaAcumula(b));
            } else if (dbSort.column === 'pa') {
                va = a.pa ?? 1;
                vb = b.pa ?? 1;
            } else {
                va = a[dbSort.column];
                vb = b[dbSort.column];
            }
            if (isNum) {
                va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
                return dbSort.direction === 'asc' ? va - vb : vb - va;
            }
            va = String(va ?? '').toLowerCase(); vb = String(vb ?? '').toLowerCase();
            if (va < vb) return dbSort.direction === 'asc' ? -1 : 1;
            if (va > vb) return dbSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    updateInfo();
    setupVirtualScroll();
}

function updateInfo() {
    const fmt = new Intl.NumberFormat('es-CO');
    const el = document.getElementById('db-table-info');
    if (el) el.textContent = `${fmt.format(VS.filteredData.length)} registros en total`;
}

// ─── Virtual scrolling ────────────────────────────────────────────────────────
function setupVirtualScroll() {
    const scrollContainer = document.getElementById('db-scroll-container');
    if (!scrollContainer) return;

    scrollContainer.onscroll = null;

    // Siempre re-leer la altura real (puede ser 0 si el tab estaba oculto)
    VS.containerH = scrollContainer.clientHeight || scrollContainer.offsetHeight || 520;

    // Si todavía es 0 (tab aun invisible), esperar un frame e intentar de nuevo
    if (VS.containerH < 10) {
        requestAnimationFrame(() => {
            VS.containerH = scrollContainer.clientHeight || scrollContainer.offsetHeight || 520;
            renderVirtualRows(scrollContainer);
        });
    } else {
        renderVirtualRows(scrollContainer);
    }

    scrollContainer.onscroll = () => {
        VS.scrollTop = scrollContainer.scrollTop;
        // Re-leer altura por si cambió el viewport
        VS.containerH = scrollContainer.clientHeight || scrollContainer.offsetHeight || 520;
        renderVirtualRows(scrollContainer);
    };
}

function renderVirtualRows(scrollContainer) {
    const spacerTop  = document.getElementById('db-spacer-top');
    const spacerBot  = document.getElementById('db-spacer-bottom');
    const tbody      = document.getElementById('db-table-body');
    if (!spacerTop || !spacerBot || !tbody) return;

    const total      = VS.filteredData.length;
    const startRow   = Math.max(0, Math.floor(VS.scrollTop / VS.ROW_HEIGHT) - VS.BUFFER);
    const visibleRows = Math.ceil(VS.containerH / VS.ROW_HEIGHT);
    const endRow     = Math.min(total, startRow + visibleRows + VS.BUFFER * 2);

    // Ajustar spacers (no tocar los mismos nodos)
    spacerTop.firstElementChild.style.height = (startRow * VS.ROW_HEIGHT) + 'px';
    spacerBot.firstElementChild.style.height = Math.max(0, (total - endRow) * VS.ROW_HEIGHT) + 'px';

    // Ajustar colspan
    spacerTop.firstElementChild.setAttribute('colspan', columnMap.length);
    spacerBot.firstElementChild.setAttribute('colspan', columnMap.length);

    const fmt = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP',
        minimumFractionDigits: 0, maximumFractionDigits: 0
    });

    // Eliminar filas de datos anteriores (todo entre spacerTop y spacerBot)
    let node = spacerTop.nextSibling;
    while (node && node !== spacerBot) {
        const next = node.nextSibling;
        tbody.removeChild(node);
        node = next;
    }

    if (total === 0) {
        const empty = document.createElement('tr');
        empty.innerHTML = `<td colspan="${columnMap.length}" style="padding:2rem;text-align:center;color:#6b7280;">No hay registros que coincidan con los filtros.</td>`;
        tbody.insertBefore(empty, spacerBot);
        return;
    }

    // Insertar filas nuevas
    const frag = document.createDocumentFragment();
    for (let i = startRow; i < endRow; i++) {
        const row  = VS.filteredData[i];
        const tr   = document.createElement('tr');
        tr.className = 'db-row';
        
        let rowHtml = '';
        for (const col of columnMap) {
            const widthStyle = col.width ? `width:${col.width};min-width:${col.width};max-width:${col.width};` : '';
            let val = '';
            let cellStyle = `padding:0.6rem 0.5rem;${widthStyle}box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
            
            if (col.key === 'fa') {
                val = getFechaAcumula(row);
            } else if (col.key === 'cant') {
                val = row.cant ?? 0;
                cellStyle += 'text-align:right;';
            } else if (col.key === 'v') {
                val = fmt.format(row.v ?? 0);
                cellStyle += 'text-align:right;font-weight:500;';
            } else if (col.key === 'pa') {
                val = row.pa ? 'Q' + row.pa : 'Q1';
            } else if (col.key === 'na') {
                const naStyle = (row.na === 'DEDUCCION' || row.na === 'DESCUENTO' || row.na === 'DEDUCCIÓN')
                    ? 'background:#fee2e2;color:#b91c1c;'
                    : 'background:#dcfce7;color:#15803d;';
                val = `<span style="padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.7rem;font-weight:600;${naStyle}">${row.na ?? ''}</span>`;
            } else if (col.key === 'c') {
                val = row.c ?? '';
                cellStyle += 'font-family:monospace;';
            } else {
                val = row[col.key] ?? '';
            }
            
            rowHtml += `<td style="${cellStyle}">${val}</td>`;
        }
        
        tr.innerHTML = rowHtml;
        frag.appendChild(tr);
    }
    tbody.insertBefore(frag, spacerBot);
}

// ─── Export to Excel ──────────────────────────────────────────────────────────
window.exportDbToExcel = function () {
    const showAlert = (msg) => {
        if (typeof window.showNomaiAlert === 'function') {
            window.showNomaiAlert(msg);
        } else {
            alert(msg);
        }
    };

    if (!window.XLSX) {
        showAlert('La librería XLSX no está cargada.');
        return;
    }
    const dataToExport = VS.filteredData || [];
    if (!dataToExport.length) {
        showAlert('No hay registros para exportar.');
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (overlay && loadingText) {
        loadingText.innerText = 'Generando archivo Excel...';
        overlay.classList.remove('hide');
    }

    setTimeout(() => {
        try {
            const headers = columnMap.map(col => col.label);
            const rows = dataToExport.map(row => {
                return columnMap.map(col => {
                    if (col.key === 'fa') {
                        return getFechaAcumula(row);
                    } else if (col.key === 'pa') {
                        return row.pa ? 'Q' + row.pa : 'Q1';
                    } else if (col.isNumber) {
                        return row[col.key] !== undefined ? (parseFloat(row[col.key]) || 0) : 0;
                    } else {
                        return row[col.key] ?? '';
                    }
                });
            });

            const sheetData = [headers, ...rows];
            const newWb = XLSX.utils.book_new();
            const newWs = XLSX.utils.aoa_to_sheet(sheetData);

            // Auto-ajustar anchos
            const colWidths = headers.map((header, colIndex) => {
                let maxLength = header.length;
                const sampleSize = Math.min(200, rows.length);
                for (let i = 0; i < sampleSize; i++) {
                    const val = String(rows[i][colIndex] || '');
                    if (val.length > maxLength) {
                        maxLength = val.length;
                    }
                }
                return { wch: Math.min(40, maxLength + 3) };
            });
            newWs['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(newWb, newWs, 'Base de Datos');

            let filename = 'Base_de_Datos_Nomai.xlsx';
            if (dataToExport.length < (window.state?.data?.length || 0)) {
                filename = 'Base_de_Datos_Filtrada.xlsx';
            }
            XLSX.writeFile(newWb, filename);

        } catch (error) {
            console.error('Error al exportar a Excel:', error);
            showAlert('Ocurrió un error al exportar a Excel.');
        } finally {
            if (overlay) {
                overlay.classList.add('hide');
            }
        }
    }, 100);
};
