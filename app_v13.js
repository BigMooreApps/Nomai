/**
 * Logica del Dashboard de Nomina y Netos
 * Utiliza Chart.js para graficos, SheetJS para importacion de Excel y Lucide para iconos.
 */

// Mapeo ordenado de meses para ordenar cronologicamente
const MONTH_ORDER = {
    "Enero": 1, "Febrero": 2, "Marzo": 3, "Abril": 4, "Mayo": 5, "Junio": 6,
    "Julio": 7, "Agosto": 8, "Septiembre": 9, "Octubre": 10, "Noviembre": 11, "Diciembre": 12
};

const MONTHS_LIST = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function getQuincenaLabel(p) {
    if (!p) return "";
    const pInt = parseInt(p);
    const mIdx = Math.ceil(pInt / 2) - 1;
    const q = (pInt % 2 === 1) ? "Q1" : "Q2";
    const monthName = MONTHS_LIST[mIdx % 12];
    return `${q} ${monthName}`;
}

// Formateador de moneda en Pesos Colombianos (COP) sin decimales
const currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

// Formateador corto (ej. $1.2M)
function formatShortCurrency(value) {
    const absVal = Math.abs(value);
    if (absVal >= 1e6) {
        return (value / 1e6).toFixed(1) + 'M';
    } else if (absVal >= 1e3) {
        return (value / 1e3).toFixed(0) + 'k';
    }
    return value;
}

// Etiquetas legibles de Tipo de Nómina
const TIPO_NOMINA_LABELS = {
    'N': 'Normal',
    'C': 'Complementaria',
    'A': 'Ajuste',
    'D': 'Directivo',
    'V': 'Vacaciones',
    'X': 'Extra'
};

// Estado de la aplicacion
const state = {
    data: [],              // Datos brutos cargados
    filteredData: [],      // Datos filtrados
    selectedYears: [],     // Array de años seleccionados
    selectedMonths: [],    // Array de meses seleccionados
    selectedQuincenas: [], // Array de quincenas seleccionadas
    selectedTipoNomina: [],    // Array de tipos de nómina seleccionados (vacío = todos)
    activeTab: 'overview', // Pestaña activa
    charts: {},            // Instancias de graficos de Chart.js
    
    // Vista Empleado
    selectedEmployeeCedula: '',
    employeeDetailPeriod: 'ALL',
    employeeDetailConcept: 'ALL',
    
    // Vista Concepto
    selectedConceptName: '',
    
    // Vista Comparativa
    compareEmployees: [],   // Lista de cedulas a comparar
    compareConcepts: [],    // Lista de conceptos a filtrar
    compareCargos: [],      // Lista de cargos a filtrar
    compareCecos: [],       // Lista de cecos a filtrar
    
    // Vista Comparativa de Periodos (Imagen)
    comparePeriod1: '',     // Periodo 1 (Base)
    comparePeriod2: '',     // Periodo 2 (Comparado)
    periodCompareSearchQuery: '',
    periodCompareExpanded: false,
    periodCompareSelectedEmployees: [],
    
    // Vista Comparativa de Conceptos
    conceptComparePeriod1: '',
    conceptComparePeriod2: '',
    conceptCompareSearchQuery: '',
    conceptCompareExpanded: false,
    conceptCompareSelectedConcepts: [],
    
    // Vista Comparativa de Centros de Costo
    cecoComparePeriod1: '',
    cecoComparePeriod2: '',
    cecoCompareSearchQuery: '',
    cecoCompareExpanded: false,
    cecoCompareSelectedCecos: [],
    
    // Vista Comparativa de Cargos
    cargoComparePeriod1: '',
    cargoComparePeriod2: '',
    cargoCompareSearchQuery: '',
    cargoCompareExpanded: false,
    cargoCompareSelectedCargos: [],
    
    // Configuración de carpeta local
    folderHandle: null,
    folderFiles: [],
    
    // Caché de valores únicos
    uniqueYears: [],
    uniqueMonths: [],
    uniqueQuincenas: [],
    uniquePeriods: [],
    uniquePeople: [],
    uniqueConcepts: [],
    periodDataMap: {}
};

// Inicializacion de la Aplicacion al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar datos iniciales desde data.js si existen
    if (window.PAYROLL_DATA && window.PAYROLL_DATA.length > 0) {
        state.data = window.PAYROLL_DATA.filter(d => d.na !== 'BENEFICIO');
    } else {
        console.warn("No se encontraron datos pre-cargados en window.PAYROLL_DATA.");
    }
    
    // Inicializar caché de valores únicos
    initUniqueValuesCache();
    
    // 2. Inicializar componentes y eventos
    initSidebar();
    initHeaderTabs();
    initGlobalFilters();
    initImporter();
    initPeriodCompareSelectors();
    initConceptCompareSelectors();
    initCecoCompareSelectors();
    initCargoCompareSelectors();
    initFilterModal(); // Modal centralizado de filtros de Comparativas
    initEmployeeDetailFilters();
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Cerrar dropdowns personalizados al hacer click fuera
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (!d.contains(e.target)) {
                d.classList.remove('active');
            }
        });
    });
    
    // 3. Procesar datos y renderizar vista por defecto
    processData();
    switchTab('overview');
});


// Inicializa los clicks en el Sidebar y el boton toggle
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    // Prevenir duplicidad de listeners si se vuelve a llamar esta función
    if (sidebar.dataset.listenerBound) return;
    sidebar.dataset.listenerBound = 'true';

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const closeMobileSidebar = () => {
        sidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    };

    const openMobileSidebar = () => {
        sidebar.classList.add('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    };

    // Escuchar clicks en los enlaces del sidebar que tengan data-tab (navegación real)
    const navLinks = document.querySelectorAll('.nav-link[data-tab]');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            if (tabId) {
                switchTab(tabId);
            }
            closeMobileSidebar();
        });
    });
    
    // Toggle del Sidebar colapsable
    const toggleBtn = document.getElementById('sidebar-toggle');
    const toggleBtnBottom = document.getElementById('sidebar-toggle-bottom');
    
    const handleToggle = () => {
        sidebar.classList.toggle('collapsed');
        
        // Al colapsar el sidebar, cerramos todos los dropdowns abiertos para limpieza visual
        if (sidebar.classList.contains('collapsed')) {
            document.querySelectorAll('.dropdown').forEach(d => {
                d.classList.remove('open');
            });
        }
        
        // Actualizar iconos de ambos botones de toggle
        const btns = [toggleBtn, toggleBtnBottom];
        btns.forEach(btn => {
            if (!btn) return;
            const icon = btn.querySelector('i');
            if (icon) {
                if (sidebar.classList.contains('collapsed')) {
                    icon.setAttribute('data-lucide', 'chevron-right');
                } else {
                    icon.setAttribute('data-lucide', 'chevron-left');
                }
            }
        });
        
        // Re-inicializar iconos de Lucide
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    if (toggleBtn) toggleBtn.addEventListener('click', handleToggle);
    if (toggleBtnBottom) toggleBtnBottom.addEventListener('click', handleToggle);

    // Eventos móviles para abrir/cerrar sidebar
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMobileSidebar();
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            closeMobileSidebar();
        });
    }

    // Manejo de Dropdowns de categorías (Acordeón)
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const dropdown = toggle.closest('.dropdown');
            if (!dropdown) return;
            
            // Si el sidebar está colapsado, al hacer clic lo expandimos primero
            if (sidebar && sidebar.classList.contains('collapsed')) {
                handleToggle();
            }
            
            const isOpen = dropdown.classList.contains('open');
            
            // Cerrar otros dropdowns para un comportamiento limpio de acordeón
            document.querySelectorAll('.dropdown').forEach(d => {
                if (d !== dropdown) {
                    d.classList.remove('open');
                }
            });
            
            // Alternar dropdown actual
            if (isOpen) {
                dropdown.classList.remove('open');
            } else {
                dropdown.classList.add('open');
            }
        });
    });
}

function initHeaderTabs() {
    const headerTabs = document.querySelectorAll('.header-tab');
    headerTabs.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

// ==========================================
// SISTEMA DE CACHÉ DE VALORES ÚNICOS
// ==========================================

function initUniqueValuesCache() {
    console.time("initUniqueValuesCache");
    
    // 1. Years
    const years = new Set();
    state.data.forEach(d => {
        if (d.a) years.add(parseInt(d.a));
    });
    state.uniqueYears = Array.from(years).sort((a, b) => a - b);

    // 2. Months
    const months = new Set();
    state.data.forEach(d => {
        if (d.m) months.add(d.m);
    });
    state.uniqueMonths = Array.from(months).sort((a, b) => (MONTH_ORDER[a] || 0) - (MONTH_ORDER[b] || 0));

    // 3. Quincenas
    const qSet = new Set();
    state.data.forEach(d => {
        if (d.pa !== undefined && d.pa !== null) {
            const qStr = (parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2';
            qSet.add(qStr);
        } else {
            qSet.add('MES');
        }
    });
    state.uniqueQuincenas = Array.from(qSet).sort((a, b) => {
        if (a === 'MES') return -1;
        if (b === 'MES') return 1;
        return a.localeCompare(b);
    });

    // 4. People
    const peopleMap = {};
    state.data.forEach(d => {
        peopleMap[d.c] = d.n;
    });
    state.uniquePeople = Object.keys(peopleMap).map(cedula => ({
        cedula: cedula,
        name: peopleMap[cedula]
    })).sort((a,b) => a.name.localeCompare(b.name));

    // 5. Concepts
    const concepts = new Set();
    state.data.forEach(d => {
        if (d.co) concepts.add(d.co);
    });
    state.uniqueConcepts = Array.from(concepts).sort((a,b) => a.localeCompare(b));

    // 6. Periods Sorted
    const quincenaSet = new Set();
    const monthSet = new Set();
    state.data.forEach(d => {
        if (d.a && d.m) {
            if (d.pa !== undefined && d.pa !== null) {
                const qLabel = (parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2';
                quincenaSet.add(`${d.a} - ${d.m} - ${qLabel}`);
                monthSet.add(`${d.a} - ${d.m} - MES`);
            } else {
                monthSet.add(`${d.a} - ${d.m} - MES`);
            }
        }
    });
    const monthPeriods = Array.from(monthSet).sort((a, b) => {
        const partsA = a.split(' - ');
        const partsB = b.split(' - ');
        const yA = parseInt(partsA[0]);
        const yB = parseInt(partsB[0]);
        if (yA !== yB) return yA - yB;
        const mA = MONTH_ORDER[partsA[1]] || 0;
        const mB = MONTH_ORDER[partsB[1]] || 0;
        return mA - mB;
    });
    const quinPeriods = Array.from(quincenaSet).sort((a, b) => {
        const partsA = a.split(' - ');
        const partsB = b.split(' - ');
        const yA = parseInt(partsA[0]);
        const yB = parseInt(partsB[0]);
        if (yA !== yB) return yA - yB;
        const mA = MONTH_ORDER[partsA[1]] || 0;
        const mB = MONTH_ORDER[partsB[1]] || 0;
        if (mA !== mB) return mA - mB;
        return (partsA[2] || '').localeCompare(partsB[2] || '');
    });
    state.uniquePeriods = [...monthPeriods, ...quinPeriods].sort((a, b) => {
        const partsA = a.split(' - ');
        const partsB = b.split(' - ');
        const yA = parseInt(partsA[0]);
        const yB = parseInt(partsB[0]);
        if (yA !== yB) return yA - yB;
        const mA = MONTH_ORDER[partsA[1]] || 0;
        const mB = MONTH_ORDER[partsB[1]] || 0;
        if (mA !== mB) return mA - mB;
        const qA = partsA[2] || '';
        const qB = partsB[2] || '';
        if (qA === 'MES' && qB !== 'MES') return -1;
        if (qA !== 'MES' && qB === 'MES') return 1;
        return qA.localeCompare(qB);
    });
    
    // 7. Group data by period for O(1) month/year lookup
    state.periodDataMap = {};
    state.data.forEach(d => {
        if (d.a && d.m) {
            const key = `${d.a} - ${d.m}`;
            if (!state.periodDataMap[key]) {
                state.periodDataMap[key] = [];
            }
            state.periodDataMap[key].push(d);
        }
    });
    
    console.timeEnd("initUniqueValuesCache");
}

function getUniqueYears() {
    return state.uniqueYears || [];
}

function getUniqueMonths() {
    return state.uniqueMonths || [];
}

function getUniqueQuincenas() {
    return state.uniqueQuincenas || [];
}

// Inicializa los filtros globales
function initGlobalFilters() {
    // Inicializar con todos los filtros seleccionados si están vacíos
    if (!state.selectedYears || state.selectedYears.length === 0) {
        state.selectedYears = getUniqueYears();
    }
    if (!state.selectedMonths || state.selectedMonths.length === 0) {
        state.selectedMonths = getUniqueMonths();
    }
    if (!state.selectedQuincenas || state.selectedQuincenas.length === 0) {
        state.selectedQuincenas = getUniqueQuincenas();
    }
    
    // Si no hay tipos seleccionados, inicializar vacío (=todos)
    if (!Array.isArray(state.selectedTipoNomina)) {
        state.selectedTipoNomina = [];
    }
    
    // Botón de limpiar filtros globales
    const btnClear = document.getElementById('btn-clear-filters');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            state.selectedYears = getUniqueYears();
            state.selectedMonths = getUniqueMonths();
            state.selectedQuincenas = getUniqueQuincenas();
            state.selectedTipoNomina = []; // vacío = todos
            
            processData();
            renderActiveTab();
        });
    }
}

// Las etiquetas globales de selección ya no se renderizan en la barra principal por requerimiento de diseño.

// Cambiar de pestaña activa
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Activar link en sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-tab') === tabId) {
            link.classList.add('active');
            
            // Si el enlace activo está dentro de un dropdown, lo abrimos y cerramos los otros
            const parentDropdown = link.closest('.dropdown');
            if (parentDropdown) {
                document.querySelectorAll('.dropdown').forEach(d => {
                    if (d !== parentDropdown) d.classList.remove('open');
                });
                parentDropdown.classList.add('open');
            } else {
                // Si está en el nivel superior, cerramos todos los dropdowns
                document.querySelectorAll('.dropdown').forEach(d => {
                    d.classList.remove('open');
                });
            }
        } else {
            link.classList.remove('active');
        }
    });
    
    // Activar link en header
    document.querySelectorAll('.header-tab').forEach(link => {
        if (link.getAttribute('data-tab') === tabId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Activar contenedor de contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === `tab-${tabId}`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Manejar la visibilidad de la toolbar de filtros global
    const filterToolbar = document.getElementById('global-filter-toolbar');
    const dateFiltersGroup = document.getElementById('date-filters-group');
    const divider = document.getElementById('filter-divider-1');
    
    if (filterToolbar) {
        if (tabId === 'importer' || tabId === 'period-compare' || tabId === 'concept-compare' || tabId === 'ceco-compare' || tabId === 'cargo-compare') {
            // Ocultar toda la barra en importador y en análisis masivo (tienen sus propios filtros inline)
            filterToolbar.classList.add('hidden');
        } else {
            filterToolbar.classList.remove('hidden');
            // Mostrar todos los grupos de filtros
            if (dateFiltersGroup) dateFiltersGroup.classList.remove('hidden');
            if (divider) divider.classList.remove('hidden');
        }
    }

    
    renderActiveTab();
}

// Procesa y filtra los datos en memoria segun los filtros globales (años, meses, quincenas)
function processData() {
    const allYears = getUniqueYears();
    const allMonths = getUniqueMonths();
    const allQuincenas = getUniqueQuincenas();
    
    const hasYearFilter = state.selectedYears && state.selectedYears.length > 0 && state.selectedYears.length < allYears.length;
    const yearSet = hasYearFilter ? new Set(state.selectedYears.map(Number)) : null;
    
    const hasMonthFilter = state.selectedMonths && state.selectedMonths.length > 0 && state.selectedMonths.length < allMonths.length;
    const monthSet = hasMonthFilter ? new Set(state.selectedMonths) : null;
    
    const hasQuincenaFilter = state.selectedQuincenas && state.selectedQuincenas.length > 0 && state.selectedQuincenas.length < allQuincenas.length;
    const qSet = hasQuincenaFilter ? new Set(state.selectedQuincenas) : null;
    
    const hasTnFilter = Array.isArray(state.selectedTipoNomina) && state.selectedTipoNomina.length > 0;
    const tnSet = hasTnFilter ? new Set(state.selectedTipoNomina) : null;

    if ((state.selectedYears && state.selectedYears.length === 0) ||
        (state.selectedMonths && state.selectedMonths.length === 0) ||
        (state.selectedQuincenas && state.selectedQuincenas.length === 0)) {
        state.filteredData = [];
        return;
    }
    
    if (!hasYearFilter && !hasMonthFilter && !hasQuincenaFilter && !hasTnFilter) {
        state.filteredData = state.data;
        return;
    }
    
    state.filteredData = state.data.filter(d => {
        if (hasYearFilter && !yearSet.has(Number(d.a))) return false;
        if (hasMonthFilter && !monthSet.has(d.m)) return false;
        if (hasQuincenaFilter) {
            const hasQuincena = (d.pa !== undefined && d.pa !== null);
            const qStr = hasQuincena ? ((parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2') : 'MES';
            if (!qSet.has(qStr)) return false;
        }
        if (hasTnFilter && !tnSet.has(d.tn)) return false;
        return true;
    });
    
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
}

// Renderiza la pestaña seleccionada
function renderActiveTab() {
    // Destruir todos los graficos previos para evitar fallos de canvas
    destroyCharts();
    
    // Inicializar iconos de Lucide
    setTimeout(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, 50);

    if (state.data.length === 0) {
        showEmptyStateMessage();
        return;
    }
    
    switch (state.activeTab) {
        case 'overview':
            renderOverview();
            break;
        case 'employee':
            renderEmployeeView();
            break;
        case 'concept':
            renderConceptView();
            break;
        case 'comparison':
            renderComparisonView();
            break;
        case 'period-compare':
            renderPeriodComparison();
            break;
        case 'concept-compare':
            renderConceptComparison();
            break;
        case 'ceco-compare':
            renderCecoComparison();
            break;
        case 'cargo-compare':
            renderCargoComparison();
            break;
        case 'importer':
            // No requiere logica pesada de renderizado, es estatica
            break;
    }
}

function destroyCharts() {
    Object.keys(state.charts).forEach(key => {
        if (state.charts[key] && typeof state.charts[key].destroy === 'function') {
            state.charts[key].destroy();
        }
    });
    state.charts = {};
}

// Muestra un estado vacio si no hay datos
function showEmptyStateMessage() {
    // Si no hay datos, forzar ir a pestaña importador
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => {
        if (c.id !== 'tab-importer') {
            c.innerHTML = `
                <div class="chart-card" style="align-items: center; justify-content: center; padding: 60px; text-align: center;">
                    <i data-lucide="database" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h3 style="margin-bottom: 8px;">No hay datos disponibles</h3>
                    <p style="color: var(--text-secondary); max-width: 400px; margin-bottom: 24px;">Por favor, importa un archivo Excel con la informacion de pagos en la pestaña de Importador.</p>
                    <button class="btn btn-primary" onclick="switchTab('importer')">Ir al Importador</button>
                </div>
            `;
        }
    });
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================
// RENDERIZADO: RESUMEN GENERAL (OVERVIEW)
// ==========================================
function renderOverview() {
    const data = state.filteredData;
    
    // 1. Calculo de KPIs
    let totalDevengos = 0;
    let totalDescuentos = 0; // Guardado negativo, sumamos algebraicamente
    let totalBeneficios = 0;
    const uniqueEmployees = new Set();
    const uniqueConcepts = new Set();
    
    data.forEach(d => {
        if (d.na === 'DEVENGO') {
            totalDevengos += d.v;
        } else if (d.na === 'DESCUENTO') {
            totalDescuentos += d.v;
        } else if (d.na === 'BENEFICIO') {
            totalBeneficios += d.v;
        }
        uniqueEmployees.add(d.c);
        uniqueConcepts.add(d.co);
    });
    
    const totalNeto = totalDevengos + totalDescuentos; // descuentos es negativo
    const avgNet = uniqueEmployees.size > 0 ? (totalNeto / uniqueEmployees.size) : 0;
    
    // Inyectar en HTML
    document.getElementById('overview-total-neto').innerText = currencyFormatter.format(totalNeto);
    document.getElementById('overview-total-empleados').innerText = uniqueEmployees.size;
    document.getElementById('overview-total-conceptos').innerText = uniqueConcepts.size;
    document.getElementById('overview-promedio-salario').innerText = currencyFormatter.format(avgNet);
    
    // Subtitulos detallando el total de Devengos y Descuentos
    document.getElementById('overview-total-neto-sub').innerHTML = `<span class="kpi-sub-item">Ingresos: ${currencyFormatter.format(totalDevengos)}</span><span class="kpi-sub-separator"> | </span><span class="kpi-sub-item">Dctos: ${currencyFormatter.format(Math.abs(totalDescuentos))}</span>`;
    document.getElementById('overview-total-beneficios-sub').innerText = 'En el periodo seleccionado';
    
    // 2. Gráfico: Tendencia Mensual (Neto, Devengos, Descuentos)
    renderOverviewTrendChart(data);
    
    // 3. Gráfico: Distribución por Naturaleza (Doughnut)
    renderOverviewNatureChart(totalDevengos, Math.abs(totalDescuentos));
    
    // 4. Tabla: Resumen Mensual
    renderOverviewMonthlyTable(data);
    
    // 5. Gráficos: Top 10 Centros de Costo y Top 10 Cargos
    renderTopCecosChart(data);
    renderTopCargosChart(data);
}

function renderOverviewTrendChart(data) {
    const ctx = document.getElementById('overview-trend-chart');
    if (!ctx) return;
    
    // Agrupar datos por mes
    const monthlyData = {};
    data.forEach(d => {
        const key = d.m;
        if (!monthlyData[key]) {
            monthlyData[key] = { devengos: 0, descuentos: 0, neto: 0 };
        }
        if (d.na === 'DEVENGO') {
            monthlyData[key].devengos += d.v;
            monthlyData[key].neto += d.v;
        } else if (d.na === 'DESCUENTO') {
            monthlyData[key].descuentos += Math.abs(d.v); // guardar positivo para el grafico de barras apiladas o lineales
            monthlyData[key].neto += d.v; // descuento es negativo en data
        }
    });
    
    // Ordenar meses
    const sortedMonths = Object.keys(monthlyData).sort((a,b) => (MONTH_ORDER[a] || 99) - (MONTH_ORDER[b] || 99));
    
    const labels = sortedMonths;
    const netoVals = sortedMonths.map(m => monthlyData[m].neto);
    const devVals = sortedMonths.map(m => monthlyData[m].devengos);
    const descVals = sortedMonths.map(m => monthlyData[m].descuentos);
    
    state.charts['overviewTrend'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Neto Pagado',
                    data: netoVals,
                    type: 'line',
                    borderColor: '#6C00D3',
                    borderWidth: 3,
                    backgroundColor: 'rgba(108,0,211,0.06)',
                    pointBackgroundColor: '#6C00D3',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4,
                    order: 0
                },
                {
                    label: 'Ingresos (Devengos)',
                    data: devVals,
                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    order: 1
                },
                {
                    label: 'Deducciones (Descuentos)',
                    data: descVals,
                    backgroundColor: 'rgba(239, 68, 68, 0.18)',
                    borderColor: '#ef4444',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#6B7280', font: { family: 'Outfit', size: 11 }, boxWidth: 12, padding: 16 }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  ${context.dataset.label}: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 11 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                }
            }
        }
    });
}

function renderOverviewNatureChart(dev, desc) {
    const canvas = document.getElementById('overview-nature-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Gradiente verde para Ingresos (Verde del gráfico de tendencia con degradado y transparencia)
    const greenGrad = ctx.createLinearGradient(0, 0, 0, 200);
    greenGrad.addColorStop(0, 'rgba(16, 185, 129, 0.85)');
    greenGrad.addColorStop(1, 'rgba(16, 185, 129, 0.35)');
    
    // Gradiente rojo para Deducciones (Rojo del gráfico de tendencia con degradado y transparencia)
    const redGrad = ctx.createLinearGradient(0, 0, 0, 200);
    redGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
    redGrad.addColorStop(1, 'rgba(239, 68, 68, 0.35)');
    
    state.charts['overviewNature'] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Ingresos (Devengo)', 'Deducciones (Descuento)'],
            datasets: [{
                data: [dev, desc],
                backgroundColor: [greenGrad, redGrad],
                borderColor: ['#FFFFFF','#FFFFFF'],
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 11 },
                        padding: 16,
                        boxWidth: 11,
                        borderRadius: 3
                    }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const total = dev + desc;
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                            return `  ${context.label}: ${currencyFormatter.format(val)} (${pct})`;
                        }
                    }
                }
            }
        }
    });
}

function renderTopCecosChart(data) {
    const canvas = document.getElementById('cecoChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Agrupar por Centro de Costo
    const cecosMap = {};
    data.forEach(d => {
        if (!d.cc || !d.dcc || d.na === 'BENEFICIO') return;
        const key = `${d.cc} - ${d.dcc}`;
        if (!cecosMap[key]) cecosMap[key] = 0;
        cecosMap[key] += (d.v || 0);
    });

    // Ordenar y tomar Top 10
    const sortedCecos = Object.entries(cecosMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedCecos.map(item => item[0]);
    const values = sortedCecos.map(item => item[1]);

    // Crear gradiente vibrante NomAI
    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, 'rgba(108, 0, 211, 0.80)');
    gradient.addColorStop(1, 'rgba(139, 47, 239, 0.65)');

    state.charts.cecoChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Neto Pagado',
                data: values,
                backgroundColor: gradient,
                borderColor: '#FFFFFF',
                borderWidth: 2,
                borderRadius: 6,
                barThickness: 'flex',
                maxBarThickness: 24
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return '  ' + currencyFormatter.format(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 11, weight: '500' },
                        callback: function(value, index) {
                            const label = this.getLabelForValue(value);
                            return label.length > 22 ? label.substring(0, 22) + '...' : label;
                        }
                    }
                }
            }
        }
    });
}

function renderTopCargosChart(data) {
    const canvas = document.getElementById('cargoChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Agrupar por Cargo
    const cargosMap = {};
    data.forEach(d => {
        if (!d.cg || d.na === 'BENEFICIO') return;
        const key = d.cg;
        if (!cargosMap[key]) cargosMap[key] = 0;
        cargosMap[key] += (d.v || 0);
    });

    // Ordenar y tomar Top 10
    const sortedCargos = Object.entries(cargosMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedCargos.map(item => item[0]);
    const values = sortedCargos.map(item => item[1]);

    // Gradiente anaranjado NomAI (con degradado y transparencia alineados con el resto de gráficos)
    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.80)');
    gradient.addColorStop(1, 'rgba(251, 191, 36, 0.55)');

    state.charts.cargoChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Neto Pagado',
                data: values,
                backgroundColor: gradient,
                borderColor: '#FFFFFF',
                borderWidth: 2,
                borderRadius: 6,
                barThickness: 'flex',
                maxBarThickness: 24
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return '  ' + currencyFormatter.format(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 11, weight: '500' },
                        callback: function(value, index) {
                            const label = this.getLabelForValue(value);
                            return label.length > 22 ? label.substring(0, 22) + '...' : label;
                        }
                    }
                }
            }
        }
    });
}

