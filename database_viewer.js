/**
 * NOMAI BATCH MANAGER & DATABASE VIEWER
 * Handles multiple dataset loads and Excel-like filtering.
 */

document.addEventListener('DOMContentLoaded', () => {
    initDatabaseViewer();
    
    // Escuchar cuando el importador carga nuevos lotes
    document.addEventListener('nomai:batchesUpdated', () => {
        renderBatchesList();
        refreshDatabaseTable();
    });

    // Refrescar tabla cuando el usuario navega a la pestaña de Base de Datos
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link[data-tab="database"]');
        if (link) {
            // Pequeño delay para que switchTab termine de mostrar el panel
            setTimeout(() => {
                renderBatchesList();
                refreshDatabaseTable();
            }, 50);
        }
    });
});

let dbPagination = {
    currentPage: 1,
    pageSize: 100,
    totalRows: 0,
    filteredData: []
};

let dbFilters = {
    a: '', // Año
    m: '', // Mes
    pa: '', // Quincena
    c: '', // Cedula
    n: '', // Nombre
    cg: '', // Cargo
    cc: '', // Ceco
    na: '', // Naturaleza
    co: '', // Concepto
    v: ''   // Valor
};

let dbSort = {
    column: null,
    direction: 'asc' // 'asc' o 'desc'
};

const columnMap = [
    { key: 'a', label: 'Año' },
    { key: 'm', label: 'Mes' },
    { key: 'pa', label: 'Quincena' },
    { key: 'c', label: 'Cédula' },
    { key: 'n', label: 'Nombre' },
    { key: 'cg', label: 'Cargo' },
    { key: 'cc', label: 'Centro Costo' },
    { key: 'na', label: 'Naturaleza' },
    { key: 'co', label: 'Concepto' },
    { key: 'v', label: 'Valor', isNumber: true }
];

function initDatabaseViewer() {
    renderTableHeaders();
    setupPaginationButtons();
}

