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
            }, 60);
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
    { key: 'a',  label: 'Año' },
    { key: 'm',  label: 'Mes' },
    { key: 'pa', label: 'Quincena' },
    { key: 'c',  label: 'Cédula' },
    { key: 'n',  label: 'Nombre' },
    { key: 'cg', label: 'Cargo' },
    { key: 'cc', label: 'Centro Costo' },
    { key: 'na', label: 'Naturaleza' },
    { key: 'co', label: 'Concepto' },
    { key: 'v',  label: 'Valor', isNumber: true },
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

    headerRow.innerHTML = columnMap.map(col => `
        <th style="padding:0.75rem 1rem;cursor:pointer;user-select:none;white-space:nowrap;"
            onclick="handleDbSort('${col.key}')">
            <div style="display:flex;align-items:center;gap:0.25rem;">
                ${col.label}
                <span id="db-sort-icon-${col.key}" style="color:#cbd5e1;font-size:0.75rem;">↕</span>
            </div>
        </th>`).join('');

    filterRow.innerHTML = columnMap.map(col => `
        <th style="padding:0.5rem 1rem;">
            <input type="text" placeholder="Filtrar…"
                   style="width:100%;min-width:70px;padding:0.25rem 0.5rem;font-size:0.75rem;
                          border:1px solid #d1d5db;border-radius:0.25rem;background:white;"
                   data-col="${col.key}" onkeyup="handleDbFilter(event)">
        </th>`).join('');
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

    // Remove old listener before adding new one
    scrollContainer.onscroll = null;

    VS.containerH = scrollContainer.clientHeight || 520;

    renderVirtualRows(scrollContainer);

    scrollContainer.onscroll = () => {
        VS.scrollTop = scrollContainer.scrollTop;
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
        empty.innerHTML = '<td colspan="10" style="padding:2rem;text-align:center;color:#6b7280;">No hay registros que coincidan con los filtros.</td>';
        tbody.insertBefore(empty, spacerBot);
        return;
    }

    // Insertar filas nuevas
    const frag = document.createDocumentFragment();
    for (let i = startRow; i < endRow; i++) {
        const row  = VS.filteredData[i];
        const tr   = document.createElement('tr');
        const bg   = i % 2 === 0 ? '#ffffff' : '#f9fafb';
        const naStyle = row.na === 'DEDUCCION'
            ? 'background:#fee2e2;color:#b91c1c;'
            : 'background:#dcfce7;color:#15803d;';
        tr.style.cssText = `border-bottom:1px solid #f3f4f6;background:${bg};`;
        tr.innerHTML = `
            <td style="padding:0.6rem 1rem;">${row.a ?? ''}</td>
            <td style="padding:0.6rem 1rem;">${row.m ?? ''}</td>
            <td style="padding:0.6rem 1rem;">${row.pa ? 'Q' + row.pa : 'Q1'}</td>
            <td style="padding:0.6rem 1rem;font-family:monospace;">${row.c ?? ''}</td>
            <td style="padding:0.6rem 1rem;">${row.n ?? ''}</td>
            <td style="padding:0.6rem 1rem;font-size:0.75rem;">${row.cg ?? ''}</td>
            <td style="padding:0.6rem 1rem;font-size:0.75rem;">${row.cc ?? ''}</td>
            <td style="padding:0.6rem 1rem;">
                <span style="padding:0.125rem 0.5rem;border-radius:9999px;font-size:0.7rem;font-weight:600;${naStyle}">
                    ${row.na ?? ''}
                </span>
            </td>
            <td style="padding:0.6rem 1rem;">${row.co ?? ''}</td>
            <td style="padding:0.6rem 1rem;text-align:right;font-weight:500;">${fmt.format(row.v ?? 0)}</td>`;
        frag.appendChild(tr);
    }
    tbody.insertBefore(frag, spacerBot);
}