function renderOverviewMonthlyTable(data) {
    const tbody = document.getElementById('overview-monthly-tbody');
    if (!tbody) return;
    
    // Agrupar
    const monthlyData = {};
    data.forEach(d => {
        const key = `${d.a} - ${d.m}`;
        if (!monthlyData[key]) {
            monthlyData[key] = { year: d.a, month: d.m, dev: 0, desc: 0, ben: 0 };
        }
        if (d.na === 'DEVENGO') monthlyData[key].dev += d.v;
        else if (d.na === 'DESCUENTO') monthlyData[key].desc += d.v; // descuento es negativo
        else if (d.na === 'BENEFICIO') monthlyData[key].ben += d.v;
    });
    
    // Convertir y ordenar
    const rows = Object.values(monthlyData).sort((a,b) => {
        if (a.year !== b.year) return b.year - a.year; // año descendente
        return (MONTH_ORDER[b.month] || 0) - (MONTH_ORDER[a.month] || 0); // mes descendente
    });
    
    tbody.innerHTML = '';
    rows.forEach(r => {
        const net = r.dev + r.desc; // desc es negativo
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.month}, ${r.year}</td>
            <td style="color: #059669; text-align: right; font-weight: 500;">${currencyFormatter.format(r.dev)}</td>
            <td style="color: #EF4444; text-align: right; font-weight: 500;">${currencyFormatter.format(Math.abs(r.desc))}</td>
            <td style="font-weight: normal; text-align: right; color: var(--text-primary);">${currencyFormatter.format(net)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// RENDERIZADO: ANÁLISIS POR PERSONA
// ==========================================
function renderEmployeeView() {
    // 1. Cargar selector/autocompletar de personas
    initEmployeeSearch();
    
    if (!state.selectedEmployeeCedula) {
        // Seleccionar el primero por defecto si hay personas
        const peopleList = getUniquePeopleSorted();
        if (peopleList.length > 0) {
            state.selectedEmployeeCedula = peopleList[0].cedula;
            document.getElementById('employee-search-input').value = peopleList[0].name;
        } else {
            return;
        }
    }
    
    const cedula = state.selectedEmployeeCedula;
    const employeeData = state.filteredData.filter(d => d.c === cedula);
    const allEmployeeDataAcrossYears = state.data.filter(d => d.c === cedula);
    
    // Encontrar nombre
    const empInfo = employeeData[0] || allEmployeeDataAcrossYears[0];
    const empName = empInfo ? empInfo.n : 'Empleado No Encontrado';
    document.getElementById('employee-title-name').innerText = empName;
    document.getElementById('employee-title-id').innerText = `Cédula: ${cedula}`;
    
    // Llenar selectores de filtro del detalle de la tabla
    const periodSelect = document.getElementById('employee-detail-filter-period');
    const conceptSelect = document.getElementById('employee-detail-filter-concept');
    
    if (periodSelect && conceptSelect) {
        const uniquePeriods = new Set();
        const uniqueConcepts = new Set();
        employeeData.forEach(r => {
            uniquePeriods.add(`${r.m}, ${r.a}`);
            uniqueConcepts.add(r.co);
        });
        
        const sortedUniquePeriods = [...uniquePeriods].sort((a, b) => {
            const partsA = a.split(', ');
            const partsB = b.split(', ');
            const yA = parseInt(partsA[1]);
            const yB = parseInt(partsB[1]);
            if (yA !== yB) return yB - yA;
            return (MONTH_ORDER[partsB[0]] || 0) - (MONTH_ORDER[partsA[0]] || 0);
        });
        
        const sortedUniqueConcepts = [...uniqueConcepts].sort((a, b) => a.localeCompare(b));
        
        // Sincronizar filtros seleccionados
        if (state.employeeDetailPeriod !== 'ALL' && !uniquePeriods.has(state.employeeDetailPeriod)) {
            state.employeeDetailPeriod = 'ALL';
        }
        if (state.employeeDetailConcept !== 'ALL' && !uniqueConcepts.has(state.employeeDetailConcept)) {
            state.employeeDetailConcept = 'ALL';
        }
        
        periodSelect.innerHTML = '<option value="ALL">Todos los Periodos</option>';
        sortedUniquePeriods.forEach(p => {
            periodSelect.innerHTML += `<option value="${p}">${p}</option>`;
        });
        periodSelect.value = state.employeeDetailPeriod;
        
        conceptSelect.innerHTML = '<option value="ALL">Todos los Conceptos</option>';
        sortedUniqueConcepts.forEach(c => {
            conceptSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
        conceptSelect.value = state.employeeDetailConcept;
    }
    
    // 2. Calcular KPIs del Empleado
    let totalDev = 0;
    let totalDesc = 0;
    let totalBen = 0;
    let sueldoBasico = 0; // Ultimo sueldo basico registrado
    
    // Ordenar transacciones por fecha para tener el sueldo basico mas reciente en el anio
    const sortedData = [...employeeData].sort((a,b) => {
        const yearDiff = a.a - b.a;
        if (yearDiff !== 0) return yearDiff;
        return (MONTH_ORDER[a.m] || 0) - (MONTH_ORDER[b.m] || 0);
    });
    
    sortedData.forEach(d => {
        if (d.na === 'DEVENGO') totalDev += d.v;
        else if (d.na === 'DESCUENTO') totalDesc += d.v;
        else if (d.na === 'BENEFICIO') totalBen += d.v;
        
        if (d.co.toUpperCase().includes('SUELDO BASICO') || d.co.toUpperCase() === 'SUELDO BÁSICO') {
            sueldoBasico = d.v;
        }
    });
    
    const netTotal = totalDev + totalDesc;
    
    // Si no se encontro sueldo basico en el anio filtrado, buscar en todo el historico
    if (sueldoBasico === 0) {
        const sortedAllData = [...allEmployeeDataAcrossYears].sort((a,b) => {
            const yearDiff = a.a - b.a;
            if (yearDiff !== 0) return yearDiff;
            return (MONTH_ORDER[a.m] || 0) - (MONTH_ORDER[b.m] || 0);
        });
        sortedAllData.forEach(d => {
            if (d.co.toUpperCase().includes('SUELDO BASICO') || d.co.toUpperCase() === 'SUELDO BÁSICO') {
                sueldoBasico = d.v;
            }
        });
    }
    
    document.getElementById('emp-kpi-neto').innerText = currencyFormatter.format(netTotal);
    document.getElementById('emp-kpi-devengos').innerText = currencyFormatter.format(totalDev);
    document.getElementById('emp-kpi-descuentos').innerText = currencyFormatter.format(Math.abs(totalDesc));
    document.getElementById('emp-kpi-basico').innerText = sueldoBasico > 0 ? currencyFormatter.format(sueldoBasico) : 'No registra';
    
    // 3. Gráfico: Evolución de Salario Neto Mensual
    renderEmployeeHistoryChart(employeeData, allEmployeeDataAcrossYears);
    
    // 4. Gráfico: Distribución de Ingresos y Deducciones
    renderEmployeeDistributionChart(employeeData);
    
    // 4.5. Gráfico: Capacidad de Endeudamiento
    renderEmployeeDebtChart(employeeData, allEmployeeDataAcrossYears);
    
    // 5. Tabla: Detalles de Pagos
    renderEmployeeDetailsTable(employeeData);
}

// Retorna la lista de personas unicas ordenadas alfabeticamente
function getUniquePeopleSorted() {
    return state.uniquePeople || [];
}

// Inicializa los filtros del detalle de transacciones por empleado
function initEmployeeDetailFilters() {
    const periodSelect = document.getElementById('employee-detail-filter-period');
    const conceptSelect = document.getElementById('employee-detail-filter-concept');
    
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            state.employeeDetailPeriod = e.target.value;
            const cedula = state.selectedEmployeeCedula;
            const employeeData = state.filteredData.filter(d => d.c === cedula);
            renderEmployeeDetailsTable(employeeData);
        });
    }
    
    if (conceptSelect) {
        conceptSelect.addEventListener('change', (e) => {
            state.employeeDetailConcept = e.target.value;
            const cedula = state.selectedEmployeeCedula;
            const employeeData = state.filteredData.filter(d => d.c === cedula);
            renderEmployeeDetailsTable(employeeData);
        });
    }
}

// Inicializa el autocompletar de empleados
function initEmployeeSearch() {
    const input = document.getElementById('employee-search-input');
    const list = document.getElementById('employee-dropdown-list');
    if (!input || !list) return;


    
    const people = getUniquePeopleSorted();
    
    // Llenar lista inicial
    renderPeopleListItems(people);
    
    if (!input.dataset.listenerBound) {
        // Evento de foco/click para abrir
        input.addEventListener('focus', () => {
            list.classList.add('show');
        });
        
        // Ocultar dropdown al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('show');
            }
        });
        
        // Evento de busqueda (filtrado en lista)
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const currentPeople = getUniquePeopleSorted();
            const filtered = currentPeople.filter(p => 
                p.name.toLowerCase().includes(query) || p.cedula.includes(query)
            );
            renderPeopleListItems(filtered);
            list.classList.add('show');
        });
        
        input.dataset.listenerBound = 'true';
    }
    
    function renderPeopleListItems(items) {
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div class="dropdown-item" style="color: var(--text-muted); cursor: default;">No se encontraron resultados</div>';
            return;
        }
        
        items.forEach(p => {
            const div = document.createElement('div');
            div.className = `dropdown-item ${p.cedula === state.selectedEmployeeCedula ? 'selected' : ''}`;
            div.innerHTML = `
                <div style="font-weight: 500; color: var(--text-primary);">${p.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Cédula: ${p.cedula}</div>
            `;
            div.addEventListener('click', () => {
                state.selectedEmployeeCedula = p.cedula;
                input.value = p.name;
                list.classList.remove('show');
                renderActiveTab();
            });
            list.appendChild(div);
        });
    }
}

function renderEmployeeHistoryChart(currentYearData, allYearsData) {
    const ctx = document.getElementById('employee-history-chart');
    if (!ctx) return;
    
    // Si se filtra por año especifico, mostramos el detalle de ese año.
    // Si es "todos los años", mostramos un historico largo año-mes.
    const isFiltered = state.selectedYears && state.selectedYears.length === 1;
    const chartData = isFiltered ? currentYearData : allYearsData;
    
    const monthlyNet = {};
    chartData.forEach(d => {
        const labelKey = isFiltered ? d.m : `${d.a} - ${d.m}`;
        if (!monthlyNet[labelKey]) {
            monthlyNet[labelKey] = { sortVal: 0, net: 0, dev: 0, desc: 0 };
        }
        
        // Criterio de ordenacion
        if (isFiltered) {
            monthlyNet[labelKey].sortVal = MONTH_ORDER[d.m] || 0;
        } else {
            monthlyNet[labelKey].sortVal = (d.a * 100) + (MONTH_ORDER[d.m] || 0);
        }
        
        if (d.na === 'DEVENGO') {
            monthlyNet[labelKey].net += d.v;
            monthlyNet[labelKey].dev += d.v;
        } else if (d.na === 'DESCUENTO') {
            monthlyNet[labelKey].net += d.v; // descuento es negativo
            monthlyNet[labelKey].desc += Math.abs(d.v);
        }
    });
    
    const sortedKeys = Object.keys(monthlyNet).sort((a,b) => monthlyNet[a].sortVal - monthlyNet[b].sortVal);
    
    const labels = sortedKeys;
    const netVals = sortedKeys.map(k => monthlyNet[k].net);
    const devVals = sortedKeys.map(k => monthlyNet[k].dev);
    const descVals = sortedKeys.map(k => monthlyNet[k].desc);
    
    state.charts['empHistory'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Salario Neto Recibido',
                    data: netVals,
                    borderColor: '#6C00D3',
                    backgroundColor: 'rgba(108, 0, 211, 0.07)',
                    borderWidth: 3,
                    pointBackgroundColor: '#6C00D3',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                    order: 0
                },
                {
                    label: 'Ingresos Totales',
                    data: devVals,
                    borderColor: 'rgba(16, 185, 129, 0.65)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Deducciones Totales',
                    data: descVals,
                    borderColor: 'rgba(239, 68, 68, 0.65)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    fill: false,
                    pointRadius: 0,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#6B7280', font: { family: 'Outfit', size: 11 }, boxWidth: 12, padding: 16 }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  ${context.dataset.label}: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                }
            }
        }
    });
}

function renderEmployeeDebtChart(currentYearData, allYearsData) {
    const ctx = document.getElementById('employee-debt-chart');
    if (!ctx) return;
    
    const isFiltered = state.selectedYears && state.selectedYears.length === 1;
    const chartData = isFiltered ? currentYearData : allYearsData;
    
    const monthlyNet = {};
    chartData.forEach(d => {
        const labelKey = isFiltered ? d.m : `${d.a} - ${d.m}`;
        if (!monthlyNet[labelKey]) {
            monthlyNet[labelKey] = { sortVal: 0, dev: 0, desc: 0 };
        }
        
        if (isFiltered) {
            monthlyNet[labelKey].sortVal = MONTH_ORDER[d.m] || 0;
        } else {
            monthlyNet[labelKey].sortVal = (d.a * 100) + (MONTH_ORDER[d.m] || 0);
        }
        
        if (d.na === 'DEVENGO') {
            monthlyNet[labelKey].dev += d.v;
        } else if (d.na === 'DESCUENTO') {
            monthlyNet[labelKey].desc += Math.abs(d.v);
        }
    });
    
    const sortedKeys = Object.keys(monthlyNet).sort((a,b) => monthlyNet[a].sortVal - monthlyNet[b].sortVal);
    
    const labels = sortedKeys;
    const debtRatios = sortedKeys.map(k => {
        const dev = monthlyNet[k].dev;
        const desc = monthlyNet[k].desc;
        if (dev === 0) return 0;
        return parseFloat(((desc / dev) * 100).toFixed(2));
    });
    
    let finalLabels = [...labels];
    let finalDebtRatios = [...debtRatios];
    if (labels.length > 0) {
        const avgRatio = debtRatios.reduce((sum, val) => sum + val, 0) / debtRatios.length;
        finalDebtRatios.push(parseFloat(avgRatio.toFixed(2)));
        finalLabels.push('Promedio');
    }
    
    const recommendedLimit = finalLabels.map(() => 40);
    
    const canvasCtx = ctx.getContext('2d');
    
    // Regular bar gradient (Bright orange)
    const orangeGrad = canvasCtx.createLinearGradient(0, 0, 0, 300);
    orangeGrad.addColorStop(0, '#FF5500'); // very bright orange
    orangeGrad.addColorStop(1, 'rgba(255, 153, 0, 0.4)'); // fading amber-orange
    
    // Promedio bar gradient (Bright purple)
    const purpleGrad = canvasCtx.createLinearGradient(0, 0, 0, 300);
    purpleGrad.addColorStop(0, '#8B2FEF'); // bright violet
    purpleGrad.addColorStop(1, 'rgba(108, 0, 211, 0.4)'); // fading deep purple
    
    // Hover gradients (slightly more opaque)
    const orangeGradHover = canvasCtx.createLinearGradient(0, 0, 0, 300);
    orangeGradHover.addColorStop(0, '#FF6B1A');
    orangeGradHover.addColorStop(1, 'rgba(255, 170, 20, 0.6)');
    
    const purpleGradHover = canvasCtx.createLinearGradient(0, 0, 0, 300);
    purpleGradHover.addColorStop(0, '#9D48FF');
    purpleGradHover.addColorStop(1, 'rgba(120, 10, 230, 0.6)');

    const backgroundColors = finalLabels.map((label, idx) => {
        if (idx === finalLabels.length - 1) return purpleGrad;
        return orangeGrad;
    });
    
    const hoverBackgroundColors = finalLabels.map((label, idx) => {
        if (idx === finalLabels.length - 1) return purpleGradHover;
        return orangeGradHover;
    });
    
    state.charts['empDebt'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: finalLabels,
            datasets: [
                {
                    label: 'Porcentaje de Endeudamiento',
                    data: finalDebtRatios,
                    backgroundColor: backgroundColors,
                    hoverBackgroundColor: hoverBackgroundColors,
                    borderRadius: 6,
                    borderWidth: 0,
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Límite Recomendado (40%)',
                    data: recommendedLimit,
                    borderColor: 'rgba(239, 68, 68, 0.55)',
                    borderWidth: 1.5,
                    borderDash: [6, 6],
                    fill: false,
                    pointRadius: 0,
                    hoverRadius: 0,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#6B7280', font: { family: 'Outfit', size: 11 }, boxWidth: 12, padding: 16 }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  ${context.dataset.label}: ${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grace: '15%',
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return value + '%'; }
                    }
                }
            }
        },
        plugins: [
            {
                id: 'barLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    ctx.font = '500 11px Outfit, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    
                    const meta = chart.getDatasetMeta(0);
                    if (!meta || meta.hidden) return;
                    
                    meta.data.forEach((bar, index) => {
                        const value = data.datasets[0].data[index];
                        if (value !== undefined && value !== null) {
                            const x = bar.x;
                            const y = bar.y;
                            
                            if (index === meta.data.length - 1) {
                                ctx.fillStyle = '#8B2FEF'; // purple for Promedio label
                            } else {
                                ctx.fillStyle = '#FF5500'; // bright orange for regular labels
                            }
                            
                            ctx.fillText(value + '%', x, y - 6);
                        }
                    });
                    ctx.restore();
                }
            }
        ]
    });
}

function renderEmployeeDistributionChart(employeeData) {
    const ctx = document.getElementById('employee-distribution-chart');
    if (!ctx) return;
    
    // Consolidar conceptos recibidos por el empleado
    const concepts = {};
    employeeData.forEach(d => {
        if (!concepts[d.co]) {
            concepts[d.co] = { val: 0, na: d.na };
        }
        concepts[d.co].val += Math.abs(d.v); // guardar valor absoluto para graficar
    });
    
    // Separar en Devengos y Descuentos y tomar los top
    const list = Object.keys(concepts).map(name => ({
        name: name,
        val: concepts[name].val,
        na: concepts[name].na
    })).sort((a,b) => b.val - a.val);
    
    // Tomamos los top 7 conceptos mas representativos
    const topConcepts = list.slice(0, 7);
    
    // Si quedan mas, los agrupamos en "Otros"
    if (list.length > 7) {
        const remaining = list.slice(7);
        let remDev = 0;
        let remDesc = 0;
        remaining.forEach(item => {
            if (item.na === 'DEVENGO' || item.na === 'BENEFICIO') remDev += item.val;
            else remDesc += item.val;
        });
        
        if (remDev > 0) {
            topConcepts.push({ name: 'Otros Ingresos/Beneficios', val: remDev, na: 'DEVENGO' });
        }
        if (remDesc > 0) {
            topConcepts.push({ name: 'Otros Descuentos', val: remDesc, na: 'DESCUENTO' });
        }
    }
    
    const labels = topConcepts.map(c => c.name);
    const vals = topConcepts.map(c => c.val);
    
    // Paleta pastel alineada con los colores NomAI
    const PASTEL_PALETTE = [
        'rgba(167, 139, 250, 0.80)', // Lavender
        'rgba(244, 114, 182, 0.80)', // Rose
        'rgba(129, 140, 248, 0.80)', // Indigo
        'rgba(196, 181, 253, 0.80)', // Light Violet
        'rgba(251, 191, 36,  0.80)', // Amber
        'rgba(110, 231, 183, 0.80)', // Mint Green
        'rgba(147, 197, 253, 0.80)', // Sky Blue
        'rgba(253, 164, 175, 0.80)', // Coral
        'rgba(216, 180, 254, 0.80)', // Soft Purple
        'rgba(134, 239, 172, 0.80)', // Emerald Light
        'rgba(249, 168, 212, 0.80)', // Petal Pink
        'rgba(165, 243, 252, 0.80)', // Cyan
    ];

    const bgColors = topConcepts.map((_, i) => PASTEL_PALETTE[i % PASTEL_PALETTE.length]);
    const borderColors = topConcepts.map(() => '#FFFFFF');
    
    state.charts['empDistribution'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: vals,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 10 },
                        padding: 12,
                        boxWidth: 10,
                        borderRadius: 3
                    }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  ${context.label}: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

function renderEmployeeDetailsTable(employeeData) {
    const tbody = document.getElementById('employee-details-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Apply filters
    let filteredData = employeeData;
    if (state.employeeDetailPeriod && state.employeeDetailPeriod !== 'ALL') {
        filteredData = filteredData.filter(r => `${r.m}, ${r.a}` === state.employeeDetailPeriod);
    }
    if (state.employeeDetailConcept && state.employeeDetailConcept !== 'ALL') {
        filteredData = filteredData.filter(r => r.co === state.employeeDetailConcept);
    }
    
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay transacciones registradas para este filtro</td></tr>';
        return;
    }
    
    // Group by period
    const grouped = {};
    filteredData.forEach(r => {
        const key = `${r.a} - ${r.m}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
    });
    
    // Sort periods: most recent first
    const periods = Object.keys(grouped).sort((a, b) => {
        const partsA = a.split(' - ');
        const partsB = b.split(' - ');
        const yA = parseInt(partsA[0]);
        const yB = parseInt(partsB[0]);
        if (yA !== yB) return yB - yA;
        return (MONTH_ORDER[partsB[1]] || 0) - (MONTH_ORDER[partsA[1]] || 0);
    });
    
    let grandDev = 0;
    let grandDesc = 0;
    
    periods.forEach(periodKey => {
        const rows = grouped[periodKey];
        
        // Sort: DEVENGO first, then DESCUENTO. Within each, absolute value descending.
        const sortedRows = rows.sort((a, b) => {
            if (a.na === 'DEVENGO' && b.na === 'DESCUENTO') return -1;
            if (a.na === 'DESCUENTO' && b.na === 'DEVENGO') return 1;
            return Math.abs(b.v) - Math.abs(a.v);
        });
        
        let totalDev = 0;
        let totalDesc = 0;
        
        sortedRows.forEach(r => {
            let ingresosHtml = '-';
            let descuentosHtml = '-';
            
            if (r.na === 'DEVENGO') {
                totalDev += r.v;
                const valPrefix = r.v > 0 ? '+' : '';
                ingresosHtml = `<span style="color: #059669; font-weight: normal;">${valPrefix}${currencyFormatter.format(r.v)}</span>`;
            } else if (r.na === 'DESCUENTO') {
                totalDesc += r.v; // descuento es negativo
                descuentosHtml = `<span style="color: #EF4444; font-weight: normal;">-${currencyFormatter.format(Math.abs(r.v))}</span>`;
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.m}, ${r.a}</td>
                <td>${r.co}</td>
                <td style="text-align: right;">${ingresosHtml}</td>
                <td style="text-align: right;">${descuentosHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        
        grandDev += totalDev;
        grandDesc += totalDesc;
        
        // Render subtotal row for this month
        const subtotalTr = document.createElement('tr');
        subtotalTr.className = 'subtotal-row';
        subtotalTr.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
        subtotalTr.style.borderTop = '1px solid var(--border-color)';
        subtotalTr.style.borderBottom = '1px solid var(--border-color)';
        
        const [year, month] = periodKey.split(' - ');
        const netVal = totalDev + totalDesc;
        const netColor = netVal >= 0 ? 'var(--text-primary)' : '#EF4444';
        
        const devLabel = totalDev > 0 ? '+' + currencyFormatter.format(totalDev) : '$ 0';
        const descLabel = totalDesc < 0 ? '-' + currencyFormatter.format(Math.abs(totalDesc)) : '$ 0';
        
        subtotalTr.innerHTML = `
            <td colspan="2" style="color: var(--text-secondary); font-weight: normal;">
                Subtotal ${month}, ${year} 
                <span style="margin-left: 12px; font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">Neto: </span>
                <span style="color: ${netColor}; font-size: 0.8rem; font-weight: normal;">${currencyFormatter.format(netVal)}</span>
            </td>
            <td style="text-align: right; color: #059669; font-weight: normal;">${devLabel}</td>
            <td style="text-align: right; color: #EF4444; font-weight: normal;">${descLabel}</td>
        `;
        tbody.appendChild(subtotalTr);
    });
    
    // Render grand total row at the very bottom
    const totalTr = document.createElement('tr');
    totalTr.className = 'total-row';
    totalTr.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    totalTr.style.borderTop = '2px solid var(--border-color)';
    
    const grandNet = grandDev + grandDesc;
    const grandNetColor = grandNet >= 0 ? 'var(--text-primary)' : '#EF4444';
    
    const grandDevLabel = grandDev > 0 ? '+' + currencyFormatter.format(grandDev) : '$ 0';
    const grandDescLabel = grandDesc < 0 ? '-' + currencyFormatter.format(Math.abs(grandDesc)) : '$ 0';
    
    totalTr.innerHTML = `
        <td colspan="2" style="color: var(--text-secondary); font-weight: normal;">
            TOTAL GENERAL (Todos los meses)
            <span style="margin-left: 12px; font-size: 0.85rem; color: var(--text-muted); font-weight: normal;">Neto: </span>
            <span style="color: ${grandNetColor}; font-size: 0.85rem; font-weight: normal;">${currencyFormatter.format(grandNet)}</span>
        </td>
        <td style="text-align: right; color: #059669; font-weight: normal;">${grandDevLabel}</td>
        <td style="text-align: right; color: #EF4444; font-weight: normal;">${grandDescLabel}</td>
    `;
    tbody.appendChild(totalTr);
}

// ==========================================
// RENDERIZADO: ANÁLISIS POR CONCEPTO
// ==========================================
function renderConceptView() {
    initConceptSearch();
    
    if (!state.selectedConceptName) {
        const conceptList = getUniqueConceptsSorted();
        if (conceptList.length > 0) {
            // Preferir SUELDO BASICO si existe para comenzar
            const hasBasic = conceptList.find(c => c.toUpperCase().includes('SUELDO BASICO') || c.toUpperCase() === 'SUELDO BÁSICO');
            state.selectedConceptName = hasBasic || conceptList[0];
            document.getElementById('concept-search-input').value = state.selectedConceptName;
        } else {
            return;
        }
    }
    
    const conceptName = state.selectedConceptName;
    const conceptData = state.filteredData.filter(d => d.co === conceptName);
    
    // Encontrar detalles meta del concepto
    const sample = conceptData[0] || state.data.filter(d => d.co === conceptName)[0];
    const nature = sample ? sample.na : 'N/A';
    const type = sample ? sample.t : 'N/A';
    
    document.getElementById('concept-title-name').innerText = conceptName;
    document.getElementById('concept-title-meta').innerText = `Naturaleza: ${nature} | Tipo: ${type}`;
    
    // 1. Calcular KPIs del Concepto
    let totalSum = 0;
    let transactionCount = conceptData.length;
    const uniqueAffectedPeople = new Set();
    let maxVal = 0;
    let minVal = Infinity;
    
    conceptData.forEach(d => {
        const absVal = Math.abs(d.v);
        totalSum += absVal;
        uniqueAffectedPeople.add(d.c);
        if (absVal > maxVal) maxVal = absVal;
        if (absVal < minVal) minVal = absVal;
    });
    
    if (minVal === Infinity) minVal = 0;
    
    const avgVal = transactionCount > 0 ? (totalSum / transactionCount) : 0;
    
    document.getElementById('concept-kpi-total').innerText = currencyFormatter.format(totalSum);
    document.getElementById('concept-kpi-personas').innerText = uniqueAffectedPeople.size;
    document.getElementById('concept-kpi-promedio').innerText = currencyFormatter.format(avgVal);
    document.getElementById('concept-kpi-maximo').innerText = currencyFormatter.format(maxVal);
    
    // 2. Gráfico: Top 10 Personas
    renderConceptTopPeopleChart(conceptData);
    
    // 3. Gráfico: Tendencia Temporal del Concepto
    renderConceptTrendChart(conceptData);
    
    // 3.5. Gráficos de Distribución por CECO y Cargo (Pie/Torta)
    renderConceptCecoChart(conceptData);
    renderConceptCargoChart(conceptData);
    
    // 3.8. Gráfico de Distribución Cruzada: Cargo vs Centro de Costo (Stacked Bar)
    renderConceptCrossChart(conceptData);
    
    // 4. Tabla: Detalles del Concepto
    renderConceptTable(conceptData);
}

// Retorna lista de conceptos unicos
function getUniqueConceptsSorted() {
    return state.uniqueConcepts || [];
}

// Inicializa autocompletar de conceptos
function initConceptSearch() {
    const input = document.getElementById('concept-search-input');
    const list = document.getElementById('concept-dropdown-list');
    if (!input || !list) return;
    
    const concepts = getUniqueConceptsSorted();
    
    renderConceptListItems(concepts);
    
    if (!input.dataset.listenerBound) {
        input.addEventListener('focus', () => {
            list.classList.add('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.remove('show');
            }
        });
        
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const currentConcepts = getUniqueConceptsSorted();
            const filtered = currentConcepts.filter(c => c.toLowerCase().includes(query));
            renderConceptListItems(filtered);
            list.classList.add('show');
        });
        
        input.dataset.listenerBound = 'true';
    }
    
    function renderConceptListItems(items) {
        list.innerHTML = '';
        if (items.length === 0) {
            list.innerHTML = '<div class="dropdown-item" style="color: var(--text-muted); cursor: default;">No se encontraron resultados</div>';
            return;
        }
        
        items.forEach(c => {
            const div = document.createElement('div');
            div.className = `dropdown-item ${c === state.selectedConceptName ? 'selected' : ''}`;
            div.innerText = c;
            div.addEventListener('click', () => {
                state.selectedConceptName = c;
                input.value = c;
                list.classList.remove('show');
                renderActiveTab();
            });
            list.appendChild(div);
        });
    }
}

function renderConceptTopPeopleChart(conceptData) {
    const ctx = document.getElementById('concept-top-people-chart');
    if (!ctx) return;
    
    // Agrupar por persona
    const peopleSum = {};
    conceptData.forEach(d => {
        if (!peopleSum[d.n]) peopleSum[d.n] = 0;
        peopleSum[d.n] += Math.abs(d.v);
    });
    
    // Ordenar y tomar top 10
    const sorted = Object.keys(peopleSum).map(name => ({
        name: name,
        val: peopleSum[name]
    })).sort((a,b) => b.val - a.val).slice(0, 10);
    
    const labels = sorted.map(x => x.name.length > 20 ? x.name.substring(0, 18) + '...' : x.name);
    const vals = sorted.map(x => x.val);
    
    // Usar color segun naturaleza (NomAI palette)
    const natureColor = (conceptData[0] || {}).na === 'DESCUENTO' ? 'rgba(239,68,68,0.70)' : 'rgba(108,0,211,0.70)';
    const borderColor = (conceptData[0] || {}).na === 'DESCUENTO' ? '#ef4444' : '#6C00D3';
    
    state.charts['conceptTopPeople'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monto Acumulado',
                data: vals,
                backgroundColor: natureColor,
                borderColor: borderColor,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Grafico de barras horizontales
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  Total: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#6B7280', font: { family: 'Outfit', size: 10 } }
                }
            }
        }
    });
}

function renderConceptTrendChart(conceptData) {
    const ctx = document.getElementById('concept-trend-chart');
    if (!ctx) return;
    
    // Agrupar por mes
    const monthlySum = {};
    conceptData.forEach(d => {
        const key = d.m;
        if (!monthlySum[key]) monthlySum[key] = 0;
        monthlySum[key] += Math.abs(d.v);
    });
    
    const sortedMonths = Object.keys(monthlySum).sort((a,b) => (MONTH_ORDER[a] || 0) - (MONTH_ORDER[b] || 0));
    const labels = sortedMonths;
    const vals = sortedMonths.map(m => monthlySum[m]);
    
    const color = (conceptData[0] || {}).na === 'DESCUENTO' ? '#ef4444' : '#6C00D3';
    
    state.charts['conceptTrend'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monto mensual total',
                data: vals,
                borderColor: color,
                backgroundColor: color === '#6C00D3' ? 'rgba(108,0,211,0.06)' : 'rgba(239,68,68,0.06)',
                borderWidth: 2.5,
                pointBackgroundColor: color,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  Total: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 11 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                }
            }
        }
    });
}

function renderConceptCecoChart(conceptData) {
    const canvas = document.getElementById('concept-ceco-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const cecosMap = {};
    conceptData.forEach(d => {
        if (!d.cc || !d.dcc) return;
        const key = `${d.cc} - ${d.dcc}`;
        if (!cecosMap[key]) cecosMap[key] = 0;
        cecosMap[key] += Math.abs(d.v || 0);
    });
    
    const sortedCecos = Object.entries(cecosMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
        
    const labels = sortedCecos.map(item => item[0]);
    const values = sortedCecos.map(item => item[1]);
    
    const PASTEL_PALETTE = [
        'rgba(167, 139, 250, 0.85)',
        'rgba(244, 114, 182, 0.85)',
        'rgba(129, 140, 248, 0.85)',
        'rgba(196, 181, 253, 0.85)',
        'rgba(251, 191, 36,  0.85)',
        'rgba(110, 231, 183, 0.85)',
        'rgba(147, 197, 253, 0.85)',
        'rgba(253, 164, 175, 0.85)',
        'rgba(216, 180, 254, 0.85)',
        'rgba(134, 239, 172, 0.85)'
    ];
    
    const bgColors = sortedCecos.map((_, i) => PASTEL_PALETTE[i % PASTEL_PALETTE.length]);
    const borderColors = sortedCecos.map(() => '#FFFFFF');
    
    state.charts['conceptCeco'] = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 10 },
                        boxWidth: 10,
                        padding: 8
                    }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                            const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) + '%' : '0%';
                            return `  ${context.label}: ${currencyFormatter.format(context.raw)} (${pct})`;
                        }
                    }
                }
            }
        },
        plugins: [
            {
                id: 'pieLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    ctx.font = '500 10px Outfit, sans-serif';
                    ctx.fillStyle = '#1F2937';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const dataset = data.datasets[0];
                    const total = dataset.data.reduce((sum, val) => sum + val, 0);
                    if (total === 0) return;
                    
                    const meta = chart.getDatasetMeta(0);
                    const chartWidth = chart.width || 300;
                    // En móvil (gráfico angosto) empujar etiquetas más hacia afuera
                    const radiusFactor = chartWidth < 280 ? 0.82 : 0.68;
                    meta.data.forEach((element, index) => {
                        const value = dataset.data[index];
                        const percentage = ((value / total) * 100).toFixed(1) + '%';
                        const { x, y, startAngle, endAngle, innerRadius, outerRadius } = element;
                        if (endAngle - startAngle > 0.18) {
                            const avgAngle = startAngle + (endAngle - startAngle) / 2;
                            const r = innerRadius + (outerRadius - innerRadius) * radiusFactor;
                            const labelX = x + Math.cos(avgAngle) * r;
                            const labelY = y + Math.sin(avgAngle) * r;
                            ctx.fillText(percentage, labelX, labelY);
                        }
                    });
                    ctx.restore();
                }
            }
        ]
    });
}

function renderConceptCargoChart(conceptData) {
    const canvas = document.getElementById('concept-cargo-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const cargosMap = {};
    conceptData.forEach(d => {
        if (!d.cg) return;
        const key = d.cg;
        if (!cargosMap[key]) cargosMap[key] = 0;
        cargosMap[key] += Math.abs(d.v || 0);
    });
    
    const sortedCargos = Object.entries(cargosMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
        
    const labels = sortedCargos.map(item => item[0]);
    const values = sortedCargos.map(item => item[1]);
    
    const PASTEL_PALETTE = [
        'rgba(129, 140, 248, 0.85)',
        'rgba(167, 139, 250, 0.85)',
        'rgba(244, 114, 182, 0.85)',
        'rgba(251, 191, 36,  0.85)',
        'rgba(110, 231, 183, 0.85)',
        'rgba(196, 181, 253, 0.85)',
        'rgba(147, 197, 253, 0.85)',
        'rgba(253, 164, 175, 0.85)',
        'rgba(216, 180, 254, 0.85)',
        'rgba(134, 239, 172, 0.85)'
    ];
    
    const bgColors = sortedCargos.map((_, i) => PASTEL_PALETTE[i % PASTEL_PALETTE.length]);
    const borderColors = sortedCargos.map(() => '#FFFFFF');
    
    state.charts['conceptCargo'] = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 10 },
                        boxWidth: 10,
                        padding: 8
                    }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                            const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) + '%' : '0%';
                            return `  ${context.label}: ${currencyFormatter.format(context.raw)} (${pct})`;
                        }
                    }
                }
            }
        },
        plugins: [
            {
                id: 'pieLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    ctx.font = '500 10px Outfit, sans-serif';
                    ctx.fillStyle = '#1F2937';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const dataset = data.datasets[0];
                    const total = dataset.data.reduce((sum, val) => sum + val, 0);
                    if (total === 0) return;
                    
                    const meta = chart.getDatasetMeta(0);
                    const chartWidth = chart.width || 300;
                    // En móvil (gráfico angosto) empujar etiquetas más hacia afuera
                    const radiusFactor = chartWidth < 280 ? 0.82 : 0.68;
                    meta.data.forEach((element, index) => {
                        const value = dataset.data[index];
                        const percentage = ((value / total) * 100).toFixed(1) + '%';
                        const { x, y, startAngle, endAngle, innerRadius, outerRadius } = element;
                        if (endAngle - startAngle > 0.18) {
                            const avgAngle = startAngle + (endAngle - startAngle) / 2;
                            const r = innerRadius + (outerRadius - innerRadius) * radiusFactor;
                            const labelX = x + Math.cos(avgAngle) * r;
                            const labelY = y + Math.sin(avgAngle) * r;
                            ctx.fillText(percentage, labelX, labelY);
                        }
                    });
                    ctx.restore();
                }
            }
        ]
    });
}

function renderConceptCrossChart(conceptData) {
    const canvas = document.getElementById('concept-cross-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 1. Agrupar por Centro de Costo (para identificar los Top 8 CECOs)
    const cecosMap = {};
    conceptData.forEach(d => {
        if (!d.cc || !d.dcc) return;
        const key = `${d.cc} - ${d.dcc}`;
        if (!cecosMap[key]) cecosMap[key] = 0;
        cecosMap[key] += Math.abs(d.v || 0);
    });
    
    const topCecos = Object.entries(cecosMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(item => item[0]);
        
    if (topCecos.length === 0) return;
    
    // 2. Para estos Top 8 CECOs, agrupar por Persona (Colaborador)
    const topCecosSet = new Set(topCecos);
    const uniquePeople = new Set();
    const crossData = {}; // crossData[ceco][person] = value
    
    topCecos.forEach(ceco => {
        crossData[ceco] = {};
    });
    
    conceptData.forEach(d => {
        if (!d.cc || !d.dcc || !d.n) return;
        const cecoKey = `${d.cc} - ${d.dcc}`;
        if (!topCecosSet.has(cecoKey)) return;
        
        const personName = d.n;
        const val = Math.abs(d.v || 0);
        if (val === 0) return;
        
        uniquePeople.add(personName);
        
        if (!crossData[cecoKey][personName]) crossData[cecoKey][personName] = 0;
        crossData[cecoKey][personName] += val;
    });
    
    const peopleArray = [...uniquePeople].sort();
    
    const COLOR_PALETTE = [
        'rgba(108, 0, 211, 0.75)',
        'rgba(16, 185, 129, 0.75)',
        'rgba(249, 115, 22, 0.75)',
        'rgba(239, 68, 68, 0.75)',
        'rgba(59, 130, 246, 0.75)',
        'rgba(236, 72, 153, 0.75)',
        'rgba(245, 158, 11, 0.75)',
        'rgba(6, 182, 212, 0.75)',
        'rgba(139, 92, 246, 0.75)',
        'rgba(14, 165, 233, 0.75)',
        'rgba(168, 85, 247, 0.75)',
        'rgba(34, 197, 94, 0.75)'
    ];
    
    const datasets = peopleArray.map((person, idx) => {
        const data = topCecos.map(ceco => crossData[ceco][person] || 0);
        return {
            label: person,
            data: data,
            backgroundColor: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            borderWidth: 0
        };
    });
    
    state.charts['conceptCross'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: topCecos,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Oculta la leyenda para evitar saturación de nombres
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const personName = context.dataset.label;
                            const value = context.raw;
                            const cecoIndex = context.dataIndex;
                            const chart = context.chart;
                            
                            // Calcular el total de esta columna (CECO)
                            let cecoTotal = 0;
                            chart.data.datasets.forEach(dataset => {
                                cecoTotal += dataset.data[cecoIndex] || 0;
                            });
                            
                            const pct = cecoTotal > 0 ? ((value / cecoTotal) * 100).toFixed(1) + '%' : '0%';
                            return `  ${personName}: ${currencyFormatter.format(value)} (${pct})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                }
            }
        }
    });
}

