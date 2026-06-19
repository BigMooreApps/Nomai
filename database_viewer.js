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

let dbFilters = {
    a: '', m: '', pa: '', c: '', n: '', cg: '', cc: '', na: '', co: '', v: ''
};

let dbSort = { column: null, direction: 'asc' };

const columnMap = [
    { key: 'a',   label: 'Año', width: '65px' },
    { key: 'm',   label: 'Mes', width: '85px' },
    { key: 'pa',  label: 'Quincena', width: '90px' },
    { key: 'tn',  label: 'Tipo Nómina', width: '110px' },
    { key: 'c',   label: 'Cédula', width: '105px' },
    { key: 'n',   label: 'Nombre' },
    { key: 'cg',  label: 'Cargo' },
    { key: 'cc',  label: 'Código CECO', width: '110px' },
    { key: 'dcc', label: 'Centro de Costo' },
    { key: 'na',  label: 'Naturaleza', width: '115px' },
    { key: 't',   label: 'Tipo', width: '90px' },
    { key: 'co',  label: 'Concepto' },
    { key: 'cant',label: 'Cantidad', isNumber: true, width: '80px' },
    { key: 'v',   label: 'Valor', isNumber: true, width: '120px' },
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

    el.innerHTML = batches.map((b, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:0.75rem 1rem;background:#f8fafc;border:1px solid #e2e8f0;
                    border-radius:0.5rem;">
            <div>
                <div style="font-weight:600;color:#1e293b;font-size:0.875rem;">
                    Lote ${i + 1}: ${b.name}
                </div>
                <div style="color:#64748b;font-size:0.75rem;">
                    Cargado el: ${b.date} &bull; ${b.data.length.toLocaleString('es-CO')} registros
                </div>
            </div>
            <button class="btn btn-outline"
                    style="color:#ef4444;border-color:#ef4444;padding:0.25rem 0.5rem;font-size:0.75rem;"
                    onclick="deleteBatch('${b.id}')">
                <i data-lucide="trash-2" style="width:14px;height:14px;margin-right:4px;"></i> Eliminar
            </button>
        </div>`).join('');

    if (window.lucide) window.lucide.createIcons();
}

window.deleteBatch = function (batchId) {
    if (!window.state?.batches) return;
    if (!confirm('¿Estás seguro de que deseas eliminar este lote? Los datos se recalcularán.')) return;

    window.state.batches = window.state.batches.filter(b => b.id !== batchId);

    let allData = [];
    window.state.batches.forEach(batch => {
        allData = allData.concat(batch.data.filter(d => d.na !== 'BENEFICIO'));
    });
    window.state.data = allData;

    renderBatchesList();
    refreshDatabaseTable();

    if (typeof window.initUniqueValuesCache === 'function') window.initUniqueValuesCache();
    if (typeof window.updateAll === 'function') {
        window.state.filters = { years: [], months: [], types: [], cecos: [], quincenas: [] };
        window.updateAll();
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
            <th style="padding:0.75rem 0.5rem;cursor:pointer;user-select:none;white-space:nowrap;${widthStyle}box-sizing:border-box;"
                onclick="handleDbSort('${col.key}')">
                <div style="display:flex;align-items:center;gap:0.25rem;overflow:hidden;text-overflow:ellipsis;">
                    ${col.label}
                    <span id="db-sort-icon-${col.key}" style="color:#cbd5e1;font-size:0.75rem;flex-shrink:0;">↕</span>
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
            if (fv && !String(row[col.key] ?? '').toLowerCase().includes(fv)) return false;
        }
        return true;
    });

    // Sort
    if (dbSort.column) {
        const isNum = columnMap.find(c => c.key === dbSort.column)?.isNumber;
        VS.filteredData.sort((a, b) => {
            let va = a[dbSort.column], vb = b[dbSort.column];
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
        empty.innerHTML = '<td colspan="14" style="padding:2rem;text-align:center;color:#6b7280;">No hay registros que coincidan con los filtros.</td>';
        tbody.insertBefore(empty, spacerBot);
        return;
    }

    // Insertar filas nuevas
    const frag = document.createDocumentFragment();
    for (let i = startRow; i < endRow; i++) {
        const row  = VS.filteredData[i];
        const tr   = document.createElement('tr');
        const bg   = i % 2 === 0 ? '#ffffff' : '#f9fafb';
        const naStyle = (row.na === 'DEDUCCION' || row.na === 'DESCUENTO' || row.na === 'DEDUCCIÓN')
            ? 'background:#fee2e2;color:#b91c1c;'
            : 'background:#dcfce7;color:#15803d;';
        tr.style.cssText = `border-bottom:1px solid #f3f4f6;background:${bg};`;
        tr.innerHTML = `
            <td style="padding:0.6rem 0.5rem;width:65px;min-width:65px;max-width:65px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.a ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;width:85px;min-width:85px;max-width:85px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.m ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;width:90px;min-width:90px;max-width:90px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.pa ? 'Q' + row.pa : 'Q1'}</td>
            <td style="padding:0.6rem 0.5rem;font-size:0.75rem;width:110px;min-width:110px;max-width:110px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.tn ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;font-family:monospace;width:105px;min-width:105px;max-width:105px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.c ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.n ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.cg ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;font-size:0.75rem;width:110px;min-width:110px;max-width:110px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.cc ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.dcc ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;width:115px;min-width:115px;max-width:115px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                <span style="padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.7rem;font-weight:600;${naStyle}">
                    ${row.na ?? ''}
                </span>
            </td>
            <td style="padding:0.6rem 0.5rem;font-size:0.75rem;width:90px;min-width:90px;max-width:90px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.t ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.co ?? ''}</td>
            <td style="padding:0.6rem 0.5rem;text-align:right;width:80px;min-width:80px;max-width:80px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.cant ?? 0}</td>
            <td style="padding:0.6rem 0.5rem;text-align:right;font-weight:500;width:120px;min-width:120px;max-width:120px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fmt.format(row.v ?? 0)}</td>`;
        frag.appendChild(tr);
    }
    tbody.insertBefore(frag, spacerBot);
}

// ─── Export to Excel ──────────────────────────────────────────────────────────
window.exportDbToExcel = function () {
    if (!window.XLSX) {
        alert('La librería XLSX no está cargada.');
        return;
    }
    const dataToExport = VS.filteredData || [];
    if (!dataToExport.length) {
        alert('No hay registros para exportar.');
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
            const rows = dataToExport.map(row => [
                row.a ?? '',
                row.m ?? '',
                row.pa ? 'Q' + row.pa : 'Q1',
                row.tn ?? '',
                row.c ?? '',
                row.n ?? '',
                row.cg ?? '',
                row.cc ?? '',
                row.dcc ?? '',
                row.na ?? '',
                row.t ?? '',
                row.co ?? '',
                row.cant !== undefined ? (parseFloat(row.cant) || 0) : 0,
                row.v !== undefined ? (parseFloat(row.v) || 0) : 0
            ]);

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
            alert('Ocurrió un error al exportar a Excel.');
        } finally {
            if (overlay) {
                overlay.classList.add('hide');
            }
        }
    }, 100);
};