function renderBatchesList() {
    const listContainer = document.getElementById('nomai-batch-list');
    if (!listContainer) return;
    
    const batches = window.state?.batches || [];
    
    if (batches.length === 0) {
        listContainer.innerHTML = '<div style="color: #9ca3af; font-size: 0.875rem; font-style: italic;">No hay lotes cargados actualmente.</div>';
        return;
    }
    
    let html = '';
    batches.forEach((b, index) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem;">
                <div>
                    <div style="font-weight: 600; color: #1e293b; font-size: 0.875rem;">Lote ${index + 1}: ${b.name}</div>
                    <div style="color: #64748b; font-size: 0.75rem;">Cargado el: ${b.date} • ${b.data.length.toLocaleString()} registros</div>
                </div>
                <button class="btn btn-outline" style="color: #ef4444; border-color: #ef4444; padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteBatch('${b.id}')">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px; margin-right: 4px;"></i> Eliminar
                </button>
            </div>
        `;
    });
    
    listContainer.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

window.deleteBatch = function(batchId) {
    if (!window.state || !window.state.batches) return;
    
    if (!confirm('¿Estás seguro de que deseas eliminar este lote? Los datos se recalcularán.')) return;
    
    // Filtrar el lote a eliminar
    window.state.batches = window.state.batches.filter(b => b.id !== batchId);
    
    // Reconstruir window.state.data con concat para evitar stack overflow en datos masivos
    let allData = [];
    window.state.batches.forEach(batch => {
        allData = allData.concat(batch.data.filter(d => d.na !== 'BENEFICIO'));
    });
    window.state.data = allData;
    
    // Actualizar UI
    renderBatchesList();
    refreshDatabaseTable();
    
    // Refrescar caché de filtros y el Dashboard principal
    if (typeof window.initUniqueValuesCache === 'function') {
        window.initUniqueValuesCache();
    }
    if (typeof window.updateAll === 'function') {
        // Reiniciar filtros globales para evitar inconsistencias
        window.state.filters = { years: [], months: [], types: [], cecos: [], quincenas: [] };
        window.updateAll();
    }
    
    // Actualizar botones de hojas si existen
    if (typeof window.updateSheetOptionsAfterDelete === 'function') {
        window.updateSheetOptionsAfterDelete(batchId);
    }
};

function renderTableHeaders() {
    const headerRow = document.getElementById('db-table-headers');
    const filterRow = document.getElementById('db-table-filters');
    if (!headerRow || !filterRow) return;
    
    let headersHtml = '';
    let filtersHtml = '';
    
    columnMap.forEach(col => {
        // Cabecera con botón de ordenamiento
        headersHtml += `
            <th style="padding: 0.75rem 1rem; cursor: pointer; user-select: none;" onclick="handleDbSort('${col.key}')">
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                    ${col.label}
                    <span id="db-sort-icon-${col.key}" style="color: #cbd5e1; font-size: 0.75rem;">↕</span>
                </div>
            </th>
        `;
        
        // Fila de inputs para filtrar
        filtersHtml += `
            <th style="padding: 0.5rem 1rem;">
                <input type="text" placeholder="Filtrar..." style="width: 100%; min-width: 80px; padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white;" data-col="${col.key}" onkeyup="handleDbFilter(event)">
            </th>
        `;
    });
    
    headerRow.innerHTML = headersHtml;
    filterRow.innerHTML = filtersHtml;
}

window.handleDbSort = function(columnKey) {
    if (dbSort.column === columnKey) {
        dbSort.direction = dbSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        dbSort.column = columnKey;
        dbSort.direction = 'asc';
    }
    
    // Actualizar íconos
    columnMap.forEach(col => {
        const icon = document.getElementById(`db-sort-icon-${col.key}`);
        if (icon) {
            if (col.key === columnKey) {
                icon.innerHTML = dbSort.direction === 'asc' ? '↑' : '↓';
                icon.style.color = '#4f46e5';
            } else {
                icon.innerHTML = '↕';
                icon.style.color = '#cbd5e1';
            }
        }
    });
    
    applyFiltersAndSort();
};

window.handleDbFilter = function(event) {
    const input = event.target;
    const colKey = input.getAttribute('data-col');
    dbFilters[colKey] = input.value.toLowerCase();
    
    // Resetear a página 1 al filtrar
    dbPagination.currentPage = 1;
    applyFiltersAndSort();
};

function refreshDatabaseTable() {
    dbPagination.currentPage = 1;
    applyFiltersAndSort();
}

function applyFiltersAndSort() {
    let data = window.state?.data || [];
    
    // 1. Aplicar Filtros
    dbPagination.filteredData = data.filter(row => {
        for (let i = 0; i < columnMap.length; i++) {
            const col = columnMap[i];
            const filterValue = dbFilters[col.key];
            if (filterValue) {
                const cellValue = String(row[col.key] || '').toLowerCase();
                if (!cellValue.includes(filterValue)) {
                    return false;
                }
            }
        }
        return true;
    });
    
    // 2. Aplicar Ordenamiento
    if (dbSort.column) {
        const isNum = columnMap.find(c => c.key === dbSort.column)?.isNumber;
        dbPagination.filteredData.sort((a, b) => {
            let valA = a[dbSort.column];
            let valB = b[dbSort.column];
            
            if (isNum) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
                return dbSort.direction === 'asc' ? valA - valB : valB - valA;
            } else {
                valA = String(valA || '').toLowerCase();
                valB = String(valB || '').toLowerCase();
                if (valA < valB) return dbSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return dbSort.direction === 'asc' ? 1 : -1;
                return 0;
            }
        });
    }
    
    dbPagination.totalRows = dbPagination.filteredData.length;
    renderTableBody();
}

function renderTableBody() {
    const tbody = document.getElementById('db-table-body');
    const infoSpan = document.getElementById('db-table-info');
    if (!tbody) return;
    
    const startIdx = (dbPagination.currentPage - 1) * dbPagination.pageSize;
    const endIdx = startIdx + dbPagination.pageSize;
    const pageData = dbPagination.filteredData.slice(startIdx, endIdx);
    
    let html = '';
    
    if (pageData.length === 0) {
        html = '<tr><td colspan="10" style="padding: 2rem; text-align: center; color: #6b7280;">No hay registros que coincidan con los filtros.</td></tr>';
    } else {
        const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
        
        pageData.forEach(row => {
            html += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 0.75rem 1rem;">${row.a || ''}</td>
                    <td style="padding: 0.75rem 1rem;">${row.m || ''}</td>
                    <td style="padding: 0.75rem 1rem;">${row.pa ? 'Q' + row.pa : 'Q1'}</td>
                    <td style="padding: 0.75rem 1rem; font-family: monospace;">${row.c || ''}</td>
                    <td style="padding: 0.75rem 1rem;">${row.n || ''}</td>
                    <td style="padding: 0.75rem 1rem; font-size: 0.75rem;">${row.cg || ''}</td>
                    <td style="padding: 0.75rem 1rem; font-size: 0.75rem;">${row.cc || ''}</td>
                    <td style="padding: 0.75rem 1rem;">
                        <span style="padding: 0.125rem 0.375rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; background-color: ${row.na === 'DEDUCCION' ? '#fee2e2' : '#dcfce7'}; color: ${row.na === 'DEDUCCION' ? '#b91c1c' : '#15803d'};">
                            ${row.na || ''}
                        </span>
                    </td>
                    <td style="padding: 0.75rem 1rem;">${row.co || ''}</td>
                    <td style="padding: 0.75rem 1rem; text-align: right; font-weight: 500;">${formatMoney(row.v || 0)}</td>
                </tr>
            `;
        });
    }
    
    tbody.innerHTML = html;
    
    // Actualizar Info y Paginación
    const totalPages = Math.max(1, Math.ceil(dbPagination.totalRows / dbPagination.pageSize));
    const pageCurrent = document.getElementById('db-page-current');
    const pageTotal = document.getElementById('db-page-total');
    if (pageCurrent) pageCurrent.textContent = dbPagination.currentPage;
    if (pageTotal) pageTotal.textContent = totalPages;
    
    const countFormatter = new Intl.NumberFormat('es-CO');
    if (infoSpan) {
        infoSpan.textContent = `Mostrando ${startIdx + 1} - ${Math.min(endIdx, dbPagination.totalRows)} de ${countFormatter.format(dbPagination.totalRows)} registros`;
    }
    
    const btnPrev = document.getElementById('db-btn-prev');
    const btnNext = document.getElementById('db-btn-next');
    if (btnPrev) btnPrev.disabled = dbPagination.currentPage === 1;
    if (btnNext) btnNext.disabled = dbPagination.currentPage === totalPages;
}

function setupPaginationButtons() {
    const btnPrev = document.getElementById('db-btn-prev');
    const btnNext = document.getElementById('db-btn-next');
    
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (dbPagination.currentPage > 1) {
                dbPagination.currentPage--;
                renderTableBody();
            }
        });
    }
    
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const totalPages = Math.ceil(dbPagination.totalRows / dbPagination.pageSize);
            if (dbPagination.currentPage < totalPages) {
                dbPagination.currentPage++;
                renderTableBody();
            }
        });
    }
}