function renderConceptTable(conceptData) {
    const tbody = document.getElementById('concept-details-tbody');
    if (!tbody) return;
    
    // Ordenar descendente por valor absoluto
    const sorted = [...conceptData].sort((a,b) => Math.abs(b.v) - Math.abs(a.v));
    
    tbody.innerHTML = '';
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay registros en este periodo</td></tr>';
        return;
    }
    
    sorted.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td>${r.n}</td>
            <td>${r.m}, ${r.a}</td>
            <td style="text-align: right; font-weight: normal; color: var(--text-primary);">${currencyFormatter.format(Math.abs(r.v))}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// RENDERIZADO: COMPARATIVAS Y MATRIZ
// ==========================================
function renderComparisonView() {
    // 1. Si no hay empleados seleccionados para comparar, agregar los 3 primeros de manera predeterminada
    if (state.compareEmployees.length === 0 && state.compareCargos.length === 0 && state.compareCecos.length === 0) {
        const list = getUniquePeopleSorted();
        const limit = Math.min(list.length, 3);
        for (let i = 0; i < limit; i++) {
            state.compareEmployees.push(list[i].cedula);
        }
    }
    
    // Renderizar tags de empleados y conceptos seleccionados
    renderCompareTags();
    renderCompareConceptTags();
    renderCompareCargoTags();
    renderCompareCecoTags();
    
    // 2. Renderizar gráfico comparativo
    renderCompareChart();
    
    // 3. Renderizar Matriz / Heatmap
    renderHeatmapMatrix();
}

// ==========================================
// SISTEMA MODAL DE FILTROS (Centralizado)
// ==========================================

/**
 * Estado del modal de filtros.
 * currentFilterType: 'employees' | 'concepts' | 'cargos' | 'cecos'
 * modalTempSelected: Set con la selección temporal mientras el modal está abierto
 */
const filterModalState = {
    currentFilterType: null,
    modalTempSelected: new Set()
};

/**
 * Construye la lista completa de opciones para cada tipo de filtro.
 */
function getFilterOptions(type) {
    switch (type) {
        case 'p1':
        case 'p2': {
            return getUniquePeriodsSorted().map(p => ({
                value: p,
                label: getPeriodLabel(p),
                sublabel: ''
            }));
        }
        case 'years': {
            return getUniqueYears().map(y => ({
                value: y.toString(),
                label: y.toString(),
                sublabel: ''
            }));
        }
        case 'months': {
            return getUniqueMonths().map(m => ({
                value: m,
                label: m,
                sublabel: ''
            }));
        }
        case 'quincenas': {
            return getUniqueQuincenas().map(q => {
                let label = q;
                if (q === 'Q1') label = 'Quincena 1 (Q1)';
                else if (q === 'Q2') label = 'Quincena 2 (Q2)';
                else if (q === 'MES') label = 'Mes Completo (MES)';
                return {
                    value: q,
                    label: label,
                    sublabel: ''
                };
            });
        }
        case 'types': {
            const set = new Set();
            state.data.forEach(d => { if (d.tn) set.add(d.tn); });
            return Array.from(set).sort().map(t => ({
                value: t,
                label: t,
                sublabel: ''
            }));
        }
        case 'employees':
        case 'period_compare_employees': {
            return getUniquePeopleSorted().map(p => ({
                value: p.cedula,
                label: p.name,
                sublabel: `Cédula: ${p.cedula}`
            }));
        }
        case 'employee_single': {
            return getUniquePeopleSorted().map(p => ({
                value: p.cedula,
                label: p.name,
                sublabel: `Cédula: ${p.cedula}`
            }));
        }
        case 'concepts':
        case 'concept_compare_concepts': {
            const set = new Set();
            state.data.forEach(d => set.add(d.co));
            return Array.from(set).sort().map(c => ({ value: c, label: c, sublabel: '' }));
        }
        case 'concept_single': {
            const set = new Set();
            state.data.forEach(d => set.add(d.co));
            return Array.from(set).sort().map(c => ({ value: c, label: c, sublabel: '' }));
        }
        case 'cargos':
        case 'cargo_compare_cargos': {
            const set = new Set();
            state.data.forEach(d => { if (d.cg) set.add(d.cg); });
            return Array.from(set).sort().map(c => ({ value: c, label: c, sublabel: '' }));
        }
        case 'cecos':
        case 'ceco_compare_cecos': {
            const set = new Set();
            state.data.forEach(d => { if (d.cc && d.dcc) set.add(`${d.cc} - ${d.dcc}`); });
            return Array.from(set).sort().map(c => ({ value: c, label: c, sublabel: '' }));
        }
        default:
            return [];
    }
}

/**
 * Retorna el array de selección actual del estado global para cada tipo.
 */
function getCurrentSelectionForType(type) {
    switch (type) {
        case 'p1': {
            const tab = state.activeTab;
            if (tab === 'period-compare') return state.comparePeriod1 ? [state.comparePeriod1] : [];
            if (tab === 'concept-compare') return state.conceptComparePeriod1 ? [state.conceptComparePeriod1] : [];
            if (tab === 'ceco-compare') return state.cecoComparePeriod1 ? [state.cecoComparePeriod1] : [];
            if (tab === 'cargo-compare') return state.cargoComparePeriod1 ? [state.cargoComparePeriod1] : [];
            return [];
        }
        case 'p2': {
            const tab = state.activeTab;
            if (tab === 'period-compare') return state.comparePeriod2 ? [state.comparePeriod2] : [];
            if (tab === 'concept-compare') return state.conceptComparePeriod2 ? [state.conceptComparePeriod2] : [];
            if (tab === 'ceco-compare') return state.cecoComparePeriod2 ? [state.cecoComparePeriod2] : [];
            if (tab === 'cargo-compare') return state.cargoComparePeriod2 ? [state.cargoComparePeriod2] : [];
            return [];
        }
        case 'years':     return state.selectedYears.map(String);
        case 'months':    return state.selectedMonths;
        case 'quincenas':  return state.selectedQuincenas;
        case 'types':     return Array.isArray(state.selectedTipoNomina) ? state.selectedTipoNomina : [];
        case 'employees': return state.compareEmployees;
        case 'period_compare_employees': return state.periodCompareSelectedEmployees || [];
        case 'employee_single': return state.selectedEmployeeCedula ? [state.selectedEmployeeCedula] : [];
        case 'concepts':  return state.compareConcepts;
        case 'concept_compare_concepts': return state.conceptCompareSelectedConcepts || [];
        case 'concept_single': return state.selectedConceptName ? [state.selectedConceptName] : [];
        case 'cargos':    return state.compareCargos;
        case 'cargo_compare_cargos': return state.cargoCompareSelectedCargos || [];
        case 'cecos':     return state.compareCecos;
        case 'ceco_compare_cecos': return state.cecoCompareSelectedCecos || [];
        default:          return [];
    }
}

/**
 * Persiste la selección temporal del modal al estado global.
 */
function applyModalSelection(type) {
    const arr = Array.from(filterModalState.modalTempSelected);
    switch (type) {
        case 'p1': {
            const tab = state.activeTab;
            if (arr.length > 0) {
                if (tab === 'period-compare') state.comparePeriod1 = arr[0];
                else if (tab === 'concept-compare') state.conceptComparePeriod1 = arr[0];
                else if (tab === 'ceco-compare') state.cecoComparePeriod1 = arr[0];
                else if (tab === 'cargo-compare') state.cargoComparePeriod1 = arr[0];
            }
            break;
        }
        case 'p2': {
            const tab = state.activeTab;
            if (arr.length > 0) {
                if (tab === 'period-compare') state.comparePeriod2 = arr[0];
                else if (tab === 'concept-compare') state.conceptComparePeriod2 = arr[0];
                else if (tab === 'ceco-compare') state.cecoComparePeriod2 = arr[0];
                else if (tab === 'cargo-compare') state.cargoComparePeriod2 = arr[0];
            }
            break;
        }
        case 'years':
            state.selectedYears = arr.map(Number);
            break;
        case 'months':
            state.selectedMonths = arr;
            break;
        case 'quincenas':
            state.selectedQuincenas = arr;
            break;
        case 'types':
            // Multi-select: vacío = todos los tipos
            state.selectedTipoNomina = arr.filter(v => v !== 'all');
            break;
        case 'employees': state.compareEmployees = arr; break;
        case 'period_compare_employees': state.periodCompareSelectedEmployees = arr; break;
        case 'employee_single':
            if (arr.length > 0) {
                state.selectedEmployeeCedula = arr[0];
            }
            break;
        case 'concepts':  state.compareConcepts  = arr; break;
        case 'concept_compare_concepts': state.conceptCompareSelectedConcepts = arr; break;
        case 'concept_single':
            if (arr.length > 0) {
                state.selectedConceptName = arr[0];
            }
            break;
        case 'cargos':
            state.compareCargos = arr;
            if (arr.length > 0) state.compareEmployees = []; // Cargo toma prioridad
            break;
        case 'cargo_compare_cargos':
            state.cargoCompareSelectedCargos = arr;
            break;
        case 'cecos':
            state.compareCecos = arr;
            if (arr.length > 0) state.compareEmployees = []; // Ceco toma prioridad
            break;
        case 'ceco_compare_cecos':
            state.cecoCompareSelectedCecos = arr;
            break;
    }
}

/**
 * Renderiza las opciones en la lista del modal, filtradas por la búsqueda interna.
 */
function renderModalOptions(allOptions, query) {
    const list = document.getElementById('filter-modal-options-list');
    if (!list) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = q
        ? allOptions.filter(o =>
            o.label.toLowerCase().includes(q) ||
            (o.sublabel && o.sublabel.toLowerCase().includes(q))
          )
        : allOptions;

    list.innerHTML = '';

    if (filtered.length === 0) {
        list.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Sin resultados</div>`;
        return;
    }

    filtered.forEach(option => {
        let isSelected = false;
        if (filterModalState.currentFilterType === 'employee_single') {
            isSelected = state.selectedEmployeeCedula === option.value;
        } else if (filterModalState.currentFilterType === 'concept_single') {
            isSelected = state.selectedConceptName === option.value;
        } else if (filterModalState.currentFilterType === 'p1') {
            const tab = state.activeTab;
            if (tab === 'period-compare') isSelected = state.comparePeriod1 === option.value;
            else if (tab === 'concept-compare') isSelected = state.conceptComparePeriod1 === option.value;
            else if (tab === 'ceco-compare') isSelected = state.cecoComparePeriod1 === option.value;
            else if (tab === 'cargo-compare') isSelected = state.cargoComparePeriod1 === option.value;
        } else if (filterModalState.currentFilterType === 'p2') {
            const tab = state.activeTab;
            if (tab === 'period-compare') isSelected = state.comparePeriod2 === option.value;
            else if (tab === 'concept-compare') isSelected = state.conceptComparePeriod2 === option.value;
            else if (tab === 'ceco-compare') isSelected = state.cecoComparePeriod2 === option.value;
            else if (tab === 'cargo-compare') isSelected = state.cargoComparePeriod2 === option.value;
        } else {
            isSelected = filterModalState.modalTempSelected.has(option.value);
        }
        const item = document.createElement('div');
        item.className = `options-list-item${isSelected ? ' selected' : ''}`;
        item.setAttribute('data-value', option.value);
        item.innerHTML = `
            <div class="custom-checkbox-box"></div>
            <div class="option-item-content">
                <div class="option-item-label">${option.label}</div>
                ${option.sublabel ? `<div class="option-item-sublabel">${option.sublabel}</div>` : ''}
            </div>
        `;
        item.addEventListener('click', () => {
            if (filterModalState.currentFilterType === 'employee_single') {
                state.selectedEmployeeCedula = option.value;
                closeFilterModal();
                renderActiveTab();
                return;
            }
            if (filterModalState.currentFilterType === 'concept_single') {
                state.selectedConceptName = option.value;
                closeFilterModal();
                renderActiveTab();
                return;
            }
            if (filterModalState.currentFilterType === 'p1' || filterModalState.currentFilterType === 'p2') {
                const tab = state.activeTab;
                if (filterModalState.currentFilterType === 'p1') {
                    if (tab === 'period-compare') state.comparePeriod1 = option.value;
                    else if (tab === 'concept-compare') state.conceptComparePeriod1 = option.value;
                    else if (tab === 'ceco-compare') state.cecoComparePeriod1 = option.value;
                    else if (tab === 'cargo-compare') state.cargoComparePeriod1 = option.value;
                } else {
                    if (tab === 'period-compare') state.comparePeriod2 = option.value;
                    else if (tab === 'concept-compare') state.conceptComparePeriod2 = option.value;
                    else if (tab === 'ceco-compare') state.cecoComparePeriod2 = option.value;
                    else if (tab === 'cargo-compare') state.cargoComparePeriod2 = option.value;
                }
                closeFilterModal();
                renderActiveTab();
                return;
            }
            if (filterModalState.modalTempSelected.has(option.value)) {
                filterModalState.modalTempSelected.delete(option.value);
            } else {
                filterModalState.modalTempSelected.add(option.value);
            }
            renderModalOptions(allOptions, document.getElementById('filter-modal-search')?.value || '');
        });

        list.appendChild(item);
    });
}

/**
 * Abre el modal para el tipo de filtro indicado.
 */
function openFilterModal(type) {
    const overlay = document.getElementById('filter-modal-overlay');
    const titleEl = document.getElementById('filter-modal-title');
    const searchInput = document.getElementById('filter-modal-search');
    if (!overlay || !titleEl) return;

    filterModalState.currentFilterType = type;

    // Inicializar selección temporal con la selección actual del estado
    filterModalState.modalTempSelected = new Set(getCurrentSelectionForType(type));

    // Configurar título
    const titles = {
        years:     '🔍 Filtrar Años',
        months:    '🔍 Filtrar Meses',
        quincenas: '🔍 Filtrar Quincenas',
        types:     '🔍 Filtrar Tipo de Nómina',
        employees: '🔍 Filtrar Personas',
        concepts:  '🔍 Filtrar Conceptos',
        cargos:    '🔍 Filtrar por Cargo',
        cecos:     '🔍 Filtrar Centros de Costo',
        employee_single: '👤 Seleccionar Colaborador',
        concept_single: '🔍 Seleccionar Concepto',
        p1: '📅 Seleccionar Periodo 1 (Base)',
        p2: '📅 Seleccionar Periodo 2 (Comparado)',
        period_compare_employees: '👤 Filtrar Colaborador',
        concept_compare_concepts: '🔍 Filtrar Concepto',
        ceco_compare_cecos: '🏢 Filtrar Centro de Costo',
        cargo_compare_cargos: '🎖️ Filtrar Cargo'
    };
    titleEl.textContent = titles[type] || 'Filtrar Opciones';

    // Limpiar y resetear el buscador interno
    if (searchInput) searchInput.value = '';

    // Cargar y renderizar opciones
    const allOptions = getFilterOptions(type);
    renderModalOptions(allOptions, '');

    // Listener de búsqueda interna (se clona el nodo para evitar duplicados)
    if (searchInput) {
        const newSearch = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearch, searchInput);
        newSearch.addEventListener('input', e => {
            renderModalOptions(allOptions, e.target.value);
        });
        // Autofocus
        requestAnimationFrame(() => newSearch.focus());
    }

    // Mostrar modal
    overlay.classList.add('show');
}

/**
 * Cierra el modal sin aplicar cambios.
 */
function closeFilterModal() {
    const overlay = document.getElementById('filter-modal-overlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
    filterModalState.currentFilterType = null;
    filterModalState.modalTempSelected = new Set();
}

/**
 * Registra todos los eventos del modal. Se llama UNA SOLA VEZ al iniciar la app.
 */
function initFilterModal() {
    // Botón cerrar (X)
    const btnClose = document.getElementById('btn-close-filter-modal');
    if (btnClose) {
        btnClose.addEventListener('click', closeFilterModal);
    }

    // Clic fuera del panel del modal
    const overlay = document.getElementById('filter-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeFilterModal();
        });
    }

    // Botón Limpiar
    const btnClear = document.getElementById('btn-filter-modal-clear');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            filterModalState.modalTempSelected.clear();
            const allOptions = getFilterOptions(filterModalState.currentFilterType);
            renderModalOptions(allOptions, document.getElementById('filter-modal-search')?.value || '');
        });
    }

    // Botón Aceptar
    const btnAccept = document.getElementById('btn-filter-modal-accept');
    if (btnAccept) {
        btnAccept.addEventListener('click', () => {
            const type = filterModalState.currentFilterType;
            if (type) {
                applyModalSelection(type);
                closeFilterModal();
                
                if (type === 'years' || type === 'months' || type === 'quincenas' || type === 'types') {
                    processData();
                }
                
                renderActiveTab();
            }
        });
    }

    // Botones lupa por filtro
    const filterButtonMap = [
        { btnId: 'btn-open-filter-years',          type: 'years'     },
        { btnId: 'btn-open-filter-months',         type: 'months'    },
        { btnId: 'btn-open-filter-quincenas',       type: 'quincenas' },
        { btnId: 'btn-open-filter-types',          type: 'types'     },
        { btnId: 'btn-open-filter-employees',      type: 'employees' },
        { btnId: 'btn-open-filter-concepts',       type: 'concepts'  },
        { btnId: 'btn-open-filter-cargos',         type: 'cargos'    },
        { btnId: 'btn-open-filter-cecos',          type: 'cecos'     },
        { btnId: 'btn-open-filter-employee-label',  type: 'employee_single' },
        { btnId: 'btn-open-filter-concept-label',   type: 'concept_single' },
        
        // Pestaña Análisis Masivo por Persona
        { btnId: 'period-compare-p1-label',        type: 'p1' },
        { btnId: 'period-compare-p2-label',        type: 'p2' },
        { btnId: 'period-compare-employees-label', type: 'period_compare_employees' },
        { btnId: 'period-compare-tipo-label',      type: 'types' },
        
        // Pestaña Análisis Masivo por Concepto
        { btnId: 'concept-compare-p1-label',       type: 'p1' },
        { btnId: 'concept-compare-p2-label',       type: 'p2' },
        { btnId: 'concept-compare-concepts-label', type: 'concept_compare_concepts' },
        { btnId: 'concept-compare-tipo-label',     type: 'types' },
        
        // Pestaña Análisis Masivo por CECO
        { btnId: 'ceco-compare-p1-label',          type: 'p1' },
        { btnId: 'ceco-compare-p2-label',          type: 'p2' },
        { btnId: 'ceco-compare-cecos-label',       type: 'ceco_compare_cecos' },
        { btnId: 'ceco-compare-tipo-label',        type: 'types' },
        
        // Pestaña Análisis Masivo por Cargo
        { btnId: 'cargo-compare-p1-label',         type: 'p1' },
        { btnId: 'cargo-compare-p2-label',         type: 'p2' },
        { btnId: 'cargo-compare-cargos-label',     type: 'cargo_compare_cargos' },
        { btnId: 'cargo-compare-tipo-label',        type: 'types' }
    ];

    filterButtonMap.forEach(({ btnId, type }) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => openFilterModal(type));
        }
    });

    // Tecla Escape para cerrar
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeFilterModal();
    });
}



function renderCompareTags() {
    const container = document.getElementById('compare-tags-container');
    if (!container) return;
    
    container.innerHTML = '';
    const peopleMap = {};
    state.data.forEach(d => {
        peopleMap[d.c] = d.n;
    });
    
    if (state.compareEmployees.length === 0) {
        const allTag = document.createElement('div');
        allTag.className = 'tag-item';
        allTag.style.background = 'rgba(0,0,0,0.08)';
        allTag.style.color = 'var(--text-muted)';
        allTag.innerHTML = `<span>Todos</span>`;
        container.appendChild(allTag);
        return;
    }
    
    state.compareEmployees.forEach(cedula => {
        const name = peopleMap[cedula] || 'Desconocido';
        const tag = document.createElement('div');
        tag.className = 'tag-item';
        tag.innerHTML = `
            <span>${name.split(' ')[0]} (C.C. ${cedula})</span>
            <svg class="remove-tag" data-cedula="${cedula}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        `;
        
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
            const ced = e.currentTarget.getAttribute('data-cedula');
            state.compareEmployees = state.compareEmployees.filter(c => c !== ced);
            renderActiveTab();
        });
        
        container.appendChild(tag);
    });
}

function renderCompareConceptTags() {
    const container = document.getElementById('compare-concept-tags-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (state.compareConcepts.length === 0) {
        const allTag = document.createElement('div');
        allTag.className = 'tag-item';
        allTag.style.background = 'rgba(0,0,0,0.08)';
        allTag.style.color = 'var(--text-muted)';
        allTag.innerHTML = `<span>Todos (Neto Total)</span>`;
        container.appendChild(allTag);
        return;
    }
    
    state.compareConcepts.forEach(concept => {
        const tag = document.createElement('div');
        tag.className = 'tag-item';
        tag.style.background = 'rgba(16, 185, 129, 0.15)'; 
        tag.style.color = '#34d399';
        tag.style.border = '1px solid rgba(52, 211, 153, 0.2)';
        
        tag.innerHTML = `
            <span>${concept}</span>
            <svg class="remove-concept-tag" data-concept="${concept}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; cursor:pointer;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        `;
        
        tag.querySelector('.remove-concept-tag').addEventListener('click', (e) => {
            const co = e.currentTarget.getAttribute('data-concept');
            state.compareConcepts = state.compareConcepts.filter(c => c !== co);
            renderActiveTab();
        });
        
        container.appendChild(tag);
    });
}

function renderCompareCargoTags() {

    const container = document.getElementById('compare-cargo-tags-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (state.compareCargos.length === 0) {
        const allTag = document.createElement('div');
        allTag.className = 'tag-item';
        allTag.style.background = 'rgba(0,0,0,0.08)';
        allTag.style.color = 'var(--text-muted)';
        allTag.innerHTML = `<span>Todos</span>`;
        container.appendChild(allTag);
        return;
    }
    
    state.compareCargos.forEach(item => {
        const tag = document.createElement('div');
        tag.className = 'tag-item';
        tag.style.background = 'rgba(59, 130, 246, 0.15)'; 
        tag.style.color = '#60a5fa';
        tag.style.border = '1px solid rgba(59, 130, 246, 0.2)';
        tag.innerHTML = `
            <span>${item}</span>
            <svg class="remove-cargo-tag" data-val="${item}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; cursor:pointer;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        `;
        tag.querySelector('.remove-cargo-tag').addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-val');
            state.compareCargos = state.compareCargos.filter(x => x !== val);
            renderActiveTab();
        });
        container.appendChild(tag);
    });
}

function renderCompareCecoTags() {
    const container = document.getElementById('compare-ceco-tags-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (state.compareCecos.length === 0) {
        const allTag = document.createElement('div');
        allTag.className = 'tag-item';
        allTag.style.background = 'rgba(0,0,0,0.08)';
        allTag.style.color = 'var(--text-muted)';
        allTag.innerHTML = `<span>Todos</span>`;
        container.appendChild(allTag);
        return;
    }
    
    state.compareCecos.forEach(item => {
        const tag = document.createElement('div');
        tag.className = 'tag-item';
        tag.style.background = 'rgba(168, 85, 247, 0.15)'; 
        tag.style.color = '#c084fc';
        tag.style.border = '1px solid rgba(168, 85, 247, 0.2)';
        tag.innerHTML = `
            <span>${item}</span>
            <svg class="remove-ceco-tag" data-val="${item}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; cursor:pointer;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        `;
        tag.querySelector('.remove-ceco-tag').addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-val');
            state.compareCecos = state.compareCecos.filter(x => x !== val);
            renderActiveTab();
        });
        container.appendChild(tag);
    });
}

function renderCompareChart() {
    const ctx = document.getElementById('compare-employees-chart');
    if (!ctx) return;
    
    const selectedConcepts = new Set(state.compareConcepts);
    const selectedCargos = new Set(state.compareCargos);
    const selectedCecos = new Set(state.compareCecos);
    const filterByConcept = selectedConcepts.size > 0;
    const filterByCargo = selectedCargos.size > 0;
    const filterByCeco = selectedCecos.size > 0;
    
    let selectedCedulas = state.compareEmployees;
    if (selectedCedulas.length === 0) {
        if (filterByCargo || filterByCeco) {
            const matchingPeople = new Set();
            state.data.forEach(d => {
                const matchesCargo = !filterByCargo || selectedCargos.has(d.cg);
                const matchesCeco = !filterByCeco || selectedCecos.has(`${d.cc} - ${d.dcc}`);
                if (matchesCargo && matchesCeco) matchingPeople.add(d.c);
            });
            selectedCedulas = Array.from(matchingPeople);
            ctx.style.display = 'block';
            document.getElementById('compare-empty-msg').style.display = 'none';
        } else {
            ctx.style.display = 'none';
            document.getElementById('compare-empty-msg').style.display = 'block';
            return;
        }
    } else {
        ctx.style.display = 'block';
        document.getElementById('compare-empty-msg').style.display = 'none';
    }
    
    const data = state.filteredData;
    
    // Meses
    const isFiltered = state.selectedYears && state.selectedYears.length === 1;
    // Encontrar todos los meses presentes en el set
    const allMonthsSet = new Set(data.map(d => isFiltered ? d.m : `${d.a} - ${d.m}`));
    const sortedLabels = [...allMonthsSet].sort((a,b) => {
        if (isFiltered) {
            return (MONTH_ORDER[a] || 0) - (MONTH_ORDER[b] || 0);
        } else {
            const partsA = a.split(' - ');
            const partsB = b.split(' - ');
            if (partsA[0] !== partsB[0]) return parseInt(partsA[0]) - parseInt(partsB[0]);
            return (MONTH_ORDER[partsA[1]] || 0) - (MONTH_ORDER[partsB[1]] || 0);
        }
    });
    
    // Obtener nombres de los comparados
    const peopleMap = {};
    state.data.forEach(d => {
        peopleMap[d.c] = d.n;
    });
    
    // Paleta pastel NomAI para graficos comparativos
    const colorPalette = [
        'rgba(167, 139, 250, 0.85)', // Lavender
        'rgba(244, 114, 182, 0.85)', // Rose
        'rgba(129, 140, 248, 0.85)', // Indigo
        'rgba(251, 191, 36,  0.85)', // Amber
        'rgba(110, 231, 183, 0.85)', // Mint
        'rgba(147, 197, 253, 0.85)', // Sky Blue
        'rgba(253, 164, 175, 0.85)'  // Coral
    ];
    
    const datasets = selectedCedulas.map((cedula, idx) => {
        const empData = data.filter(d => d.c === cedula);
        
        // Agrupar sumas por mes
        const monthlySum = {};
        empData.forEach(d => {
            if (filterByCargo && (!d.cg || !selectedCargos.has(d.cg))) return;
            if (filterByCeco && (!d.cc || !d.dcc || !selectedCecos.has(`${d.cc} - ${d.dcc}`))) return;
            
            const key = isFiltered ? d.m : `${d.a} - ${d.m}`;
            if (!monthlySum[key]) monthlySum[key] = 0;
            
            if (filterByConcept) {
                if (selectedConcepts.has(d.co)) {
                    monthlySum[key] += d.v;
                }
            } else {
                // Comportamiento por defecto: Salario Neto
                if (d.na === 'DEVENGO' || d.na === 'DESCUENTO') {
                    monthlySum[key] += d.v; // descuentos ya son negativos en data
                }
            }
        });
        
        const dataValues = sortedLabels.map(label => monthlySum[label] || 0);
        const color = colorPalette[idx % colorPalette.length];
        
        return {
            label: '  ' + (peopleMap[cedula] || cedula),
            data: dataValues,
            borderColor: color,
            backgroundColor: color + '15', // Opacidad del 8%
            borderWidth: 2.5,
            pointBackgroundColor: color,
            tension: 0.25,
            fill: false
        };
    });
    
    if (state.charts['compareChart']) {
        state.charts['compareChart'].destroy();
    }
    
    state.charts['compareChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: window.innerWidth <= 768 ? 8 : 9 },
                        padding: window.innerWidth <= 768 ? 6 : 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: window.innerWidth <= 768 ? 3 : 4
                    }
                },
                tooltip: {
                    backgroundColor: '#FFFFFF',
                    titleColor: '#1A1D2E',
                    bodyColor: '#6B7280',
                    borderColor: 'rgba(0,0,0,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `  ${context.dataset.label.trim()}: ${currencyFormatter.format(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    ticks: { color: '#9CA3AF', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: {
                        color: '#9CA3AF',
                        font: { family: 'Outfit', size: 10 },
                        callback: function(value) { return formatShortCurrency(value); }
                    }
                }
            }
        }
    });
}

function renderHeatmapMatrix() {
    const tableHeader = document.getElementById('heatmap-header-tr');
    const tbody = document.getElementById('heatmap-tbody');
    if (!tableHeader || !tbody) return;
    
    const data = state.filteredData;
    const isFiltered = state.selectedYears && state.selectedYears.length === 1;
    
    // Filters applied
    const selectedCedulasSet = new Set(state.compareEmployees);
    const selectedConceptsSet = new Set(state.compareConcepts);
    const selectedCargosSet = new Set(state.compareCargos);
    const selectedCecosSet = new Set(state.compareCecos);
    const filterByConcept = selectedConceptsSet.size > 0;
    const filterByPerson = selectedCedulasSet.size > 0;
    const filterByCargo = selectedCargosSet.size > 0;
    const filterByCeco = selectedCecosSet.size > 0;
    
    // Encontrar todos los meses/periodos ordenados
    const allMonthsSet = new Set(data.map(d => isFiltered ? d.m : `${d.a}-${d.m}`));
    const sortedPeriods = [...allMonthsSet].sort((a,b) => {
        if (isFiltered) {
            return (MONTH_ORDER[a] || 0) - (MONTH_ORDER[b] || 0);
        } else {
            const partsA = a.split('-');
            const partsB = b.split('-');
            if (partsA[0] !== partsB[0]) return parseInt(partsA[0]) - parseInt(partsB[0]);
            return (MONTH_ORDER[partsA[1]] || 0) - (MONTH_ORDER[partsB[1]] || 0);
        }
    });
    
    // Dibujar cabecera
    tableHeader.innerHTML = '<th>Colaborador</th>';
    sortedPeriods.forEach(p => {
        // Formatear para cabecera corta (ej: "Sept" o "2023-Sept")
        const label = isFiltered ? p.substring(0, 4) + '.' : p.split('-')[0].substring(2) + '-' + p.split('-')[1].substring(0, 3) + '.';
        const th = document.createElement('th');
        th.style.textAlign = 'right';
        th.innerText = label;
        tableHeader.appendChild(th);
    });
    // Añadir columna de Total
    const thTotal = document.createElement('th');
    thTotal.style.textAlign = 'right';
    thTotal.innerText = 'Total ' + (filterByConcept ? 'Filtrado' : 'Neto');
    tableHeader.appendChild(thTotal);
    
    // Obtener personas a mostrar (filtradas o todas las activas)
    let people = getUniquePeopleSorted();
    if (filterByPerson) {
        people = people.filter(p => selectedCedulasSet.has(p.cedula));
    } else if (filterByCargo || filterByCeco) {
        const matchingCedulas = new Set();
        data.forEach(d => {
            const matchesCargo = !filterByCargo || selectedCargosSet.has(d.cg);
            const matchesCeco = !filterByCeco || selectedCecosSet.has(`${d.cc} - ${d.dcc}`);
            if (matchesCargo && matchesCeco) matchingCedulas.add(d.c);
        });
        people = people.filter(p => matchingCedulas.has(p.cedula));
    }
    
    // Calcular netos por persona y periodo
    const matrix = {}; // matrix[cedula][periodo] = neto
    const totals = {}; // totals[cedula] = netoAcumulado
    let maxNet = 0;
    let minNet = 0;
    
    people.forEach(p => {
        matrix[p.cedula] = {};
        totals[p.cedula] = 0;
    });
    
    data.forEach(d => {
        if (filterByPerson && !selectedCedulasSet.has(d.c)) return; // Skip if not selected
        if (filterByCargo && (!d.cg || !selectedCargosSet.has(d.cg))) return;
        if (filterByCeco && (!d.cc || !d.dcc || !selectedCecosSet.has(`${d.cc} - ${d.dcc}`))) return;
        
        const periodKey = isFiltered ? d.m : `${d.a}-${d.m}`;
        
        let shouldSum = false;
        if (filterByConcept) {
            shouldSum = selectedConceptsSet.has(d.co);
        } else {
            shouldSum = (d.na === 'DEVENGO' || d.na === 'DESCUENTO');
        }
        
        if (shouldSum) {
            if (!matrix[d.c][periodKey]) matrix[d.c][periodKey] = 0;
            matrix[d.c][periodKey] += d.v; 
            totals[d.c] += d.v;
            
            const val = matrix[d.c][periodKey];
            if (val > maxNet) maxNet = val;
            if (val < minNet) minNet = val;
        }
    });
    
    tbody.innerHTML = '';
    
    // Filtrar personas que tienen algun pago en el periodo
    const activePeople = people.filter(p => totals[p.cedula] !== 0);
    
    if (activePeople.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${sortedPeriods.length + 2}" style="text-align: center; color: var(--text-muted);">No hay datos para esta selección</td></tr>`;
        return;
    }
    
    // Semáforo si hay conceptos filtrados, azul si es neto general
    const useSemaphore = filterByConcept;
    const maxPosVal = maxNet > 0 ? maxNet : 1;
    const maxNegVal = minNet < 0 ? Math.abs(minNet) : 1;
    
    const verticalTotals = {};
    sortedPeriods.forEach(period => verticalTotals[period] = 0);
    let grandTotal = 0;

    activePeople.forEach(p => {
        const tr = document.createElement('tr');
        
        let rowHtml = `<td>
            <div style="font-weight:600; color: var(--text-secondary);">${p.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">C.C. ${p.cedula}</div>
        </td>`;
        
        sortedPeriods.forEach(period => {
            const val = matrix[p.cedula][period] || 0;
            verticalTotals[period] += val;
            
            let heatStyle = '';
            let heatClass = 'heatmap-cell';
            
            if (useSemaphore) {
                // Semáforo: Verde para positivo, Rojo para negativo
                if (val > 0) {
                    const intensity = Math.min(Math.max(val / maxPosVal, 0.1), 1);
                    heatStyle = `background-color: rgba(16, 185, 129, ${intensity * 0.4});`;
                } else if (val < 0) {
                    const intensity = Math.min(Math.max(Math.abs(val) / maxNegVal, 0.1), 1);
                    heatStyle = `background-color: rgba(239, 68, 68, ${intensity * 0.4});`;
                }
            } else {
                // Original: Azul para positivo basado en calor (lv0-10)
                let lvClass = 'heat-lv0';
                if (val > 0 && maxNet > 0) {
                    const ratio = val / maxNet;
                    const lv = Math.min(Math.ceil(ratio * 10), 10);
                    lvClass = `heat-lv${lv}`;
                }
                heatClass += ` ${lvClass}`;
            }
            
            rowHtml += `<td class="${heatClass}" style="${heatStyle}">
                ${val !== 0 ? currencyFormatter.format(val) : '-'}
            </td>`;
        });
        
        grandTotal += totals[p.cedula];
        
        // Columna del total neto
        rowHtml += `<td style="text-align: right; font-weight:normal; background-color: rgba(0,0,0,0.05); border-left:1px solid var(--border-color);">
            ${currencyFormatter.format(totals[p.cedula])}
        </td>`;
        
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });
    
    // Fila de totales verticales
    const totalRow = document.createElement('tr');
    totalRow.style.backgroundColor = 'rgba(0,0,0,0.06)';
    totalRow.style.borderTop = '2px solid var(--border-color)';
    
    let totalHtml = `<td><div style="font-weight:normal; color:var(--text-secondary); text-align:right;">TOTALES:</div></td>`;
    sortedPeriods.forEach(period => {
        totalHtml += `<td style="text-align: right; font-weight:normal; color: var(--text-primary); padding: 12px 16px;">${currencyFormatter.format(verticalTotals[period])}</td>`;
    });
    totalHtml += `<td style="text-align: right; font-weight:normal; color: var(--text-primary); border-left:1px solid var(--border-color); padding: 12px 16px;">
        ${currencyFormatter.format(grandTotal)}
    </td>`;
    
    totalRow.innerHTML = totalHtml;
    tbody.appendChild(totalRow);
}

// ==========================================
// IMPORTACIÓN: DRAG AND DROP EXCEL
// ==========================================
function initImporter() {
    const importZone = document.getElementById('import-drop-zone');
    const fileInput = document.getElementById('excel-file-input');
    const fileInfo = document.getElementById('file-info-box');
    
    if (!importZone || !fileInput) return;
    
    // Click en la zona abre el selector de archivo
    importZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Eventos dragover / dragenter / dragleave
    ['dragenter', 'dragover'].forEach(eventName => {
        importZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            importZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        importZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            importZone.classList.remove('dragover');
        }, false);
    });
    
    // Drop de archivo
    importZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleExcelFile(files[0]);
        }
    });
    
    // Selector de archivo cambio
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleExcelFile(e.target.files[0]);
        }
    });

    // Inicializar controles de la carpeta local
    initFolderControls();
}

function handleExcelFile(file) {
    const fileInfo = document.getElementById('file-info-box');
    const importZone = document.getElementById('import-drop-zone');
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Por favor, selecciona únicamente archivos de Excel (.xlsx, .xls)');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const arrayBuffer = e.target.result;
            const mappedData = parseExcelFile(arrayBuffer, file.name);
            const consolidated = aggregateRecords(mappedData);
            
            if (consolidated.length === 0) {
                alert('No se encontraron registros de pagos válidos.');
                return;
            }
            
            // Cargar en el estado global
            state.data = consolidated.filter(d => d.na !== 'BENEFICIO');
            
            // Inicializar caché de valores únicos con nuevos datos
            initUniqueValuesCache();
            
            // Reiniciar filtros y selecciones para evitar inconsistencias
            state.selectedYears = getUniqueYears();
            state.selectedMonths = getUniqueMonths();
            state.selectedQuincenas = getUniqueQuincenas();
            state.selectedEmployeeCedula = '';
            state.selectedConceptName = '';
            state.compareEmployees = [];
            state.comparePeriods = [];
            state.compareConcepts = [];
            state.compareCecos = [];
            state.compareCargos = [];
            // Resetear periodos de comparación para que se reinicialicen con los nuevos datos
            state.comparePeriod1 = '';
            state.comparePeriod2 = '';
            state.conceptComparePeriod1 = '';
            state.conceptComparePeriod2 = '';
            state.cecoComparePeriod1 = '';
            state.cecoComparePeriod2 = '';
            state.cargoComparePeriod1 = '';
            state.cargoComparePeriod2 = '';
            // Resetear filtros de los comparadores masivos
            state.periodCompareSelectedEmployees = [];
            state.conceptCompareSelectedConcepts = [];
            state.cecoCompareSelectedCecos = [];
            state.cargoCompareSelectedCargos = [];
            state.selectedTipoNomina = [];
            
            processData();
            
            // Mostrar confirmación
            if (fileInfo) {
                fileInfo.style.display = 'inline-flex';
                document.getElementById('file-info-text').innerText = `¡Cargados con éxito ${consolidated.length} registros del archivo: ${file.name}!`;
            }
            
            // Llenar selectores de periodos con nuevos datos
            initPeriodCompareSelectors();
            initConceptCompareSelectors();
            initCecoCompareSelectors();
            initCargoCompareSelectors();
            
            // Mostrar pestaña resumen
            setTimeout(() => {
                switchTab('overview');
            }, 1500);
            
        } catch (error) {
            console.error('Error procesando archivo:', error);
            alert(`Error al procesar el archivo Excel: ${error.message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// CONFIGURACIÓN Y CARGA DESDE CARPETA LOCAL
// ==========================================

const DB_NAME = 'NomAIFolderStorage';
const STORE_NAME = 'handles';

function openFolderDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function storeFolderHandle(handle) {
    try {
        const db = await openFolderDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(handle, 'folderHandle');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error('Error guardando handle de carpeta en DB:', err);
    }
}

async function getStoredFolderHandle() {
    try {
        const db = await openFolderDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('folderHandle');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.error('Error leyendo handle de carpeta de DB:', err);
        return null;
    }
}

async function initFolderControls() {
    const btnSelect = document.getElementById('btn-select-folder');
    const btnImport = document.getElementById('btn-import-selected');
    const btnRefresh = document.getElementById('btn-refresh-folder');
    const chkSelectAll = document.getElementById('chk-select-all-files');
    
    if (!btnSelect) return;
    
    btnSelect.addEventListener('click', async () => {
        await handleSelectFolder();
    });
    
    btnRefresh.addEventListener('click', async () => {
        await handleRefreshFolder();
    });
    
    btnImport.addEventListener('click', async () => {
        await handleImportSelected();
    });
    
    if (chkSelectAll) {
        chkSelectAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.chk-folder-file').forEach(chk => {
                chk.checked = checked;
            });
            updateImportSelectedButtonState();
        });
    }
    
    await restorePersistedFolder();
}

async function restorePersistedFolder() {
    const handle = await getStoredFolderHandle();
    if (handle) {
        state.folderHandle = handle;
        const statusText = document.getElementById('folder-status-text');
        if (statusText) {
            statusText.innerHTML = `Carpeta persistida: <strong>${handle.name}</strong>. Haz clic en <strong>Configurar Carpeta</strong> para autorizar acceso o reconfigurar.`;
        }
        const btnRefresh = document.getElementById('btn-refresh-folder');
        if (btnRefresh) btnRefresh.style.display = 'inline-flex';
    }
}

async function handleSelectFolder() {
    if (!window.showDirectoryPicker) {
        alert('Tu navegador no soporta el acceso al sistema de archivos local. Por favor, usa Google Chrome o Microsoft Edge.');
        return;
    }
    
    try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        state.folderHandle = handle;
        await storeFolderHandle(handle);
        
        await handleRefreshFolder();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error seleccionando carpeta:', err);
            alert('No se pudo acceder a la carpeta seleccionada.');
        }
    }
}

async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = 'readwrite';
    }
    if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
    }
    return false;
}

async function handleRefreshFolder() {
    if (!state.folderHandle) return;
    
    const statusText = document.getElementById('folder-status-text');
    const container = document.getElementById('folder-files-container');
    const btnImport = document.getElementById('btn-import-selected');
    const btnRefresh = document.getElementById('btn-refresh-folder');
    
    try {
        const hasPermission = await verifyPermission(state.folderHandle, false);
        if (!hasPermission) {
            if (statusText) {
                statusText.innerHTML = `<span style="color: #EF4444;">Acceso denegado a la carpeta. Vuelve a configurar.</span>`;
            }
            return;
        }
        
        if (statusText) {
            statusText.innerHTML = `Carpeta configurada: <strong>${state.folderHandle.name}</strong>`;
        }
        
        const files = [];
        for await (const entry of state.folderHandle.values()) {
            if (entry.kind === 'file' && (entry.name.toLowerCase().endsWith('.xlsx') || entry.name.toLowerCase().endsWith('.xls'))) {
                files.push(entry);
            }
        }
        
        files.sort((a, b) => a.name.localeCompare(b.name));
        state.folderFiles = files;
        
        await renderFolderFiles();
        
        if (container) container.style.display = 'block';
        if (btnImport) btnImport.style.display = 'inline-flex';
        if (btnRefresh) btnRefresh.style.display = 'inline-flex';
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
    } catch (err) {
        console.error('Error cargando archivos de la carpeta:', err);
        if (statusText) {
            statusText.innerHTML = `<span style="color: #EF4444;">Error al leer la carpeta: ${err.message}</span>`;
        }
    }
}

async function renderFolderFiles() {
    const tbody = document.getElementById('folder-files-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (state.folderFiles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron archivos de Excel (.xlsx, .xls) en esta carpeta.</td></tr>`;
        return;
    }
    
    for (let i = 0; i < state.folderFiles.length; i++) {
        const entry = state.folderFiles[i];
        const file = await entry.getFile();
        const sizeStr = formatBytes(file.size);
        
        const tr = document.createElement('tr');
        tr.id = `row-file-${i}`;
        tr.innerHTML = `
            <td style="padding: 10px 12px; vertical-align: middle;">
                <input type="checkbox" class="chk-folder-file" data-index="${i}" checked style="cursor: pointer;">
            </td>
            <td style="padding: 10px 12px; vertical-align: middle; font-weight: 500;">
                <span style="display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="file-spreadsheet" style="color: #10B981; width: 16px; height: 16px; flex-shrink: 0;"></i>
                    ${entry.name}
                </span>
            </td>
            <td style="padding: 10px 12px; vertical-align: middle; text-align: right; color: var(--text-secondary);">${sizeStr}</td>
            <td style="padding: 10px 12px; vertical-align: middle; text-align: center;" id="status-file-${i}">
                <span class="badge-status" style="background: rgba(107, 114, 128, 0.08); color: var(--text-secondary); border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600;">Listo</span>
            </td>
            <td style="padding: 10px 12px; vertical-align: middle; text-align: right;">
                <button class="btn btn-secondary btn-load-single-file" data-index="${i}" style="padding: 4px 8px; font-size: 0.75rem; height: 26px;">
                    Cargar
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    }
    
    document.querySelectorAll('.chk-folder-file').forEach(chk => {
        chk.addEventListener('change', () => {
            updateImportSelectedButtonState();
        });
    });
    
    document.querySelectorAll('.btn-load-single-file').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            await loadSingleFolderFile(idx);
        });
    });
    
    updateImportSelectedButtonState();
}

function updateImportSelectedButtonState() {
    const checkedCount = document.querySelectorAll('.chk-folder-file:checked').length;
    const btnImport = document.getElementById('btn-import-selected');
    const summary = document.getElementById('folder-files-summary');
    
    if (btnImport) {
        btnImport.disabled = (checkedCount === 0);
    }
    if (summary) {
        summary.innerText = `${checkedCount} de ${state.folderFiles.length} archivos seleccionados`;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function loadSingleFolderFile(index) {
    const fileEntry = state.folderFiles[index];
    const statusCol = document.getElementById(`status-file-${index}`);
    
    if (!fileEntry || !statusCol) return;
    
    statusCol.innerHTML = `<span style="color: var(--primary); font-weight:600;"><i data-lucide="loader-2" class="spin-animation" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>Cargando...</span>`;
    if (window.lucide) window.lucide.createIcons();
    
    try {
        const file = await fileEntry.getFile();
        const arrayBuffer = await file.arrayBuffer();
        
        const mappedData = parseExcelFile(arrayBuffer, file.name);
        const consolidated = aggregateRecords(mappedData);
        
        state.data = consolidated.filter(d => d.na !== 'BENEFICIO');
        
        // Inicializar caché de valores únicos con nuevos datos
        initUniqueValuesCache();
        
        state.selectedYears = getUniqueYears();
        state.selectedMonths = getUniqueMonths();
        state.selectedQuincenas = getUniqueQuincenas();
        state.selectedEmployeeCedula = '';
        state.selectedConceptName = '';
        state.compareEmployees = [];
        
        processData();
        
        statusCol.innerHTML = `<span class="badge-status" style="background: rgba(16, 185, 129, 0.1); color: #10B981; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600;">Cargado</span>`;
        
        initPeriodCompareSelectors();
        initConceptCompareSelectors();
        initCecoCompareSelectors();
        initCargoCompareSelectors();
        
        const fileInfo = document.getElementById('file-info-box');
        if (fileInfo) {
            fileInfo.style.display = 'inline-flex';
            document.getElementById('file-info-text').innerText = `¡Cargado con éxito: ${file.name}!`;
        }
        
        setTimeout(() => {
            switchTab('overview');
        }, 1200);
        
    } catch (err) {
        console.error('Error al cargar archivo individual:', err);
        statusCol.innerHTML = `<span class="badge-status" style="background: rgba(239, 68, 68, 0.1); color: #EF4444; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600;">Error</span>`;
        alert(`Error al cargar el archivo ${fileEntry.name}: ${err.message}`);
    }
    
    if (window.lucide) window.lucide.createIcons();
}

async function handleImportSelected() {
    const checkedBoxes = document.querySelectorAll('.chk-folder-file:checked');
    if (checkedBoxes.length === 0) return;
    
    const btnImport = document.getElementById('btn-import-selected');
    const originalText = btnImport.innerHTML;
    
    btnImport.disabled = true;
    btnImport.innerHTML = `<i data-lucide="loader-2" class="spin-animation" style="width:16px; height:16px;"></i> Importando...`;
    if (window.lucide) window.lucide.createIcons();
    
    let allRecords = [];
    let processedCount = 0;
    
    for (const chk of checkedBoxes) {
        const idx = parseInt(chk.getAttribute('data-index'));
        const fileEntry = state.folderFiles[idx];
        const statusCol = document.getElementById(`status-file-${idx}`);
        
        if (!fileEntry || !statusCol) continue;
        
        statusCol.innerHTML = `<span style="color: var(--primary); font-weight:600;"><i data-lucide="loader-2" class="spin-animation" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>Cargando...</span>`;
        if (window.lucide) window.lucide.createIcons();
        
        try {
            const file = await fileEntry.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const mappedData = parseExcelFile(arrayBuffer, file.name);
            
            allRecords = allRecords.concat(mappedData);
            
            statusCol.innerHTML = `<span class="badge-status" style="background: rgba(16, 185, 129, 0.1); color: #10B981; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600;">Procesado</span>`;
            processedCount++;
        } catch (err) {
            console.error(`Error procesando archivo ${fileEntry.name}:`, err);
            statusCol.innerHTML = `<span class="badge-status" style="background: rgba(239, 68, 68, 0.1); color: #EF4444; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600;">Error</span>`;
        }
        
        if (window.lucide) window.lucide.createIcons();
    }
    
    btnImport.innerHTML = originalText;
    btnImport.disabled = false;
    
    if (allRecords.length === 0) {
        alert('No se pudo procesar ningún registro válido de los archivos seleccionados.');
        return;
    }
    
    const consolidated = aggregateRecords(allRecords);
    state.data = consolidated.filter(d => d.na !== 'BENEFICIO');
    
    // Inicializar caché de valores únicos con nuevos datos
    initUniqueValuesCache();
    
    state.selectedYears = getUniqueYears();
    state.selectedMonths = getUniqueMonths();
    state.selectedQuincenas = getUniqueQuincenas();
    state.selectedEmployeeCedula = '';
    state.selectedConceptName = '';
    state.compareEmployees = [];
    // Resetear periodos de comparación para que se reinicialicen con los nuevos datos
    state.comparePeriod1 = '';
    state.comparePeriod2 = '';
    state.conceptComparePeriod1 = '';
    state.conceptComparePeriod2 = '';
    state.cecoComparePeriod1 = '';
    state.cecoComparePeriod2 = '';
    state.cargoComparePeriod1 = '';
    state.cargoComparePeriod2 = '';
    // Resetear filtros de los comparadores masivos
    state.periodCompareSelectedEmployees = [];
    state.conceptCompareSelectedConcepts = [];
    state.cecoCompareSelectedCecos = [];
    state.cargoCompareSelectedCargos = [];
    state.selectedTipoNomina = [];
    
    processData();
    
    initPeriodCompareSelectors();
    initConceptCompareSelectors();
    initCecoCompareSelectors();
    initCargoCompareSelectors();
    
    const fileInfo = document.getElementById('file-info-box');
    if (fileInfo) {
        fileInfo.style.display = 'inline-flex';
        document.getElementById('file-info-text').innerText = `¡Se importaron con éxito ${processedCount} archivos (${consolidated.length} registros consolidados)!`;
    }
    
    if (window.lucide) window.lucide.createIcons();
    
    setTimeout(() => {
        switchTab('overview');
    }, 1500);
}

function parseExcelFile(arrayBuffer, fileName) {
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    const headerRowIndex = findHeaderRowIndex(worksheet);
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        defval: null,
        range: headerRowIndex
    });
    
    if (jsonData.length === 0) {
        throw new Error('El archivo parece estar vacío.');
    }
    
    const firstRow = jsonData[0];
    const keys = Object.keys(firstRow);
    
    const getColKey = (stdNames) => {
        const cleanStr = (str) => {
            if (!str) return '';
            return str.toUpperCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/\s+/g, ' ')
                      .trim();
        };

        const cleanStdNames = stdNames.map(cleanStr);
        
        // 1. Coincidencia exacta primero (sin acentos, espacios normalizados)
        let found = keys.find(k => {
            const cleanK = cleanStr(k);
            return cleanStdNames.some(name => cleanK === name);
        });
        if (found) return found;
        
        // 2. Coincidencia parcial (inclusión)
        return keys.find(k => {
            const cleanK = cleanStr(k);
            return cleanStdNames.some(name => cleanK.includes(name));
        });
    };
    
    const kCed = getColKey(['CEDULA', 'IDENTIFICACION', 'IDENTIFICAC', 'DOCUMENTO', 'N PERS', 'ID']);
    const kApe = getColKey(['APELLIDOS', 'APELLIDO']);
    const kNom = getColKey(['NOMBRES', 'NOMBRE']);
    const kFullName = getColKey(['NOMBRE DEL EMPLEADO', 'COLABORADOR', 'NOMBRE COMPLETO', 'NOMBRE Y APELLIDO', 'NOMBRE Y APELLIDOS']);
    const kCon = getColKey(['NOMBRE CONCEPTO', 'NOMBRE DEL CONCEPTO', 'CONCEPTO']);
    const kTot = getColKey(['VALOR (+/-)', 'VALOR(+/-)', 'VALOR', 'TOTAL', 'IMPORTE']);
    const kMes = getColKey(['MES ACUMULADO', 'MES']);
    const kAnio = getColKey(['FECHA ACUMULA', 'AÑO', 'ANIO', 'FECHA']);
    const kTip = getColKey(['TIPO DE NOMINA', 'TIPO DE NÓMINA', 'TIPO']);
    const kNat = getColKey(['NATURALEZA']);
    const kCC = getColKey(['CENTRO DE COSTO', 'COD CECO', 'CECO', 'CENTRO COSTO']);
    const kDCC = getColKey(['NOMBRE CENTRO DE COSTO', 'DESCRIPCION CENTRO DE COSTO', 'DESC CECO', 'DESC CENTRO DE COSTO', 'DESCRIPCION CECO', 'NOMBRE CECO', 'DESCRIPCION', 'DETALLE CECO', 'DETALLE CENTRO DE COSTO']);
    const kCg = getColKey(['NOMBRE CARGO', 'CARGO']);
    const kPa = getColKey(['PERIODO ACUMULA', 'PERÍODO ACUMULA', 'PERIODO', 'PERÍODO', 'QUINCENA']);
    const kCant = getColKey(['CANTIDAD', 'CANT', 'HORAS', 'DIAS', 'CANT.']);
    
    if (!kCed || !kCon || !kTot) {
        throw new Error('No se encontraron las columnas mínimas requeridas (Cédula, Concepto y Valor).');
    }
    
    let fileMonth = null;
    let fileYear = null;
    
    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    
    const lowerName = fileName.toLowerCase();
    for (const mName of monthNames) {
        if (lowerName.includes(mName.toLowerCase())) {
            fileMonth = mName;
            break;
        }
    }
    
    const yearMatch = fileName.match(/(\d{4})/);
    if (yearMatch) {
        fileYear = parseInt(yearMatch[1]);
    }
    
    const mappedData = [];
    
    jsonData.forEach((row) => {
        const cedula = row[kCed];
        if (cedula === null || cedula === undefined || cedula.toString().trim() === "") {
            return;
        }
        
        let fullName = "";
        if (kFullName && row[kFullName]) {
            fullName = row[kFullName].toString().trim();
        } else {
            const apellidos = kApe && row[kApe] ? row[kApe].toString().trim() : "";
            const nombres = kNom && row[kNom] ? row[kNom].toString().trim() : "";
            fullName = `${apellidos} ${nombres}`.trim().replace(/\s+/g, ' ');
        }
        fullName = fullName.toUpperCase();
        
        let valNum = 0.0;
        const rawVal = row[kTot];
        if (rawVal !== null && rawVal !== undefined) {
            if (typeof rawVal === 'number') {
                valNum = rawVal;
            } else {
                const cleaned = rawVal.toString().replace(/[^\d.-]/g, '');
                valNum = parseFloat(cleaned) || 0.0;
            }
        }
        
        let cantNum = 0.0;
        if (kCant && row[kCant] !== null && row[kCant] !== undefined) {
            if (typeof row[kCant] === 'number') {
                cantNum = row[kCant];
            } else {
                const cleaned = row[kCant].toString().replace(/[^\d.-]/g, '');
                cantNum = parseFloat(cleaned) || 0.0;
            }
        }
        
        let mes = fileMonth;
        if (!mes && kMes && row[kMes]) {
            mes = row[kMes].toString().trim();
        }
        if (!mes) mes = "Desconocido";
        
        let anio = fileYear;
        if (!anio && kAnio && row[kAnio]) {
            const rawAnio = row[kAnio];
            if (typeof rawAnio === 'number') {
                if (rawAnio > 1900 && rawAnio < 2100) {
                    anio = Math.floor(rawAnio);
                } else {
                    const dateObj = new Date((rawAnio - 25569) * 86400 * 1000);
                    if (!isNaN(dateObj.getTime())) {
                        anio = dateObj.getFullYear();
                        if (!fileMonth) {
                            mes = monthNames[dateObj.getMonth()];
                        }
                    }
                }
            } else {
                const match = rawAnio.toString().match(/(\d{4})/);
                if (match) anio = parseInt(match[1]);
            }
        }
        if (!anio) anio = 2026;
        
        let nat = "DEVENGO";
        if (kNat && row[kNat]) {
            const cleanNat = row[kNat].toString().toUpperCase().trim();
            if (cleanNat.includes("DESCUENTO")) {
                nat = "DESCUENTO";
            }
        } else {
            if (valNum < 0) nat = "DESCUENTO";
        }
        
        if (nat === "DESCUENTO" && valNum > 0) {
            valNum = -valNum;
        }
        
        let tipo = "SALARIAL";
        if (kTip && row[kTip]) {
            tipo = row[kTip].toString().toUpperCase().trim();
        } else {
            const conceptUpper = (row[kCon] || "").toString().toUpperCase();
            if (nat === "DESCUENTO") {
                if (conceptUpper.includes("EPS") || conceptUpper.includes("PENSION") || conceptUpper.includes("SOLIDARIDAD") || conceptUpper.includes("SALUD")) {
                    tipo = "SEGURIDAD SOCIAL";
                } else {
                    tipo = "OTROS";
                }
            } else {
                if (conceptUpper.includes("SUELDO") || conceptUpper.includes("SALARIO") || conceptUpper.includes("COMISION") || conceptUpper.includes("EXTRA") || conceptUpper.includes("REC.") || conceptUpper.includes("VACACIO") || conceptUpper.includes("PRIMA") || conceptUpper.includes("CESANTIA") || conceptUpper.includes("INCAPAC") || conceptUpper.includes("LICENCIA")) {
                    tipo = "SALARIAL";
                } else {
                    tipo = "NO SALARIAL";
                }
            }
        }
        
        const cc = kCC && row[kCC] ? row[kCC].toString().trim() : "";
        let dcc = kDCC && row[kDCC] ? row[kDCC].toString().trim() : "";
        if (cc && !dcc) {
            dcc = cc;
        }
        const cg = kCg && row[kCg] ? row[kCg].toString().trim().toUpperCase() : "";
        const pa = kPa && row[kPa] ? parseInt(row[kPa]) : null;
        
        mappedData.push({
            c: cedula.toString().trim(),
            n: fullName,
            co: row[kCon] ? row[kCon].toString().trim().toUpperCase() : "N/A",
            v: Math.round(valNum * 100) / 100,
            cant: Math.round(cantNum * 100) / 100,
            m: mes,
            a: anio,
            t: tipo,
            na: nat,
            cc: cc,
            dcc: dcc,
            cg: cg,
            pa: pa
        });
    });
    
    return mappedData;
}

function findHeaderRowIndex(sheet) {
    if (!sheet['!ref']) return 0;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
        let matches = 0;
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
            const cell = sheet[cellRef];
            if (cell && cell.v) {
                const valStr = cell.v.toString().toUpperCase().trim();
                if (valStr.includes('CEDULA') || valStr.includes('IDENTIFICAC') || valStr.includes('DOCUMENTO') ||
                    valStr.includes('CONCEPTO') || valStr.includes('VALOR') || valStr.includes('TOTAL') || 
                    valStr.includes('IMPORTE') || valStr.includes('NATURALEZA') || valStr.includes('NOMBRES') || valStr.includes('CANTIDAD') || valStr.includes('CANT.')) {
                    matches++;
                }
            }
        }
        if (matches >= 3) {
            return r;
        }
    }
    return 0;
}

function aggregateRecords(records) {
    const agg = {};
    records.forEach(r => {
        const key = `${r.c}|${r.n}|${r.co}|${r.m}|${r.a}|${r.na}|${r.pa || 0}`;
        if (agg[key]) {
            agg[key].v += r.v;
            agg[key].v = Math.round(agg[key].v * 100) / 100;
            if (r.cant !== undefined && r.cant !== null) {
                agg[key].cant = (agg[key].cant || 0) + r.cant;
                agg[key].cant = Math.round(agg[key].cant * 100) / 100;
            }
        } else {
            agg[key] = { ...r };
            if (agg[key].cant === undefined || agg[key].cant === null) {
                agg[key].cant = r.cant || 0;
            }
        }
    });
    return Object.values(agg);
}

// ==========================================
// LÓGICA DE COMPARATIVA DE PERIODOS (NUEVA)
// ==========================================

// Retorna lista ordenada de periodos. Incluye quincenas individuales (Q1/Q2) y mes completo.
// Formato de quincena: "2025 - Enero - Q1"
// Formato de mes completo: "2025 - Enero - MES"
function getUniquePeriodsSorted() {
    return state.uniquePeriods || [];
}

// Obtiene la etiqueta legible para un periodo en el selector
function getPeriodLabel(periodStr) {
    const parts = periodStr.split(' - ');
    if (parts.length < 3) return periodStr;
    const year = parts[0];
    const month = parts[1];
    const q = parts[2];
    if (q === 'MES') return `${month} ${year} (Mes Completo)`;
    return `${month} ${year} - ${q}`;
}

function filterDataByPeriod(periodStr) {
    const parts = periodStr.split(' - ');
    if (parts.length < 2) return [];
    const y = parseInt(parts[0]);
    const m = parts[1];
    const q = parts[2]; // 'Q1', 'Q2', 'MES' o undefined
    
    const key = `${y} - ${m}`;
    const monthlyData = state.periodDataMap[key] || [];
    
    return monthlyData.filter(d => {
        const matchTN = !Array.isArray(state.selectedTipoNomina) || state.selectedTipoNomina.length === 0 || state.selectedTipoNomina.includes(d.tn);
        if (!matchTN) return false;
        if (!q || q === 'MES') return true; // Mes completo: no filtrar por quincena
        const recordQ = (parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2';
        return recordQ === q;
    });
}

// Inicializa un dropdown personalizado con soporte para selección múltiple
function initCustomTipoDropdown(dropdownId, listId, triggerId, onSelectionChange) {
    const dropdown = document.getElementById(dropdownId);
    const trigger = document.getElementById(triggerId);
    const list = document.getElementById(listId);
    
    if (!dropdown || !trigger || !list) return;
    
    // Abrir/Cerrar dropdown al hacer click en el trigger
    if (!trigger.dataset.listenerBound) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });
        trigger.dataset.listenerBound = 'true';
    }
    
    // Función para renderizar las opciones de la lista
    const renderOptions = () => {
        const set = new Set();
        state.data.forEach(d => { if (d.tn) set.add(d.tn); });
        const types = Array.from(set).sort();
        
        list.innerHTML = '';
        
        // Agregar opción "Todos" al inicio
        const allSelected = state.selectedTipoNomina.length === 0;
        const liAll = document.createElement('li');
        liAll.className = allSelected ? 'selected' : '';
        liAll.innerHTML = `
            <div class="checkbox-custom">
                <i data-lucide="check"></i>
            </div>
            <span style="font-weight: 600;">Todos</span>
        `;
        liAll.addEventListener('click', (e) => {
            e.stopPropagation();
            state.selectedTipoNomina = [];
            syncCustomTipoDropdowns();
            onSelectionChange();
        });
        list.appendChild(liAll);
        
        // Agregar las letras individuales de Tipo de Nómina
        types.forEach(t => {
            const isSelected = state.selectedTipoNomina.includes(t);
            const li = document.createElement('li');
            li.className = isSelected ? 'selected' : '';
            li.innerHTML = `
                <div class="checkbox-custom">
                    <i data-lucide="check"></i>
                </div>
                <span>${t}</span>
            `;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.selectedTipoNomina.includes(t)) {
                    state.selectedTipoNomina = state.selectedTipoNomina.filter(x => x !== t);
                } else {
                    state.selectedTipoNomina.push(t);
                }
                syncCustomTipoDropdowns();
                onSelectionChange();
            });
            list.appendChild(li);
        });
        
        // Actualizar el texto del trigger
        const textSpan = trigger.querySelector('.selected-text');
        if (textSpan) {
            if (state.selectedTipoNomina.length === 0) {
                textSpan.innerText = 'Todos';
            } else {
                textSpan.innerText = state.selectedTipoNomina.join(', ');
            }
        }
        
        // Inicializar iconos de Lucide
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };
    
    dropdown.renderOptions = renderOptions;
    renderOptions();
}

// Sincroniza todos los dropdowns personalizados de tipo de nómina
function syncCustomTipoDropdowns() {
    document.querySelectorAll('.custom-dropdown').forEach(d => {
        if (typeof d.renderOptions === 'function') {
            d.renderOptions();
        }
    });
}

function getEmployeeNameByCedula(cedula) {
    const people = getUniquePeopleSorted();
    const p = people.find(item => item.cedula === cedula);
    return p ? p.name : cedula;
}

function updatePeriodSelectorLabels() {
    // Period Compare
    const p1Period = document.getElementById('period-compare-p1-label');
    const p2Period = document.getElementById('period-compare-p2-label');
    if (p1Period) p1Period.innerHTML = `<i data-lucide="calendar"></i> P1: ${state.comparePeriod1 ? getPeriodLabel(state.comparePeriod1) : '-'}`;
    if (p2Period) p2Period.innerHTML = `<i data-lucide="calendar"></i> P2: ${state.comparePeriod2 ? getPeriodLabel(state.comparePeriod2) : '-'}`;

    // Concept Compare
    const p1Concept = document.getElementById('concept-compare-p1-label');
    const p2Concept = document.getElementById('concept-compare-p2-label');
    if (p1Concept) p1Concept.innerHTML = `<i data-lucide="calendar"></i> P1: ${state.conceptComparePeriod1 ? getPeriodLabel(state.conceptComparePeriod1) : '-'}`;
    if (p2Concept) p2Concept.innerHTML = `<i data-lucide="calendar"></i> P2: ${state.conceptComparePeriod2 ? getPeriodLabel(state.conceptComparePeriod2) : '-'}`;

    // CECO Compare
    const p1Ceco = document.getElementById('ceco-compare-p1-label');
    const p2Ceco = document.getElementById('ceco-compare-p2-label');
    if (p1Ceco) p1Ceco.innerHTML = `<i data-lucide="calendar"></i> P1: ${state.cecoComparePeriod1 ? getPeriodLabel(state.cecoComparePeriod1) : '-'}`;
    if (p2Ceco) p2Ceco.innerHTML = `<i data-lucide="calendar"></i> P2: ${state.cecoComparePeriod2 ? getPeriodLabel(state.cecoComparePeriod2) : '-'}`;

    // Cargo Compare
    const p1Cargo = document.getElementById('cargo-compare-p1-label');
    const p2Cargo = document.getElementById('cargo-compare-p2-label');
    if (p1Cargo) p1Cargo.innerHTML = `<i data-lucide="calendar"></i> P1: ${state.cargoComparePeriod1 ? getPeriodLabel(state.cargoComparePeriod1) : '-'}`;
    if (p2Cargo) p2Cargo.innerHTML = `<i data-lucide="calendar"></i> P2: ${state.cargoComparePeriod2 ? getPeriodLabel(state.cargoComparePeriod2) : '-'}`;

    if (window.lucide) window.lucide.createIcons();
}

function updateSearchSelectorLabels() {
    // Colaboradores
    const empLabel = document.getElementById('period-compare-employees-label');
    if (empLabel) {
        const count = state.periodCompareSelectedEmployees ? state.periodCompareSelectedEmployees.length : 0;
        if (count === 0) {
            empLabel.innerHTML = `<i data-lucide="users"></i> Colaborador: Todos`;
        } else if (count === 1) {
            empLabel.innerHTML = `<i data-lucide="users"></i> Colaborador: ${getEmployeeNameByCedula(state.periodCompareSelectedEmployees[0])}`;
        } else {
            empLabel.innerHTML = `<i data-lucide="users"></i> Colaboradores: ${count}`;
        }
    }

    // Conceptos
    const conceptLabel = document.getElementById('concept-compare-concepts-label');
    if (conceptLabel) {
        const count = state.conceptCompareSelectedConcepts ? state.conceptCompareSelectedConcepts.length : 0;
        if (count === 0) {
            conceptLabel.innerHTML = `<i data-lucide="briefcase"></i> Concepto: Todos`;
        } else if (count === 1) {
            conceptLabel.innerHTML = `<i data-lucide="briefcase"></i> Concepto: ${state.conceptCompareSelectedConcepts[0]}`;
        } else {
            conceptLabel.innerHTML = `<i data-lucide="briefcase"></i> Conceptos: ${count}`;
        }
    }

    // CECOs
    const cecoLabel = document.getElementById('ceco-compare-cecos-label');
    if (cecoLabel) {
        const count = state.cecoCompareSelectedCecos ? state.cecoCompareSelectedCecos.length : 0;
        if (count === 0) {
            cecoLabel.innerHTML = `<i data-lucide="building-2"></i> CECO: Todos`;
        } else if (count === 1) {
            const shortName = state.cecoCompareSelectedCecos[0].split(' - ')[0];
            cecoLabel.innerHTML = `<i data-lucide="building-2"></i> CECO: ${shortName}`;
        } else {
            cecoLabel.innerHTML = `<i data-lucide="building-2"></i> CECOs: ${count}`;
        }
    }

    // Cargos
    const cargoLabel = document.getElementById('cargo-compare-cargos-label');
    if (cargoLabel) {
        const count = state.cargoCompareSelectedCargos ? state.cargoCompareSelectedCargos.length : 0;
        if (count === 0) {
            cargoLabel.innerHTML = `<i data-lucide="award"></i> Cargo: Todos`;
        } else if (count === 1) {
            cargoLabel.innerHTML = `<i data-lucide="award"></i> Cargo: ${state.cargoCompareSelectedCargos[0]}`;
        } else {
            cargoLabel.innerHTML = `<i data-lucide="award"></i> Cargos: ${count}`;
        }
    }

    // Tipo de Nómina para todos los 4 comparadores
    const labels = [
        'period-compare-tipo-label',
        'concept-compare-tipo-label',
        'ceco-compare-tipo-label',
        'cargo-compare-tipo-label'
    ];
    labels.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const count = state.selectedTipoNomina ? state.selectedTipoNomina.length : 0;
            if (count === 0) {
                el.innerHTML = `<i data-lucide="tag"></i> Tipo: Todos`;
            } else if (count === 1) {
                const val = state.selectedTipoNomina[0];
                el.innerHTML = `<i data-lucide="tag"></i> Tipo: ${val}`;
            } else {
                el.innerHTML = `<i data-lucide="tag"></i> Tipos: ${count}`;
            }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

// Inicializa selectores y eventos del comparador de periodos
function initPeriodCompareSelectors() {
    const btnExpand = document.getElementById('btn-period-compare-expand');
    const btnCollapse = document.getElementById('btn-period-compare-collapse');
    
    const periods = getUniquePeriodsSorted();
    if (periods.length === 0) return;
    
    // Valores predeterminados (P1 = penúltimo, P2 = último)
    if (!state.comparePeriod1) {
        if (periods.length >= 2) {
            state.comparePeriod1 = periods[periods.length - 2];
            state.comparePeriod2 = periods[periods.length - 1];
        } else {
            state.comparePeriod1 = periods[0];
            state.comparePeriod2 = periods[0];
        }
    }
    
    if (btnExpand && !btnExpand.dataset.listenerBound) {
        btnExpand.addEventListener('click', () => {
            state.periodCompareExpanded = true;
            document.querySelectorAll('.compare-table tbody tr.employee-row').forEach(row => {
                row.classList.add('expanded');
                const cedula = row.getAttribute('data-cedula');
                document.querySelectorAll(`.child-of-${cedula}`).forEach(child => {
                    child.classList.remove('collapsed-row');
                });
            });
        });
        btnExpand.dataset.listenerBound = 'true';
    }
    
    if (btnCollapse && !btnCollapse.dataset.listenerBound) {
        btnCollapse.addEventListener('click', () => {
            state.periodCompareExpanded = false;
            document.querySelectorAll('.compare-table tbody tr.employee-row').forEach(row => {
                row.classList.remove('expanded');
                const cedula = row.getAttribute('data-cedula');
                document.querySelectorAll(`.child-of-${cedula}`).forEach(child => {
                    child.classList.add('collapsed-row');
                });
            });
        });
        btnCollapse.dataset.listenerBound = 'true';
    }
}

// Formatea la variación monetaria con colores e iconos
function formatVariationHTML(val, isPercentage = false) {
    if (val === 0) {
        return `<span class="val-neutral">-</span>`;
    }
    
    const sign = val > 0 ? '+' : '';
    const icon = val > 0 ? '↑' : '↓';
    const cssClass = val > 0 ? 'val-up' : 'val-down';
    
    let formattedText = '';
    if (isPercentage) {
        formattedText = `${sign}${val.toFixed(1)}%`;
    } else {
        formattedText = `${sign}${currencyFormatter.format(val)}`;
    }
    
    return `<span class="${cssClass}">${icon} ${formattedText}</span>`;
}

// Genera un comentario inteligente de la variación del neto del colaborador
function generatePeriodInsight(val1, val2, devVar, descVar, benVar, conceptChanges) {
    const diff = val2 - val1;
    if (Math.abs(diff) < 100) {
        return '<span class="insight-text">Sin variaciones salariales significativas en este periodo.</span>';
    }
    
    let insightParts = [];
    
    // Analizar principales causantes
    // Ordenar los cambios individuales de los conceptos por impacto absoluto
    const sortedChanges = conceptChanges.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    
    if (sortedChanges.length > 0) {
        const topChange = sortedChanges[0];
        const isPositive = topChange.diff > 0;
        
        // Si es un descuento y es positivo, significa que se descontó menos!
        let effectText = '';
        if (topChange.na === 'DESCUENTO') {
            effectText = isPositive ? 'Menores descuentos en' : 'Mayores deducciones por';
        } else if (topChange.na === 'DEVENGO') {
            effectText = isPositive ? 'Incremento en' : 'Reducción de';
        } else {
            effectText = isPositive ? 'Aumento de beneficio en' : 'Reducción de beneficio en';
        }
        
        insightParts.push(`${effectText} <strong>${topChange.co.toLowerCase()}</strong>`);
    }
    
    // Si hay un segundo cambio importante, añadirlo
    if (sortedChanges.length > 1 && Math.abs(sortedChanges[1].diff) > 50000) {
        const secondChange = sortedChanges[1];
        const isPositive = secondChange.diff > 0;
        
        let effectText = '';
        if (secondChange.na === 'DESCUENTO') {
            effectText = isPositive ? 'menor deducción de' : 'mayor retención de';
        } else {
            effectText = isPositive ? 'más' : 'menos';
        }
        
        insightParts.push(`y ${effectText} <strong>${secondChange.co.toLowerCase()}</strong>`);
    }
    
    const directionText = diff > 0 ? 'aumento neto de' : 'disminución neta de';
    const sumInsight = `Genera un ${directionText} ${currencyFormatter.format(Math.abs(diff))}.`;
    
    return `<div class="insight-text">${insightParts.join(' ')}. ${sumInsight}</div>`;
}

// Renderiza la tabla de comparación de periodos jerárquica
function renderPeriodComparison() {
    const tbody = document.getElementById('period-compare-tbody');
    const headerP1 = document.getElementById('period-header-p1');
    const headerP2 = document.getElementById('period-header-p2');
    const headerCantP1 = document.getElementById('period-header-cant-p1');
    const headerCantP2 = document.getElementById('period-header-cant-p2');
    const p1Label = getPeriodLabel(state.comparePeriod1) || 'P1';
    const p2Label = getPeriodLabel(state.comparePeriod2) || 'P2';
    
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas
    if (headerCantP1) headerCantP1.innerText = 'Cant ' + p1Label;
    if (headerP1) headerP1.innerText = 'Valor ' + p1Label;
    if (headerCantP2) headerCantP2.innerText = 'Cant ' + p2Label;
    if (headerP2) headerP2.innerText = 'Valor ' + p2Label;

    tbody.innerHTML = '';
    
    if (!state.comparePeriod1 || !state.comparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    const dataP1 = filterDataByPeriod(state.comparePeriod1);
    const dataP2 = filterDataByPeriod(state.comparePeriod2);
    
    // 2. Obtener lista de personas a mostrar
    const people = getUniquePeopleSorted();
    
    // Filtrar personas por selección si aplica
    const selectedCeds = state.periodCompareSelectedEmployees || [];
    const filteredPeople = people.filter(p => {
        if (selectedCeds.length === 0) return true;
        return selectedCeds.includes(p.cedula);
    });
    
    if (filteredPeople.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">No se encontraron colaboradores que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    // 3. Procesar datos para cada colaborador
    filteredPeople.forEach(person => {
        const cedula = person.cedula;
        const name = person.name;
        
        const p1Rows = dataP1.filter(d => d.c === cedula);
        const p2Rows = dataP2.filter(d => d.c === cedula);
        
        // Si no tiene registros en ninguno de los dos meses, omitir
        if (p1Rows.length === 0 && p2Rows.length === 0) {
            return;
        }
        
        // Mapear conceptos en cada periodo
        const p1Concepts = {};
        const p1ConceptsCant = {};
        const p2Concepts = {};
        const p2ConceptsCant = {};
        const allConceptsMeta = {}; // Guardar naturaleza y tipo de cada concepto
        
        p1Rows.forEach(r => {
            p1Concepts[r.co] = r.v;
            p1ConceptsCant[r.co] = r.cant || 0;
            allConceptsMeta[r.co] = { na: r.na, t: r.t };
        });
        
        p2Rows.forEach(r => {
            p2Concepts[r.co] = r.v;
            p2ConceptsCant[r.co] = r.cant || 0;
            allConceptsMeta[r.co] = { na: r.na, t: r.t };
        });
        
        // Lista única de conceptos ordenados por naturaleza
        const uniqueConceptsList = Object.keys(allConceptsMeta).sort((a, b) => {
            const natA = allConceptsMeta[a].na;
            const natB = allConceptsMeta[b].na;
            
            // Orden: DEVENGO (1), DESCUENTO (2), BENEFICIO (3)
            const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2, 'BENEFICIO': 3 };
            const ordA = natOrder[natA] || 99;
            const ordB = natOrder[natB] || 99;
            
            if (ordA !== ordB) return ordA - ordB;
            return a.localeCompare(b);
        });
        
        // Inicializar acumuladores de Totales
        const totals = {
            DEVENGO: { p1: 0, p2: 0 },
            DESCUENTO: { p1: 0, p2: 0 },
            BENEFICIO: { p1: 0, p2: 0 }
        };
        
        const conceptChanges = [];
        
        // Calcular valores y acumular
        uniqueConceptsList.forEach(co => {
            const meta = allConceptsMeta[co];
            const val1 = p1Concepts[co] || 0;
            const cant1 = p1ConceptsCant[co] || 0;
            const val2 = p2Concepts[co] || 0;
            const cant2 = p2ConceptsCant[co] || 0;
            const diff = val2 - val1;
            
            if (totals[meta.na]) {
                totals[meta.na].p1 += val1;
                totals[meta.na].p2 += val2;
            }
            
            conceptChanges.push({
                co: co,
                na: meta.na,
                t: meta.t,
                val1: val1,
                cant1: cant1,
                val2: val2,
                cant2: cant2,
                diff: diff
            });
        });
        
        // Sumas consolidadas generales del colaborador (Neto)
        // Neto = Devengo + Descuento + Beneficio (descuento ya es negativo, sumamos algebraicamente)
        const netP1 = totals.DEVENGO.p1 + totals.DESCUENTO.p1 + totals.BENEFICIO.p1;
        const netP2 = totals.DEVENGO.p2 + totals.DESCUENTO.p2 + totals.BENEFICIO.p2;
        const netDiff = netP2 - netP1;
        const netPct = netP1 !== 0 ? (netDiff / Math.abs(netP1)) * 100 : (netDiff > 0 ? 100.0 : (netDiff < 0 ? -100.0 : 0));
        
        // Generar Insight dinámico
        const insightHTML = generatePeriodInsight(netP1, netP2, totals.DEVENGO.p2 - totals.DEVENGO.p1, totals.DESCUENTO.p2 - totals.DESCUENTO.p1, totals.BENEFICIO.p2 - totals.BENEFICIO.p1, conceptChanges);
        
        // ==========================================
        // RENDER: Fila del Colaborador (Nivel 1)
        // ==========================================
        const empRow = document.createElement('tr');
        empRow.className = `employee-row ${state.periodCompareExpanded ? 'expanded' : ''}`;
        empRow.setAttribute('data-cedula', cedula);
        
        empRow.innerHTML = `
            <td>
                <i data-lucide="chevron-right" class="expand-chevron"></i>
                <span>${name}</span>
            </td>
            <td>${cedula}</td>
            <td>-</td>
            <td>-</td>
            <td style="text-align: right; font-weight: normal; color: var(--text-muted);">-</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(netP1)}</td>
            <td style="text-align: right; font-weight: normal; color: var(--text-muted);">-</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(netP2)}</td>
            <td style="text-align: right;">${formatVariationHTML(netDiff)}</td>
            <td style="text-align: right;">${formatVariationHTML(netPct, true)}</td>
            <td>
                <button class="btn-analyze" data-cedula="${cedula}" data-name="${name}" title="Analizar variaciones">
                    <i data-lucide="search" style="width:13px;height:13px;"></i>
                    <span>Analizar</span>
                </button>
            </td>
        `;
        
        tbody.appendChild(empRow);
        
        // ==========================================
        // RENDER: Filas de Conceptos Detalladas (Nivel 2 y 3)
        // ==========================================
        const natures = ['DEVENGO', 'DESCUENTO'];
        
        natures.forEach(nat => {
            const natConcepts = conceptChanges.filter(c => c.na === nat);
            if (natConcepts.length === 0) return;
            
            // Fila de cada concepto individual
            natConcepts.forEach(c => {
                const conRow = document.createElement('tr');
                // Ocultar si el estado global dice colapsado
                conRow.className = `concept-row child-of-${cedula} ${state.periodCompareExpanded ? '' : 'collapsed-row'}`;
                
                // Variación porcentual individual
                const cPct = c.val1 !== 0 ? (c.diff / Math.abs(c.val1)) * 100 : (c.diff > 0 ? 100.0 : (c.diff < 0 ? -100.0 : 0));
                
                conRow.innerHTML = `
                    <td></td>
                    <td>${cedula}</td>
                    <td><span class="badge badge-${nat.toLowerCase()}">${nat}</span></td>
                    <td>${c.co}</td>
                    <td style="text-align: right;">${c.val1 !== 0 && c.cant1 ? c.cant1 : '-'}</td>
                    <td style="text-align: right;">${c.val1 !== 0 ? currencyFormatter.format(c.val1) : '-'}</td>
                    <td style="text-align: right;">${c.val2 !== 0 && c.cant2 ? c.cant2 : '-'}</td>
                    <td style="text-align: right;">${c.val2 !== 0 ? currencyFormatter.format(c.val2) : '-'}</td>
                    <td style="text-align: right;">${formatVariationHTML(c.diff)}</td>
                    <td style="text-align: right;">${formatVariationHTML(cPct, true)}</td>
                    <td></td>
                `;
                tbody.appendChild(conRow);
            });
            
            // Fila de Total de Categoría (Subtotal)
            const totRow = document.createElement('tr');
            totRow.className = `total-row child-of-${cedula} ${state.periodCompareExpanded ? '' : 'collapsed-row'}`;
            
            const natDiff = totals[nat].p2 - totals[nat].p1;
            const natPct = totals[nat].p1 !== 0 ? (natDiff / Math.abs(totals[nat].p1)) * 100 : (natDiff > 0 ? 100.0 : (natDiff < 0 ? -100.0 : 0));
            
            totRow.innerHTML = `
                <td></td>
                <td>${cedula}</td>
                <td>-</td>
                <td style="font-weight: normal;">Total ${nat}</td>
                <td style="text-align: right; font-weight: normal; color: var(--text-muted);">-</td>
                <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(totals[nat].p1)}</td>
                <td style="text-align: right; font-weight: normal; color: var(--text-muted);">-</td>
                <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(totals[nat].p2)}</td>
                <td style="text-align: right;">${formatVariationHTML(natDiff)}</td>
                <td style="text-align: right;">${formatVariationHTML(natPct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(totRow);
        });
        
        // Agregar evento de click a la fila del empleado para expandir / contraer
        empRow.addEventListener('click', (e) => {
            // Don't trigger if clicking the analyze button
            if (e.target.closest('.btn-analyze')) return;
            
            const row = e.currentTarget;
            row.classList.toggle('expanded');
            
            const isExpanded = row.classList.contains('expanded');
            const ced = row.getAttribute('data-cedula');
            
            document.querySelectorAll(`.child-of-${ced}`).forEach(child => {
                if (isExpanded) {
                    child.classList.remove('collapsed-row');
                } else {
                    child.classList.add('collapsed-row');
                }
            });
        });
    });
    
    // Bind Analizar buttons (after all rows are rendered)
    document.querySelectorAll('.btn-analyze').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cedula = btn.getAttribute('data-cedula');
            const name = btn.getAttribute('data-name');
            showAnalysisModal(cedula, name, state.comparePeriod1, state.comparePeriod2);
        });
    });
    
    // Inicializar iconos de Lucide cargados
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================
// MODAL DE ANÁLISIS DETALLADO DE VARIACIONES
// ==========================================
function showAnalysisModal(cedula, name, period1, period2) {
    // Remove existing modal if any
    const existing = document.getElementById('analysis-modal-overlay');
    if (existing) existing.remove();
    
    // Parse periods
    const dataP1 = filterDataByPeriod(period1).filter(d => d.c === cedula);
    const dataP2 = filterDataByPeriod(period2).filter(d => d.c === cedula);
    
    // Map concepts
    const p1Map = {}, p2Map = {}, allMeta = {};
    dataP1.forEach(r => { p1Map[r.co] = r.v; allMeta[r.co] = { na: r.na, t: r.t }; });
    dataP2.forEach(r => { p2Map[r.co] = r.v; allMeta[r.co] = { na: r.na, t: r.t }; });
    
    const allConcepts = Object.keys(allMeta);
    
    // Calculate changes
    const changes = allConcepts.map(co => {
        const v1 = p1Map[co] || 0;
        const v2 = p2Map[co] || 0;
        return {
            co, na: allMeta[co].na, v1, v2, diff: v2 - v1,
            pct: v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : (v2 !== 0 ? 100 : 0)
        };
    }).filter(c => Math.abs(c.diff) > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    
    // Totals
    const totals = { DEVENGO: { p1: 0, p2: 0 }, DESCUENTO: { p1: 0, p2: 0 } };
    allConcepts.forEach(co => {
        const na = allMeta[co].na;
        if (totals[na]) {
            totals[na].p1 += (p1Map[co] || 0);
            totals[na].p2 += (p2Map[co] || 0);
        }
    });
    const netP1 = totals.DEVENGO.p1 + totals.DESCUENTO.p1;
    const netP2 = totals.DEVENGO.p2 + totals.DESCUENTO.p2;
    const netDiff = netP2 - netP1;
    const netPct = netP1 !== 0 ? (netDiff / Math.abs(netP1)) * 100 : 0;
    
    // Build analysis narrative
    let narrative = '';
    
    if (Math.abs(netDiff) < 100) {
        narrative = `<p class="analysis-summary">El salario neto de <strong>${name}</strong> se mantuvo prácticamente estable entre ambos periodos, sin variaciones significativas.</p>`;
    } else {
        const direction = netDiff > 0 ? 'aumentó' : 'disminuyó';
        const arrow = netDiff > 0 ? '↑' : '↓';
        const colorClass = netDiff > 0 ? 'analysis-positive' : 'analysis-negative';
        
        narrative = `<p class="analysis-summary">El ingreso neto de <strong>${name}</strong> ${direction} en <span class="${colorClass}"><strong>${arrow} ${currencyFormatter.format(Math.abs(netDiff))}</strong> (${netPct > 0 ? '+' : ''}${netPct.toFixed(1)}%)</span> entre ${period1} y ${period2}.</p>`;
    }
    
    // Top increases
    const increases = changes.filter(c => c.diff > 0).slice(0, 5);
    const decreases = changes.filter(c => c.diff < 0).slice(0, 5);
    
    let increasesHTML = '';
    if (increases.length > 0) {
        increasesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title analysis-positive">↑ Conceptos con incremento</h4>
                <div class="analysis-items">
                    ${increases.map(c => `
                        <div class="analysis-item">
                            <div class="analysis-item-header">
                                <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                            </div>
                            <div class="analysis-item-values">
                                <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                <span class="analysis-arrow">→</span>
                                <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                <span class="analysis-diff analysis-positive">+${currencyFormatter.format(c.diff)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    let decreasesHTML = '';
    if (decreases.length > 0) {
        decreasesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title analysis-negative">↓ Conceptos con reducción</h4>
                <div class="analysis-items">
                    ${decreases.map(c => `
                        <div class="analysis-item">
                            <div class="analysis-item-header">
                                <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                            </div>
                            <div class="analysis-item-values">
                                <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                <span class="analysis-arrow">→</span>
                                <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                <span class="analysis-diff analysis-negative">${currencyFormatter.format(c.diff)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // New concepts appearing
    const newConcepts = changes.filter(c => (p1Map[c.co] === undefined || p1Map[c.co] === 0) && c.v2 !== 0);
    let newConceptsHTML = '';
    if (newConcepts.length > 0) {
        newConceptsHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title" style="color: var(--info);">● Conceptos nuevos en ${period2}</h4>
                <div class="analysis-items">
                    ${newConcepts.slice(0, 5).map(c => `
                        <div class="analysis-item">
                            <span class="analysis-concept">${c.co.toLowerCase()}</span>
                            <span class="analysis-diff" style="color: var(--info);">${currencyFormatter.format(c.v2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Removed concepts
    const removedConcepts = changes.filter(c => (p2Map[c.co] === undefined || p2Map[c.co] === 0) && c.v1 !== 0);
    let removedHTML = '';
    if (removedConcepts.length > 0) {
        removedHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title" style="color: var(--text-muted);">○ Conceptos que desaparecen en ${period2}</h4>
                <div class="analysis-items">
                    ${removedConcepts.slice(0, 5).map(c => `
                        <div class="analysis-item">
                            <span class="analysis-concept">${c.co.toLowerCase()}</span>
                            <span class="analysis-diff" style="color: var(--text-muted);">${currencyFormatter.format(c.v1)} → $0</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Summary bar
    const summaryHTML = `
        <div class="analysis-summary-bar">
            <div class="analysis-summary-item">
                <span class="analysis-label">Devengos</span>
                <span class="analysis-val">${currencyFormatter.format(totals.DEVENGO.p1)}</span>
                <span class="analysis-val">→ ${currencyFormatter.format(totals.DEVENGO.p2)}</span>
                <span class="${totals.DEVENGO.p2 - totals.DEVENGO.p1 >= 0 ? 'analysis-positive' : 'analysis-negative'}">
                    ${totals.DEVENGO.p2 - totals.DEVENGO.p1 >= 0 ? '↑' : '↓'} ${currencyFormatter.format(Math.abs(totals.DEVENGO.p2 - totals.DEVENGO.p1))}
                </span>
            </div>
            <div class="analysis-summary-item">
                <span class="analysis-label">Descuentos</span>
                <span class="analysis-val">${currencyFormatter.format(Math.abs(totals.DESCUENTO.p1))}</span>
                <span class="analysis-val">→ ${currencyFormatter.format(Math.abs(totals.DESCUENTO.p2))}</span>
                <span class="${Math.abs(totals.DESCUENTO.p2) - Math.abs(totals.DESCUENTO.p1) <= 0 ? 'analysis-positive' : 'analysis-negative'}">
                    ${Math.abs(totals.DESCUENTO.p2) <= Math.abs(totals.DESCUENTO.p1) ? '↓' : '↑'} ${currencyFormatter.format(Math.abs(Math.abs(totals.DESCUENTO.p2) - Math.abs(totals.DESCUENTO.p1)))}
                </span>
            </div>
            <div class="analysis-summary-item" style="border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 4px;">
                <span class="analysis-label" style="font-weight:600;">Neto</span>
                <span class="analysis-val" style="font-weight:600;">${currencyFormatter.format(netP1)}</span>
                <span class="analysis-val" style="font-weight:600;">→ ${currencyFormatter.format(netP2)}</span>
                <span class="${netDiff >= 0 ? 'analysis-positive' : 'analysis-negative'}" style="font-weight:700;">
                    ${netDiff >= 0 ? '↑' : '↓'} ${currencyFormatter.format(Math.abs(netDiff))}
                </span>
            </div>
        </div>
    `;
    
    // Build modal
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <div>
                    <h3 class="analysis-modal-title">Análisis de Variaciones</h3>
                    <p class="analysis-modal-subtitle">${name} · C.C. ${cedula}</p>
                    <p class="analysis-modal-periods">${period1} vs ${period2}</p>
                </div>
                <button class="analysis-close-btn" id="analysis-close-btn">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                ${narrative}
                ${summaryHTML}
                ${increasesHTML}
                ${decreasesHTML}
                ${newConceptsHTML}
                ${removedHTML}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate transition
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
    
    // Close events
    document.getElementById('analysis-close-btn').addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 250);
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 250);
        }
    });
    
    // Init lucide icons inside modal
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Inicializa selectores y eventos del comparador de conceptos
function initConceptCompareSelectors() {
    const btnExpand = document.getElementById('btn-concept-compare-expand');
    const btnCollapse = document.getElementById('btn-concept-compare-collapse');
    
    const periods = getUniquePeriodsSorted();
    if (periods.length === 0) return;
    
    // Valores predeterminados (P1 = penúltimo, P2 = último)
    if (!state.conceptComparePeriod1) {
        if (periods.length >= 2) {
            state.conceptComparePeriod1 = periods[periods.length - 2];
            state.conceptComparePeriod2 = periods[periods.length - 1];
        } else {
            state.conceptComparePeriod1 = periods[0];
            state.conceptComparePeriod2 = periods[0];
        }
    }
    
    if (btnExpand && !btnExpand.dataset.listenerBound) {
        btnExpand.addEventListener('click', () => {
            state.conceptCompareExpanded = true;
            document.querySelectorAll('#concept-compare-tbody tr.concept-top-row').forEach(row => {
                row.classList.add('expanded');
                const conceptSafe = row.getAttribute('data-concept-safe');
                document.querySelectorAll(`.child-of-${conceptSafe}`).forEach(child => {
                    child.classList.remove('collapsed-row');
                });
            });
        });
        btnExpand.dataset.listenerBound = 'true';
    }
    
    if (btnCollapse && !btnCollapse.dataset.listenerBound) {
        btnCollapse.addEventListener('click', () => {
            state.conceptCompareExpanded = false;
            document.querySelectorAll('#concept-compare-tbody tr.concept-top-row').forEach(row => {
                row.classList.remove('expanded');
                const conceptSafe = row.getAttribute('data-concept-safe');
                document.querySelectorAll(`.child-of-${conceptSafe}`).forEach(child => {
                    child.classList.add('collapsed-row');
                });
            });
        });
        btnCollapse.dataset.listenerBound = 'true';
    }
    
    const btnReport = document.getElementById('btn-concept-compare-report');
    if (btnReport && !btnReport.dataset.listenerBound) {
        btnReport.addEventListener('click', () => {
            generateManagerialReport();
        });
        btnReport.dataset.listenerBound = 'true';
    }
}

// Renderiza la tabla de comparación de conceptos jerárquica
function renderConceptComparison() {
    const tbody = document.getElementById('concept-compare-tbody');
    const headerP1 = document.getElementById('concept-period-header-p1');
    const headerP2 = document.getElementById('concept-period-header-p2');
    
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas
    if (headerP1) headerP1.innerText = getPeriodLabel(state.conceptComparePeriod1) || 'Periodo 1';
    if (headerP2) headerP2.innerText = getPeriodLabel(state.conceptComparePeriod2) || 'Periodo 2';

    tbody.innerHTML = '';
    
    if (!state.conceptComparePeriod1 || !state.conceptComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    // 1. Filtrar registros para Periodo 1 y Periodo 2
    const dataP1 = filterDataByPeriod(state.conceptComparePeriod1);
    const dataP2 = filterDataByPeriod(state.conceptComparePeriod2);
    
    // 2. Obtener lista única de todos los conceptos
    const allConcepts = [...new Set(state.data.map(d => d.co))];
    
    // Filtrar conceptos por selección si aplica
    const selectedConcepts = state.conceptCompareSelectedConcepts || [];
    const filteredConcepts = allConcepts.filter(co => {
        if (selectedConcepts.length === 0) return true;
        return selectedConcepts.includes(co);
    });
    
    if (filteredConcepts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No se encontraron conceptos que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    // 3. Obtener nombres de colaboradores mapeados por su cédula
    const employeeNames = {};
    state.data.forEach(d => {
        employeeNames[d.c] = d.n;
    });
    
    // 4. Procesar y agrupar datos por concepto
    const conceptDataList = [];
    
    filteredConcepts.forEach(co => {
        const p1Rows = dataP1.filter(d => d.co === co);
        const p2Rows = dataP2.filter(d => d.co === co);
        
        // Si no se encuentra este concepto en ninguno de los dos meses, omitir
        if (p1Rows.length === 0 && p2Rows.length === 0) {
            return;
        }
        
        // Mapear valor de cada empleado por cédula
        const p1Employees = {};
        const p2Employees = {};
        const allEmployeesInConcept = new Set();
        let conceptNature = 'DEVENGO'; // Predeterminado
        let conceptType = 'Otros';
        
        p1Rows.forEach(r => {
            p1Employees[r.c] = r.v;
            allEmployeesInConcept.add(r.c);
            conceptNature = r.na;
            conceptType = r.t;
        });
        
        p2Rows.forEach(r => {
            p2Employees[r.c] = r.v;
            allEmployeesInConcept.add(r.c);
            conceptNature = r.na;
            conceptType = r.t;
        });
        
        // Calcular sumas agregadas
        let totalP1 = 0;
        let totalP2 = 0;
        
        Object.keys(p1Employees).forEach(c => totalP1 += p1Employees[c]);
        Object.keys(p2Employees).forEach(c => totalP2 += p2Employees[c]);
        
        const conceptDiff = totalP2 - totalP1;
        const conceptPct = totalP1 !== 0 ? (conceptDiff / Math.abs(totalP1)) * 100 : (conceptDiff > 0 ? 100.0 : (conceptDiff < 0 ? -100.0 : 0));
        
        const employeeBreakdown = [];
        allEmployeesInConcept.forEach(c => {
            const ev1 = p1Employees[c] || 0;
            const ev2 = p2Employees[c] || 0;
            const ediff = ev2 - ev1;
            const epct = ev1 !== 0 ? (ediff / Math.abs(ev1)) * 100 : (ediff > 0 ? 100.0 : (ediff < 0 ? -100.0 : 0));
            
            employeeBreakdown.push({
                cedula: c,
                name: employeeNames[c] || 'Desconocido',
                v1: ev1,
                v2: ev2,
                diff: ediff,
                pct: epct
            });
        });
        
        // Ordenar desglose de empleados por el impacto absoluto de la variación
        employeeBreakdown.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        
        conceptDataList.push({
            co: co,
            na: conceptNature,
            t: conceptType,
            v1: totalP1,
            v2: totalP2,
            diff: conceptDiff,
            pct: conceptPct,
            employees: employeeBreakdown
        });
    });
    
    // Ordenar conceptos: DEVENGO (1), DESCUENTO (2), BENEFICIO (3), y luego por variación absoluta decreciente
    const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2, 'BENEFICIO': 3 };
    conceptDataList.sort((a, b) => {
        const ordA = natOrder[a.na] || 99;
        const ordB = natOrder[b.na] || 99;
        if (ordA !== ordB) return ordA - ordB;
        return Math.abs(b.diff) - Math.abs(a.diff); // de mayor variación absoluta a menor
    });
    
    if (conceptDataList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No hay transacciones registradas para este rango de periodos</td></tr>';
        return;
    }
    
    // 5. Renderizar en el DOM
    conceptDataList.forEach(item => {
        const coName = item.co;
        const conceptSafe = coName.replace(/[^a-zA-Z0-9]/g, '_');
        
        // ==========================================
        // RENDER: Fila del Concepto (Nivel 1)
        // ==========================================
        const conceptRow = document.createElement('tr');
        conceptRow.className = `concept-top-row employee-row ${state.conceptCompareExpanded ? 'expanded' : ''}`;
        conceptRow.setAttribute('data-concept-safe', conceptSafe);
        
        conceptRow.innerHTML = `
            <td>
                <i data-lucide="chevron-right" class="expand-chevron"></i>
                <span style="font-weight: normal; text-transform: uppercase;">${coName}</span>
            </td>
            <td><span class="badge badge-${item.na.toLowerCase()}">${item.na}</span></td>
            <td>-</td>
            <td>-</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(item.v1)}</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(item.v2)}</td>
            <td style="text-align: right;">${formatVariationHTML(item.diff)}</td>
            <td style="text-align: right;">${formatVariationHTML(item.pct, true)}</td>
            <td>
                <button class="btn-analyze btn-analyze-concept" data-concept="${encodeURIComponent(coName)}" data-nature="${item.na}" title="Analizar variaciones">
                    <i data-lucide="search" style="width:13px;height:13px;"></i>
                    <span>Analizar</span>
                </button>
            </td>
        `;
        
        tbody.appendChild(conceptRow);
        
        // ==========================================
        // RENDER: Desglose de Empleados (Nivel 2)
        // ==========================================
        item.employees.forEach(emp => {
            const empRow = document.createElement('tr');
            empRow.className = `concept-employee-detail-row concept-row child-of-${conceptSafe} ${state.conceptCompareExpanded ? '' : 'collapsed-row'}`;
            
            empRow.innerHTML = `
                <td></td>
                <td>-</td>
                <td style="font-weight: normal; padding-left: 20px;">${emp.name}</td>
                <td style="color: var(--text-secondary);">${emp.cedula}</td>
                <td style="text-align: right;">${emp.v1 !== 0 ? currencyFormatter.format(emp.v1) : '-'}</td>
                <td style="text-align: right;">${emp.v2 !== 0 ? currencyFormatter.format(emp.v2) : '-'}</td>
                <td style="text-align: right;">${formatVariationHTML(emp.diff)}</td>
                <td style="text-align: right;">${formatVariationHTML(emp.pct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(empRow);
        });
        
        // Evento de click en la fila del concepto para colapsar/expandir
        conceptRow.addEventListener('click', (e) => {
            if (e.target.closest('.btn-analyze')) return;
            
            const row = e.currentTarget;
            row.classList.toggle('expanded');
            
            const isExpanded = row.classList.contains('expanded');
            const safeId = row.getAttribute('data-concept-safe');
            
            document.querySelectorAll(`.child-of-${safeId}`).forEach(child => {
                if (isExpanded) {
                    child.classList.remove('collapsed-row');
                } else {
                    child.classList.add('collapsed-row');
                }
            });
        });
    });
    
    // Bind Analizar buttons (Concepts)
    document.querySelectorAll('.btn-analyze-concept').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const coName = decodeURIComponent(btn.getAttribute('data-concept'));
            const nature = btn.getAttribute('data-nature');
            showConceptAnalysisModal(coName, nature, state.conceptComparePeriod1, state.conceptComparePeriod2);
        });
    });
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================
// ANÁLISIS MASIVO: CENTRO DE COSTO
// ==========================================
function initCecoCompareSelectors() {
    const btnExpand = document.getElementById('btn-ceco-compare-expand');
    const btnCollapse = document.getElementById('btn-ceco-compare-collapse');
    
    const periods = getUniquePeriodsSorted();
    if (periods.length === 0) return;
    
    if (!state.cecoComparePeriod1) {
        if (periods.length >= 2) {
            state.cecoComparePeriod1 = periods[periods.length - 2];
            state.cecoComparePeriod2 = periods[periods.length - 1];
        } else {
            state.cecoComparePeriod1 = periods[0];
            state.cecoComparePeriod2 = periods[0];
        }
    }
    
    if (btnExpand && !btnExpand.dataset.listenerBound) {
        btnExpand.addEventListener('click', () => {
            state.cecoCompareExpanded = true;
            document.querySelectorAll('#ceco-compare-tbody tr.employee-row').forEach(row => {
                row.classList.add('expanded');
                const key = row.getAttribute('data-row-key');
                document.querySelectorAll(`.child-of-${key}`).forEach(child => child.classList.remove('collapsed-row'));
            });
        });
        btnExpand.dataset.listenerBound = 'true';
    }
    if (btnCollapse && !btnCollapse.dataset.listenerBound) {
        btnCollapse.addEventListener('click', () => {
            state.cecoCompareExpanded = false;
            document.querySelectorAll('#ceco-compare-tbody tr.employee-row').forEach(row => {
                row.classList.remove('expanded');
                const key = row.getAttribute('data-row-key');
                document.querySelectorAll(`.child-of-${key}`).forEach(child => child.classList.add('collapsed-row'));
            });
        });
        btnCollapse.dataset.listenerBound = 'true';
    }
}

function renderCecoComparison() {
    const tbody = document.getElementById('ceco-compare-tbody');
    const headerP1 = document.getElementById('ceco-compare-header-p1');
    const headerP2 = document.getElementById('ceco-compare-header-p2');
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas
    if (headerP1) headerP1.innerText = getPeriodLabel(state.cecoComparePeriod1) || 'Periodo 1';
    if (headerP2) headerP2.innerText = getPeriodLabel(state.cecoComparePeriod2) || 'Periodo 2';
    
    tbody.innerHTML = '';
    
    if (!state.cecoComparePeriod1 || !state.cecoComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    const dataP1 = filterDataByPeriod(state.cecoComparePeriod1);
    const dataP2 = filterDataByPeriod(state.cecoComparePeriod2);
    
    const cecosSet = new Set();
    [...dataP1, ...dataP2].forEach(d => { if (d.cc && d.dcc) cecosSet.add(`${d.cc} - ${d.dcc}`); });
    
    // Filtrar CECOs por selección si aplica
    const selectedCecos = state.cecoCompareSelectedCecos || [];
    const filteredCecos = [...cecosSet].filter(c => {
        if (selectedCecos.length === 0) return true;
        return selectedCecos.includes(c);
    }).sort();
    
    if (filteredCecos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No se encontraron centros de costo que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    filteredCecos.forEach(cecoKey => {
        const p1RowsCeco = dataP1.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
        const p2RowsCeco = dataP2.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
        if (p1RowsCeco.length === 0 && p2RowsCeco.length === 0) return;
        
        // Totales del CECO
        const cecoTotals = { DEVENGO: {p1:0,p2:0}, DESCUENTO: {p1:0,p2:0} };
        p1RowsCeco.forEach(r => { if (cecoTotals[r.na]) cecoTotals[r.na].p1 += r.v; });
        p2RowsCeco.forEach(r => { if (cecoTotals[r.na]) cecoTotals[r.na].p2 += r.v; });
        const cecoNetP1 = cecoTotals.DEVENGO.p1 + cecoTotals.DESCUENTO.p1;
        const cecoNetP2 = cecoTotals.DEVENGO.p2 + cecoTotals.DESCUENTO.p2;
        const cecoNetDiff = cecoNetP2 - cecoNetP1;
        const cecoNetPct = cecoNetP1 !== 0 ? (cecoNetDiff / Math.abs(cecoNetP1)) * 100 : (cecoNetDiff > 0 ? 100 : (cecoNetDiff < 0 ? -100 : 0));
        const cecoSafe = cecoKey.replace(/[^a-zA-Z0-9]/g, '_');
        
        // NIVEL 1: CECO
        const cecoRow = document.createElement('tr');
        cecoRow.className = `employee-row ${state.cecoCompareExpanded ? 'expanded' : ''}`;
        cecoRow.setAttribute('data-row-key', cecoSafe);
        cecoRow.innerHTML = `
            <td><i data-lucide="chevron-right" class="expand-chevron"></i><span>${cecoKey}</span></td>
            <td>-</td><td>-</td><td>-</td>
            <td style="text-align:right;">${currencyFormatter.format(cecoNetP1)}</td>
            <td style="text-align:right;">${currencyFormatter.format(cecoNetP2)}</td>
            <td style="text-align:right;">${formatVariationHTML(cecoNetDiff)}</td>
            <td style="text-align:right;">${formatVariationHTML(cecoNetPct, true)}</td>
            <td></td>
        `;
        tbody.appendChild(cecoRow);
        
        // Personas en este CECO
        const peopleMap = {};
        [...p1RowsCeco, ...p2RowsCeco].forEach(d => { if (!peopleMap[d.c]) peopleMap[d.c] = d.n; });
        const sortedPeople = Object.keys(peopleMap).sort((a, b) => peopleMap[a].localeCompare(peopleMap[b]));
        
        sortedPeople.forEach(cedula => {
            const personName = peopleMap[cedula];
            const persP1 = p1RowsCeco.filter(d => d.c === cedula);
            const persP2 = p2RowsCeco.filter(d => d.c === cedula);
            
            const pTotals = { DEVENGO: {p1:0,p2:0}, DESCUENTO: {p1:0,p2:0} };
            persP1.forEach(r => { if (pTotals[r.na]) pTotals[r.na].p1 += r.v; });
            persP2.forEach(r => { if (pTotals[r.na]) pTotals[r.na].p2 += r.v; });
            const pNetP1 = pTotals.DEVENGO.p1 + pTotals.DESCUENTO.p1;
            const pNetP2 = pTotals.DEVENGO.p2 + pTotals.DESCUENTO.p2;
            const pNetDiff = pNetP2 - pNetP1;
            const pNetPct = pNetP1 !== 0 ? (pNetDiff / Math.abs(pNetP1)) * 100 : (pNetDiff > 0 ? 100 : (pNetDiff < 0 ? -100 : 0));
            const personSafe = `${cecoSafe}_${cedula.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            // NIVEL 2: Trabajador
            const personRow = document.createElement('tr');
            personRow.className = `employee-row child-of-${cecoSafe} ${state.cecoCompareExpanded ? '' : 'collapsed-row'}`;
            personRow.setAttribute('data-row-key', personSafe);
            personRow.innerHTML = `
                <td style="padding-left:24px;"><i data-lucide="chevron-right" class="expand-chevron"></i><span>${personName}</span></td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${cedula}</td>
                <td>-</td><td>-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP1)}</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP2)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetDiff)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetPct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(personRow);
            
            // NIVEL 3: Conceptos del trabajador en este CECO
            const pConceptsMeta = {};
            const pC1 = {}, pC2 = {};
            persP1.forEach(r => { pC1[r.co] = (pC1[r.co]||0) + r.v; pConceptsMeta[r.co] = {na: r.na}; });
            persP2.forEach(r => { pC2[r.co] = (pC2[r.co]||0) + r.v; pConceptsMeta[r.co] = {na: r.na}; });
            const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2 };
            const personConcepts = Object.keys(pConceptsMeta).sort((a, b) => {
                const oA = natOrder[pConceptsMeta[a].na]||99, oB = natOrder[pConceptsMeta[b].na]||99;
                return oA !== oB ? oA - oB : a.localeCompare(b);
            });
            personConcepts.forEach(co => {
                const v1 = pC1[co]||0, v2 = pC2[co]||0, diff = v2-v1;
                const cPct = v1 !== 0 ? (diff/Math.abs(v1))*100 : (diff>0?100:(diff<0?-100:0));
                const na = pConceptsMeta[co].na;
                const conRow = document.createElement('tr');
                conRow.className = `concept-row child-of-${personSafe} collapsed-row`;
                conRow.innerHTML = `
                    <td></td><td></td>
                    <td><span class="badge badge-${na.toLowerCase()}">${na}</span></td>
                    <td>${co}</td>
                    <td style="text-align:right;">${v1!==0?currencyFormatter.format(v1):'-'}</td>
                    <td style="text-align:right;">${v2!==0?currencyFormatter.format(v2):'-'}</td>
                    <td style="text-align:right;">${formatVariationHTML(diff)}</td>
                    <td style="text-align:right;">${formatVariationHTML(cPct,true)}</td>
                    <td></td>
                `;
                tbody.appendChild(conRow);
            });
            
            // Click trabajador → mostrar/ocultar sus conceptos
            personRow.addEventListener('click', () => {
                personRow.classList.toggle('expanded');
                const isExp = personRow.classList.contains('expanded');
                document.querySelectorAll(`.child-of-${personSafe}`).forEach(c => c.classList.toggle('collapsed-row', !isExp));
            });
        });
        
        // Click CECO → mostrar/ocultar trabajadores (colapsa sus sub-hijos también)
        cecoRow.addEventListener('click', () => {
            cecoRow.classList.toggle('expanded');
            const isExp = cecoRow.classList.contains('expanded');
            document.querySelectorAll(`.child-of-${cecoSafe}`).forEach(child => {
                child.classList.toggle('collapsed-row', !isExp);
                if (!isExp) {
                    child.classList.remove('expanded');
                    const ck = child.getAttribute('data-row-key');
                    if (ck) document.querySelectorAll(`.child-of-${ck}`).forEach(sc => sc.classList.add('collapsed-row'));
                }
            });
        });
    });
    
    if (window.lucide) window.lucide.createIcons();
}

// ==========================================
// ANÁLISIS MASIVO: CARGOS
// ==========================================
function initCargoCompareSelectors() {
    const btnExpand = document.getElementById('btn-cargo-compare-expand');
    const btnCollapse = document.getElementById('btn-cargo-compare-collapse');
    
    const periods = getUniquePeriodsSorted();
    if (periods.length === 0) return;
    
    if (!state.cargoComparePeriod1) {
        if (periods.length >= 2) {
            state.cargoComparePeriod1 = periods[periods.length - 2];
            state.cargoComparePeriod2 = periods[periods.length - 1];
        } else {
            state.cargoComparePeriod1 = periods[0];
            state.cargoComparePeriod2 = periods[0];
        }
    }
    
    if (btnExpand && !btnExpand.dataset.listenerBound) {
        btnExpand.addEventListener('click', () => {
            state.cargoCompareExpanded = true;
            document.querySelectorAll('#cargo-compare-tbody tr.employee-row').forEach(row => {
                row.classList.add('expanded');
                const key = row.getAttribute('data-row-key');
                document.querySelectorAll(`.child-of-${key}`).forEach(child => child.classList.remove('collapsed-row'));
            });
        });
        btnExpand.dataset.listenerBound = 'true';
    }
    if (btnCollapse && !btnCollapse.dataset.listenerBound) {
        btnCollapse.addEventListener('click', () => {
            state.cargoCompareExpanded = false;
            document.querySelectorAll('#cargo-compare-tbody tr.employee-row').forEach(row => {
                row.classList.remove('expanded');
                const key = row.getAttribute('data-row-key');
                document.querySelectorAll(`.child-of-${key}`).forEach(child => child.classList.add('collapsed-row'));
            });
        });
        btnCollapse.dataset.listenerBound = 'true';
    }
}

function renderCargoComparison() {
    const tbody = document.getElementById('cargo-compare-tbody');
    const headerP1 = document.getElementById('cargo-compare-header-p1');
    const headerP2 = document.getElementById('cargo-compare-header-p2');
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas
    if (headerP1) headerP1.innerText = getPeriodLabel(state.cargoComparePeriod1) || 'Periodo 1';
    if (headerP2) headerP2.innerText = getPeriodLabel(state.cargoComparePeriod2) || 'Periodo 2';
    
    tbody.innerHTML = '';
    
    if (!state.cargoComparePeriod1 || !state.cargoComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    const dataP1 = filterDataByPeriod(state.cargoComparePeriod1);
    const dataP2 = filterDataByPeriod(state.cargoComparePeriod2);
    
    const cargosSet = new Set();
    [...dataP1, ...dataP2].forEach(d => { if (d.cg) cargosSet.add(d.cg); });
    
    // Filtrar cargos por selección si aplica
    const selectedCargos = state.cargoCompareSelectedCargos || [];
    const filteredCargos = [...cargosSet].filter(c => {
        if (selectedCargos.length === 0) return true;
        return selectedCargos.includes(c);
    }).sort();
    
    if (filteredCargos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No se encontraron cargos que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    filteredCargos.forEach(cargo => {
        const p1RowsCargo = dataP1.filter(d => d.cg === cargo);
        const p2RowsCargo = dataP2.filter(d => d.cg === cargo);
        if (p1RowsCargo.length === 0 && p2RowsCargo.length === 0) return;
        
        const cargoTotals = { DEVENGO: {p1:0,p2:0}, DESCUENTO: {p1:0,p2:0} };
        p1RowsCargo.forEach(r => { if (cargoTotals[r.na]) cargoTotals[r.na].p1 += r.v; });
        p2RowsCargo.forEach(r => { if (cargoTotals[r.na]) cargoTotals[r.na].p2 += r.v; });
        const cargoNetP1 = cargoTotals.DEVENGO.p1 + cargoTotals.DESCUENTO.p1;
        const cargoNetP2 = cargoTotals.DEVENGO.p2 + cargoTotals.DESCUENTO.p2;
        const cargoNetDiff = cargoNetP2 - cargoNetP1;
        const cargoNetPct = cargoNetP1 !== 0 ? (cargoNetDiff / Math.abs(cargoNetP1)) * 100 : (cargoNetDiff > 0 ? 100 : (cargoNetDiff < 0 ? -100 : 0));
        const cargoSafe = cargo.replace(/[^a-zA-Z0-9]/g, '_');
        
        // NIVEL 1: Cargo
        const cargoRow = document.createElement('tr');
        cargoRow.className = `employee-row ${state.cargoCompareExpanded ? 'expanded' : ''}`;
        cargoRow.setAttribute('data-row-key', cargoSafe);
        cargoRow.innerHTML = `
            <td><i data-lucide="chevron-right" class="expand-chevron"></i><span>${cargo}</span></td>
            <td>-</td><td>-</td><td>-</td>
            <td style="text-align:right;">${currencyFormatter.format(cargoNetP1)}</td>
            <td style="text-align:right;">${currencyFormatter.format(cargoNetP2)}</td>
            <td style="text-align:right;">${formatVariationHTML(cargoNetDiff)}</td>
            <td style="text-align:right;">${formatVariationHTML(cargoNetPct, true)}</td>
            <td></td>
        `;
        tbody.appendChild(cargoRow);
        
        // Personas en este Cargo
        const peopleMap = {};
        [...p1RowsCargo, ...p2RowsCargo].forEach(d => { if (!peopleMap[d.c]) peopleMap[d.c] = d.n; });
        const sortedPeople = Object.keys(peopleMap).sort((a, b) => peopleMap[a].localeCompare(peopleMap[b]));
        
        sortedPeople.forEach(cedula => {
            const personName = peopleMap[cedula];
            const persP1 = p1RowsCargo.filter(d => d.c === cedula);
            const persP2 = p2RowsCargo.filter(d => d.c === cedula);
            
            const pTotals = { DEVENGO: {p1:0,p2:0}, DESCUENTO: {p1:0,p2:0} };
            persP1.forEach(r => { if (pTotals[r.na]) pTotals[r.na].p1 += r.v; });
            persP2.forEach(r => { if (pTotals[r.na]) pTotals[r.na].p2 += r.v; });
            const pNetP1 = pTotals.DEVENGO.p1 + pTotals.DESCUENTO.p1;
            const pNetP2 = pTotals.DEVENGO.p2 + pTotals.DESCUENTO.p2;
            const pNetDiff = pNetP2 - pNetP1;
            const pNetPct = pNetP1 !== 0 ? (pNetDiff / Math.abs(pNetP1)) * 100 : (pNetDiff > 0 ? 100 : (pNetDiff < 0 ? -100 : 0));
            const personSafe = `${cargoSafe}_${cedula.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            // NIVEL 2: Trabajador
            const personRow = document.createElement('tr');
            personRow.className = `employee-row child-of-${cargoSafe} ${state.cargoCompareExpanded ? '' : 'collapsed-row'}`;
            personRow.setAttribute('data-row-key', personSafe);
            personRow.innerHTML = `
                <td style="padding-left:24px;"><i data-lucide="chevron-right" class="expand-chevron"></i><span>${personName}</span></td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${cedula}</td>
                <td>-</td><td>-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP1)}</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP2)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetDiff)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetPct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(personRow);
            
            // NIVEL 3: Conceptos del trabajador
            const pConceptsMeta = {};
            const pC1 = {}, pC2 = {};
            persP1.forEach(r => { pC1[r.co] = (pC1[r.co]||0) + r.v; pConceptsMeta[r.co] = {na: r.na}; });
            persP2.forEach(r => { pC2[r.co] = (pC2[r.co]||0) + r.v; pConceptsMeta[r.co] = {na: r.na}; });
            const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2 };
            const personConcepts = Object.keys(pConceptsMeta).sort((a, b) => {
                const oA = natOrder[pConceptsMeta[a].na]||99, oB = natOrder[pConceptsMeta[b].na]||99;
                return oA !== oB ? oA - oB : a.localeCompare(b);
            });
            personConcepts.forEach(co => {
                const v1 = pC1[co]||0, v2 = pC2[co]||0, diff = v2-v1;
                const cPct = v1 !== 0 ? (diff/Math.abs(v1))*100 : (diff>0?100:(diff<0?-100:0));
                const na = pConceptsMeta[co].na;
                const conRow = document.createElement('tr');
                conRow.className = `concept-row child-of-${personSafe} collapsed-row`;
                conRow.innerHTML = `
                    <td></td><td></td>
                    <td><span class="badge badge-${na.toLowerCase()}">${na}</span></td>
                    <td>${co}</td>
                    <td style="text-align:right;">${v1!==0?currencyFormatter.format(v1):'-'}</td>
                    <td style="text-align:right;">${v2!==0?currencyFormatter.format(v2):'-'}</td>
                    <td style="text-align:right;">${formatVariationHTML(diff)}</td>
                    <td style="text-align:right;">${formatVariationHTML(cPct,true)}</td>
                    <td></td>
                `;
                tbody.appendChild(conRow);
            });
            
            personRow.addEventListener('click', () => {
                personRow.classList.toggle('expanded');
                const isExp = personRow.classList.contains('expanded');
                document.querySelectorAll(`.child-of-${personSafe}`).forEach(c => c.classList.toggle('collapsed-row', !isExp));
            });
        });
        
        cargoRow.addEventListener('click', () => {
            cargoRow.classList.toggle('expanded');
            const isExp = cargoRow.classList.contains('expanded');
            document.querySelectorAll(`.child-of-${cargoSafe}`).forEach(child => {
                child.classList.toggle('collapsed-row', !isExp);
                if (!isExp) {
                    child.classList.remove('expanded');
                    const ck = child.getAttribute('data-row-key');
                    if (ck) document.querySelectorAll(`.child-of-${ck}`).forEach(sc => sc.classList.add('collapsed-row'));
                }
            });
        });
    });
    
    if (window.lucide) window.lucide.createIcons();
}


function showConceptAnalysisModal(conceptName, nature, period1, period2) {
    const existing = document.getElementById('analysis-modal-overlay');
    if (existing) existing.remove();
    
    // Parse periods
    const dataP1Raw = filterDataByPeriod(period1);
    const dataP2Raw = filterDataByPeriod(period2);
    
    const dataP1 = dataP1Raw.filter(d => d.co === conceptName);
    const dataP2 = dataP2Raw.filter(d => d.co === conceptName);
    
    // Map values by employee
    const p1Map = {}, p2Map = {}, allCedulas = new Set();
    const employeeNames = {};
    
    dataP1.forEach(r => {
        p1Map[r.c] = r.v;
        allCedulas.add(r.c);
        employeeNames[r.c] = r.n;
    });
    dataP2.forEach(r => {
        p2Map[r.c] = r.v;
        allCedulas.add(r.c);
        employeeNames[r.c] = r.n;
    });
    
    // Calculate employee-level variation
    const changes = Array.from(allCedulas).map(cedula => {
        const v1 = p1Map[cedula] || 0;
        const v2 = p2Map[cedula] || 0;
        return {
            cedula,
            name: employeeNames[cedula] || 'Desconocido',
            v1,
            v2,
            diff: v2 - v1,
            pct: v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : (v2 !== 0 ? 100 : 0)
        };
    }).filter(c => Math.abs(c.diff) > 0);
    
    // Aggregated concept values
    let totalP1 = 0;
    let totalP2 = 0;
    dataP1.forEach(r => totalP1 += r.v);
    dataP2.forEach(r => totalP2 += r.v);
    
    const totalDiff = totalP2 - totalP1;
    const totalPct = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : 0;
    
    // Top increases and decreases
    const increases = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
    const decreases = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);
    
    // Build narrative
    let narrative = '';
    if (Math.abs(totalDiff) < 100) {
        narrative = `<p class="analysis-summary">El desembolso consolidado para el concepto <strong>${conceptName}</strong> se mantuvo estable entre ambos periodos.</p>`;
    } else {
        const direction = totalDiff > 0 ? 'aumentó' : 'disminuyó';
        const arrow = totalDiff > 0 ? '↑' : '↓';
        const colorClass = totalDiff > 0 ? 'analysis-positive' : 'analysis-negative';
        
        narrative = `<p class="analysis-summary">El monto total consolidado de <strong>${conceptName}</strong> (${nature.toLowerCase()}) ${direction} en <span class="${colorClass}"><strong>${arrow} ${currencyFormatter.format(Math.abs(totalDiff))}</strong> (${totalPct > 0 ? '+' : ''}${totalPct.toFixed(1)}%)</span> entre ${period1} y ${period2}.</p>`;
    }
    
    let increasesHTML = '';
    if (increases.length > 0) {
        increasesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title analysis-positive">↑ Colaboradores con mayor incremento</h4>
                <div class="analysis-items">
                    ${increases.map(c => `
                        <div class="analysis-item">
                            <div class="analysis-item-header">
                                <span class="analysis-concept">${c.name.toLowerCase()}</span>
                                <span style="font-size:0.65rem; color:var(--text-muted);">${c.cedula}</span>
                            </div>
                            <div class="analysis-item-values">
                                <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                <span class="analysis-arrow">→</span>
                                <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                <span class="analysis-diff analysis-positive">+${currencyFormatter.format(c.diff)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    let decreasesHTML = '';
    if (decreases.length > 0) {
        decreasesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title analysis-negative">↓ Colaboradores con mayor reducción</h4>
                <div class="analysis-items">
                    ${decreases.map(c => `
                        <div class="analysis-item">
                            <div class="analysis-item-header">
                                <span class="analysis-concept">${c.name.toLowerCase()}</span>
                                <span style="font-size:0.65rem; color:var(--text-muted);">${c.cedula}</span>
                            </div>
                            <div class="analysis-item-values">
                                <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                <span class="analysis-arrow">→</span>
                                <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                <span class="analysis-diff analysis-negative">${currencyFormatter.format(c.diff)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Create DOM structure
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <div>
                    <h3 class="analysis-modal-title" style="text-transform:uppercase;">${conceptName}</h3>
                    <p class="analysis-modal-subtitle">Análisis comparativo de variaciones</p>
                    <p class="analysis-modal-periods">${period1} vs ${period2}</p>
                </div>
                <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                ${narrative}
                
                <div class="analysis-summary-bar">
                    <div class="analysis-summary-item">
                        <span class="analysis-label">Naturaleza:</span>
                        <span class="analysis-val"><span class="badge badge-${nature.toLowerCase()}">${nature}</span></span>
                    </div>
                    <div class="analysis-summary-item">
                        <span class="analysis-label">${period1}:</span>
                        <span class="analysis-val">${currencyFormatter.format(totalP1)}</span>
                    </div>
                    <div class="analysis-summary-item">
                        <span class="analysis-label">${period2}:</span>
                        <span class="analysis-val">${currencyFormatter.format(totalP2)}</span>
                    </div>
                    <div class="analysis-summary-item">
                        <span class="analysis-label">Variación:</span>
                        <span class="analysis-val" style="font-weight:600;">${formatVariationHTML(totalDiff)}</span>
                    </div>
                </div>
                
                ${increasesHTML}
                ${decreasesHTML}
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate in
    requestAnimationFrame(() => overlay.classList.add('visible'));
    
    // Close events
    const closeBtn = overlay.querySelector('#analysis-close-btn');
    const closeOverlay = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 250);
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
    });
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Modal lateral de análisis general consolidado de periodos (Análisis Ejecutivo)
// Modal lateral de análisis general consolidado de periodos (Análisis Ejecutivo)
function showGeneralPeriodAnalysisModal(period1, period2) {
    const existing = document.getElementById('analysis-modal-overlay');
    if (existing) existing.remove();
    
    // Parse periods
    const dataP1Raw = filterDataByPeriod(period1);
    const dataP2Raw = filterDataByPeriod(period2);
    
    const allConceptsMap = {};
    dataP1Raw.concat(dataP2Raw).forEach(d => {
        allConceptsMap[d.co] = d.na;
    });
    const allConceptsAvailable = Object.keys(allConceptsMap).sort();
    let selectedConcepts = new Set(allConceptsAvailable);
    
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    document.body.appendChild(overlay);
    
    function renderModalContent() {
        // Filtrar datos según conceptos seleccionados
        const dataP1 = dataP1Raw.filter(d => selectedConcepts.has(d.co));
        const dataP2 = dataP2Raw.filter(d => selectedConcepts.has(d.co));
        
        // Aggregate overall metrics
        let devP1 = 0, devP2 = 0;
        let descP1 = 0, descP2 = 0;
        let benP1 = 0, benP2 = 0;
        const empsP1 = new Set();
        const empsP2 = new Set();
        
        dataP1.forEach(d => {
            if (d.na === 'DEVENGO') devP1 += d.v;
            else if (d.na === 'DESCUENTO') descP1 += d.v;
            else if (d.na === 'BENEFICIO') benP1 += d.v;
            empsP1.add(d.c);
        });
        
        dataP2.forEach(d => {
            if (d.na === 'DEVENGO') devP2 += d.v;
            else if (d.na === 'DESCUENTO') descP2 += d.v;
            else if (d.na === 'BENEFICIO') benP2 += d.v;
            empsP2.add(d.c);
        });
        
        const netP1 = devP1 + descP1 + benP1;
        const netP2 = devP2 + descP2 + benP2;
        const netDiff = netP2 - netP1;
        const netPct = netP1 !== 0 ? (netDiff / Math.abs(netP1)) * 100 : 0;
        
        const devDiff = devP2 - devP1;
        const devPct = devP1 !== 0 ? (devDiff / Math.abs(devP1)) * 100 : 0;
        
        const descDiff = descP2 - descP1;
        const descPct = descP1 !== 0 ? (descDiff / Math.abs(descP1)) * 100 : 0;
        
        // Concept-level differences
        const p1Concepts = {};
        const p2Concepts = {};
        const conceptNatures = {};
        
        dataP1.forEach(d => {
            p1Concepts[d.co] = (p1Concepts[d.co] || 0) + d.v;
            conceptNatures[d.co] = d.na;
        });
        dataP2.forEach(d => {
            p2Concepts[d.co] = (p2Concepts[d.co] || 0) + d.v;
            conceptNatures[d.co] = d.na;
        });
        
        const allFilteredConcepts = new Set([...Object.keys(p1Concepts), ...Object.keys(p2Concepts)]);
        const conceptChanges = Array.from(allFilteredConcepts).map(co => {
            const v1 = p1Concepts[co] || 0;
            const v2 = p2Concepts[co] || 0;
            return {
                co,
                na: conceptNatures[co],
                v1,
                v2,
                diff: v2 - v1,
                pct: v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : (v2 !== 0 ? 100 : 0)
            };
        }).filter(c => Math.abs(c.diff) > 10);
        
        const increases = conceptChanges.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4);
        const decreases = conceptChanges.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 4);
        const newConcepts = conceptChanges.filter(c => c.v1 === 0 && c.v2 !== 0);
        const disappearedConcepts = conceptChanges.filter(c => c.v1 !== 0 && c.v2 === 0);
        
        // Heatmap Matrix por Persona
        const peopleMap = {};
        dataP1.concat(dataP2).forEach(d => {
            if (!peopleMap[d.c]) {
                peopleMap[d.c] = { name: d.n, p1: 0, p2: 0 };
            }
        });
        dataP1.forEach(d => peopleMap[d.c].p1 += d.v);
        dataP2.forEach(d => peopleMap[d.c].p2 += d.v);
        
        const peopleList = Object.keys(peopleMap).map(c => {
            const p = peopleMap[c];
            const diff = p.p2 - p.p1;
            const pct = p.p1 !== 0 ? (diff / Math.abs(p.p1)) * 100 : (p.p2 !== 0 ? 100 : 0);
            return { c, name: p.name, p1: p.p1, p2: p.p2, diff, pct };
        }).sort((a, b) => b.diff - a.diff);
        
        const maxPosDiff = Math.max(...peopleList.filter(p => p.diff > 0).map(p => p.diff), 1);
        const maxNegDiff = Math.abs(Math.min(...peopleList.filter(p => p.diff < 0).map(p => p.diff), -1));
        
        const matrixRowsHTML = peopleList.map(p => {
            let heatStyle = '';
            let heatClass = '';
            if (p.diff > 0) {
                const intensity = Math.min(Math.max(p.diff / maxPosDiff, 0.1), 1);
                heatStyle = `background-color: rgba(16, 185, 129, ${intensity * 0.35});`;
                heatClass = 'heatmap-positive';
            } else if (p.diff < 0) {
                const intensity = Math.min(Math.max(Math.abs(p.diff) / maxNegDiff, 0.1), 1);
                heatStyle = `background-color: rgba(239, 68, 68, ${intensity * 0.35});`;
                heatClass = 'heatmap-negative';
            }
            return `
                <tr>
                    <td>${p.name}</td>
                    <td style="text-align: right;">${currencyFormatter.format(p.p1)}</td>
                    <td style="text-align: right;">${currencyFormatter.format(p.p2)}</td>
                    <td class="heatmap-cell ${heatClass}" style="${heatStyle}">${p.diff > 0 ? '+' : ''}${currencyFormatter.format(p.diff)}</td>
                    <td class="${heatClass}" style="text-align: right;">${p.pct > 0 ? '+' : ''}${p.pct.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
        
        const matrixHTML = `
            <div class="analysis-matrix-container">
                <table>
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th style="text-align: right;">${period1}</th>
                            <th style="text-align: right;">${period2}</th>
                            <th style="text-align: right;">Variación ($)</th>
                            <th style="text-align: right;">Variación (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${peopleList.length > 0 ? matrixRowsHTML : '<tr><td colspan="5" style="text-align:center;">No hay datos para los conceptos filtrados</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        
        // Renderizado del Filtro de Conceptos
        const allSelected = selectedConcepts.size === allConceptsAvailable.length;
        const tagsHTML = `
            <div class="analysis-filter-container">
                <div class="analysis-filter-header">
                    <span style="font-size: 0.8rem; font-weight: 600;">Filtro de Conceptos a Analizar</span>
                    <button id="btn-toggle-all-concepts" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.7rem;">
                        ${allSelected ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                    </button>
                </div>
                <div class="analysis-tags-area">
                    ${allConceptsAvailable.map(co => {
                        const isSelected = selectedConcepts.has(co);
                        return `
                            <div class="analysis-concept-tag ${isSelected ? '' : 'all-selected'}" data-concept="${co}" style="cursor: pointer;">
                                ${co} ${isSelected ? '<i data-lucide="check" style="width:12px;height:12px;"></i>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        // Build Narrative
        const dir = netDiff > 0 ? 'un incremento' : 'una reducción';
        const sign = netDiff > 0 ? '+' : '';
        const arrow = netDiff > 0 ? '↑' : '↓';
        const colorClass = netDiff > 0 ? 'analysis-positive' : 'analysis-negative';
        
        const narrative = `
            <p class="analysis-summary">
                Para los conceptos seleccionados, el neto consolidado pasó de <strong>${currencyFormatter.format(netP1)}</strong> en ${period1} a <strong>${currencyFormatter.format(netP2)}</strong> en ${period2}. 
                Esto representa ${dir} de <span class="${colorClass}"><strong>${arrow} ${currencyFormatter.format(Math.abs(netDiff))}</strong> (${sign}${netPct.toFixed(2)}%)</span>.
            </p>
        `;
        
        // Extras y Tops
        let increasesHTML = '', decreasesHTML = '', extrasHTML = '';
        if (increases.length > 0) {
            increasesHTML = `
                <div class="analysis-section">
                    <h4 class="analysis-section-title analysis-positive">↑ Conceptos con mayor incremento</h4>
                    <div class="analysis-items">
                        ${increases.map(c => `
                            <div class="analysis-item">
                                <div class="analysis-item-header">
                                    <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                    <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                                </div>
                                <div class="analysis-item-values">
                                    <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                    <span class="analysis-arrow">→</span>
                                    <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                    <span class="analysis-diff analysis-positive">+${currencyFormatter.format(c.diff)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        if (decreases.length > 0) {
            decreasesHTML = `
                <div class="analysis-section">
                    <h4 class="analysis-section-title analysis-negative">↓ Conceptos con mayor reducción</h4>
                    <div class="analysis-items">
                        ${decreases.map(c => `
                            <div class="analysis-item">
                                <div class="analysis-item-header">
                                    <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                    <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                                </div>
                                <div class="analysis-item-values">
                                    <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                    <span class="analysis-arrow">→</span>
                                    <span class="analysis-to">${currencyFormatter.format(c.v2)}</span>
                                    <span class="analysis-diff analysis-negative">${currencyFormatter.format(c.diff)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (newConcepts.length > 0 || disappearedConcepts.length > 0) {
            let newContent = '';
            if (newConcepts.length > 0) {
                newContent += `<div style="margin-bottom: 8px;"><span style="font-size: 0.72rem; font-weight:600; color: var(--accent-yellow);">Nuevos conceptos en ${period2}:</span><ul style="padding-left: 16px; margin-top: 4px; font-size: 0.7rem; color: var(--text-secondary);">${newConcepts.slice(0, 3).map(c => `<li>${c.co.toLowerCase()} (+${currencyFormatter.format(c.v2)})</li>`).join('')}</ul></div>`;
            }
            if (disappearedConcepts.length > 0) {
                newContent += `<div><span style="font-size: 0.72rem; font-weight:600; color: var(--accent-yellow);">Conceptos no registrados en ${period2}:</span><ul style="padding-left: 16px; margin-top: 4px; font-size: 0.7rem; color: var(--text-secondary);">${disappearedConcepts.slice(0, 3).map(c => `<li>${c.co.toLowerCase()} (-${currencyFormatter.format(c.v1)})</li>`).join('')}</ul></div>`;
            }
            extrasHTML = `<div class="analysis-section" style="background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; padding: 12px; margin-top: 14px;"><h4 style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 4px;">Auditoría de Conceptos</h4>${newContent}</div>`;
        }
        
        overlay.innerHTML = `
            <div class="analysis-modal" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="analysis-modal-header" style="flex-shrink: 0;">
                    <div>
                        <h3 class="analysis-modal-title">ANÁLISIS GENERAL EJECUTIVO</h3>
                        <p class="analysis-modal-subtitle">Consolidado General de Nómina</p>
                        <p class="analysis-modal-periods">${period1} vs ${period2}</p>
                    </div>
                    <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                        <i data-lucide="x" style="width:18px;height:18px;"></i>
                    </button>
                </div>
                <div class="analysis-modal-body" style="overflow-y: auto; flex-grow: 1;">
                    ${tagsHTML}
                    ${narrative}
                    <div class="analysis-summary-bar" style="gap: 12px; display: flex; flex-direction: column;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                            <div style="background: rgba(0,0,0,0.04); padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size: 0.68rem; color: var(--text-muted); display: block; text-transform: uppercase;">Devengos P1</span>
                                <span style="font-size: 0.8rem; font-weight: 700;">${currencyFormatter.format(devP1)}</span>
                            </div>
                            <div style="background: rgba(0,0,0,0.04); padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size: 0.68rem; color: var(--text-muted); display: block; text-transform: uppercase;">Devengos P2</span>
                                <span style="font-size: 0.8rem; font-weight: 700; color: #3d9e78;">${currencyFormatter.format(devP2)}</span>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                            <div style="background: rgba(0,0,0,0.04); padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size: 0.68rem; color: var(--text-muted); display: block; text-transform: uppercase;">Descuentos P1</span>
                                <span style="font-size: 0.8rem; font-weight: 700;">${currencyFormatter.format(descP1)}</span>
                            </div>
                            <div style="background: rgba(0,0,0,0.04); padding: 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size: 0.68rem; color: var(--text-muted); display: block; text-transform: uppercase;">Descuentos P2</span>
                                <span style="font-size: 0.8rem; font-weight: 700; color: #d45c5c;">${currencyFormatter.format(descP2)}</span>
                            </div>
                        </div>
                        <div style="border-top: 1px solid rgba(0,0,0,0.06); padding-top: 8px; display: flex; justify-content: space-between; font-size: 0.76rem;">
                            <span style="color: var(--text-secondary);">Variación Devengos:</span>
                            <span>${formatVariationHTML(devDiff)} (${devPct > 0 ? '+' : ''}${devPct.toFixed(2)}%)</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.76rem;">
                            <span style="color: var(--text-secondary);">Variación Descuentos:</span>
                            <span>${formatVariationHTML(descDiff)} (${descPct > 0 ? '+' : ''}${descPct.toFixed(2)}%)</span>
                        </div>
                    </div>
                    
                    ${increasesHTML}
                    ${decreasesHTML}
                    ${extrasHTML}
                    
                    <h4 class="analysis-section-title" style="margin-top: 24px;">Matriz Cruzada por Colaborador (Mapa de Calor)</h4>
                    ${matrixHTML}
                </div>
            </div>
        `;
        
        // Bind events for tags
        overlay.querySelectorAll('.analysis-concept-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                const co = e.currentTarget.getAttribute('data-concept');
                if (selectedConcepts.has(co)) {
                    selectedConcepts.delete(co);
                } else {
                    selectedConcepts.add(co);
                }
                renderModalContent();
            });
        });
        
        // Toggle All button
        overlay.querySelector('#btn-toggle-all-concepts').addEventListener('click', () => {
            if (allSelected) {
                selectedConcepts.clear();
            } else {
                allConceptsAvailable.forEach(c => selectedConcepts.add(c));
            }
            renderModalContent();
        });
        
        // Bind close
        const closeBtn = overlay.querySelector('#analysis-close-btn');
        const closeOverlay = () => {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 250);
        };
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
        
        // Update Icons
        if (window.lucide) window.lucide.createIcons();
    }
    
    // Initial Render
    renderModalContent();
    
    // Show overlay smoothly
    requestAnimationFrame(() => overlay.classList.add('visible'));
    
    // Close on click outside
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 250);
        }
    });
}



// ============================================================================
// GENERACIÓN DE INFORME GERENCIAL EN PDF (ANÁLISIS MASIVO POR CONCEPTO)
// ============================================================================

function loadHtml2Pdf() {
    return new Promise((resolve, reject) => {
        if (window.html2pdf) {
            resolve(window.html2pdf);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => resolve(window.html2pdf);
        script.onerror = () => reject(new Error('No se pudo cargar la librería html2pdf.js'));
        document.head.appendChild(script);
    });
}

function calculateManagerialInsights() {
    const p1 = state.conceptComparePeriod1;
    const p2 = state.conceptComparePeriod2;
    if (!p1 || !p2) return null;

    const dataP1 = filterDataByPeriod(p1);
    const dataP2 = filterDataByPeriod(p2);

    const payrollData = state.data || [];
    const allConcepts = [...new Set(payrollData.map(d => d.co))];
    const selectedConcepts = state.conceptCompareSelectedConcepts || [];
    const filteredConcepts = allConcepts.filter(co => {
        if (selectedConcepts.length === 0) return true;
        return selectedConcepts.includes(co);
    });

    let devengosP1 = 0, devengosP2 = 0;
    let descuentosP1 = 0, descuentosP2 = 0;

    const conceptDetails = [];
    const p1ConceptSums = {};
    const p2ConceptSums = {};
    const conceptNatures = {};

    const employeeNames = {};
    const empNetP1 = {};
    const empNetP2 = {};

    const cecoP1 = {};
    const cecoP2 = {};

    const cargoP1 = {};
    const cargoP2 = {};

    // Procesar P1
    dataP1.forEach(d => {
        if (d.c) employeeNames[d.c] = d.n || 'Desconocido';
        const val = d.v || 0;
        const isDevengo = d.na === 'DEVENGO';
        const isDescuento = d.na === 'DESCUENTO';

        if (filteredConcepts.includes(d.co)) {
            p1ConceptSums[d.co] = (p1ConceptSums[d.co] || 0) + val;
            conceptNatures[d.co] = d.na;

            if (isDevengo) {
                devengosP1 += val;
                if (d.c) empNetP1[d.c] = (empNetP1[d.c] || 0) + val;
                if (d.dcc) cecoP1[d.dcc] = (cecoP1[d.dcc] || 0) + val;
                if (d.cg) cargoP1[d.cg] = (cargoP1[d.cg] || 0) + val;
            } else if (isDescuento) {
                descuentosP1 += val;
                if (d.c) empNetP1[d.c] = (empNetP1[d.c] || 0) - val;
            }
        }
    });

    // Procesar P2
    dataP2.forEach(d => {
        if (d.c) employeeNames[d.c] = d.n || 'Desconocido';
        const val = d.v || 0;
        const isDevengo = d.na === 'DEVENGO';
        const isDescuento = d.na === 'DESCUENTO';

        if (filteredConcepts.includes(d.co)) {
            p2ConceptSums[d.co] = (p2ConceptSums[d.co] || 0) + val;
            conceptNatures[d.co] = d.na;

            if (isDevengo) {
                devengosP2 += val;
                if (d.c) empNetP2[d.c] = (empNetP2[d.c] || 0) + val;
                if (d.dcc) cecoP2[d.dcc] = (cecoP2[d.dcc] || 0) + val;
                if (d.cg) cargoP2[d.cg] = (cargoP2[d.cg] || 0) + val;
            } else if (isDescuento) {
                descuentosP2 += val;
                if (d.c) empNetP2[d.c] = (empNetP2[d.c] || 0) - val;
            }
        }
    });

    const netP1 = devengosP1 - descuentosP1;
    const netP2 = devengosP2 - descuentosP2;

    const devengosDiff = devengosP2 - devengosP1;
    const devengosPct = devengosP1 !== 0 ? (devengosDiff / devengosP1) * 100 : 0;

    const descuentosDiff = descuentosP2 - descuentosP1;
    const descuentosPct = descuentosP1 !== 0 ? (descuentosDiff / descuentosP1) * 100 : 0;

    const netDiff = netP2 - netP1;
    const netPct = netP1 !== 0 ? (netDiff / netP1) * 100 : 0;

    filteredConcepts.forEach(co => {
        const v1 = p1ConceptSums[co] || 0;
        const v2 = p2ConceptSums[co] || 0;
        const na = conceptNatures[co] || 'DEVENGO';

        if (v1 === 0 && v2 === 0) return;

        const diff = v2 - v1;
        const pct = v1 !== 0 ? (diff / Math.abs(v1)) * 100 : (diff > 0 ? 100 : -100);

        conceptDetails.push({ co, na, v1, v2, diff, pct });
    });

    conceptDetails.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    const topIncreases = conceptDetails.filter(c => c.diff > 0).slice(0, 3);
    const topReductions = conceptDetails.filter(c => c.diff < 0).sort((a,b) => a.diff - b.diff).slice(0, 3);
    const newConcepts = conceptDetails.filter(c => c.v1 === 0 && c.v2 > 0);
    const inactiveConcepts = conceptDetails.filter(c => c.v1 > 0 && c.v2 === 0);

    const cecoDetails = [];
    const allCecos = new Set([...Object.keys(cecoP1), ...Object.keys(cecoP2)]);
    allCecos.forEach(cc => {
        const v1 = cecoP1[cc] || 0;
        const v2 = cecoP2[cc] || 0;
        const diff = v2 - v1;
        const pct = v1 !== 0 ? (diff / v1) * 100 : 0;
        if (v1 !== 0 || v2 !== 0) {
            cecoDetails.push({ cc, v1, v2, diff, pct });
        }
    });
    cecoDetails.sort((a, b) => b.diff - a.diff);
    const topCecoIncreases = cecoDetails.slice(0, 3);

    const cargoDetails = [];
    const allCargos = new Set([...Object.keys(cargoP1), ...Object.keys(cargoP2)]);
    allCargos.forEach(cg => {
        const v1 = cargoP1[cg] || 0;
        const v2 = cargoP2[cg] || 0;
        const diff = v2 - v1;
        const pct = v1 !== 0 ? (diff / v1) * 100 : 0;
        if (v1 !== 0 || v2 !== 0) {
            cargoDetails.push({ cg, v1, v2, diff, pct });
        }
    });
    cargoDetails.sort((a, b) => b.diff - a.diff);
    const topCargoIncreases = cargoDetails.slice(0, 3);

    const empDetails = [];
    const allEmps = new Set([...Object.keys(empNetP1), ...Object.keys(empNetP2)]);
    allEmps.forEach(c => {
        const v1 = empNetP1[c] || 0;
        const v2 = empNetP2[c] || 0;
        const diff = v2 - v1;
        const pct = v1 !== 0 ? (diff / Math.abs(v1)) * 100 : 0;
        if (Math.abs(diff) > 1) {
            empDetails.push({
                c,
                name: employeeNames[c] || 'Desconocido',
                v1,
                v2,
                diff,
                pct
            });
        }
    });
    empDetails.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const topEmpImpacts = empDetails.slice(0, 5);

    return {
        p1,
        p2,
        totals: {
            devengosP1, devengosP2, devengosDiff, devengosPct,
            descuentosP1, descuentosP2, descuentosDiff, descuentosPct,
            netP1, netP2, netDiff, netPct
        },
        conceptDetails,
        topIncreases,
        topReductions,
        newConcepts,
        inactiveConcepts,
        topCecoIncreases,
        topCargoIncreases,
        topEmpImpacts
    };
}

function generateManagerialReport() {
    // 1. Mostrar pantalla de progreso step-by-step
    const progressOverlay = document.createElement('div');
    progressOverlay.id = 'report-progress-overlay';
    progressOverlay.style.position = 'fixed';
    progressOverlay.style.top = '0';
    progressOverlay.style.left = '0';
    progressOverlay.style.width = '100vw';
    progressOverlay.style.height = '100vh';
    progressOverlay.style.background = 'rgba(15, 23, 42, 0.9)';
    progressOverlay.style.backdropFilter = 'blur(10px)';
    progressOverlay.style.zIndex = '100000';
    progressOverlay.style.display = 'flex';
    progressOverlay.style.justifyContent = 'center';
    progressOverlay.style.alignItems = 'center';
    progressOverlay.style.color = 'white';
    progressOverlay.style.fontFamily = "'Outfit', sans-serif";
    
    progressOverlay.innerHTML = `
        <div style="background: rgba(30, 27, 75, 0.95); border: 1px solid rgba(255,255,255,0.15); padding: 40px; border-radius: 20px; max-width: 500px; width: 90%; box-shadow: 0 20px 50px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; align-items: center; gap: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
                <div class="spin-animation" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #a855f7; border-radius: 50%; width: 30px; height: 30px;"></div>
                <h3 style="margin: 0; font-size: 1.3rem; font-weight: 600;">Creador de Informe NomAI</h3>
            </div>
            <div id="progress-steps-list" style="display: flex; flex-direction: column; gap: 12px; font-size: 0.95rem; color: #cbd5e1;">
            </div>
            <div id="progress-error-box" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 15px; border-radius: 8px; color: #fca5a5; font-size: 0.85rem; font-family: monospace; overflow-y: auto; white-space: pre-wrap; max-height: 150px;">
            </div>
            <div id="progress-action-bar" style="display: none; justify-content: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                <button id="btn-close-progress" class="btn btn-secondary" style="padding: 6px 16px; border-radius: 20px;">Cerrar</button>
            </div>
        </div>
    `;
    
    if (!document.getElementById('report-spin-style')) {
        const style = document.createElement('style');
        style.id = 'report-spin-style';
        style.innerHTML = `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .spin-animation { animation: spin 1s linear infinite; }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(progressOverlay);
    
    function updateProgressStep(stepId, status, text, errorMsg = '') {
        const list = document.getElementById('progress-steps-list');
        if (!list) return;
        
        let stepRow = document.getElementById('step-' + stepId);
        if (!stepRow) {
            stepRow = document.createElement('div');
            stepRow.id = 'step-' + stepId;
            stepRow.style.display = 'flex';
            stepRow.style.alignItems = 'center';
            stepRow.style.gap = '10px';
            list.appendChild(stepRow);
        }
        
        let icon = '';
        let color = '#cbd5e1';
        if (status === 'pending') {
            icon = '<span style="color: #cbd5e1; font-weight: bold;">[ ]</span>';
        } else if (status === 'processing') {
            icon = '<div class="spin-animation" style="border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid #a855f7; border-radius: 50%; width: 12px; height: 12px; display: inline-block;"></div>';
            color = '#a855f7';
        } else if (status === 'success') {
            icon = '<span style="color: #10b981; font-weight: bold;">[&#10004;]</span>';
            color = '#10b981';
        } else if (status === 'error') {
            icon = '<span style="color: #ef4444; font-weight: bold;">[&#10006;]</span>';
            color = '#ef4444';
        }
        
        stepRow.innerHTML = `${icon} <span style="color: ${color};">${text}</span>`;
        
        if (status === 'error') {
            const spin = progressOverlay.querySelector('.spin-animation');
            if (spin) spin.style.animation = 'none'; // Detener giro principal
            
            if (errorMsg) {
                const errBox = document.getElementById('progress-error-box');
                if (errBox) {
                    errBox.style.display = 'block';
                    errBox.innerText = errorMsg;
                }
            }
            const actionBar = document.getElementById('progress-action-bar');
            if (actionBar) {
                actionBar.style.display = 'flex';
                const closeBtn = document.getElementById('btn-close-progress');
                if (closeBtn) {
                    closeBtn.onclick = () => progressOverlay.remove();
                }
            }
        }
    }
    
    // Registrar pasos iniciales
    updateProgressStep('1-validate', 'pending', 'Validando periodos y filtros...');
    updateProgressStep('2-insights', 'pending', 'Calculando insights gerenciales...');
    updateProgressStep('3-logo', 'pending', 'Cargando logo corporativo de NomAI...');
    updateProgressStep('4-template', 'pending', 'Construyendo maqueta del reporte...');
    updateProgressStep('5-charts', 'pending', 'Renderizando graficos de analisis...');
    updateProgressStep('6-show', 'pending', 'Abriendo previsualizacion en pantalla...');
    
    setTimeout(() => {
        try {
            // Paso 1: Validacion
            updateProgressStep('1-validate', 'processing', 'Validando periodos y filtros...');
            const p1 = state.conceptComparePeriod1;
            const p2 = state.conceptComparePeriod2;
            
            if (!p1 || !p2) {
                throw new Error("Por favor selecciona los periodos (P1 y P2) en la tabla antes de continuar.");
            }
            updateProgressStep('1-validate', 'success', 'Periodos validados correctamente.');
            
            // Paso 2: Insights
            updateProgressStep('2-insights', 'processing', 'Calculando insights gerenciales...');
            const insights = calculateManagerialInsights();
            if (!insights) {
                throw new Error("No se pudieron calcular los insights. Verifica los filtros seleccionados.");
            }
            updateProgressStep('2-insights', 'success', 'Insights gerenciales calculados.');
            
            // Paso 3: Logo
            updateProgressStep('3-logo', 'processing', 'Cargando logo corporativo de NomAI...');
            const logoImg = document.querySelector('.logo-img-expanded');
            let logoBase64 = '';
            if (logoImg) {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = logoImg.naturalWidth || logoImg.width;
                    canvas.height = logoImg.naturalHeight || logoImg.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(logoImg, 0, 0);
                    logoBase64 = canvas.toDataURL("image/png");
                } catch (e) {
                    console.error("Error al convertir logo a base64:", e);
                    logoBase64 = 'logo-expanded.png';
                }
            } else {
                logoBase64 = 'logo-expanded.png';
            }
            updateProgressStep('3-logo', 'success', 'Logo cargado exitosamente.');
            
            // Paso 4: Construyendo maqueta
            updateProgressStep('4-template', 'processing', 'Construyendo maqueta del reporte...');
            const formatPercentage = (val) => (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
            
            // Remover modal existente si lo hay
            const existingPreview = document.getElementById('report-preview-overlay');
            if (existingPreview) existingPreview.remove();
            
            const previewOverlay = document.createElement('div');
            previewOverlay.id = 'report-preview-overlay';
            previewOverlay.style.position = 'fixed';
            previewOverlay.style.top = '0';
            previewOverlay.style.left = '0';
            previewOverlay.style.width = '100vw';
            previewOverlay.style.height = '100vh';
            previewOverlay.style.background = 'rgba(15, 23, 42, 0.75)';
            previewOverlay.style.backdropFilter = 'blur(10px)';
            previewOverlay.style.zIndex = '9999';
            previewOverlay.style.display = 'flex';
            previewOverlay.style.flexDirection = 'column';
            previewOverlay.style.fontFamily = "'Outfit', sans-serif";
            
            previewOverlay.innerHTML = `
                <style>
                    .report-preview-header {
                        background: rgba(30, 27, 75, 0.95);
                        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                        padding: 15px 30px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-shrink: 0;
                        color: white;
                    }
                    .report-preview-body {
                        flex-grow: 1;
                        overflow-y: auto;
                        padding: 30px 20px;
                        background: #0f172a;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    .report-page-sheet {
                        width: 210mm;
                        min-height: 279mm; /* Letter size */
                        background: white;
                        color: #1e1b4b;
                        padding: 20mm;
                        margin-bottom: 40px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                        box-sizing: border-box;
                        border-radius: 8px;
                        position: relative;
                    }
                    .report-page-sheet table th, .report-page-sheet table td {
                        border-bottom: 1px solid #e5e7eb;
                    }
                    @media (max-width: 768px) {
                        .report-page-sheet {
                            width: 100%;
                            min-height: auto;
                            padding: 15px;
                            margin-bottom: 20px;
                        }
                        .report-preview-header {
                            padding: 10px 15px;
                        }
                        .report-preview-title {
                            font-size: 1rem;
                        }
                    }
                </style>
                
                <div class="report-preview-header">
                    <div>
                        <h2 class="report-preview-title" style="margin: 0; font-size: 1.2rem; font-weight: 600; color: white;">Previsualizacion de Informe Gerencial NomAI</h2>
                        <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #cbd5e1;">Periodos: ${getPeriodLabel(insights.p1)} vs ${getPeriodLabel(insights.p2)}</p>
                    </div>
                    <div>
                        <button id="btn-close-report-preview" class="btn btn-secondary" style="display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 20px; font-weight: 500;">
                            <i data-lucide="x" style="width: 16px; height: 16px;"></i> Cerrar Informe
                        </button>
                    </div>
                </div>
                
                <div class="report-preview-body">
                    <!-- Page 1: Portada -->
                    <div class="report-page-sheet">
                        <!-- Header Portada -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6C00D3; padding-bottom: 15px;">
                            <img src="${logoBase64}" alt="NomAI Logo" style="height: 35px;" />
                            <div style="text-align: right; font-size: 9pt; color: #6b7280; font-weight: 500;">REPORTES CORPORATIVOS</div>
                        </div>

                        <!-- Cuerpo Portada -->
                        <div style="margin-top: 40px; min-height: 170mm; display: flex; flex-direction: column; justify-content: center;">
                            <span style="display: inline-block; width: fit-content; background: rgba(108, 0, 211, 0.08); color: #6C00D3; padding: 5px 12px; border-radius: 20px; font-size: 9pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px;">Analisis Financiero de Nomina</span>
                            <h1 style="font-size: 26pt; font-weight: 800; line-height: 1.2; color: #1e1b4b; margin: 0 0 15px 0;">INFORME GERENCIAL DE VARIACIONES</h1>
                            <h2 style="font-size: 16pt; font-weight: 500; color: #4b5563; margin: 0 0 30px 0; border-left: 4px solid #6C00D3; padding-left: 15px;">Variaciones de Conceptos de Nomina</h2>

                            <!-- Metadatos de la Comparacion -->
                            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div>
                                    <div style="font-size: 8pt; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.5px;">Periodo Base (P1)</div>
                                    <div style="font-size: 11pt; font-weight: 600; color: #1f2937;">${getPeriodLabel(insights.p1)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 8pt; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.5px;">Periodo Comparado (P2)</div>
                                    <div style="font-size: 11pt; font-weight: 600; color: #1f2937;">${getPeriodLabel(insights.p2)}</div>
                                </div>
                                <div>
                                    <div style="font-size: 8pt; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.5px;">Filtros de Tipo de Nomina</div>
                                    <div style="font-size: 10pt; font-weight: 500; color: #1f2937;">${state.selectedTipoNomina && state.selectedTipoNomina.length > 0 ? state.selectedTipoNomina.join(', ') : 'Todos'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 8pt; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.5px;">Fecha de Emision</div>
                                    <div style="font-size: 10pt; font-weight: 500; color: #1f2937;">${new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}</div>
                                </div>
                            </div>

                            <!-- Resumen Ejecutivo -->
                            <div style="margin-top: 10px;">
                                <h3 style="font-size: 13pt; font-weight: 700; color: #1e1b4b; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Resumen Ejecutivo</h3>
                                <p style="font-size: 10pt; color: #374151; text-align: justify; line-height: 1.6; margin: 0 0 10px 0;">
                                    El presente informe provee un analisis gerencial de las variaciones identificadas en la nomina al comparar el periodo <strong>${getPeriodLabel(insights.p1)}</strong> con el periodo <strong>${getPeriodLabel(insights.p2)}</strong>. 
                                    El gasto neto total por concepto para esta seleccion paso de <strong>${currencyFormatter.format(insights.totals.netP1)}</strong> a <strong>${currencyFormatter.format(insights.totals.netP2)}</strong>, lo que representa una variacion neta de <strong>${currencyFormatter.format(insights.totals.netDiff)}</strong> (${formatPercentage(insights.totals.netPct)}).
                                </p>
                                <p style="font-size: 10pt; color: #374151; text-align: justify; line-height: 1.6; margin: 0;">
                                    Este comportamiento financiero esta determinado principalmente por un cambio en los devengos totales del <strong>${formatPercentage(insights.totals.devengosPct)}</strong> (${currencyFormatter.format(insights.totals.devengosDiff)}) y una variacion en los descuentos totales del <strong>${formatPercentage(insights.totals.descuentosPct)}</strong> (${currencyFormatter.format(insights.totals.descuentosDiff)}). A continuacion se detallan los principales drivers y el desglose de estas variaciones.
                                </p>
                            </div>
                        </div>

                        <!-- Footer Portada -->
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; font-weight: 500;">
                            <div>NomAI Dashboard - Sistema de Inteligencia de Nomina</div>
                            <div>Confidencial - Pagina 1 de 4</div>
                        </div>
                    </div>

                    <!-- Page 2: Analisis Macroeconomico y Graficos -->
                    <div class="report-page-sheet">
                        <!-- Header comun -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 25px;">
                            <img src="${logoBase64}" alt="NomAI Logo" style="height: 25px;" />
                            <div style="font-size: 8pt; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Analisis de Variaciones de Nomina</div>
                        </div>

                        <h3 style="font-size: 14pt; font-weight: 700; color: #1e1b4b; margin: 0 0 15px 0; border-bottom: 2px solid #6C00D3; padding-bottom: 5px;">1. Analisis Macroeconomico</h3>
                        <p style="font-size: 9.5pt; color: #4b5563; margin-bottom: 20px; line-height: 1.4;">
                            Resumen comparativo de la estructura general de la nomina para los conceptos analizados. Los devengos representan las percepciones brutas de los colaboradores, mientras que los descuentos corresponden a deducciones legales o internas.
                        </p>

                        <!-- Tabla comparativa macro -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 9.5pt;">
                            <thead>
                                <tr style="background: #6C00D3; color: white;">
                                    <th style="padding: 10px; text-align: left; font-weight: 600; border-top-left-radius: 6px; border-bottom-left-radius: 6px;">Estructura de Nomina</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">P1: ${getPeriodLabel(insights.p1)}</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">P2: ${getPeriodLabel(insights.p2)}</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600;">Variacion ($)</th>
                                    <th style="padding: 10px; text-align: right; font-weight: 600; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">Variacion (%)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <td style="padding: 10px; font-weight: 500;">(+) Devengos Totales</td>
                                    <td style="padding: 10px; text-align: right;">${currencyFormatter.format(insights.totals.devengosP1)}</td>
                                    <td style="padding: 10px; text-align: right;">${currencyFormatter.format(insights.totals.devengosP2)}</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 500; color: ${insights.totals.devengosDiff >= 0 ? '#10b981' : '#ef4444'};">${insights.totals.devengosDiff >= 0 ? '+' : ''}${currencyFormatter.format(insights.totals.devengosDiff)}</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 600; color: ${insights.totals.devengosDiff >= 0 ? '#10b981' : '#ef4444'};">${insights.totals.devengosDiff >= 0 ? '+' : ''}${insights.totals.devengosPct.toFixed(2)}%</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #e5e7eb;">
                                    <td style="padding: 10px; font-weight: 500;">(-) Descuentos Totales</td>
                                    <td style="padding: 10px; text-align: right;">${currencyFormatter.format(insights.totals.descuentosP1)}</td>
                                    <td style="padding: 10px; text-align: right;">${currencyFormatter.format(insights.totals.descuentosP2)}</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 500; color: ${insights.totals.descuentosDiff >= 0 ? '#ef4444' : '#10b981'};">${insights.totals.descuentosDiff >= 0 ? '+' : ''}${currencyFormatter.format(insights.totals.descuentosDiff)}</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 600; color: ${insights.totals.descuentosDiff >= 0 ? '#ef4444' : '#10b981'};">${insights.totals.descuentosDiff >= 0 ? '+' : ''}${insights.totals.descuentosPct.toFixed(2)}%</td>
                                </tr>
                                <tr style="background: #f9fafb; font-weight: bold; border-bottom: 2px solid #e5e7eb;">
                                    <td style="padding: 12px 10px; color: #6C00D3;">(=) Gasto Neto Consolidado</td>
                                    <td style="padding: 12px 10px; text-align: right;">${currencyFormatter.format(insights.totals.netP1)}</td>
                                    <td style="padding: 12px 10px; text-align: right;">${currencyFormatter.format(insights.totals.netP2)}</td>
                                    <td style="padding: 12px 10px; text-align: right; color: ${insights.totals.netDiff >= 0 ? '#10b981' : '#ef4444'};">${insights.totals.netDiff >= 0 ? '+' : ''}${currencyFormatter.format(insights.totals.netDiff)}</td>
                                    <td style="padding: 12px 10px; text-align: right; color: ${insights.totals.netDiff >= 0 ? '#10b981' : '#ef4444'};">${insights.totals.netDiff >= 0 ? '+' : ''}${insights.totals.netPct.toFixed(2)}%</td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Graficos de Comparacion -->
                        <div style="margin-top: 15px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; align-items: center;">
                            <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 15px; text-align: center;">
                                <h4 style="font-size: 10pt; font-weight: 700; color: #1e1b4b; margin: 0 0 12px 0; text-transform: uppercase;">Comparacion Estructural de Periodos</h4>
                                <canvas id="chart-macro-comparison" width="310" height="170" style="margin: 0 auto;"></canvas>
                            </div>
                            <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 15px; text-align: center;">
                                <h4 style="font-size: 10pt; font-weight: 700; color: #1e1b4b; margin: 0 0 12px 0; text-transform: uppercase;">Composicion P2</h4>
                                <canvas id="chart-macro-pie" width="230" height="170" style="margin: 0 auto;"></canvas>
                            </div>
                        </div>

                        <!-- Footer Pagina 2 -->
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 35px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; font-weight: 500;">
                            <div>NomAI Dashboard - Sistema de Inteligencia de Nomina</div>
                            <div>Confidencial - Pagina 2 de 4</div>
                        </div>
                    </div>

                    <!-- Page 3: Principales Variaciones e Insights -->
                    <div class="report-page-sheet">
                        <!-- Header comun -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 25px;">
                            <img src="${logoBase64}" alt="NomAI Logo" style="height: 25px;" />
                            <div style="font-size: 8pt; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Analisis de Variaciones de Nomina</div>
                        </div>

                        <h3 style="font-size: 14pt; font-weight: 700; color: #1e1b4b; margin: 0 0 15px 0; border-bottom: 2px solid #6C00D3; padding-bottom: 5px;">2. Drivers Principales de Variacion</h3>
                        
                        <!-- Bloque de Insights Principales -->
                        <div style="margin-bottom: 20px;">
                            <div style="background: rgba(108, 0, 211, 0.03); border-left: 4px solid #6C00D3; border-radius: 0 8px 8px 0; padding: 12px; margin-bottom: 12px; font-size: 9.5pt;">
                                <strong style="color: #6C00D3; display: block; margin-bottom: 4px;">Principales Incrementos de Costo (Drivers de Alza)</strong>
                                ${insights.topIncreases.length > 0 ? `
                                    <ul style="margin: 0; padding-left: 20px; line-height: 1.4; color: #374151;">
                                        ${insights.topIncreases.map(inc => `
                                            <li>El concepto <strong>${inc.co}</strong> (${inc.na}) aumento en <strong>${currencyFormatter.format(inc.diff)}</strong> (+${inc.pct.toFixed(1)}%).</li>
                                        `).join('')}
                                    </ul>
                                ` : '<span style="color:#6b7280;">No se registraron incrementos significativos de costo.</span>'}
                            </div>

                            <div style="background: rgba(239, 68, 68, 0.03); border-left: 4px solid #ef4444; border-radius: 0 8px 8px 0; padding: 12px; margin-bottom: 12px; font-size: 9.5pt;">
                                <strong style="color: #ef4444; display: block; margin-bottom: 4px;">Principales Reducciones de Costo o Retenciones</strong>
                                ${insights.topReductions.length > 0 ? `
                                    <ul style="margin: 0; padding-left: 20px; line-height: 1.4; color: #374151;">
                                        ${insights.topReductions.map(red => `
                                            <li>El concepto <strong>${red.co}</strong> (${red.na}) disminuyo en <strong>${currencyFormatter.format(Math.abs(red.diff))}</strong> (${red.pct.toFixed(1)}%).</li>
                                        `).join('')}
                                    </ul>
                                ` : '<span style="color:#6b7280;">No se registraron reducciones significativas.</span>'}
                            </div>

                            <!-- Conceptos nuevos y descontinuados -->
                            ${insights.newConcepts.length > 0 || insights.inactiveConcepts.length > 0 ? `
                                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-size: 9pt;">
                                    <strong style="color: #1e1b4b; display: block; margin-bottom: 6px; text-transform: uppercase; font-size: 8.5pt;">Matriz de Conceptos: Cambios Estructurales</strong>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                        <div>
                                            <span style="font-weight: 600; color: #10b981; font-size: 8.5pt;">Nuevos Conceptos (P2):</span>
                                            ${insights.newConcepts.length > 0 ? `
                                                <ul style="margin: 4px 0 0 0; padding-left: 15px; color: #4b5563;">
                                                    ${insights.newConcepts.slice(0, 3).map(nc => `<li><strong>${nc.co}</strong>: ${currencyFormatter.format(nc.v2)}</li>`).join('')}
                                                </ul>
                                            ` : '<div style="color:#9ca3af; margin-top:2px;">Ninguno</div>'}
                                        </div>
                                        <div>
                                            <span style="font-weight: 600; color: #ef4444; font-size: 8.5pt;">Conceptos Inactivos (P1):</span>
                                            ${insights.inactiveConcepts.length > 0 ? `
                                                <ul style="margin: 4px 0 0 0; padding-left: 15px; color: #4b5563;">
                                                    ${insights.inactiveConcepts.slice(0, 3).map(ic => `<li><strong>${ic.co}</strong>: ${currencyFormatter.format(ic.v1)}</li>`).join('')}
                                                </ul>
                                            ` : '<div style="color:#9ca3af; margin-top:2px;">Ninguno</div>'}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Grafico de Variacion por Concepto (Top 10) -->
                        <div style="margin-top: 15px;">
                            <h4 style="font-size: 11pt; font-weight: 700; color: #1e1b4b; margin: 0 0 10px 0; text-transform: uppercase;">Top Variaciones de Conceptos (Impacto de Variacion Absoluta)</h4>
                            <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 15px; text-align: center;">
                                <canvas id="chart-top-concept-variations" width="560" height="190" style="margin: 0 auto;"></canvas>
                            </div>
                        </div>

                        <!-- Footer Pagina 3 -->
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 35px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; font-weight: 500;">
                            <div>NomAI Dashboard - Sistema de Inteligencia de Nomina</div>
                            <div>Confidencial - Pagina 3 de 4</div>
                        </div>
                    </div>

                    <!-- Page 4: Impacto en Colaboradores e Impacto Estructural -->
                    <div class="report-page-sheet">
                        <!-- Header comun -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 25px;">
                            <img src="${logoBase64}" alt="NomAI Logo" style="height: 25px;" />
                            <div style="font-size: 8pt; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Analisis de Variaciones de Nomina</div>
                        </div>

                        <h3 style="font-size: 14pt; font-weight: 700; color: #1e1b4b; margin: 0 0 15px 0; border-bottom: 2px solid #6C00D3; padding-bottom: 5px;">3. Distribucion Estructural y Casos Atipicos</h3>

                        <!-- Centros de costo y cargos -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                            <div>
                                <h4 style="font-size: 9.5pt; font-weight: 700; color: #1e1b4b; margin: 0 0 8px 0; text-transform: uppercase; border-left: 3px solid #6C00D3; padding-left: 8px;">Top Centros de Costo (Aumento de Gasto)</h4>
                                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                                    <thead>
                                        <tr style="background: #f3f4f6; text-align: left;">
                                            <th style="padding: 6px; font-weight: 600;">Centro de Costo</th>
                                            <th style="padding: 6px; text-align: right; font-weight: 600;">Variacion ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${insights.topCecoIncreases.length > 0 ? insights.topCecoIncreases.map(cc => `
                                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                                <td style="padding: 6px; font-weight: 500; color: #374151;">${cc.cc}</td>
                                                <td style="padding: 6px; text-align: right; font-weight: 600; color: #10b981;">+${currencyFormatter.format(cc.diff)}</td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="2" style="padding:6px; color:#9ca3af; text-align:center;">Sin variaciones</td></tr>'}
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <h4 style="font-size: 9.5pt; font-weight: 700; color: #1e1b4b; margin: 0 0 8px 0; text-transform: uppercase; border-left: 3px solid #6C00D3; padding-left: 8px;">Top Cargos (Aumento de Devengo)</h4>
                                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                                    <thead>
                                        <tr style="background: #f3f4f6; text-align: left;">
                                            <th style="padding: 6px; font-weight: 600;">Cargo</th>
                                            <th style="padding: 6px; text-align: right; font-weight: 600;">Variacion ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${insights.topCargoIncreases.length > 0 ? insights.topCargoIncreases.map(cg => `
                                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                                <td style="padding: 6px; font-weight: 500; color: #374151;">${cg.cg}</td>
                                                <td style="padding: 6px; text-align: right; font-weight: 600; color: #10b981;">+${currencyFormatter.format(cg.diff)}</td>
                                            </tr>
                                        `).join('') : '<tr><td colspan="2" style="padding:6px; color:#9ca3af; text-align:center;">Sin variaciones</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Colaboradores con mayor variacion (Casos Atipicos) -->
                        <div style="margin-bottom: 25px;">
                            <h4 style="font-size: 9.5pt; font-weight: 700; color: #1e1b4b; margin: 0 0 8px 0; text-transform: uppercase; border-left: 3px solid #6C00D3; padding-left: 8px;">Top 5 Desviaciones Atipicas de Salario Neto Individual</h4>
                            <p style="font-size: 8.5pt; color: #6b7280; margin-bottom: 8px;">
                                Colaboradores individuales cuya retribucion neta experimento las variaciones absolutas mas pronunciadas entre los dos periodos para los conceptos analizados.
                            </p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                                <thead>
                                    <tr style="background: #6c00d3; color: white; text-align: left;">
                                        <th style="padding: 8px; font-weight: 600;">Colaborador</th>
                                        <th style="padding: 8px; font-weight: 600;">Identificacion</th>
                                        <th style="padding: 8px; text-align: right; font-weight: 600;">Neto P1</th>
                                        <th style="padding: 8px; text-align: right; font-weight: 600;">Neto P2</th>
                                        <th style="padding: 8px; text-align: right; font-weight: 600;">Variacion ($)</th>
                                        <th style="padding: 8px; text-align: right; font-weight: 600;">Variacion (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${insights.topEmpImpacts.length > 0 ? insights.topEmpImpacts.map(emp => `
                                        <tr style="border-bottom: 1px solid #e5e7eb;">
                                            <td style="padding: 8px; font-weight: 500; color: #374151;">${emp.name}</td>
                                            <td style="padding: 8px; color: #6b7280;">${emp.c}</td>
                                            <td style="padding: 8px; text-align: right;">${currencyFormatter.format(emp.v1)}</td>
                                            <td style="padding: 8px; text-align: right;">${currencyFormatter.format(emp.v2)}</td>
                                            <td style="padding: 8px; text-align: right; font-weight: 600; color: ${emp.diff >= 0 ? '#10b981' : '#ef4444'};">${emp.diff >= 0 ? '+' : ''}${currencyFormatter.format(emp.diff)}</td>
                                            <td style="padding: 8px; text-align: right; font-weight: 600; color: ${emp.diff >= 0 ? '#10b981' : '#ef4444'};">${emp.diff >= 0 ? '+' : ''}${emp.pct.toFixed(1)}%</td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="6" style="padding:10px; color:#9ca3af; text-align:center;">No se registraron variaciones individuales.</td></tr>'}
                                </tbody>
                            </table>
                        </div>

                        <!-- Conclusiones y Plan de Action -->
                        <div>
                            <h4 style="font-size: 10pt; font-weight: 700; color: #1e1b4b; margin: 0 0 10px 0; text-transform: uppercase;">Conclusiones y Recomendaciones Gerenciales</h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 9pt; color: #374151; line-height: 1.4;">
                                <li>Se observa una variacion neta de la nomina del <strong>${formatPercentage(insights.totals.netPct)}</strong> en los conceptos consolidados. Se aconseja monitorear que esta variacion se alinee con los objetivos de presupuesto trimestral.</li>
                                ${insights.topIncreases.length > 0 ? `<li>El incremento principal fue liderado por el concepto <strong>${insights.topIncreases[0].co}</strong>. Se recomienda auditar si este incremento se debe a factores estacionales, horas extras o ajustes programados.</li>` : ''}
                                ${insights.topCecoIncreases.length > 0 ? `<li>El Centro de Costo <strong>${insights.topCecoIncreases[0].cc}</strong> presenta el mayor crecimiento de gasto. Es procedente revisar la eficiencia operativa en dicha unidad administrativa.</li>` : ''}
                                <li>Los colaboradores con desviaciones superiores al 30% en su neto (como se lista en la tabla de Casos Atipicos) deben ser revisados individualmente por el equipo de recursos humanos para garantizar que no existan errores de captura en el sistema.</li>
                            </ul>
                        </div>
                        
                        <!-- Firmas -->
                        <div style="margin-top: 30px; display: flex; justify-content: space-around; text-align: center; font-size: 8.5pt; color: #4b5563;">
                            <div style="width: 200px; border-top: 1px solid #9ca3af; padding-top: 8px;">
                                <strong>Elaborado por:</strong><br>
                                Analista de Nomina - NomAI
                            </div>
                            <div style="width: 200px; border-top: 1px solid #9ca3af; padding-top: 8px;">
                                <strong>Revisado y Aprobado por:</strong><br>
                                Gerente de Finanzas / Recursos Humanos
                            </div>
                        </div>

                        <!-- Footer Pagina 4 -->
                        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; font-weight: 500;">
                            <div>NomAI Dashboard - Sistema de Inteligencia de Nomina</div>
                            <div>Confidencial - Pagina 4 de 4</div>
                        </div>
                    </div>
                </div>
            `;
            
            updateProgressStep('4-template', 'success', 'Maqueta del reporte construida.');
            
            // Paso 5: Dibujar graficos
            updateProgressStep('5-charts', 'processing', 'Renderizando graficos de analisis...');
            document.body.appendChild(previewOverlay);
            
            // Dibujar graficos de analisis
            new Chart(previewOverlay.querySelector('#chart-macro-comparison'), {
                type: 'bar',
                data: {
                    labels: ['Devengos', 'Descuentos'],
                    datasets: [
                        {
                            label: 'P1: ' + getPeriodLabel(insights.p1),
                            data: [insights.totals.devengosP1, insights.totals.descuentosP1],
                            backgroundColor: '#c7d2fe',
                            borderColor: '#818cf8',
                            borderWidth: 1
                        },
                        {
                            label: 'P2: ' + getPeriodLabel(insights.p2),
                            data: [insights.totals.devengosP2, insights.totals.descuentosP2],
                            backgroundColor: '#6C00D3',
                            borderColor: '#4f46e5',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    animation: false,
                    responsive: false,
                    plugins: {
                        legend: { display: true, labels: { boxWidth: 10, font: { size: 8 } } }
                    },
                    scales: {
                        y: {
                            ticks: {
                                font: { size: 7 },
                                callback: function(value) {
                                    return '$' + (value / 1e3).toFixed(0) + 'k';
                                }
                            }
                        },
                        x: { ticks: { font: { size: 8 } } }
                    }
                }
            });

            new Chart(previewOverlay.querySelector('#chart-macro-pie'), {
                type: 'doughnut',
                data: {
                    labels: ['Devengos', 'Descuentos'],
                    datasets: [{
                        data: [insights.totals.devengosP2, insights.totals.descuentosP2],
                        backgroundColor: ['#10b981', '#ef4444'],
                        borderWidth: 1
                    }]
                },
                options: {
                    animation: false,
                    responsive: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { boxWidth: 10, font: { size: 8 } }
                        }
                    }
                }
            });

            const topConceptsForChart = insights.conceptDetails.slice(0, 7);
            const chartLabels = topConceptsForChart.map(c => c.co.length > 18 ? c.co.substring(0, 16) + '...' : c.co);
            const chartData = topConceptsForChart.map(c => c.diff);
            const chartColors = topConceptsForChart.map(c => c.diff >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(239, 68, 68, 0.75)');
            const chartBorderColors = topConceptsForChart.map(c => c.diff >= 0 ? '#10b981' : '#ef4444');

            new Chart(previewOverlay.querySelector('#chart-top-concept-variations'), {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Variacion Neta ($)',
                        data: chartData,
                        backgroundColor: chartColors,
                        borderColor: chartBorderColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    animation: false,
                    responsive: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            ticks: {
                                font: { size: 7 },
                                callback: function(value) {
                                    const absVal = Math.abs(value);
                                    const sign = value >= 0 ? '' : '-';
                                    if (absVal >= 1e6) return sign + '$' + (absVal / 1e6).toFixed(1) + 'M';
                                    if (absVal >= 1e3) return sign + '$' + (absVal / 1e3).toFixed(0) + 'k';
                                    return sign + '$' + absVal;
                                }
                            }
                        },
                        x: {
                            ticks: {
                                font: { size: 7 },
                                maxRotation: 20,
                                minRotation: 10
                            }
                        }
                    }
                }
            });
            updateProgressStep('5-charts', 'success', 'Graficos renderizados correctamente.');
            
            // Paso 6: Mostrar previsualizacion
            updateProgressStep('6-show', 'processing', 'Abriendo previsualizacion en pantalla...');
            
            // Vincular boton cerrar
            previewOverlay.querySelector('#btn-close-report-preview').addEventListener('click', () => {
                previewOverlay.remove();
            });
            
            if (window.lucide) {
                window.lucide.createIcons();
            }
            updateProgressStep('6-show', 'success', 'Previsualizacion iniciada exitosamente.');
            
            // Quitar overlay de progreso despues de una fraccion de segundo
            setTimeout(() => {
                progressOverlay.remove();
            }, 600);
            
        } catch (err) {
            console.error("Error al procesar el informe gerencial:", err);
            // Identificar que paso fallo y marcarlo con error
            const steps = ['1-validate', '2-insights', '3-logo', '4-template', '5-charts', '6-show'];
            for (let s of steps) {
                const row = document.getElementById('step-' + s);
                if (row && row.innerHTML.includes('spin-animation')) {
                    updateProgressStep(s, 'error', 'Error en este paso.', err.message + "\nStack: " + err.stack);
                    break;
                }
            }
            // Si ninguno estaba en proceso, marcar el primero
            updateProgressStep('1-validate', 'error', 'Fallo de ejecucion.', err.message + "\nStack: " + err.stack);
        }
    }, 400);
}