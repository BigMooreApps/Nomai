/**
 * Logica del Dashboard de Nomina y Netos
 * Utiliza Chart.js para graficos y Lucide para iconos.
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
    dataVersion: 0,        // Versión actual de los datos filtrados para cacheo
    renderedTabs: {},      // Registro de pestañas ya renderizadas para la versión actual
    
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
    periodCompareSelectedCecos: [],
    
    // Vista Comparativa de Conceptos
    conceptComparePeriod1: '',
    conceptComparePeriod2: '',
    conceptCompareSearchQuery: '',
    conceptCompareExpanded: false,
    conceptCompareSelectedConcepts: [],
    conceptCompareSelectedCecos: [],
    
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
    cargoCompareSelectedCecos: [],
    
    // Configuración de carpeta local
    folderHandle: null,
    folderFiles: [],
    
    // Estado de ordenación de tablas comparativas
    cecoSortColumn: 'name',
    cecoSortDirection: 'asc',
    cargoSortColumn: 'name',
    cargoSortDirection: 'asc',
    conceptSortColumn: 'default',
    conceptSortDirection: 'asc',
    periodSortColumn: 'name',
    periodSortDirection: 'asc',
    
    // Caché de valores únicos
    uniqueYears: [],
    uniqueMonths: [],
    uniqueQuincenas: [],
    uniquePeriods: [],
    uniquePeople: [],
    uniqueConcepts: [],
    periodDataMap: {}
};

// Exponer el estado y funciones globalmente para integración con el importador
window.state = state;
window.initUniqueValuesCache = initUniqueValuesCache;
window.processData = processData;
window.getUniqueYears = getUniqueYears;
window.getUniqueMonths = getUniqueMonths;
window.getUniqueQuincenas = getUniqueQuincenas;
window.switchTab = switchTab;

// ─── Actualizar datos desde Supabase sin recargar la página ───────────────────
async function refreshDataFromSupabase() {
    if (!window.NomaiAuth || !window.NomaiAuth.session) {
        alert('No hay sesión activa. Por favor inicia sesión nuevamente.');
        return;
    }
    
    const btn = document.getElementById('btn-refresh-data');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i> Actualizando...';
        if (window.lucide) window.lucide.createIcons();
    }

    const overlay = document.createElement('div');
    overlay.id = 'refresh-overlay';
    overlay.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1e1b4b;color:white;padding:1rem 1.5rem;border-radius:0.75rem;z-index:9999;display:flex;align-items:center;gap:1rem;box-shadow:0 10px 30px rgba(0,0,0,0.3);min-width:280px;';
    overlay.innerHTML = `
        <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:6px;">Actualizando Base de Datos</div>
            <div style="background:rgba(255,255,255,0.15);height:5px;border-radius:3px;overflow:hidden;">
                <div id="refresh-progress-bar" style="width:5%;height:100%;background:linear-gradient(90deg,#6366f1,#a855f7);transition:width 0.2s;"></div>
            </div>
            <div id="refresh-progress-text" style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-top:4px;">5%</div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    try {
        // Limpiar caché vieja antes de refrescar
        await clearCachedData();
        
        state.data = await loadPayrollFromSupabase((pct) => {
            const bar = document.getElementById('refresh-progress-bar');
            const txt = document.getElementById('refresh-progress-text');
            if (bar) bar.style.width = pct + '%';
            if (txt) txt.innerText = pct + '%';
        });

        // Guardar nueva caché (incluyendo batches)
        const companyId = window.NomaiAuth.profile && window.NomaiAuth.profile.company_id;
        if (state.data.length > 0) {
            const batchesToCache = (state.batches || []).map(b => ({
                id: b.id, name: b.name, date: b.date, recordCount: b.data ? b.data.length : 0
            }));
            await setCachedData({ companyId, records: state.data, batches: batchesToCache, savedAt: Date.now() });
        }

        // Reconstruir caché de valores únicos y volver a renderizar
        initUniqueValuesCache();
        processData();
        renderActiveTab();
        
        // Re-renderizar lista de lotes
        if (typeof window.renderBatchesList === 'function') window.renderBatchesList();
        if (typeof window.refreshDatabaseTable === 'function') window.refreshDatabaseTable();

        // Actualizar timestamp en la tabla
        const ts = document.getElementById('db-last-updated');
        if (ts) ts.innerText = 'Actualizado: ' + new Date().toLocaleTimeString('es-CO');

        overlay.style.background = '#065f46';
        overlay.querySelector('div > div:first-child').innerText = `¡${state.data.length.toLocaleString('es-CO')} registros actualizados!`;
        setTimeout(() => overlay.remove(), 2500);

    } catch (e) {
        console.error('[Nomai] Error al actualizar datos:', e);
        overlay.style.background = '#7f1d1d';
        overlay.querySelector('div > div:first-child').innerText = 'Error al actualizar';
        setTimeout(() => overlay.remove(), 3000);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw" style="width:16px;height:16px;"></i> Actualizar Datos';
            if (window.lucide) window.lucide.createIcons();
        }
    }
}
window.refreshDataFromSupabase = refreshDataFromSupabase;


// ─── IndexedDB Cache ─────────────────────────────────────────────────────────
const CACHE_DB_NAME = 'NomaiCache';
const CACHE_STORE = 'payroll';
const CACHE_KEY = 'data';

function openCacheDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CACHE_DB_NAME, 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(CACHE_STORE);
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => reject(req.error);
    });
}

async function getCachedData() {
    try {
        const db = await openCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(CACHE_STORE, 'readonly');
            const req = tx.objectStore(CACHE_STORE).get(CACHE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function setCachedData(payload) {
    try {
        const db = await openCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).put(payload, CACHE_KEY);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    } catch {}
}

async function clearCachedData() {
    try {
        const db = await openCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    } catch {}
}
window.clearNomaiCache = clearCachedData;

// Inicializacion de la Aplicacion al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Esperar a que la autenticación e inicialización del contexto se completen
    if (window.NomaiAuthInitPromise) {
        await window.NomaiAuthInitPromise;
    }

    // 1. Cargar datos iniciales (desde caché o Supabase)
    if (window.NomaiAuth && window.NomaiAuth.session) {
        try {
            // Intentar cargar desde caché local primero (instantáneo)
            const cached = await getCachedData();
            const companyId = window.NomaiAuth.profile && window.NomaiAuth.profile.company_id;
            
            if (cached && cached.companyId === companyId && cached.records && cached.records.length > 0) {
                // ✅ Datos en caché: carga instantánea sin overlay
                console.log(`[Nomai] Cargando ${cached.records.length} registros desde caché local...`);
                state.data = cached.records;
                
                // Restaurar batches desde caché para que se muestren en "Lotes de Información Cargados"
                if (cached.batches && cached.batches.length > 0) {
                    state.batches = cached.batches;
                }
                
                // Mostrar badge discreto
                const badge = document.createElement('div');
                badge.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:#065f46;color:white;padding:0.5rem 1rem;border-radius:0.5rem;font-size:0.8rem;z-index:9999;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
                badge.innerHTML = `<i data-lucide="check-circle" style="width:14px;height:14px;"></i> ${cached.records.length.toLocaleString('es-CO')} registros cargados desde caché`;
                document.body.appendChild(badge);
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => { badge.style.opacity = '0'; badge.style.transition = 'opacity 0.5s'; setTimeout(() => badge.remove(), 500); }, 3000);
                
            } else {
                // 🔄 Sin caché: descargar desde Supabase con overlay
                console.log("[Nomai] Sin caché local. Cargando desde Supabase...");
                
                const loadingOverlay = document.createElement('div');
                loadingOverlay.id = 'nomai-initial-loading';
                loadingOverlay.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1e1b4b;color:white;padding:1rem 1.5rem;border-radius:0.75rem;z-index:9999;display:flex;align-items:center;gap:1rem;box-shadow:0 10px 30px rgba(0,0,0,0.3);min-width:280px;font-family:Outfit,sans-serif;';
                loadingOverlay.innerHTML = `
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.9rem;margin-bottom:6px;">Cargando Base de Datos</div>
                        <div style="background:rgba(255,255,255,0.15);height:5px;border-radius:3px;overflow:hidden;">
                            <div id="nomai-initial-progress" style="width:5%;height:100%;background:linear-gradient(90deg,#6366f1,#a855f7);transition:width 0.2s;"></div>
                        </div>
                        <div id="nomai-initial-text" style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-top:4px;">5%</div>
                    </div>
                `;
                document.body.appendChild(loadingOverlay);
                if (window.lucide) window.lucide.createIcons();
                
                state.data = await loadPayrollFromSupabase((pct) => {
                    const pb = document.getElementById('nomai-initial-progress');
                    const pt = document.getElementById('nomai-initial-text');
                    if(pb) pb.style.width = pct + '%';
                    if(pt) pt.innerText = pct + '%';
                });
                
                // Guardar en caché para futuras cargas (incluyendo batches)
                if (state.data.length > 0) {
                    const batchesToCache = (state.batches || []).map(b => ({
                        id: b.id, name: b.name, date: b.date, recordCount: b.data ? b.data.length : 0
                    }));
                    await setCachedData({ companyId, records: state.data, batches: batchesToCache, savedAt: Date.now() });
                    console.log(`[Nomai] ${state.data.length} registros y ${batchesToCache.length} lotes guardados en caché local.`);
                }
                
                loadingOverlay.style.background = '#065f46';
                loadingOverlay.querySelector('div > div:first-child').innerText = `¡${state.data.length.toLocaleString('es-CO')} registros cargados!`;
                setTimeout(() => {
                    loadingOverlay.style.opacity = '0';
                    loadingOverlay.style.transition = 'opacity 0.3s';
                    setTimeout(() => loadingOverlay.remove(), 300);
                }, 2500);
            }
            
        } catch (e) {
            console.error("[Nomai] Error cargando datos de Supabase:", e);
            state.data = [];
            const el = document.getElementById('nomai-initial-loading');
            if (el) {
                el.style.background = '#7f1d1d';
                el.querySelector('div > div:first-child').innerText = 'Error al cargar';
                setTimeout(() => el.remove(), 3000);
            }
        }
    } else if (window.PAYROLL_DATA && window.PAYROLL_DATA.length > 0) {
        state.data = window.PAYROLL_DATA.filter(d => d.na !== 'BENEFICIO');
    } else {
        console.warn("No se encontraron datos pre-cargados ni sesión de Supabase.");
    }
    
    // Inicializar caché de valores únicos
    initUniqueValuesCache();
    
    // 2. Inicializar componentes y eventos
    initSidebar();
    initHeaderTabs();
    initGlobalFilters();
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
        if (d.pa !== undefined && d.pa !== null && d.pa !== '') {
            const qStr = (parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2';
            qSet.add(qStr);
        } else {
            qSet.add('MES');
        }
    });
    const qOrder = { 'Q1': 1, 'Q2': 2, 'MES': 3 };
    state.uniqueQuincenas = Array.from(qSet).sort((a, b) => (qOrder[a] || 9) - (qOrder[b] || 9));

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
    
    // 8. Auto-seleccionar los últimos dos periodos cargados para todas las comparaciones
    const periods = state.uniquePeriods || [];
    if (periods.length >= 2) {
        state.comparePeriod1 = periods[periods.length - 2];
        state.comparePeriod2 = periods[periods.length - 1];
        state.conceptComparePeriod1 = periods[periods.length - 2];
        state.conceptComparePeriod2 = periods[periods.length - 1];
        state.cecoComparePeriod1 = periods[periods.length - 2];
        state.cecoComparePeriod2 = periods[periods.length - 1];
        state.cargoComparePeriod1 = periods[periods.length - 2];
        state.cargoComparePeriod2 = periods[periods.length - 1];
    } else if (periods.length === 1) {
        state.comparePeriod1 = periods[0];
        state.comparePeriod2 = periods[0];
        state.conceptComparePeriod1 = periods[0];
        state.conceptComparePeriod2 = periods[0];
        state.cecoComparePeriod1 = periods[0];
        state.cecoComparePeriod2 = periods[0];
        state.cargoComparePeriod1 = periods[0];
        state.cargoComparePeriod2 = periods[0];
    } else {
        state.comparePeriod1 = '';
        state.comparePeriod2 = '';
        state.conceptComparePeriod1 = '';
        state.conceptComparePeriod2 = '';
        state.cecoComparePeriod1 = '';
        state.cecoComparePeriod2 = '';
        state.cargoComparePeriod1 = '';
        state.cargoComparePeriod2 = '';
    }

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
    // Guardar accesos según permisos
    if (window.NomaiAuth) {
        if (tabId === 'assistant' && !window.NomaiAuth.hasPermission('use_ai_assistant')) {
            tabId = 'overview';
        }
        if (tabId === 'importer' && !window.NomaiAuth.hasPermission('import_data')) {
            tabId = 'overview';
        }
        if (tabId === 'database' && !window.NomaiAuth.hasPermission('view_database')) {
            tabId = 'overview';
        }
    }

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
        if (tabId === 'assistant' || tabId === 'importer' || tabId === 'database' || tabId === 'period-compare' || tabId === 'concept-compare' || tabId === 'ceco-compare' || tabId === 'cargo-compare') {
            // Ocultar toda la barra en importador, asistente y en análisis masivo (tienen sus propios filtros inline)
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
    
    // Al procesar nuevos datos o cambiar filtros, incrementamos la version y limpiamos el caché de pestañas
    state.dataVersion++;
    state.renderedTabs = {};
}

// Renderiza la pestaña seleccionada
function renderActiveTab() {
    let currentTabKey = state.dataVersion.toString();
    
    // Añadimos variables locales al key de cache para pestañas especificas
    if (state.activeTab === 'employee') currentTabKey += '|' + state.selectedEmployeeCedula;
    if (state.activeTab === 'concept') currentTabKey += '|' + state.selectedConceptName;
    if (state.activeTab === 'comparison') currentTabKey += '|' + state.compareEmployees.join(',');
    
    // Verificamos si la pestaña actual ya está renderizada para los datos/filtros actuales
    if (state.renderedTabs[state.activeTab] === currentTabKey) {
        return; // Retorno temprano: ya está renderizada y cacheada
    }
    
    // Guardamos que esta pestaña acaba de ser renderizada
    state.renderedTabs[state.activeTab] = currentTabKey;
    
    // Inicializar iconos de Lucide
    setTimeout(() => {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }, 50);

    if (state.data.length === 0 && state.activeTab !== 'importer' && state.activeTab !== 'database' && state.activeTab !== 'assistant') {
        showEmptyStateMessage();
        return;
    } else {
        hideEmptyStateMessage();
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
            // La inicialización y renderizado del importador está autocontenida
            break;
        case 'database':
            // La base de datos se renderiza mediante database_viewer.js
            break;
        case 'assistant':
            if (typeof window.initAssistantChatIfNeeded === 'function') {
                window.initAssistantChatIfNeeded();
            }
            break;
    }
}

function clearChart(key) {
    if (state.charts[key] && typeof state.charts[key].destroy === 'function') {
        state.charts[key].destroy();
    }
    delete state.charts[key];
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
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => {
        if (c.id === 'tab-importer') return;
        if (c.id === 'tab-database') return; // No borrar la pestaña de Base de Datos
        
        // Remove existing empty state if any
        let existing = c.querySelector('.empty-state-overlay');
        if (!existing) {
            // Hide normal content
            Array.from(c.children).forEach(child => {
                child.style.display = 'none';
            });
            
            existing = document.createElement('div');
            existing.className = 'empty-state-overlay chart-card';
            existing.style.cssText = 'align-items: center; justify-content: center; padding: 60px; text-align: center; margin-top: 2rem; border: 2px dashed var(--border-color); background: transparent; box-shadow: none;';
            existing.innerHTML = `
                <i data-lucide="database" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                <h3 style="margin-bottom: 8px;">No hay datos disponibles</h3>
                <p style="color: var(--text-secondary); max-width: 400px; margin-bottom: 0;">No hay información de pagos cargada en el dashboard.</p>
            `;
            c.appendChild(existing);
        }
    });
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function hideEmptyStateMessage() {
    const overlays = document.querySelectorAll('.empty-state-overlay');
    overlays.forEach(o => {
        const parent = o.parentElement;
        o.remove();
        Array.from(parent.children).forEach(child => {
            child.style.display = '';
        });
    });
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
    
    // 3.5. Gráfico: Variación de Headcount
    renderOverviewHeadcountChart(data);
    
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
    
    clearChart('overviewTrend');
    
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
    
    clearChart('overviewNature');
    
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

function renderOverviewHeadcountChart(data) {
    const ctx = document.getElementById('overview-headcount-chart');
    if (!ctx) return;
    
    // Total de personas registradas en la base de datos
    const totalPool = state.uniquePeople ? state.uniquePeople.length : 0;
    
    // Agrupar headcount único por mes
    const monthlyEmployees = {};
    data.forEach(d => {
        const key = d.m;
        if (!monthlyEmployees[key]) {
            monthlyEmployees[key] = new Set();
        }
        monthlyEmployees[key].add(d.c);
    });
    
    // Ordenar meses
    const sortedMonths = Object.keys(monthlyEmployees).sort((a,b) => (MONTH_ORDER[a] || 99) - (MONTH_ORDER[b] || 99));
    
    const labels = sortedMonths;
    const paidVals = sortedMonths.map(m => monthlyEmployees[m].size);
    const unpaidVals = sortedMonths.map(m => totalPool - monthlyEmployees[m].size);
    
    // Calcular estadísticas
    let peakVal = 0;
    let peakMonth = "";
    let minVal = paidVals.length > 0 ? paidVals[0] : 0;
    let minMonth = sortedMonths.length > 0 ? sortedMonths[0] : "";
    
    sortedMonths.forEach((m, idx) => {
        const val = paidVals[idx];
        if (val > peakVal) {
            peakVal = val;
            peakMonth = m;
        }
        if (val < minVal) {
            minVal = val;
            minMonth = m;
        }
    });

    const totalEl = document.getElementById('headcount-total-val');
    const peakEl = document.getElementById('headcount-peak-val');
    const minEl = document.getElementById('headcount-min-val');

    if (totalEl) totalEl.innerText = totalPool;
    if (peakEl) peakEl.innerText = `${peakVal} (${peakMonth})`;
    if (minEl) minEl.innerText = `${minVal} (${minMonth})`;
    
    clearChart('overviewHeadcount');
    
    state.charts['overviewHeadcount'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Se les pagó nómina',
                    data: paidVals,
                    backgroundColor: 'rgba(16, 185, 129, 0.85)', // Verde esmeralda para activos/pagados
                    borderColor: '#10b981',
                    borderWidth: 1,
                    stack: 'headcount'
                },
                {
                    label: 'No se les pagó nómina',
                    data: unpaidVals,
                    backgroundColor: 'rgba(239, 68, 68, 0.35)', // Rojo coral transparente para inactivos/no pagados
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    stack: 'headcount'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#6B7280',
                        font: { family: 'Outfit', size: 11 },
                        padding: 10,
                        boxWidth: 12
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
                            const label = context.dataset.label || '';
                            const val = context.raw;
                            const total = totalPool;
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                            return ` ${label}: ${val} (${pct})`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: '#64748b',
                        font: { family: 'Outfit', size: 11 }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.04)'
                    }
                },
                x: {
                    stacked: true,
                    ticks: {
                        color: '#64748b',
                        font: { family: 'Outfit', size: 11 }
                    },
                    grid: {
                        display: false
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

    clearChart('cecoChart');

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

    clearChart('cargoChart');

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
    
    clearChart('empHistory');
    
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
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    order: 1
                },
                {
                    label: 'Deducciones Totales',
                    data: descVals,
                    borderColor: 'rgba(239, 68, 68, 0.65)',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    fill: true,
                    tension: 0.35,
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
    
    // Destruir instancia anterior de Chart.js para evitar errores de lienzo ya en uso
    if (state.charts['empDebt']) {
        state.charts['empDebt'].destroy();
    }
    
    // Recuperar el valor del límite recomendado desde el control input
    const limitInput = document.getElementById('debt-limit-input');
    let limitValue = 40;
    if (limitInput) {
        // Inicializar con el valor actual del estado si ya existe
        if (state.debtLimit !== undefined) {
            limitInput.value = state.debtLimit;
        }
        
        limitValue = parseFloat(limitInput.value);
        if (isNaN(limitValue) || limitValue < 0) limitValue = 0;
        if (limitValue > 100) limitValue = 100;
        
        // Agregar manejadores de eventos para actualizar el límite en tiempo real al ingresar texto o cambiar el número
        if (!limitInput.dataset.listenerBound) {
            const handleLimitChange = (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) return; // Dejar que el usuario termine de escribir
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                
                state.debtLimit = val;
                
                // Volver a renderizar el gráfico con el nuevo límite
                const cedula = state.selectedEmployeeCedula;
                const empData = state.filteredData.filter(d => d.c === cedula);
                const allData = state.data.filter(d => d.c === cedula);
                renderEmployeeDebtChart(empData, allData);
            };
            
            limitInput.addEventListener('input', handleLimitChange);
            limitInput.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 40; // Valor por defecto si queda vacío al salir
                if (val > 100) val = 100;
                e.target.value = val;
                state.debtLimit = val;
                
                const cedula = state.selectedEmployeeCedula;
                const empData = state.filteredData.filter(d => d.c === cedula);
                const allData = state.data.filter(d => d.c === cedula);
                renderEmployeeDebtChart(empData, allData);
            });
            
            limitInput.dataset.listenerBound = 'true';
        }
    }
    state.debtLimit = limitValue;
    
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
    
    const finalLabels = [...labels];
    const finalDebtRatios = [...debtRatios];
    if (labels.length > 0) {
        const avgRatio = debtRatios.reduce((sum, val) => sum + val, 0) / debtRatios.length;
        finalDebtRatios.push(parseFloat(avgRatio.toFixed(2)));
        finalLabels.push('Promedio');
    }
    
    const recommendedLimit = finalLabels.map(() => limitValue);
    
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
    
    clearChart('empDebt');
    
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
                    label: `Límite Recomendado (${limitValue}%)`,
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
    
    clearChart('empDistribution');
    
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
    
    clearChart('conceptTopPeople');
    
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
    
    clearChart('conceptTrend');
    
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
    
    clearChart('conceptCeco');
    
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
    
    clearChart('conceptCargo');
    
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
                if (q === 'Q1') label = '1Q';
                else if (q === 'Q2') label = '2Q';
                else if (q === 'MES') label = 'Mensual';
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
        case 'ceco_compare_cecos':
        case 'period_compare_cecos':
        case 'concept_compare_cecos':
        case 'cargo_compare_cecos': {
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
        case 'period_compare_cecos': return state.periodCompareSelectedCecos || [];
        case 'concept_compare_cecos': return state.conceptCompareSelectedCecos || [];
        case 'cargo_compare_cecos': return state.cargoCompareSelectedCecos || [];
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
        case 'period_compare_cecos':
            state.periodCompareSelectedCecos = arr;
            break;
        case 'concept_compare_cecos':
            state.conceptCompareSelectedCecos = arr;
            break;
        case 'cargo_compare_cecos':
            state.cargoCompareSelectedCecos = arr;
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
        years:     '📅 Filtrar Años',
        months:    '📅 Filtrar Meses',
        quincenas: '📅 Filtrar Quincenas',
        types:     '🏷️ Filtrar Tipo de Nómina',
        employees: '👥 Filtrar Personas',
        concepts:  '🔍 Filtrar Conceptos',
        cargos:    '🎖️ Filtrar por Cargo',
        cecos:     '🏢 Filtrar Centros de Costo',
        employee_single: '👤 Seleccionar Colaborador',
        concept_single: '🔍 Seleccionar Concepto',
        p1: '📅 Seleccionar Periodo 1 (Base)',
        p2: '📅 Seleccionar Periodo 2 (Comparado)',
        period_compare_employees: '👤 Filtrar Colaborador',
        concept_compare_concepts: '🔍 Filtrar Concepto',
        ceco_compare_cecos: '🏢 Filtrar Centro de Costo',
        cargo_compare_cargos: '🎖️ Filtrar Cargo',
        period_compare_cecos: '🏢 Filtrar Centro de Costo',
        concept_compare_cecos: '🏢 Filtrar Centro de Costo',
        cargo_compare_cecos: '🏢 Filtrar Centro de Costo'
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
        { btnId: 'period-compare-ceco-label',      type: 'period_compare_cecos' },
        
        // Pestaña Análisis Masivo por Concepto
        { btnId: 'concept-compare-p1-label',       type: 'p1' },
        { btnId: 'concept-compare-p2-label',       type: 'p2' },
        { btnId: 'concept-compare-concepts-label', type: 'concept_compare_concepts' },
        { btnId: 'concept-compare-tipo-label',     type: 'types' },
        { btnId: 'concept-compare-ceco-label',     type: 'concept_compare_cecos' },
        
        // Pestaña Análisis Masivo por CECO
        { btnId: 'ceco-compare-p1-label',          type: 'p1' },
        { btnId: 'ceco-compare-p2-label',          type: 'p2' },
        { btnId: 'ceco-compare-cecos-label',       type: 'ceco_compare_cecos' },
        { btnId: 'ceco-compare-tipo-label',        type: 'types' },
        
        // Pestaña Análisis Masivo por Cargo
        { btnId: 'cargo-compare-p1-label',         type: 'p1' },
        { btnId: 'cargo-compare-p2-label',         type: 'p2' },
        { btnId: 'cargo-compare-cargos-label',     type: 'cargo_compare_cargos' },
        { btnId: 'cargo-compare-tipo-label',        type: 'types' },
        { btnId: 'cargo-compare-ceco-label',       type: 'cargo_compare_cecos' }
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
    
    clearChart('compareChart');
    
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

function aggregateRecords(records) {
    const agg = {};
    records.forEach(r => {
        const key = `${r.c}|${r.n}|${r.co}|${r.m}|${r.a}|${r.na}|${r.pa || 0}`;
        if (agg[key]) {
            agg[key].v += r.v;
            agg[key].v = Math.round(agg[key].v * 100) / 100;
            if (r.cant !== undefined && r.cant !== null) {
                agg[key].cant = (agg[key].cant || 0) + r.cant;
                agg[key].cant = Math.round(agg[key].cant);
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

    // CECOs en period-compare (Colaboradores)
    const periodCecoLabel = document.getElementById('period-compare-ceco-label');
    if (periodCecoLabel) {
        const count = state.periodCompareSelectedCecos ? state.periodCompareSelectedCecos.length : 0;
        if (count === 0) {
            periodCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: Todos`;
        } else if (count === 1) {
            const shortName = state.periodCompareSelectedCecos[0].split(' - ')[0];
            periodCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: ${shortName}`;
        } else {
            periodCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Cecos: ${count}`;
        }
    }

    // CECOs en concept-compare (Conceptos)
    const conceptCecoLabel = document.getElementById('concept-compare-ceco-label');
    if (conceptCecoLabel) {
        const count = state.conceptCompareSelectedCecos ? state.conceptCompareSelectedCecos.length : 0;
        if (count === 0) {
            conceptCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: Todos`;
        } else if (count === 1) {
            const shortName = state.conceptCompareSelectedCecos[0].split(' - ')[0];
            conceptCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: ${shortName}`;
        } else {
            conceptCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Cecos: ${count}`;
        }
    }

    // CECOs en cargo-compare (Cargos)
    const cargoCecoLabel = document.getElementById('cargo-compare-ceco-label');
    if (cargoCecoLabel) {
        const count = state.cargoCompareSelectedCecos ? state.cargoCompareSelectedCecos.length : 0;
        if (count === 0) {
            cargoCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: Todos`;
        } else if (count === 1) {
            const shortName = state.cargoCompareSelectedCecos[0].split(' - ')[0];
            cargoCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Ceco: ${shortName}`;
        } else {
            cargoCecoLabel.innerHTML = `<i data-lucide="building-2"></i> Cecos: ${count}`;
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

    const btnPersonaReport = document.getElementById('btn-period-compare-report');
    if (btnPersonaReport && !btnPersonaReport.dataset.listenerBound) {
        btnPersonaReport.addEventListener('click', () => {
            generateManagerialReport('persona');
        });
        btnPersonaReport.dataset.listenerBound = 'true';
    }

    const btnPersonaExcel = document.getElementById('btn-period-compare-excel');
    if (btnPersonaExcel && !btnPersonaExcel.dataset.listenerBound) {
        btnPersonaExcel.addEventListener('click', () => {
            exportCompareTableToExcel('persona');
        });
        btnPersonaExcel.dataset.listenerBound = 'true';
    }
}

// Formatea la variación monetaria con colores e iconos
function formatVariationHTML(val, isPercentage = false) {
    if (val === 0) {
        return `<span class="val-neutral">-</span>`;
    }
    
    const sign = val > 0 ? '+' : '';
    const icon = '';
    const cssClass = val > 0 ? 'val-up' : 'val-down';
    
    let formattedText = '';
    if (isPercentage) {
        formattedText = `${sign}${val.toFixed(1)}%`;
    } else {
        formattedText = `${sign}${currencyFormatter.format(val)}`;
    }
    
    return `<span class="${cssClass}">${formattedText}</span>`;
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

// Genera el HTML de cabecera con botón de ordenación
function getHeaderSortHTML(labelText, columnKey, activeSortColumn, activeSortDirection, isRightAligned = false) {
    const isSorted = activeSortColumn === columnKey;
    const arrowChar = isSorted ? (activeSortDirection === 'asc' ? '↑' : '↓') : '↕';
    const arrowColor = isSorted ? '#6c00d3' : '#cbd5e1';
    const containerStyle = isRightAligned 
        ? 'display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; width: 100%; cursor: pointer; user-select: none;'
        : 'display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;';
        
    return `
        <div style="${containerStyle}">
            <span>${labelText}</span>
            <span class="sort-arrow" style="color: ${arrowColor}; font-size: 0.75rem; margin-left: 4px;">${arrowChar}</span>
        </div>
    `;
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
    
    // Actualizar cabeceras de columnas con ordenación
    const headerName = document.getElementById('period-header-name');
    const headerDiff = document.getElementById('period-header-diff');
    const headerPct = document.getElementById('period-header-pct');
    
    if (headerName) headerName.innerHTML = getHeaderSortHTML('Colaborador', 'name', state.periodSortColumn, state.periodSortDirection, false);
    if (headerCantP1) headerCantP1.innerHTML = getHeaderSortHTML('Cant ' + p1Label, 'cant1', state.periodSortColumn, state.periodSortDirection, true);
    if (headerP1) headerP1.innerHTML = getHeaderSortHTML('Valor ' + p1Label, 'p1', state.periodSortColumn, state.periodSortDirection, true);
    if (headerCantP2) headerCantP2.innerHTML = getHeaderSortHTML('Cant ' + p2Label, 'cant2', state.periodSortColumn, state.periodSortDirection, true);
    if (headerP2) headerP2.innerHTML = getHeaderSortHTML('Valor ' + p2Label, 'p2', state.periodSortColumn, state.periodSortDirection, true);
    if (headerDiff) headerDiff.innerHTML = getHeaderSortHTML('Variación', 'diff', state.periodSortColumn, state.periodSortDirection, true);
    if (headerPct) headerPct.innerHTML = getHeaderSortHTML('%', 'pct', state.periodSortColumn, state.periodSortDirection, true);

    tbody.innerHTML = '';
    
    if (!state.comparePeriod1 || !state.comparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    let dataP1 = filterDataByPeriod(state.comparePeriod1);
    let dataP2 = filterDataByPeriod(state.comparePeriod2);
    
    // Filtro por Centro de Costo
    const selectedCecos = state.periodCompareSelectedCecos || [];
    if (selectedCecos.length > 0) {
        dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
        dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
    }
    
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
    const peopleStatsList = [];
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
            p1Concepts[r.co] = (p1Concepts[r.co] || 0) + r.v;
            p1ConceptsCant[r.co] = (p1ConceptsCant[r.co] || 0) + (r.cant || 0);
            allConceptsMeta[r.co] = { na: r.na, t: r.t };
        });
        
        p2Rows.forEach(r => {
            p2Concepts[r.co] = (p2Concepts[r.co] || 0) + r.v;
            p2ConceptsCant[r.co] = (p2ConceptsCant[r.co] || 0) + (r.cant || 0);
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
        
        peopleStatsList.push({
            cedula: cedula,
            name: name,
            p1: netP1,
            p2: netP2,
            diff: netDiff,
            pct: netPct,
            totals: totals,
            conceptChanges: conceptChanges,
            insightHTML: insightHTML
        });
    });

    // Ordenar peopleStatsList según la columna y dirección
    const sortCol = state.periodSortColumn || 'name';
    const sortDir = state.periodSortDirection || 'asc';
    peopleStatsList.sort((a, b) => {
        let valA, valB;
        if (sortCol === 'name') {
            valA = a.name;
            valB = b.name;
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortCol === 'p1') {
            valA = a.p1;
            valB = b.p1;
        } else if (sortCol === 'p2') {
            valA = a.p2;
            valB = b.p2;
        } else if (sortCol === 'diff') {
            valA = a.diff;
            valB = b.diff;
        } else if (sortCol === 'pct') {
            valA = a.pct;
            valB = b.pct;
        } else {
            return 0;
        }
        return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    peopleStatsList.forEach(personItem => {
        const cedula = personItem.cedula;
        const name = personItem.name;
        const netP1 = personItem.p1;
        const netP2 = personItem.p2;
        const netDiff = personItem.diff;
        const netPct = personItem.pct;
        const totals = personItem.totals;
        const conceptChanges = personItem.conceptChanges;
        const insightHTML = personItem.insightHTML;

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
            <td style="display:flex; gap:4px; align-items:center; padding-top:10px; padding-bottom:10px;">
                <button class="btn-analyze" data-cedula="${cedula}" data-name="${name}" title="Ver desglose de conceptos">
                    <i data-lucide="eye" style="width:14px;height:14px;"></i>
                </button>
                <button class="btn-analyze btn-person-detail" data-cedula="${cedula}" data-name="${name}" title="Análisis individual del colaborador" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;">
                    <i data-lucide="user-round-search" style="width:14px;height:14px;"></i>
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
                conRow.className = `concept-row child-of-${cedula} ${state.periodCompareExpanded ? '' : 'collapsed-row'}`;
                
                // Variación porcentual individual
                const cPct = c.val1 !== 0 ? (c.diff / Math.abs(c.val1)) * 100 : (c.diff > 0 ? 100.0 : (c.diff < 0 ? -100.0 : 0));
                
                conRow.innerHTML = `
                    <td></td>
                    <td>${cedula}</td>
                    <td><span class="badge badge-${nat.toLowerCase()}">${nat}</span></td>
                    <td>${c.co}</td>
                    <td style="text-align: right;">${c.val1 !== 0 ? Math.round(c.cant1) : "—"}</td>
                    <td style="text-align: right;">${c.val1 !== 0 ? currencyFormatter.format(c.val1) : '-'}</td>
                    <td style="text-align: right;">${c.val2 !== 0 ? Math.round(c.cant2) : "—"}</td>
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

    // Renderizar fila TOTAL en la parte inferior de la tabla
    (function renderPeriodTableTotalsRow() {
        let sumP1 = 0, sumP2 = 0;
        peopleStatsList.forEach(p => { sumP1 += p.p1; sumP2 += p.p2; });
        const sumDiff = sumP2 - sumP1;
        const sumPct  = sumP1 !== 0 ? (sumDiff / Math.abs(sumP1)) * 100 : (sumDiff > 0 ? 100 : (sumDiff < 0 ? -100 : 0));

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.6px; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: var(--text-primary);"><strong>TOTAL</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP1)}</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP2)}</strong></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumDiff).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumPct, true).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
        `;
        tbody.appendChild(totalRow);
    })();
    
    // Bind Analizar buttons — solo los de ojo (excluir btn-person-detail)
    document.querySelectorAll('.btn-analyze:not(.btn-person-detail)').forEach(btn => {
        if (btn.classList.contains('btn-analyze-concept') || btn.classList.contains('btn-analyze-ceco') || btn.classList.contains('btn-analyze-cargo')) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cedula = btn.getAttribute('data-cedula');
            const name = btn.getAttribute('data-name');
            showAnalysisModal(cedula, name, state.comparePeriod1, state.comparePeriod2);
        });
    });

    // Bind botón de Análisis Individual de Persona
    document.querySelectorAll('.btn-person-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cedula = btn.getAttribute('data-cedula');
            const name = btn.getAttribute('data-name');
            showPersonDetailModal(cedula, name, state.comparePeriod1, state.comparePeriod2);
        });
    });
    
    // Renderizar fila TOTAL en el pie de la tabla


    // Actualizar Tarjetas Resumen (Colaboradores)
    (function updatePeriodSummaryCards() {
        const totalEl     = document.getElementById('period-stat-total');
        const totalSubEl  = document.getElementById('period-stat-total-sub');
        const highNameEl  = document.getElementById('period-stat-highest-name');
        const highValEl   = document.getElementById('period-stat-highest-val');
        const savNameEl   = document.getElementById('period-stat-savings-name');
        const savValEl    = document.getElementById('period-stat-savings-val');
        const payrollEl   = document.getElementById('period-stat-total-payroll');
        const payrollSubEl= document.getElementById('period-stat-total-payroll-sub');
        if (!totalEl) return;

        const countP2 = peopleStatsList.filter(p => p.p2 !== 0).length;
        const countP1 = peopleStatsList.filter(p => p.p1 !== 0).length;
        const diffCount = countP2 - countP1;
        totalEl.innerText = countP2;

        if (diffCount > 0) {
            totalSubEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${diffCount} respecto a ${p1Label}</span>`;
        } else if (diffCount < 0) {
            totalSubEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${diffCount} respecto a ${p1Label}</span>`;
        } else {
            totalSubEl.innerHTML = `<span>Sin cambios respecto a ${p1Label}</span>`;
        }

        // Mayor incremento (mayor diff positivo)
        let topIncrease = null, maxDiff = 0;
        peopleStatsList.forEach(p => { if (p.diff > maxDiff) { maxDiff = p.diff; topIncrease = p; } });
        if (topIncrease) {
            const shortName = topIncrease.name.split(' ').slice(0, 2).join(' ');
            highNameEl.innerHTML = `${shortName}`;
            highValEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${topIncrease.pct.toFixed(1)}%</span> (+${currencyFormatter.format(topIncrease.diff)})`;
        } else {
            highNameEl.innerText = '-'; highValEl.innerText = 'Sin incrementos';
        }

        // Mayor ahorro (mayor diff negativo)
        let topSavings = null, minDiff = 0;
        peopleStatsList.forEach(p => { if (p.diff < minDiff) { minDiff = p.diff; topSavings = p; } });
        if (topSavings) {
            const shortName = topSavings.name.split(' ').slice(0, 2).join(' ');
            savNameEl.innerHTML = `${shortName}`;
            savValEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${topSavings.pct.toFixed(1)}%</span> (${currencyFormatter.format(topSavings.diff)})`;
        } else {
            savNameEl.innerText = '-'; savValEl.innerText = 'Sin ahorros';
        }

        // Nómina comparada
        let totalP1 = 0, totalP2 = 0;
        peopleStatsList.forEach(p => { totalP1 += p.p1; totalP2 += p.p2; });
        const totalDiff = totalP2 - totalP1;
        const totalPct  = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : (totalDiff > 0 ? 100 : (totalDiff < 0 ? -100 : 0));
        const totalSign = totalDiff > 0 ? '+' : '';
        const totalColor = totalDiff > 0 ? '#10b981' : (totalDiff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const totalIcon  = totalDiff > 0 ? 'trending-up' : (totalDiff < 0 ? 'trending-down' : 'minus');
        payrollEl.innerHTML = `<strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P1:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalP1)}</span><br><strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P2:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalP2)}</span>`;
        payrollEl.style.fontSize = '1.05rem';
        payrollEl.style.lineHeight = '1.35';
        payrollSubEl.innerHTML = `Dif: <span style="color:${totalColor};font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="${totalIcon}" style="width:12px;height:12px;"></i> ${totalSign}${currencyFormatter.format(totalDiff)} (${totalSign}${totalPct.toFixed(2)}%)</span>`;
    })();

    // Inicializar iconos de Lucide cargados
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Listeners para botones de ordenación
    document.querySelectorAll('#period-header-name .small-sort-btn, #period-header-cant-p1 .small-sort-btn, #period-header-p1 .small-sort-btn, #period-header-cant-p2 .small-sort-btn, #period-header-p2 .small-sort-btn, #period-header-diff .small-sort-btn, #period-header-pct .small-sort-btn')
        .forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = btn.getAttribute('data-col');
                if (state.periodSortColumn === col) {
                    state.periodSortDirection = state.periodSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.periodSortColumn = col;
                    state.periodSortDirection = 'desc'; // Por defecto de mayor a menor
                }
                renderPeriodComparison();
            });
        });
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
    
    // Devengos calculations
    const devP1 = totals.DEVENGO.p1;
    const devP2 = totals.DEVENGO.p2;
    const devDiff = devP2 - devP1;
    const devPct = devP1 !== 0 ? (devDiff / Math.abs(devP1)) * 100 : 0;
    
    // Descuentos calculations (absolute terms)
    const descP1 = Math.abs(totals.DESCUENTO.p1);
    const descP2 = Math.abs(totals.DESCUENTO.p2);
    const descDiff = descP2 - descP1;
    const descPct = descP1 !== 0 ? (descDiff / descP1) * 100 : 0;

    // Helper for formatting concept names
    const formatConceptName = (str) => {
        if (!str) return '';
        // Sentence case
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    // Card 1: Devengos
    let devArrow = 'arrow-up-right';
    let devArrowClass = 'pos';
    let devBadgeClass = 'badge-pos';
    if (devDiff < 0) {
        devArrow = 'arrow-down-right';
        devArrowClass = 'neg';
        devBadgeClass = 'badge-neg';
    } else if (devDiff === 0) {
        devArrow = 'arrow-right';
        devArrowClass = 'muted';
        devBadgeClass = 'badge-neutral';
    }
    const devPctStr = `${devDiff >= 0 ? '+' : ''}${devPct.toFixed(2)}%`;

    // Card 2: Descuentos
    let descArrow = 'arrow-right';
    let descArrowClass = 'pos';
    let descBadgeClass = 'badge-pos';
    if (descDiff > 0) {
        // More discounts = negative impact
        descArrow = 'arrow-right';
        descArrowClass = 'neg';
        descBadgeClass = 'badge-neg';
    } else if (descDiff === 0) {
        descArrow = 'arrow-right';
        descArrowClass = 'muted';
        descBadgeClass = 'badge-neutral';
    }
    const descPctStr = `${descDiff >= 0 ? '+' : ''}${descPct.toFixed(2)}%`;

    // Card 3: Neto
    let netArrow = 'arrow-up-right';
    let netArrowClass = 'pos';
    let netBadgeClass = 'badge-pos';
    if (netDiff < 0) {
        netArrow = 'arrow-down-right';
        netArrowClass = 'neg';
        netBadgeClass = 'badge-neg';
    } else if (netDiff === 0) {
        netArrow = 'arrow-right';
        netArrowClass = 'muted';
        netBadgeClass = 'badge-neutral';
    }
    const netPctStr = `${netDiff >= 0 ? '+' : ''}${netPct.toFixed(2)}%`;

    // Summary Cards HTML
    const summaryCardsHTML = `
        <div class="analysis-cards-row">
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="dollar-sign"></i>
                    </span>
                    <span class="analysis-card-label">Devengos</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${devArrow}" class="analysis-card-arrow ${devArrowClass}"></i>
                    <span class="analysis-card-badge ${devBadgeClass}">${devPctStr}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon descuentos">
                        <i data-lucide="percent"></i>
                    </span>
                    <span class="analysis-card-label">Descuentos</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${descArrow}" class="analysis-card-arrow ${descArrowClass}"></i>
                    <span class="analysis-card-badge ${descBadgeClass}">${descPctStr}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon neto">
                        <i data-lucide="wallet"></i>
                    </span>
                    <span class="analysis-card-label">Neto</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${netArrow}" class="analysis-card-arrow ${netArrowClass}"></i>
                    <span class="analysis-card-badge ${netBadgeClass}">${netPctStr}</span>
                </div>
            </div>
        </div>
    `;

    // Top positive and negative
    const topPositive = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    const topNegative = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff)[0];
    const newConcepts = changes.filter(c => (p1Map[c.co] === undefined || p1Map[c.co] === 0) && c.v2 !== 0);
    const removedConcepts = changes.filter(c => (p2Map[c.co] === undefined || p2Map[c.co] === 0) && c.v1 !== 0);
    const newCount = newConcepts.length;
    const removedCount = removedConcepts.length;
    
    let summaryListItems = [];
    
    if (topPositive) {
        let explanation = "";
        if (topPositive.na === 'DEVENGO') {
            explanation = `Aumento en el devengo <strong>${topPositive.co.toLowerCase()}</strong> (+$${currencyFormatter.format(topPositive.diff).replace('$', '')})`;
        } else {
            explanation = `Disminución en el descuento <strong>${topPositive.co.toLowerCase()}</strong> (representa un ahorro de +$${currencyFormatter.format(Math.abs(topPositive.diff)).replace('$', '')})`;
        }
        summaryListItems.push(`
            <li>
                <span class="bullet-dot pos"></span>
                <div><strong>Mayor impacto positivo:</strong> ${explanation}.</div>
            </li>
        `);
    }
    
    if (topNegative) {
        let explanation = "";
        if (topNegative.na === 'DEVENGO') {
            explanation = `Reducción en el devengo <strong>${topNegative.co.toLowerCase()}</strong> (-$${currencyFormatter.format(Math.abs(topNegative.diff)).replace('$', '')})`;
        } else {
            explanation = `Incremento en el descuento <strong>${topNegative.co.toLowerCase()}</strong> (mayor deducción de -$${currencyFormatter.format(Math.abs(topNegative.diff)).replace('$', '')})`;
        }
        summaryListItems.push(`
            <li>
                <span class="bullet-dot neg"></span>
                <div><strong>Mayor impacto negativo:</strong> ${explanation}.</div>
            </li>
        `);
    }
    
    if (newCount > 0) {
        const sampleNew = newConcepts.slice(0, 2).map(c => `<strong>${c.co.toLowerCase()}</strong>`).join(', ');
        const extraText = newCount > 2 ? ` y ${newCount - 2} más` : '';
        summaryListItems.push(`
            <li>
                <span class="bullet-dot pos"></span>
                <div><strong>Nuevos conceptos:</strong> Se incorporaron ${newCount} conceptos de pago (${sampleNew}${extraText}).</div>
            </li>
        `);
    }
    
    if (removedCount > 0) {
        const sampleRemoved = removedConcepts.slice(0, 2).map(c => `<strong>${c.co.toLowerCase()}</strong>`).join(', ');
        const extraText = removedCount > 2 ? ` y ${removedCount - 2} más` : '';
        summaryListItems.push(`
            <li>
                <span class="bullet-dot neg"></span>
                <div><strong>Conceptos finalizados:</strong> Dejaron de aplicarse ${removedCount} conceptos (${sampleRemoved}${extraText}).</div>
            </li>
        `);
    }

    if (summaryListItems.length === 0) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot info"></span>
                <div>No se registraron variaciones en los conceptos individuales entre los periodos analizados.</div>
            </li>
        `);
    }

    const executiveSummaryHTML = `
        <div class="analysis-executive-summary-wrapper">
            <div class="analysis-sparkle-badge">
                <i data-lucide="sparkles"></i>
            </div>
            <div class="analysis-executive-summary">
                <h5>Resumen de Variaciones Clave</h5>
                <ul class="analysis-summary-list">
                    ${summaryListItems.join('')}
                </ul>
            </div>
        </div>
    `;

    // Positives and Negatives lists
    const positives = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff);
    const negatives = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff);

    let positivesHTML = '';
    if (positives.length > 0) {
        positivesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Positivos (Suman al Neto)</h4>
                <div class="analysis-cards-list">
                    ${positives.map(c => `
                        <div class="analysis-impact-card pos">
                            <span class="analysis-impact-name">${formatConceptName(c.co)}</span>
                            <span class="analysis-impact-value pos">+${currencyFormatter.format(c.diff)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let negativesHTML = '';
    if (negatives.length > 0) {
        negativesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Negativos (Restan al Neto)</h4>
                <div class="analysis-cards-list">
                    ${negatives.map(c => `
                        <div class="analysis-impact-card neg">
                            <span class="analysis-impact-name">${formatConceptName(c.co)}</span>
                            <span class="analysis-impact-value neg">-${currencyFormatter.format(Math.abs(c.diff))}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build modal
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <h3 class="analysis-modal-title">Análisis de Variaciones</h3>
                <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                <h4 class="analysis-employee-name">${name.toUpperCase()}</h4>
                <p class="analysis-employee-periods">${period1} vs ${period2}</p>
                
                ${summaryCardsHTML}
                ${executiveSummaryHTML}
                ${positivesHTML}
                ${negativesHTML}
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

// ==========================================
// MODAL DE ANÁLISIS INDIVIDUAL DE PERSONA
// ==========================================
function showPersonDetailModal(cedula, name, period1, period2) {
    const existing = document.getElementById('person-detail-modal-overlay');
    if (existing) existing.remove();

    // 1. Get raw data for the employee (unfiltered by global filters for the modal's self-contained 6-month history)
    const allEmployeeDataAcrossYears = state.data.filter(d => d.c === cedula);

    // 2. Identify the last 6 months present in the employee's history
    const employeeMonthYears = Array.from(new Set(allEmployeeDataAcrossYears.map(d => `${d.a} - ${d.m}`)))
        .sort((a, b) => {
            const [yA, mA] = a.split(' - ');
            const [yB, mB] = b.split(' - ');
            const yearDiff = parseInt(yA) - parseInt(yB);
            if (yearDiff !== 0) return yearDiff;
            return (MONTH_ORDER[mA] || 0) - (MONTH_ORDER[mB] || 0);
        });
    const last6MonthYearsList = employeeMonthYears.slice(-6);
    const last6MonthYearsSet = new Set(last6MonthYearsList);

    // 3. Restrict all data inside this modal strictly to the last 6 months
    const rawEmployeeData = allEmployeeDataAcrossYears.filter(d => last6MonthYearsSet.has(`${d.a} - ${d.m}`));
    const rawAllEmployeeDataAcrossYears = rawEmployeeData;

    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'person-detail-modal-overlay';
    overlay.className = 'individual-analysis-overlay';
    
    // HTML structure of the modal content (including new local filters row)
    overlay.innerHTML = `
        <div class="individual-analysis-modal">
            <div class="analysis-modal-header" style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 16px 16px 0 0; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; color: white;">
                <div>
                    <h3 class="analysis-modal-title" style="color: #fff; font-size: 1.15rem; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="user" style="width: 20px; height: 20px; color: #a78bfa;"></i>
                        Análisis Individual del Colaborador <span style="font-size: 0.72rem; font-weight: normal; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 20px; margin-left: 10px; color: #e9d5ff;">Últimos 6 meses</span>
                    </h3>
                    <div style="display: flex; gap: 12px; margin-top: 4px; align-items: center;">
                        <strong id="modal-employee-title-name" style="font-size: 1rem; color: #f1f5f9;">${name}</strong>
                        <span style="color: #64748b;">|</span>
                        <span id="modal-employee-title-id" style="font-size: 0.85rem; color: #cbd5e1;">Cédula: ${cedula}</span>
                    </div>
                </div>
                <button class="analysis-close-btn" id="person-detail-close-btn" aria-label="Cerrar" style="background: rgba(255, 255, 255, 0.15); color: #fff; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                    <i data-lucide="x" style="width: 18px; height: 18px;"></i>
                </button>
            </div>
            
            <div class="analysis-modal-body" style="padding: 24px; overflow-y: auto; flex: 1; background-color: var(--bg-main, #f8fafc); display: flex; flex-direction: column; gap: 24px;">
                <!-- Local Filter Bar for Employee-specific Year, Month, Quincena, Tipo -->
                <div class="modal-filters-row" style="display: flex; gap: 12px; align-items: center; background: #fff; padding: 12px 18px; border-radius: 12px; border: 1px solid var(--border-color); flex-wrap: wrap; margin-bottom: 8px;">
                    <!-- Años -->
                    <div class="select-wrapper" style="width: 125px; position: relative;">
                        <i data-lucide="calendar" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-secondary); pointer-events: none; z-index: 10;"></i>
                        <select id="modal-filter-year" class="custom-select" style="padding: 0 36px 0 32px !important; font-size: 0.8rem !important; height: 32px !important; border-radius: 20px !important; border: 1px solid rgba(108,0,211,0.2) !important; color: #4b5563; font-weight: 600;">
                            <option value="ALL">Años</option>
                        </select>
                    </div>
                    
                    <!-- Meses -->
                    <div class="select-wrapper" style="width: 125px; position: relative;">
                        <i data-lucide="calendar-days" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-secondary); pointer-events: none; z-index: 10;"></i>
                        <select id="modal-filter-month" class="custom-select" style="padding: 0 36px 0 32px !important; font-size: 0.8rem !important; height: 32px !important; border-radius: 20px !important; border: 1px solid rgba(108,0,211,0.2) !important; color: #4b5563; font-weight: 600;">
                            <option value="ALL">Meses</option>
                        </select>
                    </div>

                    <!-- Quincenas -->
                    <div class="select-wrapper" style="width: 135px; position: relative;">
                        <i data-lucide="calendar-range" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-secondary); pointer-events: none; z-index: 10;"></i>
                        <select id="modal-filter-quincena" class="custom-select" style="padding: 0 36px 0 32px !important; font-size: 0.8rem !important; height: 32px !important; border-radius: 20px !important; border: 1px solid rgba(108,0,211,0.2) !important; color: #4b5563; font-weight: 600;">
                            <option value="ALL">Quincenas</option>
                        </select>
                    </div>

                    <!-- Tipo -->
                    <div class="select-wrapper" style="width: 120px; position: relative;">
                        <i data-lucide="tag" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-secondary); pointer-events: none; z-index: 10;"></i>
                        <select id="modal-filter-tn" class="custom-select" style="padding: 0 36px 0 32px !important; font-size: 0.8rem !important; height: 32px !important; border-radius: 20px !important; border: 1px solid rgba(108,0,211,0.2) !important; color: #4b5563; font-weight: 600;">
                            <option value="ALL">Tipo</option>
                        </select>
                    </div>
                    
                    <button id="modal-filter-clear-btn" class="btn btn-secondary" style="margin-left: auto; padding: 4px 10px; font-size: 0.78rem; height: 32px; display: none; align-items: center; gap: 4px; border-radius: 20px !important;">
                        <i data-lucide="filter-x" style="width: 13px; height: 13px;"></i> Limpiar Filtros
                    </button>
                </div>

                <!-- KPIs del Empleado -->
                <div class="kpi-grid">
                    <div class="kpi-card kpi-blue">
                        <div class="kpi-header">
                            <span class="kpi-title">Salario Neto Pagado</span>
                            <div class="kpi-icon"><i data-lucide="credit-card"></i></div>
                        </div>
                        <div id="modal-emp-kpi-neto" class="kpi-value">$ 0</div>
                        <div class="kpi-subtitle">Ingresos netos transferidos</div>
                    </div>
                    <div class="kpi-card kpi-emerald">
                        <div class="kpi-header">
                            <span class="kpi-title">Ingresos Totales (Devengos)</span>
                            <div class="kpi-icon"><i data-lucide="plus-circle"></i></div>
                        </div>
                        <div id="modal-emp-kpi-devengos" class="kpi-value">$ 0</div>
                        <div class="kpi-subtitle">Total devengado bruto</div>
                    </div>
                    <div class="kpi-card kpi-danger">
                        <div class="kpi-header">
                            <span class="kpi-title">Deducciones Totales</span>
                            <div class="kpi-icon"><i data-lucide="minus-circle"></i></div>
                        </div>
                        <div id="modal-emp-kpi-descuentos" class="kpi-value">$ 0</div>
                        <div class="kpi-subtitle">Total retenido / descontado</div>
                    </div>
                    <div class="kpi-card kpi-info">
                        <div class="kpi-header">
                            <span class="kpi-title">Sueldo Básico Actual</span>
                            <div class="kpi-icon"><i data-lucide="award"></i></div>
                        </div>
                        <div id="modal-emp-kpi-basico" class="kpi-value">$ 0</div>
                        <div class="kpi-subtitle">Última asignación básica mensual</div>
                    </div>
                </div>

                <!-- Fila de Gráficos -->
                <div class="chart-grid">
                    <div class="chart-card">
                        <div class="chart-card-header">
                            <h3 class="chart-card-title">Evolución Salarial Mensual</h3>
                        </div>
                        <div class="chart-container" style="height: 280px; position: relative;">
                            <canvas id="modal-employee-history-chart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <div class="chart-card-header">
                            <h3 class="chart-card-title">Distribución de Conceptos</h3>
                        </div>
                        <div class="chart-container" style="height: 280px; position: relative;">
                            <canvas id="modal-employee-distribution-chart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Fila de Endeudamiento y Detalle de Transacciones -->
                <div class="overview-charts" style="align-items: stretch; grid-template-columns: 0.9fr 1.1fr; display: grid; gap: 24px;">
                    <!-- Gráfico de Endeudamiento -->
                    <div class="chart-card" style="margin: 0; display: flex; flex-direction: column; height: 100%;">
                        <div class="chart-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <h3 class="chart-card-title">Capacidad de Endeudamiento por Periodo</h3>
                            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                                <div class="debt-limit-control" style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-main); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-color); font-weight: 500;">
                                    <span>Límite:</span>
                                    <input type="number" id="modal-debt-limit-input" value="40" min="0" max="100" style="width: 32px; background: transparent; border: none; color: var(--primary); font-weight: 700; text-align: center; outline: none; font-family: inherit; font-size: 0.8rem; padding: 0;" />
                                    <span>%</span>
                                </div>
                                <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">Fórmula: Descuentos / Ingresos</span>
                            </div>
                        </div>
                        <div class="chart-container" style="flex-grow: 1; min-height: 280px; height: 100%; position: relative;">
                            <canvas id="modal-employee-debt-chart"></canvas>
                        </div>
                    </div>

                    <!-- Tabla de Detalle -->
                    <div class="table-card" style="margin: 0; display: flex; flex-direction: column; height: 100%;">
                        <div class="table-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                            <h3 class="table-title">Detalle de Transacciones de Pago</h3>
                            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Periodo:</span>
                                    <div class="select-wrapper" style="width: 150px;">
                                        <select id="modal-employee-detail-filter-period" class="custom-select" style="font-size: 0.82rem !important; padding: 6px 30px 6px 12px !important; height: 34px !important; border-radius: 8px !important; line-height: 1.2 !important;">
                                            <option value="ALL">Todos los Periodos</option>
                                        </select>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Concepto:</span>
                                    <div class="select-wrapper" style="width: 170px;">
                                        <select id="modal-employee-detail-filter-concept" class="custom-select" style="font-size: 0.82rem !important; padding: 6px 30px 6px 12px !important; height: 34px !important; border-radius: 8px !important; line-height: 1.2 !important;">
                                            <option value="ALL">Todos los Conceptos</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="table-wrapper" style="flex-grow: 1; max-height: 280px; overflow-y: auto;">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th class="sortable-header" style="cursor:pointer;user-select:none;width: 25%;">Periodo<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                                        <th class="sortable-header" style="cursor:pointer;user-select:none;width: 35%;">Concepto<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                                        <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right; width: 20%;">Ingresos<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                                        <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right; width: 20%;">Descuentos<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                                    </tr>
                                </thead>
                                <tbody id="modal-employee-details-tbody">
                                    <!-- Dinámico por JS -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    
    // Animate modal entry
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });

    const modalCharts = {};

    // Calculate options present in employee's 6-month history for pre-selection validation
    const empYears = new Set();
    const empMonths = new Set();
    const empQuincenas = new Set();
    const empTns = new Set();
    rawEmployeeData.forEach(d => {
        if (d.a) empYears.add(String(d.a));
        if (d.m) empMonths.add(d.m);
        const hasQuincena = (d.pa !== undefined && d.pa !== null);
        const qStr = hasQuincena ? ((parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2') : 'MES';
        empQuincenas.add(qStr);
        if (d.tn) empTns.add(d.tn);
    });

    let selectedYear = (state.selectedYears && state.selectedYears.length === 1 && empYears.has(String(state.selectedYears[0]))) ? String(state.selectedYears[0]) : 'ALL';
    let selectedMonth = (state.selectedMonths && state.selectedMonths.length === 1 && empMonths.has(state.selectedMonths[0])) ? state.selectedMonths[0] : 'ALL';
    let selectedQuincena = (state.selectedQuincenas && state.selectedQuincenas.length === 1 && empQuincenas.has(state.selectedQuincenas[0])) ? state.selectedQuincenas[0] : 'ALL';
    let selectedTn = (state.selectedTipoNomina && state.selectedTipoNomina.length === 1 && empTns.has(state.selectedTipoNomina[0])) ? state.selectedTipoNomina[0] : 'ALL';
    let modalEmployeeDetailPeriod = 'ALL';
    let modalEmployeeDetailConcept = 'ALL';
    let modalDebtLimit = 40;

    const closeModal = () => {
        overlay.classList.remove('visible');
        setTimeout(() => {
            Object.keys(modalCharts).forEach(key => {
                if (modalCharts[key]) modalCharts[key].destroy();
            });
            overlay.remove();
        }, 300);
    };

    document.getElementById('person-detail-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // Run the initialization and rendering (in a small timeout so DOM settles and canvas size is computed)
    setTimeout(() => {
        if (window.lucide) window.lucide.createIcons();
        renderModalEmployeeView(cedula);
    }, 100);

    function getFilteredEmployeeData() {
        let data = rawEmployeeData;
        if (selectedYear !== 'ALL') {
            data = data.filter(d => String(d.a) === String(selectedYear));
        }
        if (selectedMonth !== 'ALL') {
            data = data.filter(d => d.m === selectedMonth);
        }
        if (selectedQuincena !== 'ALL') {
            data = data.filter(d => {
                const hasQuincena = (d.pa !== undefined && d.pa !== null);
                const qStr = hasQuincena ? ((parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2') : 'MES';
                return qStr === selectedQuincena;
            });
        }
        if (selectedTn !== 'ALL') {
            data = data.filter(d => d.tn === selectedTn);
        }
        return data;
    }

    function getFilteredAllYearsData() {
        let data = rawAllEmployeeDataAcrossYears;
        if (selectedYear !== 'ALL') {
            data = data.filter(d => String(d.a) === String(selectedYear));
        }
        if (selectedMonth !== 'ALL') {
            data = data.filter(d => d.m === selectedMonth);
        }
        if (selectedQuincena !== 'ALL') {
            data = data.filter(d => {
                const hasQuincena = (d.pa !== undefined && d.pa !== null);
                const qStr = hasQuincena ? ((parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2') : 'MES';
                return qStr === selectedQuincena;
            });
        }
        if (selectedTn !== 'ALL') {
            data = data.filter(d => d.tn === selectedTn);
        }
        return data;
    }

    function renderModalEmployeeView(cedula) {
        // Initial populate of Year, Month, Quincena, and TN filters based on rawEmployeeData
        const years = new Set();
        const months = new Set();
        const quincenas = new Set();
        const tns = new Set();
        
        rawEmployeeData.forEach(d => {
            if (d.a) years.add(String(d.a));
            if (d.m) months.add(d.m);
            const hasQuincena = (d.pa !== undefined && d.pa !== null);
            const qStr = hasQuincena ? ((parseInt(d.pa) % 2 === 1) ? 'Q1' : 'Q2') : 'MES';
            quincenas.add(qStr);
            if (d.tn) tns.add(d.tn);
        });
        
        const sortedYears = [...years].sort((a, b) => b.localeCompare(a));
        const sortedMonths = [...months].sort((a, b) => (MONTH_ORDER[a] || 0) - (MONTH_ORDER[b] || 0));
        const sortedQuincenas = [...quincenas].sort((a, b) => a.localeCompare(b));
        const sortedTns = [...tns].sort((a, b) => a.localeCompare(b));
        
        const yearSelect = document.getElementById('modal-filter-year');
        if (yearSelect) {
            yearSelect.innerHTML = '<option value="ALL">Años</option>';
            sortedYears.forEach(y => {
                yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
            });
            yearSelect.value = selectedYear;
            if (!yearSelect.dataset.listenerBound) {
                yearSelect.addEventListener('change', (e) => {
                    selectedYear = e.target.value;
                    updateModalView();
                });
                yearSelect.dataset.listenerBound = 'true';
            }
        }
        
        const monthSelect = document.getElementById('modal-filter-month');
        if (monthSelect) {
            monthSelect.innerHTML = '<option value="ALL">Meses</option>';
            sortedMonths.forEach(m => {
                monthSelect.innerHTML += `<option value="${m}">${m}</option>`;
            });
            monthSelect.value = selectedMonth;
            if (!monthSelect.dataset.listenerBound) {
                monthSelect.addEventListener('change', (e) => {
                    selectedMonth = e.target.value;
                    updateModalView();
                });
                monthSelect.dataset.listenerBound = 'true';
            }
        }
        
        const quincenaSelect = document.getElementById('modal-filter-quincena');
        if (quincenaSelect) {
            quincenaSelect.innerHTML = '<option value="ALL">Quincenas</option>';
            sortedQuincenas.forEach(q => {
                quincenaSelect.innerHTML += `<option value="${q}">${q}</option>`;
            });
            quincenaSelect.value = selectedQuincena;
            if (!quincenaSelect.dataset.listenerBound) {
                quincenaSelect.addEventListener('change', (e) => {
                    selectedQuincena = e.target.value;
                    updateModalView();
                });
                quincenaSelect.dataset.listenerBound = 'true';
            }
        }
        
        const tnSelect = document.getElementById('modal-filter-tn');
        if (tnSelect) {
            tnSelect.innerHTML = '<option value="ALL">Tipo</option>';
            sortedTns.forEach(t => {
                tnSelect.innerHTML += `<option value="${t}">${t}</option>`;
            });
            tnSelect.value = selectedTn;
            if (!tnSelect.dataset.listenerBound) {
                tnSelect.addEventListener('change', (e) => {
                    selectedTn = e.target.value;
                    updateModalView();
                });
                tnSelect.dataset.listenerBound = 'true';
            }
        }
        
        const clearBtn = document.getElementById('modal-filter-clear-btn');
        if (clearBtn && !clearBtn.dataset.listenerBound) {
            clearBtn.addEventListener('click', () => {
                selectedYear = 'ALL';
                selectedMonth = 'ALL';
                selectedQuincena = 'ALL';
                selectedTn = 'ALL';
                if (yearSelect) yearSelect.value = 'ALL';
                if (monthSelect) monthSelect.value = 'ALL';
                if (quincenaSelect) quincenaSelect.value = 'ALL';
                if (tnSelect) tnSelect.value = 'ALL';
                updateModalView();
            });
            clearBtn.dataset.listenerBound = 'true';
        }

        // Debt limit input listener
        const limitInput = document.getElementById('modal-debt-limit-input');
        if (limitInput && !limitInput.dataset.listenerBound) {
            limitInput.value = modalDebtLimit;
            limitInput.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) return;
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                modalDebtLimit = val;
                const filteredEmpData = getFilteredEmployeeData();
                const filteredAllYearsData = getFilteredAllYearsData();
                renderModalEmployeeDebtChart(filteredEmpData, filteredAllYearsData);
            });
            limitInput.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 40;
                if (val > 100) val = 100;
                e.target.value = val;
                modalDebtLimit = val;
                const filteredEmpData = getFilteredEmployeeData();
                const filteredAllYearsData = getFilteredAllYearsData();
                renderModalEmployeeDebtChart(filteredEmpData, filteredAllYearsData);
            });
            limitInput.dataset.listenerBound = 'true';
        }

        // Table filters
        const periodSelect = document.getElementById('modal-employee-detail-filter-period');
        const conceptSelect = document.getElementById('modal-employee-detail-filter-concept');
        if (periodSelect && !periodSelect.dataset.listenerBound) {
            periodSelect.addEventListener('change', (e) => {
                modalEmployeeDetailPeriod = e.target.value;
                const filteredEmpData = getFilteredEmployeeData();
                renderModalEmployeeDetailsTable(filteredEmpData);
            });
            periodSelect.dataset.listenerBound = 'true';
        }
        if (conceptSelect && !conceptSelect.dataset.listenerBound) {
            conceptSelect.addEventListener('change', (e) => {
                modalEmployeeDetailConcept = e.target.value;
                const filteredEmpData = getFilteredEmployeeData();
                renderModalEmployeeDetailsTable(filteredEmpData);
            });
            conceptSelect.dataset.listenerBound = 'true';
        }

        // Perform initial render
        updateModalView();
    }

    function updateModalView() {
        const filteredEmpData = getFilteredEmployeeData();
        const filteredAllYearsData = getFilteredAllYearsData();
        
        // Show/hide clear filters button
        const clearBtn = document.getElementById('modal-filter-clear-btn');
        if (clearBtn) {
            if (selectedYear !== 'ALL' || selectedMonth !== 'ALL' || selectedQuincena !== 'ALL' || selectedTn !== 'ALL') {
                clearBtn.style.display = 'inline-flex';
            } else {
                clearBtn.style.display = 'none';
            }
        }
        
        // Update KPIs
        let totalDev = 0;
        let totalDesc = 0;
        let sueldoBasico = 0;
        
        const sortedData = [...filteredEmpData].sort((a,b) => {
            const yearDiff = a.a - b.a;
            if (yearDiff !== 0) return yearDiff;
            return (MONTH_ORDER[a.m] || 0) - (MONTH_ORDER[b.m] || 0);
        });
        
        sortedData.forEach(d => {
            if (d.na === 'DEVENGO') totalDev += d.v;
            else if (d.na === 'DESCUENTO') totalDesc += d.v;
            
            if (d.co.toUpperCase().includes('SUELDO BASICO') || d.co.toUpperCase() === 'SUELDO BÁSICO') {
                sueldoBasico = d.v;
            }
        });
        
        const netTotal = totalDev + totalDesc;
        
        if (sueldoBasico === 0) {
            const sortedAllData = [...filteredAllYearsData].sort((a,b) => {
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
        
        document.getElementById('modal-emp-kpi-neto').innerText = currencyFormatter.format(netTotal);
        document.getElementById('modal-emp-kpi-devengos').innerText = currencyFormatter.format(totalDev);
        document.getElementById('modal-emp-kpi-descuentos').innerText = currencyFormatter.format(Math.abs(totalDesc));
        document.getElementById('modal-emp-kpi-basico').innerText = sueldoBasico > 0 ? currencyFormatter.format(sueldoBasico) : 'No registra';
        
        // Charts rendering
        renderModalEmployeeHistoryChart(filteredEmpData, filteredAllYearsData);
        renderModalEmployeeDistributionChart(filteredEmpData);
        renderModalEmployeeDebtChart(filteredEmpData, filteredAllYearsData);
        
        // Update table filters options
        updateTableFilters(filteredEmpData);
        
        // Render details table
        renderModalEmployeeDetailsTable(filteredEmpData);
    }

    function updateTableFilters(filteredEmpData) {
        const periodSelect = document.getElementById('modal-employee-detail-filter-period');
        const conceptSelect = document.getElementById('modal-employee-detail-filter-concept');
        
        const uniquePeriods = new Set();
        const uniqueConcepts = new Set();
        filteredEmpData.forEach(r => {
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
        
        if (periodSelect) {
            const prevVal = modalEmployeeDetailPeriod;
            periodSelect.innerHTML = '<option value="ALL">Todos los Periodos</option>';
            sortedUniquePeriods.forEach(p => {
                periodSelect.innerHTML += `<option value="${p}">${p}</option>`;
            });
            if (uniquePeriods.has(prevVal)) {
                periodSelect.value = prevVal;
            } else {
                modalEmployeeDetailPeriod = 'ALL';
                periodSelect.value = 'ALL';
            }
        }
        
        if (conceptSelect) {
            const prevVal = modalEmployeeDetailConcept;
            conceptSelect.innerHTML = '<option value="ALL">Todos los Conceptos</option>';
            sortedUniqueConcepts.forEach(c => {
                conceptSelect.innerHTML += `<option value="${c}">${c}</option>`;
            });
            if (uniqueConcepts.has(prevVal)) {
                conceptSelect.value = prevVal;
            } else {
                modalEmployeeDetailConcept = 'ALL';
                conceptSelect.value = 'ALL';
            }
        }
    }

    function renderModalEmployeeHistoryChart(currentYearData, allYearsData) {
        const ctx = document.getElementById('modal-employee-history-chart');
        if (!ctx) return;
        
        if (modalCharts['empHistory']) {
            modalCharts['empHistory'].destroy();
        }
        
        const isFiltered = selectedYear !== 'ALL';
        const chartData = currentYearData;
        
        const monthlyNet = {};
        chartData.forEach(d => {
            const labelKey = isFiltered ? d.m : `${d.a} - ${d.m}`;
            if (!monthlyNet[labelKey]) {
                monthlyNet[labelKey] = { sortVal: 0, net: 0, dev: 0, desc: 0 };
            }
            
            if (isFiltered) {
                monthlyNet[labelKey].sortVal = MONTH_ORDER[d.m] || 0;
            } else {
                monthlyNet[labelKey].sortVal = (d.a * 100) + (MONTH_ORDER[d.m] || 0);
            }
            
            if (d.na === 'DEVENGO') {
                monthlyNet[labelKey].net += d.v;
                monthlyNet[labelKey].dev += d.v;
            } else if (d.na === 'DESCUENTO') {
                monthlyNet[labelKey].net += d.v;
                monthlyNet[labelKey].desc += Math.abs(d.v);
            }
        });
        
        const sortedKeys = Object.keys(monthlyNet).sort((a,b) => monthlyNet[a].sortVal - monthlyNet[b].sortVal);
        const labels = sortedKeys;
        const netVals = sortedKeys.map(k => monthlyNet[k].net);
        const devVals = sortedKeys.map(k => monthlyNet[k].dev);
        const descVals = sortedKeys.map(k => monthlyNet[k].desc);
        
        modalCharts['empHistory'] = new Chart(ctx, {
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
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 1.5,
                        borderDash: [5, 4],
                        fill: true,
                        tension: 0.35,
                        pointRadius: 0,
                        order: 1
                    },
                    {
                        label: 'Deducciones Totales',
                        data: descVals,
                        borderColor: 'rgba(239, 68, 68, 0.65)',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        borderWidth: 1.5,
                        borderDash: [5, 4],
                        fill: true,
                        tension: 0.35,
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

    function renderModalEmployeeDistributionChart(employeeData) {
        const ctx = document.getElementById('modal-employee-distribution-chart');
        if (!ctx) return;
        
        if (modalCharts['empDistribution']) {
            modalCharts['empDistribution'].destroy();
        }
        
        const concepts = {};
        employeeData.forEach(d => {
            if (!concepts[d.co]) {
                concepts[d.co] = { val: 0, na: d.na };
            }
            concepts[d.co].val += Math.abs(d.v);
        });
        
        const list = Object.keys(concepts).map(name => ({
            name: name,
            val: concepts[name].val,
            na: concepts[name].na
        })).sort((a,b) => b.val - a.val);
        
        const topConcepts = list.slice(0, 7);
        
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
        
        const PASTEL_PALETTE = [
            'rgba(167, 139, 250, 0.80)',
            'rgba(244, 114, 182, 0.80)',
            'rgba(129, 140, 248, 0.80)',
            'rgba(196, 181, 253, 0.80)',
            'rgba(251, 191, 36,  0.80)',
            'rgba(110, 231, 183, 0.80)',
            'rgba(147, 197, 253, 0.80)',
            'rgba(253, 164, 175, 0.80)',
            'rgba(216, 180, 254, 0.80)',
            'rgba(134, 239, 172, 0.80)',
            'rgba(249, 168, 212, 0.80)',
            'rgba(165, 243, 252, 0.80)'
        ];

        const bgColors = topConcepts.map((_, i) => PASTEL_PALETTE[i % PASTEL_PALETTE.length]);
        const borderColors = topConcepts.map(() => '#FFFFFF');
        
        modalCharts['empDistribution'] = new Chart(ctx, {
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

    function renderModalEmployeeDebtChart(currentYearData, allYearsData) {
        const ctx = document.getElementById('modal-employee-debt-chart');
        if (!ctx) return;
        
        if (modalCharts['empDebt']) {
            modalCharts['empDebt'].destroy();
        }
        
        const limitValue = modalDebtLimit;
        
        const isFiltered = selectedYear !== 'ALL';
        const chartData = currentYearData;
        
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
        
        const finalLabels = [...labels];
        const finalDebtRatios = [...debtRatios];
        if (labels.length > 0) {
            const avgRatio = debtRatios.reduce((sum, val) => sum + val, 0) / debtRatios.length;
            finalDebtRatios.push(parseFloat(avgRatio.toFixed(2)));
            finalLabels.push('Promedio');
        }
        
        const recommendedLimit = finalLabels.map(() => limitValue);
        const canvasCtx = ctx.getContext('2d');
        
        const orangeGrad = canvasCtx.createLinearGradient(0, 0, 0, 300);
        orangeGrad.addColorStop(0, '#FF5500');
        orangeGrad.addColorStop(1, 'rgba(255, 153, 0, 0.4)');
        
        const purpleGrad = canvasCtx.createLinearGradient(0, 0, 0, 300);
        purpleGrad.addColorStop(0, '#8B2FEF');
        purpleGrad.addColorStop(1, 'rgba(108, 0, 211, 0.4)');
        
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
        
        modalCharts['empDebt'] = new Chart(ctx, {
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
                        label: `Límite Recomendado (${limitValue}%)`,
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
                                    ctx.fillStyle = '#8B2FEF';
                                } else {
                                    ctx.fillStyle = '#FF5500';
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

    function renderModalEmployeeDetailsTable(employeeData) {
        const tbody = document.getElementById('modal-employee-details-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        let filteredData = employeeData;
        if (modalEmployeeDetailPeriod && modalEmployeeDetailPeriod !== 'ALL') {
            filteredData = filteredData.filter(r => `${r.m}, ${r.a}` === modalEmployeeDetailPeriod);
        }
        if (modalEmployeeDetailConcept && modalEmployeeDetailConcept !== 'ALL') {
            filteredData = filteredData.filter(r => r.co === modalEmployeeDetailConcept);
        }
        
        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay transacciones registradas para este filtro</td></tr>';
            return;
        }
        
        const grouped = {};
        filteredData.forEach(r => {
            const key = `${r.a} - ${r.m}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(r);
        });
        
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
                    totalDesc += r.v;
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
        
        const totalTr = document.createElement('tr');
        totalTr.className = 'total-row';
        totalTr.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        totalTr.style.fontWeight = 'bold';
        totalTr.style.borderTop = '2px solid var(--border-color)';
        
        const grandNet = grandDev + grandDesc;
        const netColor = grandNet >= 0 ? 'var(--text-primary)' : '#EF4444';
        
        const devLabel = grandDev > 0 ? '+' + currencyFormatter.format(grandDev) : '$ 0';
        const descLabel = grandDesc < 0 ? '-' + currencyFormatter.format(Math.abs(grandDesc)) : '$ 0';
        
        totalTr.innerHTML = `
            <td colspan="2" style="color: var(--text-primary); font-weight: bold;">
                Total General
                <span style="margin-left: 12px; font-size: 0.82rem; color: var(--text-muted); font-weight: normal;">Neto: </span>
                <span style="color: ${netColor}; font-size: 0.82rem; font-weight: bold;">${currencyFormatter.format(grandNet)}</span>
            </td>
            <td style="text-align: right; color: #059669; font-weight: bold;">${devLabel}</td>
            <td style="text-align: right; color: #EF4444; font-weight: bold;">${descLabel}</td>
        `;
        tbody.appendChild(totalTr);
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

    const btnConceptExcel = document.getElementById('btn-concept-compare-excel');
    if (btnConceptExcel && !btnConceptExcel.dataset.listenerBound) {
        btnConceptExcel.addEventListener('click', () => {
            exportCompareTableToExcel('concepto');
        });
        btnConceptExcel.dataset.listenerBound = 'true';
    }
}

// Renderiza la tabla de comparación de conceptos jerárquica
function renderConceptComparison() {
    const tbody = document.getElementById('concept-compare-tbody');
    const headerP1 = document.getElementById('concept-period-header-p1');
    const headerP2 = document.getElementById('concept-period-header-p2');
    
    if (!tbody) return;
    const headerCantP1 = document.getElementById('concept-period-header-cant-p1');
    const headerCantP2 = document.getElementById('concept-period-header-cant-p2');
    const p1Label = getPeriodLabel(state.conceptComparePeriod1) || 'P1';
    const p2Label = getPeriodLabel(state.conceptComparePeriod2) || 'P2';
    
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas con ordenación
    const headerName = document.getElementById('concept-header-name');
    const headerDiff = document.getElementById('concept-header-diff');
    const headerPct = document.getElementById('concept-header-pct');
    
    if (headerName) headerName.innerHTML = getHeaderSortHTML('Concepto', 'name', state.conceptSortColumn, state.conceptSortDirection, false);
    if (headerCantP1) headerCantP1.innerHTML = getHeaderSortHTML('Cant ' + p1Label, 'cant1', state.conceptSortColumn, state.conceptSortDirection, true);
    if (headerP1) headerP1.innerHTML = getHeaderSortHTML('Valor ' + p1Label, 'p1', state.conceptSortColumn, state.conceptSortDirection, true);
    if (headerCantP2) headerCantP2.innerHTML = getHeaderSortHTML('Cant ' + p2Label, 'cant2', state.conceptSortColumn, state.conceptSortDirection, true);
    if (headerP2) headerP2.innerHTML = getHeaderSortHTML('Valor ' + p2Label, 'p2', state.conceptSortColumn, state.conceptSortDirection, true);
    if (headerDiff) headerDiff.innerHTML = getHeaderSortHTML('Variación', 'diff', state.conceptSortColumn, state.conceptSortDirection, true);
    if (headerPct) headerPct.innerHTML = getHeaderSortHTML('%', 'pct', state.conceptSortColumn, state.conceptSortDirection, true);

    tbody.innerHTML = '';
    
    if (!state.conceptComparePeriod1 || !state.conceptComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    // 1. Filtrar registros para Periodo 1 y Periodo 2
    let dataP1 = filterDataByPeriod(state.conceptComparePeriod1);
    let dataP2 = filterDataByPeriod(state.conceptComparePeriod2);
    
    // Filtro por Centro de Costo
    const selectedCecos = state.conceptCompareSelectedCecos || [];
    if (selectedCecos.length > 0) {
        dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
        dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
    }
    
    // 2. Obtener lista única de todos los conceptos
    const allConcepts = [...new Set(state.data.map(d => d.co))];
    
    // Filtrar conceptos por selección si aplica
    const selectedConcepts = state.conceptCompareSelectedConcepts || [];
    const filteredConcepts = allConcepts.filter(co => {
        if (selectedConcepts.length === 0) return true;
        return selectedConcepts.includes(co);
    });
    
    if (filteredConcepts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">No se encontraron conceptos que coincidan con los filtros seleccionados</td></tr>';
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
        const p1EmployeesCant = {};
        const p2Employees = {};
        const p2EmployeesCant = {};
        const allEmployeesInConcept = new Set();
        let conceptNature = 'DEVENGO'; // Predeterminado
        let conceptType = 'Otros';
        
        p1Rows.forEach(r => {
            p1Employees[r.c] = (p1Employees[r.c] || 0) + r.v;
            p1EmployeesCant[r.c] = (p1EmployeesCant[r.c] || 0) + (r.cant || 0);
            allEmployeesInConcept.add(r.c);
            conceptNature = r.na;
            conceptType = r.t;
        });
        
        p2Rows.forEach(r => {
            p2Employees[r.c] = (p2Employees[r.c] || 0) + r.v;
            p2EmployeesCant[r.c] = (p2EmployeesCant[r.c] || 0) + (r.cant || 0);
            allEmployeesInConcept.add(r.c);
            conceptNature = r.na;
            conceptType = r.t;
        });
        
        // Calcular sumas agregadas
        let totalP1 = 0;
        let totalP1Cant = 0;
        let totalP2 = 0;
        let totalP2Cant = 0;
        
        Object.keys(p1Employees).forEach(c => {
            totalP1 += p1Employees[c];
            totalP1Cant += p1EmployeesCant[c] || 0;
        });
        Object.keys(p2Employees).forEach(c => {
            totalP2 += p2Employees[c];
            totalP2Cant += p2EmployeesCant[c] || 0;
        });
        
        const conceptDiff = totalP2 - totalP1;
        const conceptPct = totalP1 !== 0 ? (conceptDiff / Math.abs(totalP1)) * 100 : (conceptDiff > 0 ? 100.0 : (conceptDiff < 0 ? -100.0 : 0));
        
        const employeeBreakdown = [];
        allEmployeesInConcept.forEach(c => {
            const ev1 = p1Employees[c] || 0;
            const ecant1 = p1EmployeesCant[c] || 0;
            const ev2 = p2Employees[c] || 0;
            const ecant2 = p2EmployeesCant[c] || 0;
            const ediff = ev2 - ev1;
            const epct = ev1 !== 0 ? (ediff / Math.abs(ev1)) * 100 : (ediff > 0 ? 100.0 : (ediff < 0 ? -100.0 : 0));
            
            employeeBreakdown.push({
                cedula: c,
                name: employeeNames[c] || 'Desconocido',
                v1: ev1,
                cant1: ecant1,
                v2: ev2,
                cant2: ecant2,
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
            cant1: totalP1Cant,
            v2: totalP2,
            cant2: totalP2Cant,
            diff: conceptDiff,
            pct: conceptPct,
            employees: employeeBreakdown
        });
    });
    
    // Ordenar conceptos según el estado o por defecto
    const sortCol = state.conceptSortColumn || 'default';
    const sortDir = state.conceptSortDirection || 'asc';
    
    if (sortCol !== 'default' && sortCol !== 'name') {
        conceptDataList.sort((a, b) => {
            let valA, valB;
            if (sortCol === 'p1') {
                valA = a.v1;
                valB = b.v1;
            } else if (sortCol === 'p2') {
                valA = a.v2;
                valB = b.v2;
            } else if (sortCol === 'diff') {
                valA = a.diff;
                valB = b.diff;
            } else if (sortCol === 'pct') {
                valA = a.pct;
                valB = b.pct;
            } else if (sortCol === 'cant1') {
                valA = a.cant1;
                valB = b.cant1;
            } else if (sortCol === 'cant2') {
                valA = a.cant2;
                valB = b.cant2;
            } else {
                return 0;
            }
            return sortDir === 'asc' ? valA - valB : valB - valA;
        });
    } else if (sortCol === 'name') {
        conceptDataList.sort((a, b) => {
            return sortDir === 'asc' ? a.co.localeCompare(b.co) : b.co.localeCompare(a.co);
        });
    } else {
        // Ordenar por defecto: DEVENGO (1), DESCUENTO (2), BENEFICIO (3), y luego por variación absoluta decreciente
        const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2, 'BENEFICIO': 3 };
        conceptDataList.sort((a, b) => {
            const ordA = natOrder[a.na] || 99;
            const ordB = natOrder[b.na] || 99;
            if (ordA !== ordB) return ordA - ordB;
            return Math.abs(b.diff) - Math.abs(a.diff); // de mayor variación absoluta a menor
        });
    }
    
    if (conceptDataList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">No hay transacciones registradas para este rango de periodos</td></tr>';
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
            <td style="text-align: right; font-weight: normal;">${item.v1 !== 0 ? Math.round(item.cant1) : "—"}</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(item.v1)}</td>
            <td style="text-align: right; font-weight: normal;">${item.v2 !== 0 ? Math.round(item.cant2) : "—"}</td>
            <td style="text-align: right; font-weight: normal;">${currencyFormatter.format(item.v2)}</td>
            <td style="text-align: right;">${formatVariationHTML(item.diff)}</td>
            <td style="text-align: right;">${formatVariationHTML(item.pct, true)}</td>
            <td>
                <button class="btn-analyze btn-analyze-concept" data-concept="${encodeURIComponent(coName)}" data-nature="${item.na}" title="Revisar variaciones">
                    <i data-lucide="eye" style="width:14px;height:14px;"></i>
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
                <td style="text-align: right;">${emp.v1 !== 0 ? Math.round(emp.cant1) : "—"}</td>
                <td style="text-align: right;">${emp.v1 !== 0 ? currencyFormatter.format(emp.v1) : '-'}</td>
                <td style="text-align: right;">${emp.v2 !== 0 ? Math.round(emp.cant2) : "—"}</td>
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

    // Renderizar fila TOTAL en la parte inferior de la tabla
    (function renderConceptTableTotalsRow() {
        let sumV1 = 0, sumV2 = 0;
        conceptDataList.forEach(c => { if (c.na === 'DEVENGO' || c.na === 'DESCUENTO') { sumV1 += c.v1; sumV2 += c.v2; } });
        const sumDiff = sumV2 - sumV1;
        const sumPct  = sumV1 !== 0 ? (sumDiff / Math.abs(sumV1)) * 100 : (sumDiff > 0 ? 100 : (sumDiff < 0 ? -100 : 0));

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.6px; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: var(--text-primary);"><strong>TOTAL</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumV1)}</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumV2)}</strong></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumDiff).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumPct, true).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
        `;
        tbody.appendChild(totalRow);
    })();
    
    // Bind Analizar buttons (Concepts)
    document.querySelectorAll('.btn-analyze-concept').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const coName = decodeURIComponent(btn.getAttribute('data-concept'));
            const nature = btn.getAttribute('data-nature');
            showConceptAnalysisModal(coName, nature, state.conceptComparePeriod1, state.conceptComparePeriod2);
        });
    });
    
    // Renderizar fila TOTAL en el pie de la tabla


    // Actualizar Tarjetas Resumen (Conceptos)
    (function updateConceptSummaryCards() {
        const totalEl     = document.getElementById('concept-stat-total');
        const totalSubEl  = document.getElementById('concept-stat-total-sub');
        const highNameEl  = document.getElementById('concept-stat-highest-name');
        const highValEl   = document.getElementById('concept-stat-highest-val');
        const savNameEl   = document.getElementById('concept-stat-savings-name');
        const savValEl    = document.getElementById('concept-stat-savings-val');
        const payrollEl   = document.getElementById('concept-stat-total-payroll');
        const payrollSubEl= document.getElementById('concept-stat-total-payroll-sub');
        if (!totalEl) return;

        const p1LabelC = getPeriodLabel(state.conceptComparePeriod1) || 'P1';
        const countP2 = conceptDataList.filter(c => c.v2 !== 0).length;
        const countP1 = conceptDataList.filter(c => c.v1 !== 0).length;
        const diffCount = countP2 - countP1;
        totalEl.innerText = countP2;

        if (diffCount > 0) {
            totalSubEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${diffCount} respecto a ${p1LabelC}</span>`;
        } else if (diffCount < 0) {
            totalSubEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${diffCount} respecto a ${p1LabelC}</span>`;
        } else {
            totalSubEl.innerHTML = `<span>Sin cambios respecto a ${p1LabelC}</span>`;
        }

        // Mayor incremento
        let topIncrease = null, maxDiff = 0;
        conceptDataList.forEach(c => { if (c.diff > maxDiff) { maxDiff = c.diff; topIncrease = c; } });
        if (topIncrease) {
            const shortName = topIncrease.co.length > 20 ? topIncrease.co.substring(0, 18) + '…' : topIncrease.co;
            highNameEl.innerHTML = `<span title="${topIncrease.co}" style="text-transform:uppercase;">${shortName}</span>`;
            highValEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${topIncrease.pct.toFixed(1)}%</span> (+${currencyFormatter.format(topIncrease.diff)})`;
        } else {
            highNameEl.innerText = '-'; highValEl.innerText = 'Sin incrementos';
        }

        // Mayor ahorro
        let topSavings = null, minDiff = 0;
        conceptDataList.forEach(c => { if (c.diff < minDiff) { minDiff = c.diff; topSavings = c; } });
        if (topSavings) {
            const shortName = topSavings.co.length > 20 ? topSavings.co.substring(0, 18) + '…' : topSavings.co;
            savNameEl.innerHTML = `<span title="${topSavings.co}" style="text-transform:uppercase;">${shortName}</span>`;
            savValEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${topSavings.pct.toFixed(1)}%</span> (${currencyFormatter.format(topSavings.diff)})`;
        } else {
            savNameEl.innerText = '-'; savValEl.innerText = 'Sin ahorros';
        }

        // Nómina comparada
        let totalV1 = 0, totalV2 = 0;
        conceptDataList.forEach(c => { if (c.na === 'DEVENGO' || c.na === 'DESCUENTO') { totalV1 += c.v1; totalV2 += c.v2; } });
        const totalDiff = totalV2 - totalV1;
        const totalPct  = totalV1 !== 0 ? (totalDiff / Math.abs(totalV1)) * 100 : (totalDiff > 0 ? 100 : (totalDiff < 0 ? -100 : 0));
        const totalSign = totalDiff > 0 ? '+' : '';
        const totalColor = totalDiff > 0 ? '#10b981' : (totalDiff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const totalIcon  = totalDiff > 0 ? 'trending-up' : (totalDiff < 0 ? 'trending-down' : 'minus');
        payrollEl.innerHTML = `<strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P1:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalV1)}</span><br><strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P2:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalV2)}</span>`;
        payrollEl.style.fontSize = '1.05rem';
        payrollEl.style.lineHeight = '1.35';
        payrollSubEl.innerHTML = `Dif: <span style="color:${totalColor};font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="${totalIcon}" style="width:12px;height:12px;"></i> ${totalSign}${currencyFormatter.format(totalDiff)} (${totalSign}${totalPct.toFixed(2)}%)</span>`;
    })();

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Listeners para botones de ordenación
    document.querySelectorAll('#concept-header-name .small-sort-btn, #concept-period-header-cant-p1 .small-sort-btn, #concept-period-header-p1 .small-sort-btn, #concept-period-header-cant-p2 .small-sort-btn, #concept-period-header-p2 .small-sort-btn, #concept-header-diff .small-sort-btn, #concept-header-pct .small-sort-btn')
        .forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = btn.getAttribute('data-col');
                if (state.conceptSortColumn === col) {
                    state.conceptSortDirection = state.conceptSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.conceptSortColumn = col;
                    state.conceptSortDirection = 'desc'; // Por defecto de mayor a menor
                }
                renderConceptComparison();
            });
        });
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

    const btnCecoReport = document.getElementById('btn-ceco-compare-report');
    if (btnCecoReport && !btnCecoReport.dataset.listenerBound) {
        btnCecoReport.addEventListener('click', () => {
            generateManagerialReport('ceco');
        });
        btnCecoReport.dataset.listenerBound = 'true';
    }

    const btnCecoExcel = document.getElementById('btn-ceco-compare-excel');
    if (btnCecoExcel && !btnCecoExcel.dataset.listenerBound) {
        btnCecoExcel.addEventListener('click', () => {
            exportCompareTableToExcel('ceco');
        });
        btnCecoExcel.dataset.listenerBound = 'true';
    }
}

function renderCecoComparison() {
    const tbody = document.getElementById('ceco-compare-tbody');
    const headerP1 = document.getElementById('ceco-compare-header-p1');
    const headerP2 = document.getElementById('ceco-compare-header-p2');
    if (!tbody) return;
    const headerCantP1 = document.getElementById('ceco-compare-header-cant-p1');
    const headerCantP2 = document.getElementById('ceco-compare-header-cant-p2');
    const p1Label = getPeriodLabel(state.cecoComparePeriod1) || 'P1';
    const p2Label = getPeriodLabel(state.cecoComparePeriod2) || 'P2';
    
    if (!tbody) return;
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas con ordenación
    const headerName = document.getElementById('ceco-compare-header-name');
    const headerDiff = document.getElementById('ceco-compare-header-diff');
    const headerPct = document.getElementById('ceco-compare-header-pct');
    
    if (headerName) headerName.innerHTML = getHeaderSortHTML('Centro de Costo', 'name', state.cecoSortColumn, state.cecoSortDirection, false);
    if (headerCantP1) headerCantP1.innerHTML = getHeaderSortHTML('Cant ' + p1Label, 'cant1', state.cecoSortColumn, state.cecoSortDirection, true);
    if (headerP1) headerP1.innerHTML = getHeaderSortHTML('Valor ' + p1Label, 'p1', state.cecoSortColumn, state.cecoSortDirection, true);
    if (headerCantP2) headerCantP2.innerHTML = getHeaderSortHTML('Cant ' + p2Label, 'cant2', state.cecoSortColumn, state.cecoSortDirection, true);
    if (headerP2) headerP2.innerHTML = getHeaderSortHTML('Valor ' + p2Label, 'p2', state.cecoSortColumn, state.cecoSortDirection, true);
    if (headerDiff) headerDiff.innerHTML = getHeaderSortHTML('Variación', 'diff', state.cecoSortColumn, state.cecoSortDirection, true);
    if (headerPct) headerPct.innerHTML = getHeaderSortHTML('%', 'pct', state.cecoSortColumn, state.cecoSortDirection, true);
    
    tbody.innerHTML = '';
    
    if (!state.cecoComparePeriod1 || !state.cecoComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
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
    });
    
    if (filteredCecos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">No se encontraron centros de costo que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    const cecoStatsList = [];
    filteredCecos.forEach(cecoKey => {
        const p1RowsCeco = dataP1.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
        const p2RowsCeco = dataP2.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
        if (p1RowsCeco.length === 0 && p2RowsCeco.length === 0) return;
        
        // Totales del CECO
        const cecoTotals = { DEVENGO: {p1:0,p2:0,c1:0,c2:0}, DESCUENTO: {p1:0,p2:0,c1:0,c2:0} };
        p1RowsCeco.forEach(r => { if (cecoTotals[r.na]) { cecoTotals[r.na].p1 += r.v; cecoTotals[r.na].c1 += (r.cant || 0); } });
        p2RowsCeco.forEach(r => { if (cecoTotals[r.na]) { cecoTotals[r.na].p2 += r.v; cecoTotals[r.na].c2 += (r.cant || 0); } });
        
        const cecoNetP1 = cecoTotals.DEVENGO.p1 + cecoTotals.DESCUENTO.p1;
        const cecoNetP2 = cecoTotals.DEVENGO.p2 + cecoTotals.DESCUENTO.p2;
        const cecoCantP1 = cecoTotals.DEVENGO.c1 + cecoTotals.DESCUENTO.c1;
        const cecoCantP2 = cecoTotals.DEVENGO.c2 + cecoTotals.DESCUENTO.c2;
        
        const cecoNetDiff = cecoNetP2 - cecoNetP1;
        const cecoNetPct = cecoNetP1 !== 0 ? (cecoNetDiff / Math.abs(cecoNetP1)) * 100 : (cecoNetDiff > 0 ? 100 : (cecoNetDiff < 0 ? -100 : 0));
        
        cecoStatsList.push({
            name: cecoKey,
            p1: cecoNetP1,
            p2: cecoNetP2,
            cant1: cecoCantP1,
            cant2: cecoCantP2,
            diff: cecoNetDiff,
            pct: cecoNetPct,
            p1RowsCeco: p1RowsCeco,
            p2RowsCeco: p2RowsCeco
        });
    });

    // Ordenar cecoStatsList según la columna y dirección
    const sortCol = state.cecoSortColumn || 'name';
    const sortDir = state.cecoSortDirection || 'asc';
    cecoStatsList.sort((a, b) => {
        let valA, valB;
        if (sortCol === 'name') {
            valA = a.name;
            valB = b.name;
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortCol === 'p1') {
            valA = a.p1;
            valB = b.p1;
        } else if (sortCol === 'p2') {
            valA = a.p2;
            valB = b.p2;
        } else if (sortCol === 'diff') {
            valA = a.diff;
            valB = b.diff;
        } else if (sortCol === 'pct') {
            valA = a.pct;
            valB = b.pct;
        } else if (sortCol === 'cant1') {
            valA = a.cant1;
            valB = b.cant1;
        } else if (sortCol === 'cant2') {
            valA = a.cant2;
            valB = b.cant2;
        } else {
            return 0;
        }
        return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    cecoStatsList.forEach(cecoItem => {
        const cecoKey = cecoItem.name;
        const cecoNetP1 = cecoItem.p1;
        const cecoNetP2 = cecoItem.p2;
        const cecoNetDiff = cecoItem.diff;
        const cecoNetPct = cecoItem.pct;
        const p1RowsCeco = cecoItem.p1RowsCeco;
        const p2RowsCeco = cecoItem.p2RowsCeco;
        const cecoSafe = cecoKey.replace(/[^a-zA-Z0-9]/g, '_');
        
        // NIVEL 1: CECO
        const cecoRow = document.createElement('tr');
        cecoRow.className = `employee-row ${state.cecoCompareExpanded ? 'expanded' : ''}`;
        cecoRow.setAttribute('data-row-key', cecoSafe);
        cecoRow.innerHTML = `
            <td><i data-lucide="chevron-right" class="expand-chevron"></i><span>${cecoKey}</span></td>
            <td>-</td><td>-</td><td>-</td>
            <td style="text-align:right; color:var(--text-muted);">-</td>
            <td style="text-align:right;">${currencyFormatter.format(cecoNetP1)}</td>
            <td style="text-align:right; color:var(--text-muted);">-</td>
            <td style="text-align:right;">${currencyFormatter.format(cecoNetP2)}</td>
            <td style="text-align:right;">${formatVariationHTML(cecoNetDiff)}</td>
            <td style="text-align:right;">${formatVariationHTML(cecoNetPct, true)}</td>
            <td style="text-align:center;">
                <button class="btn-analyze btn-analyze-ceco" data-ceco="${encodeURIComponent(cecoKey)}" title="Revisar variaciones">
                    <i data-lucide="eye" style="width:14px;height:14px;"></i>
                </button>
            </td>
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
            
            const pTotals = { DEVENGO: {p1:0,p2:0,c1:0,c2:0}, DESCUENTO: {p1:0,p2:0,c1:0,c2:0} };
            persP1.forEach(r => { if (pTotals[r.na]) { pTotals[r.na].p1 += r.v; pTotals[r.na].c1 += (r.cant || 0); } });
            persP2.forEach(r => { if (pTotals[r.na]) { pTotals[r.na].p2 += r.v; pTotals[r.na].c2 += (r.cant || 0); } });
            const pNetP1 = pTotals.DEVENGO.p1 + pTotals.DESCUENTO.p1;
            const pNetP2 = pTotals.DEVENGO.p2 + pTotals.DESCUENTO.p2;
            const pCantP1 = pTotals.DEVENGO.c1 + pTotals.DESCUENTO.c1;
            const pCantP2 = pTotals.DEVENGO.c2 + pTotals.DESCUENTO.c2;
            
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
                <td style="text-align:right; color:var(--text-muted);">-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP1)}</td>
                <td style="text-align:right; color:var(--text-muted);">-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP2)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetDiff)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetPct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(personRow);
            
            // NIVEL 3: Conceptos del trabajador en este CECO
            const pConceptsMeta = {};
            const pC1 = {}, pC2 = {}, pC1Cant = {}, pC2Cant = {};
            persP1.forEach(r => { pC1[r.co] = (pC1[r.co]||0) + r.v; pC1Cant[r.co] = (pC1Cant[r.co]||0) + (r.cant || 0); pConceptsMeta[r.co] = {na: r.na}; });
            persP2.forEach(r => { pC2[r.co] = (pC2[r.co]||0) + r.v; pC2Cant[r.co] = (pC2Cant[r.co]||0) + (r.cant || 0); pConceptsMeta[r.co] = {na: r.na}; });
            const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2 };
            const personConcepts = Object.keys(pConceptsMeta).sort((a, b) => {
                const oA = natOrder[pConceptsMeta[a].na]||99, oB = natOrder[pConceptsMeta[b].na]||99;
                return oA !== oB ? oA - oB : a.localeCompare(b);
            });
            personConcepts.forEach(co => {
                const v1 = pC1[co]||0, v2 = pC2[co]||0, diff = v2-v1;
                const cant1 = pC1Cant[co]||0, cant2 = pC2Cant[co]||0;
                const cPct = v1 !== 0 ? (diff/Math.abs(v1))*100 : (diff>0?100:(diff<0?-100:0));
                const na = pConceptsMeta[co].na;
                const conRow = document.createElement('tr');
                conRow.className = `concept-row child-of-${personSafe} collapsed-row`;
                conRow.innerHTML = `
                    <td></td><td></td>
                    <td><span class="badge badge-${na.toLowerCase()}">${na}</span></td>
                    <td>${co}</td>
                    <td style="text-align:right;">${v1!==0 ? Math.round(cant1) : "—"}</td>
                    <td style="text-align:right;">${v1!==0?currencyFormatter.format(v1):'-'}</td>
                    <td style="text-align:right;">${v2!==0 ? Math.round(cant2) : "—"}</td>
                    <td style="text-align:right;">${v2!==0?currencyFormatter.format(v2):'-'}</td>
                    <td style="text-align:right;">${formatVariationHTML(diff)}</td>
                    <td style="text-align:right;">${formatVariationHTML(cPct,true)}</td>
                    <td></td>
                `;
                tbody.appendChild(conRow);
            });
            
            // Click trabajador &rarr; mostrar/ocultar sus conceptos
            personRow.addEventListener('click', () => {
                personRow.classList.toggle('expanded');
                const isExp = personRow.classList.contains('expanded');
                document.querySelectorAll(`.child-of-${personSafe}`).forEach(c => c.classList.toggle('collapsed-row', !isExp));
            });
        });
        
        // Click CECO &rarr; mostrar/ocultar trabajadores (colapsa sus sub-hijos también)
        cecoRow.addEventListener('click', (e) => {
            if (e.target.closest('.btn-analyze')) return;
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

    // Renderizar fila TOTAL en la parte inferior de la tabla
    (function renderCecoTableTotalsRow() {
        let sumP1 = 0, sumP2 = 0;
        cecoStatsList.forEach(c => { sumP1 += c.p1; sumP2 += c.p2; });
        const sumDiff = sumP2 - sumP1;
        const sumPct = sumP1 !== 0 ? (sumDiff / Math.abs(sumP1)) * 100 : (sumDiff > 0 ? 100 : (sumDiff < 0 ? -100 : 0));

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.6px; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: var(--text-primary);"><strong>TOTAL</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP1)}</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP2)}</strong></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumDiff).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumPct, true).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
        `;
        tbody.appendChild(totalRow);
    })();
    
    // Bind Analizar buttons (CECO)
    document.querySelectorAll('.btn-analyze-ceco').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cecoName = decodeURIComponent(btn.getAttribute('data-ceco'));
            showCecoAnalysisModal(cecoName, state.cecoComparePeriod1, state.cecoComparePeriod2);
        });
    });
    
    // Actualizar Tarjetas Resumen (Compactas y en Español)
    (function updateSummaryCards() {
        const totalCecosEl = document.getElementById('ceco-stat-total');
        const totalSubEl = document.getElementById('ceco-stat-total-sub');
        const highestNameEl = document.getElementById('ceco-stat-highest-name');
        const highestValEl = document.getElementById('ceco-stat-highest-val');
        const savingsNameEl = document.getElementById('ceco-stat-savings-name');
        const savingsValEl = document.getElementById('ceco-stat-savings-val');
        const totalPayrollEl = document.getElementById('ceco-stat-total-payroll');
        const totalPayrollSubEl = document.getElementById('ceco-stat-total-payroll-sub');

        if (!totalCecosEl || !totalSubEl || !highestNameEl || !highestValEl || !savingsNameEl || !savingsValEl || !totalPayrollEl || !totalPayrollSubEl) {
            return;
        }

        const countP1 = cecoStatsList.filter(c => c.p1 !== 0).length;
        const countP2 = cecoStatsList.filter(c => c.p2 !== 0).length;
        const diffCecos = countP2 - countP1;

        totalCecosEl.innerText = countP2;

        let totalSubHTML = '';
        if (diffCecos > 0) {
            totalSubHTML = `<span style="color:#10b981; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-up" style="width:12px; height:12px;"></i> +${diffCecos} respecto a ${p1Label}</span>`;
        } else if (diffCecos < 0) {
            totalSubHTML = `<span style="color:#ef4444; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-down" style="width:12px; height:12px;"></i> ${diffCecos} respecto a ${p1Label}</span>`;
        } else {
            totalSubHTML = `<span>Sin cambios respecto a ${p1Label}</span>`;
        }
        totalSubEl.innerHTML = totalSubHTML;

        // 1. Mayor Incremento (CECO con mayor diff positivo)
        let worstWarningCeco = null;
        let maxDiff = 0;
        cecoStatsList.forEach(c => {
            if (c.diff > maxDiff) {
                maxDiff = c.diff;
                worstWarningCeco = c;
            }
        });

        if (worstWarningCeco) {
            const parts = worstWarningCeco.name.split(' - ');
            const codeOnly = parts[0];
            const nameOnly = parts.length > 1 ? parts[1] : '';
            highestNameEl.innerHTML = `${codeOnly} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">(${nameOnly})</span>`;
            // Positivo -> Verde (#10b981)
            highestValEl.innerHTML = `<span style="color:#10b981; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-up" style="width:12px; height:12px;"></i> +${worstWarningCeco.pct.toFixed(1)}%</span> (+${currencyFormatter.format(worstWarningCeco.diff)})`;
        } else {
            highestNameEl.innerText = '-';
            highestValEl.innerText = 'Sin incrementos';
        }

        // 2. Mayor Ahorro (CECO con mayor diff negativo)
        let bestSavingsCeco = null;
        let minDiff = 0;
        cecoStatsList.forEach(c => {
            if (c.diff < minDiff) {
                minDiff = c.diff;
                bestSavingsCeco = c;
            }
        });

        if (bestSavingsCeco) {
            const parts = bestSavingsCeco.name.split(' - ');
            const codeOnly = parts[0];
            const nameOnly = parts.length > 1 ? parts[1] : '';
            savingsNameEl.innerHTML = `${codeOnly} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">(${nameOnly})</span>`;
            // Negativo -> Rojo (#ef4444)
            savingsValEl.innerHTML = `<span style="color:#ef4444; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="trending-down" style="width:12px; height:12px;"></i> ${bestSavingsCeco.pct.toFixed(1)}%</span> (${currencyFormatter.format(bestSavingsCeco.diff)})`;
        } else {
            savingsNameEl.innerText = '-';
            savingsValEl.innerText = 'Sin ahorros';
        }

        // 3. Nómina Comparada (Suma P1, Suma P2 y variación)
        let totalP1 = 0;
        let totalP2 = 0;
        cecoStatsList.forEach(c => {
            totalP1 += c.p1;
            totalP2 += c.p2;
        });
        const totalDiff = totalP2 - totalP1;
        const totalPct = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : (totalDiff > 0 ? 100 : (totalDiff < 0 ? -100 : 0));

        // P1 y P2 en negrita, valores sin negrita
        totalPayrollEl.innerHTML = `
            <strong style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">P1:</strong> <span style="font-weight: normal;">${currencyFormatter.format(totalP1)}</span><br>
            <strong style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">P2:</strong> <span style="font-weight: normal;">${currencyFormatter.format(totalP2)}</span>
        `;
        totalPayrollEl.style.fontSize = '1.05rem';
        totalPayrollEl.style.lineHeight = '1.35';
        
        let totalPayrollSubHTML = '';
        const totalSign = totalDiff > 0 ? '+' : '';
        // Positivo = Verde (#10b981), Negativo = Rojo (#ef4444)
        const totalColor = totalDiff > 0 ? '#10b981' : (totalDiff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const totalIcon = totalDiff > 0 ? 'trending-up' : (totalDiff < 0 ? 'trending-down' : 'minus');

        totalPayrollSubHTML = `Dif: <span style="color:${totalColor}; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="${totalIcon}" style="width:12px; height:12px;"></i> ${totalSign}${currencyFormatter.format(totalDiff)} (${totalSign}${totalPct.toFixed(2)}%)</span>`;
        totalPayrollSubEl.innerHTML = totalPayrollSubHTML;
    })();

    // Renderizar Totales en la Barra de Pie de Tabla (Fuera de la Tabla)


    if (window.lucide) window.lucide.createIcons();

    // Listeners para botones de ordenación
    document.querySelectorAll('#ceco-compare-header-name .small-sort-btn, #ceco-compare-header-cant-p1 .small-sort-btn, #ceco-compare-header-p1 .small-sort-btn, #ceco-compare-header-cant-p2 .small-sort-btn, #ceco-compare-header-p2 .small-sort-btn, #ceco-compare-header-diff .small-sort-btn, #ceco-compare-header-pct .small-sort-btn')
        .forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = btn.getAttribute('data-col');
                if (state.cecoSortColumn === col) {
                    state.cecoSortDirection = state.cecoSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.cecoSortColumn = col;
                    state.cecoSortDirection = 'desc'; // Por defecto de mayor a menor
                }
                renderCecoComparison();
            });
        });
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

    const btnCargoReport = document.getElementById('btn-cargo-compare-report');
    if (btnCargoReport && !btnCargoReport.dataset.listenerBound) {
        btnCargoReport.addEventListener('click', () => {
            generateManagerialReport('cargo');
        });
        btnCargoReport.dataset.listenerBound = 'true';
    }

    const btnCargoExcel = document.getElementById('btn-cargo-compare-excel');
    if (btnCargoExcel && !btnCargoExcel.dataset.listenerBound) {
        btnCargoExcel.addEventListener('click', () => {
            exportCompareTableToExcel('cargo');
        });
        btnCargoExcel.dataset.listenerBound = 'true';
    }
}

function renderCargoComparison() {
    const tbody = document.getElementById('cargo-compare-tbody');
    const headerP1 = document.getElementById('cargo-compare-header-p1');
    const headerP2 = document.getElementById('cargo-compare-header-p2');
    if (!tbody) return;
    const headerCantP1 = document.getElementById('cargo-compare-header-cant-p1');
    const headerCantP2 = document.getElementById('cargo-compare-header-cant-p2');
    const p1Label = getPeriodLabel(state.cargoComparePeriod1) || 'P1';
    const p2Label = getPeriodLabel(state.cargoComparePeriod2) || 'P2';
    
    // Actualizar etiquetas visuales de los filtros
    updatePeriodSelectorLabels();
    updateSearchSelectorLabels();
    
    // Actualizar cabeceras de columnas con ordenación
    const headerName = document.getElementById('cargo-compare-header-name');
    const headerDiff = document.getElementById('cargo-compare-header-diff');
    const headerPct = document.getElementById('cargo-compare-header-pct');
    
    if (headerName) headerName.innerHTML = getHeaderSortHTML('Cargo', 'name', state.cargoSortColumn, state.cargoSortDirection, false);
    if (headerCantP1) headerCantP1.innerHTML = getHeaderSortHTML('Cant ' + p1Label, 'cant1', state.cargoSortColumn, state.cargoSortDirection, true);
    if (headerP1) headerP1.innerHTML = getHeaderSortHTML('Valor ' + p1Label, 'p1', state.cargoSortColumn, state.cargoSortDirection, true);
    if (headerCantP2) headerCantP2.innerHTML = getHeaderSortHTML('Cant ' + p2Label, 'cant2', state.cargoSortColumn, state.cargoSortDirection, true);
    if (headerP2) headerP2.innerHTML = getHeaderSortHTML('Valor ' + p2Label, 'p2', state.cargoSortColumn, state.cargoSortDirection, true);
    if (headerDiff) headerDiff.innerHTML = getHeaderSortHTML('Variación', 'diff', state.cargoSortColumn, state.cargoSortDirection, true);
    if (headerPct) headerPct.innerHTML = getHeaderSortHTML('%', 'pct', state.cargoSortColumn, state.cargoSortDirection, true);
    
    tbody.innerHTML = '';
    
    if (!state.cargoComparePeriod1 || !state.cargoComparePeriod2) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Selecciona los periodos arriba</td></tr>';
        return;
    }
    
    let dataP1 = filterDataByPeriod(state.cargoComparePeriod1);
    let dataP2 = filterDataByPeriod(state.cargoComparePeriod2);
    
    // Filtro por Centro de Costo
    const selectedCecos = state.cargoCompareSelectedCecos || [];
    if (selectedCecos.length > 0) {
        dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
        dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
    }
    
    const cargosSet = new Set();
    [...dataP1, ...dataP2].forEach(d => { if (d.cg) cargosSet.add(d.cg); });
    
    // Filtrar cargos por selección si aplica
    const selectedCargos = state.cargoCompareSelectedCargos || [];
    const filteredCargos = [...cargosSet].filter(c => {
        if (selectedCargos.length === 0) return true;
        return selectedCargos.includes(c);
    });
    
    if (filteredCargos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">No se encontraron cargos que coincidan con los filtros seleccionados</td></tr>';
        return;
    }
    
    const cargoStatsList = [];
    filteredCargos.forEach(cargo => {
        const p1RowsCargo = dataP1.filter(d => d.cg === cargo);
        const p2RowsCargo = dataP2.filter(d => d.cg === cargo);
        if (p1RowsCargo.length === 0 && p2RowsCargo.length === 0) return;
        
        const cargoTotals = { DEVENGO: {p1:0,p2:0,c1:0,c2:0}, DESCUENTO: {p1:0,p2:0,c1:0,c2:0} };
        p1RowsCargo.forEach(r => { if (cargoTotals[r.na]) { cargoTotals[r.na].p1 += r.v; cargoTotals[r.na].c1 += (r.cant || 0); } });
        p2RowsCargo.forEach(r => { if (cargoTotals[r.na]) { cargoTotals[r.na].p2 += r.v; cargoTotals[r.na].c2 += (r.cant || 0); } });
        const cargoNetP1 = cargoTotals.DEVENGO.p1 + cargoTotals.DESCUENTO.p1;
        const cargoNetP2 = cargoTotals.DEVENGO.p2 + cargoTotals.DESCUENTO.p2;
        const cargoCantP1 = cargoTotals.DEVENGO.c1 + cargoTotals.DESCUENTO.c1;
        const cargoCantP2 = cargoTotals.DEVENGO.c2 + cargoTotals.DESCUENTO.c2;
        const cargoNetDiff = cargoNetP2 - cargoNetP1;
        const cargoNetPct = cargoNetP1 !== 0 ? (cargoNetDiff / Math.abs(cargoNetP1)) * 100 : (cargoNetDiff > 0 ? 100 : (cargoNetDiff < 0 ? -100 : 0));
        
        cargoStatsList.push({
            cargo: cargo,
            p1: cargoNetP1,
            p2: cargoNetP2,
            cant1: cargoCantP1,
            cant2: cargoCantP2,
            diff: cargoNetDiff,
            pct: cargoNetPct,
            p1RowsCargo: p1RowsCargo,
            p2RowsCargo: p2RowsCargo
        });
    });

    // Ordenar cargoStatsList según la columna y dirección
    const sortCol = state.cargoSortColumn || 'name';
    const sortDir = state.cargoSortDirection || 'asc';
    cargoStatsList.sort((a, b) => {
        let valA, valB;
        if (sortCol === 'name') {
            valA = a.cargo;
            valB = b.cargo;
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortCol === 'p1') {
            valA = a.p1;
            valB = b.p1;
        } else if (sortCol === 'p2') {
            valA = a.p2;
            valB = b.p2;
        } else if (sortCol === 'diff') {
            valA = a.diff;
            valB = b.diff;
        } else if (sortCol === 'pct') {
            valA = a.pct;
            valB = b.pct;
        } else if (sortCol === 'cant1') {
            valA = a.cant1;
            valB = b.cant1;
        } else if (sortCol === 'cant2') {
            valA = a.cant2;
            valB = b.cant2;
        } else {
            return 0;
        }
        return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    cargoStatsList.forEach(cargoItem => {
        const cargo = cargoItem.cargo;
        const cargoNetP1 = cargoItem.p1;
        const cargoNetP2 = cargoItem.p2;
        const cargoNetDiff = cargoItem.diff;
        const cargoNetPct = cargoItem.pct;
        const p1RowsCargo = cargoItem.p1RowsCargo;
        const p2RowsCargo = cargoItem.p2RowsCargo;
        const cargoSafe = cargo.replace(/[^a-zA-Z0-9]/g, '_');
        
        // NIVEL 1: Cargo
        const cargoRow = document.createElement('tr');
        cargoRow.className = `employee-row ${state.cargoCompareExpanded ? 'expanded' : ''}`;
        cargoRow.setAttribute('data-row-key', cargoSafe);
        cargoRow.innerHTML = `
            <td><i data-lucide="chevron-right" class="expand-chevron"></i><span>${cargo}</span></td>
            <td>-</td><td>-</td><td>-</td>
            <td style="text-align:right; color:var(--text-muted);">-</td>
            <td style="text-align:right;">${currencyFormatter.format(cargoNetP1)}</td>
            <td style="text-align:right; color:var(--text-muted);">-</td>
            <td style="text-align:right;">${currencyFormatter.format(cargoNetP2)}</td>
            <td style="text-align:right;">${formatVariationHTML(cargoNetDiff)}</td>
            <td style="text-align:right;">${formatVariationHTML(cargoNetPct, true)}</td>
            <td style="text-align:center;">
                <button class="btn-analyze btn-analyze-cargo" data-cargo="${encodeURIComponent(cargo)}" title="Revisar variaciones">
                    <i data-lucide="eye" style="width:14px;height:14px;"></i>
                </button>
            </td>
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
            
            const pTotals = { DEVENGO: {p1:0,p2:0,c1:0,c2:0}, DESCUENTO: {p1:0,p2:0,c1:0,c2:0} };
            persP1.forEach(r => { if (pTotals[r.na]) { pTotals[r.na].p1 += r.v; pTotals[r.na].c1 += (r.cant || 0); } });
            persP2.forEach(r => { if (pTotals[r.na]) { pTotals[r.na].p2 += r.v; pTotals[r.na].c2 += (r.cant || 0); } });
            const pNetP1 = pTotals.DEVENGO.p1 + pTotals.DESCUENTO.p1;
            const pNetP2 = pTotals.DEVENGO.p2 + pTotals.DESCUENTO.p2;
            const pCantP1 = pTotals.DEVENGO.c1 + pTotals.DESCUENTO.c1;
            const pCantP2 = pTotals.DEVENGO.c2 + pTotals.DESCUENTO.c2;
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
                <td style="text-align:right; color:var(--text-muted);">-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP1)}</td>
                <td style="text-align:right; color:var(--text-muted);">-</td>
                <td style="text-align:right;">${currencyFormatter.format(pNetP2)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetDiff)}</td>
                <td style="text-align:right;">${formatVariationHTML(pNetPct, true)}</td>
                <td></td>
            `;
            tbody.appendChild(personRow);
            
            // NIVEL 3: Conceptos del trabajador
            const pConceptsMeta = {};
            const pC1 = {}, pC2 = {}, pC1Cant = {}, pC2Cant = {};
            persP1.forEach(r => { pC1[r.co] = (pC1[r.co]||0) + r.v; pC1Cant[r.co] = (pC1Cant[r.co]||0) + (r.cant || 0); pConceptsMeta[r.co] = {na: r.na}; });
            persP2.forEach(r => { pC2[r.co] = (pC2[r.co]||0) + r.v; pC2Cant[r.co] = (pC2Cant[r.co]||0) + (r.cant || 0); pConceptsMeta[r.co] = {na: r.na}; });
            const natOrder = { 'DEVENGO': 1, 'DESCUENTO': 2 };
            const personConcepts = Object.keys(pConceptsMeta).sort((a, b) => {
                const oA = natOrder[pConceptsMeta[a].na]||99, oB = natOrder[pConceptsMeta[b].na]||99;
                return oA !== oB ? oA - oB : a.localeCompare(b);
            });
            personConcepts.forEach(co => {
                const v1 = pC1[co]||0, v2 = pC2[co]||0, diff = v2-v1;
                const cant1 = pC1Cant[co]||0, cant2 = pC2Cant[co]||0;
                const cPct = v1 !== 0 ? (diff/Math.abs(v1))*100 : (diff>0?100:(diff<0?-100:0));
                const na = pConceptsMeta[co].na;
                const conRow = document.createElement('tr');
                conRow.className = `concept-row child-of-${personSafe} collapsed-row`;
                conRow.innerHTML = `
                    <td></td><td></td>
                    <td><span class="badge badge-${na.toLowerCase()}">${na}</span></td>
                    <td>${co}</td>
                    <td style="text-align:right;">${v1!==0 ? Math.round(cant1) : "—"}</td>
                    <td style="text-align:right;">${v1!==0?currencyFormatter.format(v1):'-'}</td>
                    <td style="text-align:right;">${v2!==0 ? Math.round(cant2) : "—"}</td>
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
        
        cargoRow.addEventListener('click', (e) => {
            if (e.target.closest('.btn-analyze')) return;
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

    // Renderizar fila TOTAL en la parte inferior de la tabla
    (function renderCargoTableTotalsRow() {
        let sumP1 = 0, sumP2 = 0;
        cargoStatsList.forEach(c => { sumP1 += c.p1; sumP2 += c.p2; });
        const sumDiff = sumP2 - sumP1;
        const sumPct  = sumP1 !== 0 ? (sumDiff / Math.abs(sumP1)) * 100 : (sumDiff > 0 ? 100 : (sumDiff < 0 ? -100 : 0));

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.6px; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: var(--text-primary);"><strong>TOTAL</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP1)}</strong></td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); color: #000;"><strong>${currencyFormatter.format(sumP2)}</strong></td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumDiff).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="text-align: right; font-weight: 700; font-size: 0.75rem; background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">${formatVariationHTML(sumPct, true).replace('class="', 'style="font-weight: 700 !important;" class="')}</td>
            <td style="background: #F9FAFB; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></td>
        `;
        tbody.appendChild(totalRow);
    })();
    
    // Bind Analizar buttons (Cargo)
    document.querySelectorAll('.btn-analyze-cargo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cargoName = decodeURIComponent(btn.getAttribute('data-cargo'));
            showCargoAnalysisModal(cargoName, state.cargoComparePeriod1, state.cargoComparePeriod2);
        });
    });
    
    // Renderizar fila TOTAL en el pie de la tabla


    // Actualizar Tarjetas Resumen (Cargos)
    (function updateCargoSummaryCards() {
        const totalEl     = document.getElementById('cargo-stat-total');
        const totalSubEl  = document.getElementById('cargo-stat-total-sub');
        const highNameEl  = document.getElementById('cargo-stat-highest-name');
        const highValEl   = document.getElementById('cargo-stat-highest-val');
        const savNameEl   = document.getElementById('cargo-stat-savings-name');
        const savValEl    = document.getElementById('cargo-stat-savings-val');
        const payrollEl   = document.getElementById('cargo-stat-total-payroll');
        const payrollSubEl= document.getElementById('cargo-stat-total-payroll-sub');
        if (!totalEl) return;

        const p1LabelCg = getPeriodLabel(state.cargoComparePeriod1) || 'P1';
        const countP2 = cargoStatsList.filter(c => c.p2 !== 0).length;
        const countP1 = cargoStatsList.filter(c => c.p1 !== 0).length;
        const diffCount = countP2 - countP1;
        totalEl.innerText = countP2;

        if (diffCount > 0) {
            totalSubEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${diffCount} respecto a ${p1LabelCg}</span>`;
        } else if (diffCount < 0) {
            totalSubEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${diffCount} respecto a ${p1LabelCg}</span>`;
        } else {
            totalSubEl.innerHTML = `<span>Sin cambios respecto a ${p1LabelCg}</span>`;
        }

        // Mayor incremento
        let topIncrease = null, maxDiff = 0;
        cargoStatsList.forEach(c => { if (c.diff > maxDiff) { maxDiff = c.diff; topIncrease = c; } });
        if (topIncrease) {
            const shortName = topIncrease.cargo.length > 20 ? topIncrease.cargo.substring(0, 18) + '…' : topIncrease.cargo;
            highNameEl.innerHTML = `<span title="${topIncrease.cargo}">${shortName}</span>`;
            highValEl.innerHTML = `<span style="color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-up" style="width:12px;height:12px;"></i> +${topIncrease.pct.toFixed(1)}%</span> (+${currencyFormatter.format(topIncrease.diff)})`;
        } else {
            highNameEl.innerText = '-'; highValEl.innerText = 'Sin incrementos';
        }

        // Mayor ahorro
        let topSavings = null, minDiff = 0;
        cargoStatsList.forEach(c => { if (c.diff < minDiff) { minDiff = c.diff; topSavings = c; } });
        if (topSavings) {
            const shortName = topSavings.cargo.length > 20 ? topSavings.cargo.substring(0, 18) + '…' : topSavings.cargo;
            savNameEl.innerHTML = `<span title="${topSavings.cargo}">${shortName}</span>`;
            savValEl.innerHTML = `<span style="color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="trending-down" style="width:12px;height:12px;"></i> ${topSavings.pct.toFixed(1)}%</span> (${currencyFormatter.format(topSavings.diff)})`;
        } else {
            savNameEl.innerText = '-'; savValEl.innerText = 'Sin ahorros';
        }

        // Nómina comparada
        let totalP1 = 0, totalP2 = 0;
        cargoStatsList.forEach(c => { totalP1 += c.p1; totalP2 += c.p2; });
        const totalDiff = totalP2 - totalP1;
        const totalPct  = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : (totalDiff > 0 ? 100 : (totalDiff < 0 ? -100 : 0));
        const totalSign = totalDiff > 0 ? '+' : '';
        const totalColor = totalDiff > 0 ? '#10b981' : (totalDiff < 0 ? '#ef4444' : 'var(--text-secondary)');
        const totalIcon  = totalDiff > 0 ? 'trending-up' : (totalDiff < 0 ? 'trending-down' : 'minus');
        payrollEl.innerHTML = `<strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P1:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalP1)}</span><br><strong style="font-size:0.85rem;font-weight:700;color:var(--text-primary);">P2:</strong> <span style="font-weight:normal;">${currencyFormatter.format(totalP2)}</span>`;
        payrollEl.style.fontSize = '1.05rem';
        payrollEl.style.lineHeight = '1.35';
        payrollSubEl.innerHTML = `Dif: <span style="color:${totalColor};font-weight:600;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="${totalIcon}" style="width:12px;height:12px;"></i> ${totalSign}${currencyFormatter.format(totalDiff)} (${totalSign}${totalPct.toFixed(2)}%)</span>`;
    })();

    if (window.lucide) window.lucide.createIcons();

    // Listeners para botones de ordenación
    document.querySelectorAll('#cargo-compare-header-name .small-sort-btn, #cargo-compare-header-cant-p1 .small-sort-btn, #cargo-compare-header-p1 .small-sort-btn, #cargo-compare-header-cant-p2 .small-sort-btn, #cargo-compare-header-p2 .small-sort-btn, #cargo-compare-header-diff .small-sort-btn, #cargo-compare-header-pct .small-sort-btn')
        .forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const col = btn.getAttribute('data-col');
                if (state.cargoSortColumn === col) {
                    state.cargoSortDirection = state.cargoSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.cargoSortColumn = col;
                    state.cargoSortDirection = 'desc'; // Por defecto de mayor a menor
                }
                renderCargoComparison();
            });
        });
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
    
    // Format helper
    const formatTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    // Cards row calculations
    let varArrow = 'arrow-up-right';
    let varArrowClass = 'pos';
    let varBadgeClass = 'badge-pos';
    if (totalDiff < 0) {
        varArrow = 'arrow-down-right';
        varArrowClass = 'neg';
        varBadgeClass = 'badge-neg';
    } else if (totalDiff === 0) {
        varArrow = 'arrow-right';
        varArrowClass = 'muted';
        varBadgeClass = 'badge-neutral';
    }
    const totalPctStr = `${totalDiff >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`;

    const summaryCardsHTML = `
        <div class="analysis-cards-row">
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period1}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP1))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period2}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP2))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon neto">
                        <i data-lucide="trending-up"></i>
                    </span>
                    <span class="analysis-card-label">Variación</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${varArrow}" class="analysis-card-arrow ${varArrowClass}"></i>
                    <span class="analysis-card-badge ${varBadgeClass}">${totalPctStr}</span>
                </div>
            </div>
        </div>
    `;

    // Top increases and decreases
    const topPositive = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    const topNegative = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff)[0];
    
    let summaryListItems = [];
    const conceptNameFormatted = conceptName.toUpperCase();
    
    const directionWord = totalDiff >= 0 ? 'aumento' : 'reducción';
    const amountStr = `$${currencyFormatter.format(Math.abs(totalDiff)).replace('$', '')}`;
    summaryListItems.push(`
        <li>
            <span class="bullet-dot ${totalDiff >= 0 ? 'pos' : 'neg'}"></span>
            <div>El desembolso consolidado para <strong>${conceptNameFormatted}</strong> registró un ${directionWord} neto de <strong>${totalDiff >= 0 ? '+' : '-'}${amountStr}</strong> (${totalPctStr}) a nivel compañía.</div>
        </li>
    `);
    
    if (topPositive) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot pos"></span>
                <div><strong>Mayor incremento:</strong> El colaborador <strong>${formatTitleCase(topPositive.name)}</strong> registró la mayor alza del concepto con <strong>+${currencyFormatter.format(topPositive.diff)}</strong>.</div>
            </li>
        `);
    }
    
    if (topNegative) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot neg"></span>
                <div><strong>Mayor reducción:</strong> El colaborador <strong>${formatTitleCase(topNegative.name)}</strong> registró la mayor baja del concepto con <strong>-${currencyFormatter.format(Math.abs(topNegative.diff))}</strong>.</div>
            </li>
        `);
    }

    const executiveSummaryHTML = `
        <div class="analysis-executive-summary-wrapper">
            <div class="analysis-sparkle-badge">
                <i data-lucide="sparkles"></i>
            </div>
            <div class="analysis-executive-summary">
                <h5>Resumen de Variaciones Clave</h5>
                <ul class="analysis-summary-list">
                    ${summaryListItems.join('')}
                </ul>
            </div>
        </div>
    `;

    // Positives and Negatives lists
    const positives = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff);
    const negatives = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff);

    let positivesHTML = '';
    if (positives.length > 0) {
        positivesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Positivos (Suman al Concepto)</h4>
                <div class="analysis-cards-list">
                    ${positives.map(c => `
                        <div class="analysis-impact-card pos">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value pos">+${currencyFormatter.format(c.diff)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let negativesHTML = '';
    if (negatives.length > 0) {
        negativesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Negativos (Restan al Concepto)</h4>
                <div class="analysis-cards-list">
                    ${negatives.map(c => `
                        <div class="analysis-impact-card neg">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value neg">-${currencyFormatter.format(Math.abs(c.diff))}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build modal
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <h3 class="analysis-modal-title">Análisis de Concepto</h3>
                <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                <h4 class="analysis-employee-name">${conceptNameFormatted}</h4>
                <p class="analysis-employee-periods">${period1} vs ${period2} · <span class="badge badge-${nature.toLowerCase()}">${nature}</span></p>
                
                ${summaryCardsHTML}
                ${executiveSummaryHTML}
                ${positivesHTML}
                ${negativesHTML}
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

function showCecoAnalysisModal(cecoName, period1, period2) {
    const existing = document.getElementById('analysis-modal-overlay');
    if (existing) existing.remove();
    
    // Parse periods
    const dataP1 = filterDataByPeriod(period1).filter(d => `${d.cc} - ${d.dcc}` === cecoName);
    const dataP2 = filterDataByPeriod(period2).filter(d => `${d.cc} - ${d.dcc}` === cecoName);
    
    // Map values by employee
    const p1Map = {}, p2Map = {}, allCedulas = new Set();
    const employeeNames = {};
    
    dataP1.forEach(r => {
        p1Map[r.c] = (p1Map[r.c] || 0) + r.v;
        allCedulas.add(r.c);
        employeeNames[r.c] = r.n;
    });
    dataP2.forEach(r => {
        p2Map[r.c] = (p2Map[r.c] || 0) + r.v;
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
    
    // Aggregated ceco values
    let totalP1 = 0;
    let totalP2 = 0;
    dataP1.forEach(r => totalP1 += r.v);
    dataP2.forEach(r => totalP2 += r.v);
    
    const totalDiff = totalP2 - totalP1;
    const totalPct = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : 0;
    
    // Format helper
    const formatTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    // Cards row calculations
    let varArrow = 'arrow-up-right';
    let varArrowClass = 'pos';
    let varBadgeClass = 'badge-pos';
    if (totalDiff < 0) {
        varArrow = 'arrow-down-right';
        varArrowClass = 'neg';
        varBadgeClass = 'badge-neg';
    } else if (totalDiff === 0) {
        varArrow = 'arrow-right';
        varArrowClass = 'muted';
        varBadgeClass = 'badge-neutral';
    }
    const totalPctStr = `${totalDiff >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`;

    const summaryCardsHTML = `
        <div class="analysis-cards-row">
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period1}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP1))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period2}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP2))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon neto">
                        <i data-lucide="trending-up"></i>
                    </span>
                    <span class="analysis-card-label">Variación</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${varArrow}" class="analysis-card-arrow ${varArrowClass}"></i>
                    <span class="analysis-card-badge ${varBadgeClass}">${totalPctStr}</span>
                </div>
            </div>
        </div>
    `;

    // Top increases and decreases
    const topPositive = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    const topNegative = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff)[0];
    
    let summaryListItems = [];
    const cecoNameFormatted = cecoName.toUpperCase();
    
    const directionWord = totalDiff >= 0 ? 'aumento' : 'reducción';
    const amountStr = `$${currencyFormatter.format(Math.abs(totalDiff)).replace('$', '')}`;
    summaryListItems.push(`
        <li>
            <span class="bullet-dot ${totalDiff >= 0 ? 'pos' : 'neg'}"></span>
            <div>El costo consolidado de nómina para el Centro de Costo <strong>${cecoNameFormatted}</strong> registró un ${directionWord} de <strong>${totalDiff >= 0 ? '+' : '-'}${amountStr}</strong> (${totalPctStr}) a nivel global.</div>
        </li>
    `);
    
    if (topPositive) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot pos"></span>
                <div><strong>Mayor incremento:</strong> El colaborador <strong>${formatTitleCase(topPositive.name)}</strong> tuvo la mayor variación de incremento en su salario neto con <strong>+${currencyFormatter.format(topPositive.diff)}</strong>.</div>
            </li>
        `);
    }
    
    if (topNegative) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot neg"></span>
                <div><strong>Mayor reducción:</strong> El colaborador <strong>${formatTitleCase(topNegative.name)}</strong> tuvo la mayor variación de reducción en su salario neto con <strong>-${currencyFormatter.format(Math.abs(topNegative.diff))}</strong>.</div>
            </li>
        `);
    }

    const executiveSummaryHTML = `
        <div class="analysis-executive-summary-wrapper">
            <div class="analysis-sparkle-badge">
                <i data-lucide="sparkles"></i>
            </div>
            <div class="analysis-executive-summary">
                <h5>Resumen de Variaciones Clave</h5>
                <ul class="analysis-summary-list">
                    ${summaryListItems.join('')}
                </ul>
            </div>
        </div>
    `;

    // Positives and Negatives lists
    const positives = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff);
    const negatives = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff);

    let positivesHTML = '';
    if (positives.length > 0) {
        positivesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Positivos (Incrementos Neto)</h4>
                <div class="analysis-cards-list">
                    ${positives.map(c => `
                        <div class="analysis-impact-card pos">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value pos">+${currencyFormatter.format(c.diff)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let negativesHTML = '';
    if (negatives.length > 0) {
        negativesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Negativos (Reducciones Neto)</h4>
                <div class="analysis-cards-list">
                    ${negatives.map(c => `
                        <div class="analysis-impact-card neg">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value neg">-${currencyFormatter.format(Math.abs(c.diff))}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build modal
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <h3 class="analysis-modal-title">Análisis de Centro de Costo</h3>
                <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                <h4 class="analysis-employee-name">${cecoNameFormatted}</h4>
                <p class="analysis-employee-periods">${period1} vs ${period2} · Centro de Costo</p>
                
                ${summaryCardsHTML}
                ${executiveSummaryHTML}
                ${positivesHTML}
                ${negativesHTML}
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

function showCargoAnalysisModal(cargoName, period1, period2) {
    const existing = document.getElementById('analysis-modal-overlay');
    if (existing) existing.remove();
    
    // Parse periods
    const dataP1 = filterDataByPeriod(period1).filter(d => d.cg === cargoName);
    const dataP2 = filterDataByPeriod(period2).filter(d => d.cg === cargoName);
    
    // Map values by employee
    const p1Map = {}, p2Map = {}, allCedulas = new Set();
    const employeeNames = {};
    
    dataP1.forEach(r => {
        p1Map[r.c] = (p1Map[r.c] || 0) + r.v;
        allCedulas.add(r.c);
        employeeNames[r.c] = r.n;
    });
    dataP2.forEach(r => {
        p2Map[r.c] = (p2Map[r.c] || 0) + r.v;
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
    
    // Aggregated cargo values
    let totalP1 = 0;
    let totalP2 = 0;
    dataP1.forEach(r => totalP1 += r.v);
    dataP2.forEach(r => totalP2 += r.v);
    
    const totalDiff = totalP2 - totalP1;
    const totalPct = totalP1 !== 0 ? (totalDiff / Math.abs(totalP1)) * 100 : 0;
    
    // Format helper
    const formatTitleCase = (str) => {
        if (!str) return '';
        return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    // Cards row calculations
    let varArrow = 'arrow-up-right';
    let varArrowClass = 'pos';
    let varBadgeClass = 'badge-pos';
    if (totalDiff < 0) {
        varArrow = 'arrow-down-right';
        varArrowClass = 'neg';
        varBadgeClass = 'badge-neg';
    } else if (totalDiff === 0) {
        varArrow = 'arrow-right';
        varArrowClass = 'muted';
        varBadgeClass = 'badge-neutral';
    }
    const totalPctStr = `${totalDiff >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`;

    const summaryCardsHTML = `
        <div class="analysis-cards-row">
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period1}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP1))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon devengos">
                        <i data-lucide="calendar"></i>
                    </span>
                    <span class="analysis-card-label">${period2}</span>
                </div>
                <div class="analysis-card-bottom">
                    <span class="analysis-card-badge badge-neutral">${currencyFormatter.format(Math.abs(totalP2))}</span>
                </div>
            </div>
            <div class="analysis-card">
                <div class="analysis-card-top">
                    <span class="analysis-card-icon neto">
                        <i data-lucide="trending-up"></i>
                    </span>
                    <span class="analysis-card-label">Variación</span>
                </div>
                <div class="analysis-card-bottom">
                    <i data-lucide="${varArrow}" class="analysis-card-arrow ${varArrowClass}"></i>
                    <span class="analysis-card-badge ${varBadgeClass}">${totalPctStr}</span>
                </div>
            </div>
        </div>
    `;

    // Top increases and decreases
    const topPositive = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    const topNegative = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff)[0];
    
    let summaryListItems = [];
    const cargoNameFormatted = cargoName.toUpperCase();
    
    const directionWord = totalDiff >= 0 ? 'aumento' : 'reducción';
    const amountStr = `$${currencyFormatter.format(Math.abs(totalDiff)).replace('$', '')}`;
    summaryListItems.push(`
        <li>
            <span class="bullet-dot ${totalDiff >= 0 ? 'pos' : 'neg'}"></span>
            <div>El costo consolidado de nómina para el Cargo <strong>${cargoNameFormatted}</strong> registró un ${directionWord} de <strong>${totalDiff >= 0 ? '+' : '-'}${amountStr}</strong> (${totalPctStr}) a nivel global.</div>
        </li>
    `);
    
    if (topPositive) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot pos"></span>
                <div><strong>Mayor incremento:</strong> El colaborador <strong>${formatTitleCase(topPositive.name)}</strong> tuvo la mayor variación de incremento en su salario neto con <strong>+${currencyFormatter.format(topPositive.diff)}</strong>.</div>
            </li>
        `);
    }
    
    if (topNegative) {
        summaryListItems.push(`
            <li>
                <span class="bullet-dot neg"></span>
                <div><strong>Mayor reducción:</strong> El colaborador <strong>${formatTitleCase(topNegative.name)}</strong> tuvo la mayor variación de reducción en su salario neto con <strong>-${currencyFormatter.format(Math.abs(topNegative.diff))}</strong>.</div>
            </li>
        `);
    }

    const executiveSummaryHTML = `
        <div class="analysis-executive-summary-wrapper">
            <div class="analysis-sparkle-badge">
                <i data-lucide="sparkles"></i>
            </div>
            <div class="analysis-executive-summary">
                <h5>Resumen de Variaciones Clave</h5>
                <ul class="analysis-summary-list">
                    ${summaryListItems.join('')}
                </ul>
            </div>
        </div>
    `;

    // Positives and Negatives lists
    const positives = changes.filter(c => c.diff > 0).sort((a, b) => b.diff - a.diff);
    const negatives = changes.filter(c => c.diff < 0).sort((a, b) => a.diff - b.diff);

    let positivesHTML = '';
    if (positives.length > 0) {
        positivesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Positivos (Incrementos Neto)</h4>
                <div class="analysis-cards-list">
                    ${positives.map(c => `
                        <div class="analysis-impact-card pos">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value pos">+${currencyFormatter.format(c.diff)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let negativesHTML = '';
    if (negatives.length > 0) {
        negativesHTML = `
            <div class="analysis-section">
                <h4 class="analysis-section-title">Impactos Negativos (Reducciones Neto)</h4>
                <div class="analysis-cards-list">
                    ${negatives.map(c => `
                        <div class="analysis-impact-card neg">
                            <span class="analysis-impact-name">${formatTitleCase(c.name)} <span style="font-size:0.72rem; color:#64748b;">· C.C. ${c.cedula}</span></span>
                            <span class="analysis-impact-value neg">-${currencyFormatter.format(Math.abs(c.diff))}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Build modal
    const overlay = document.createElement('div');
    overlay.id = 'analysis-modal-overlay';
    overlay.className = 'analysis-overlay';
    
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <h3 class="analysis-modal-title">Análisis de Cargo</h3>
                <button class="analysis-close-btn" id="analysis-close-btn" aria-label="Cerrar análisis">
                    <i data-lucide="x" style="width:18px;height:18px;"></i>
                </button>
            </div>
            <div class="analysis-modal-body">
                <h4 class="analysis-employee-name">${cargoNameFormatted}</h4>
                <p class="analysis-employee-periods">${period1} vs ${period2} · Cargo</p>
                
                ${summaryCardsHTML}
                ${executiveSummaryHTML}
                ${positivesHTML}
                ${negativesHTML}
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
                            <th class="sortable-header" style="cursor:pointer;user-select:none;">Colaborador<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                            <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right;">${period1}<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                            <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right;">${period2}<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                            <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right;">Variación ($)<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
                            <th class="sortable-header" style="cursor:pointer;user-select:none;text-align: right;">Variación (%)<span class="sort-arrow" style="color:#cbd5e1;font-size:0.75rem;margin-left:4px;">↕</span></th>
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
        const signChar = netDiff >= 0 ? '+' : '-';
        const colorClass = netDiff > 0 ? 'analysis-positive' : 'analysis-negative';
        
        const narrative = `
            <p class="analysis-summary">
                Para los conceptos seleccionados, el neto consolidado pasó de <strong>${currencyFormatter.format(netP1)}</strong> en ${period1} a <strong>${currencyFormatter.format(netP2)}</strong> en ${period2}. 
                Esto representa ${dir} de <span class="${colorClass}"><strong>${signChar}${currencyFormatter.format(Math.abs(netDiff))}</strong> (${sign}${netPct.toFixed(2)}%)</span>.
            </p>
        `;
        
        // Extras y Tops
        let increasesHTML = '', decreasesHTML = '', extrasHTML = '';
        if (increases.length > 0) {
            increasesHTML = `
                <div class="analysis-section">
                    <h4 class="analysis-section-title analysis-positive">Conceptos con mayor incremento</h4>
                    <div class="analysis-items">
                        ${increases.map(c => `
                            <div class="analysis-item">
                                <div class="analysis-item-header">
                                    <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                    <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                                </div>
                                <div class="analysis-item-values">
                                    <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                    <span class="analysis-arrow">&rarr;</span>
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
                    <h4 class="analysis-section-title analysis-negative">Conceptos con mayor reducción</h4>
                    <div class="analysis-items">
                        ${decreases.map(c => `
                            <div class="analysis-item">
                                <div class="analysis-item-header">
                                    <span class="analysis-concept">${c.co.toLowerCase()}</span>
                                    <span class="badge badge-${c.na.toLowerCase()}" style="font-size:0.65rem;">${c.na}</span>
                                </div>
                                <div class="analysis-item-values">
                                    <span class="analysis-from">${currencyFormatter.format(c.v1)}</span>
                                    <span class="analysis-arrow">&rarr;</span>
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

// HELPER: Traducción de Conceptos Técnicos a Lenguaje de Negocios
function getConceptTranslation(co) {
    if (!co) return 'Concepto de Nómina';
    const upper = co.toUpperCase();
    if (upper.includes('EXT.DIUR.ORDIN') || upper.includes('H.EXT') || upper.includes('HORAS EXTRA')) {
        return 'Horas Extras Diurnas Ordinarias';
    }
    if (upper.includes('COMIS')) {
        return 'Comisiones Comerciales por Objetivos';
    }
    if (upper.includes('BONIF') || upper.includes('BONO')) {
        return 'Bonificaciones Especiales y Reconocimientos';
    }
    if (upper.includes('RET.FTE') || upper.includes('R.FTE')) {
        return 'Retención en la Fuente (Impuesto de Renta)';
    }
    if (upper.includes('SALARIO') || upper.includes('SUELDO')) {
        return 'Sueldo Básico Estructural';
    }
    if (upper.includes('AUX.TRANSPORTE') || upper.includes('AUX.TRANS')) {
        return 'Auxilio Legal de Transporte';
    }
    if (upper.includes('SALUD')) {
        return 'Aporte a Salud de Ley';
    }
    if (upper.includes('PENSION')) {
        return 'Aporte a Pensión de Ley';
    }
    if (upper.includes('INCAPAC')) {
        return 'Incapacidades Médicas Asumidas';
    }
    if (upper.includes('PRESTAMO') || upper.includes('PRÉSTAMO')) {
        return 'Deducción por Préstamos Internos';
    }
    return co;
}

function formatPercentage(val) {
    return (val >= 0 ? '+' : '') + Number(val).toFixed(2) + '%';
}

function calculateManagerialInsights(reportType = 'concepto') {
    let p1, p2;
    let selectedConcepts = [];
    let selectedCecos = [];
    if (reportType === 'persona') {
        p1 = state.comparePeriod1;
        p2 = state.comparePeriod2;
        selectedCecos = state.periodCompareSelectedCecos || [];
    } else if (reportType === 'ceco') {
        p1 = state.cecoComparePeriod1;
        p2 = state.cecoComparePeriod2;
    } else if (reportType === 'cargo') {
        p1 = state.cargoComparePeriod1;
        p2 = state.cargoComparePeriod2;
        selectedCecos = state.cargoCompareSelectedCecos || [];
    } else {
        p1 = state.conceptComparePeriod1;
        p2 = state.conceptComparePeriod2;
        selectedConcepts = state.conceptCompareSelectedConcepts || [];
        selectedCecos = state.conceptCompareSelectedCecos || [];
    }

    if (!p1 || !p2) return null;

    let dataP1 = filterDataByPeriod(p1);
    let dataP2 = filterDataByPeriod(p2);

    if (selectedCecos.length > 0) {
        dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
        dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
    }

    const payrollData = state.data || [];
    const allConcepts = [...new Set(payrollData.map(d => d.co))];
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
    cecoDetails.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const topCecoIncreases = cecoDetails.filter(c => c.diff > 0).slice(0, 3);

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
    cargoDetails.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const topCargoIncreases = cargoDetails.filter(c => c.diff > 0).slice(0, 3);

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

    // Seleccionar incrementos principales y disminuciones según el tipo de reporte
    let primaryDetails = [];
    if (reportType === 'persona') {
        primaryDetails = empDetails;
    } else if (reportType === 'ceco') {
        primaryDetails = cecoDetails;
    } else if (reportType === 'cargo') {
        primaryDetails = cargoDetails;
    } else {
        primaryDetails = conceptDetails;
    }

    const topIncreases = primaryDetails.filter(c => c.diff > 0).slice(0, 3);
    const topReductions = primaryDetails.filter(c => c.diff < 0).sort((a,b) => a.diff - b.diff).slice(0, 3);

    // NUEVO: Efecto Headcount (Altas / Bajas)
    const empsP1 = {};
    const empsP2 = {};
    dataP1.forEach(d => {
        if (!empsP1[d.c]) empsP1[d.c] = { name: d.n || 'Desconocido', net: 0 };
        if (d.na === 'DEVENGO') empsP1[d.c].net += d.v;
        if (d.na === 'DESCUENTO') empsP1[d.c].net -= d.v;
    });
    dataP2.forEach(d => {
        if (!empsP2[d.c]) empsP2[d.c] = { name: d.n || 'Desconocido', net: 0 };
        if (d.na === 'DEVENGO') empsP2[d.c].net += d.v;
        if (d.na === 'DESCUENTO') empsP2[d.c].net -= d.v;
    });

    const bajas = [];
    const altas = [];
    for (const c in empsP1) {
        if (!empsP2[c] || empsP2[c].net <= 0) {
            bajas.push({ c, name: empsP1[c].name, net: empsP1[c].net });
        }
    }
    for (const c in empsP2) {
        if (!empsP1[c] || empsP1[c].net <= 0) {
            altas.push({ c, name: empsP2[c].name, net: empsP2[c].net });
        }
    }
    const totalBajasAmt = bajas.reduce((acc, curr) => acc + curr.net, 0);
    const totalAltasAmt = altas.reduce((acc, curr) => acc + curr.net, 0);
    const headcountNetEffect = totalAltasAmt - totalBajasAmt;

    // NUEVO: Aislamiento de Headcount (Altas / Bajas Efectivas)
    const sortedBajas = [...bajas].sort((a, b) => b.net - a.net);
    const sortedAltas = [...altas].sort((a, b) => b.net - a.net);
    
    const topBaja = sortedBajas[0] || null;
    const topAlta = sortedAltas[0] || null;
    
    let headcountPct = 0;
    if (netDiff !== 0) {
        headcountPct = Math.round((Math.abs(headcountNetEffect) / Math.abs(netDiff)) * 100);
    }
    
    let topBajaPct = 0;
    if (topBaja && netDiff < 0) {
        topBajaPct = Math.round((Math.abs(topBaja.net) / Math.abs(netDiff)) * 100);
    }
    
    let topAltaPct = 0;
    if (topAlta && netDiff > 0) {
        topAltaPct = Math.round((Math.abs(topAlta.net) / Math.abs(netDiff)) * 100);
    }

    // NUEVO: Alerta de Descalce / Compliance
    let complianceAlert = { severity: 'success', title: 'Auditoría de Cumplimiento Limpia', message: 'No se detectaron anomalías contables o descalces en la nómina del periodo.' };
    const devPctChange = devengosP1 > 0 ? (devengosP2 - devengosP1) / devengosP1 : 0;
    const descPctChange = descuentosP1 > 0 ? (descuentosP2 - descuentosP1) / descuentosP1 : 0;

    if (devPctChange < -0.005 && descPctChange > 0.005) {
        complianceAlert = {
            severity: 'danger',
            title: 'Alerta de Descalce en Seguridad Social',
            message: `Se detectó una anomalía: los devengos totales disminuyeron en ${formatPercentage(devPctChange * 100)}, pero las deducciones aumentaron en ${formatPercentage(descPctChange * 100)}. Se sugiere auditoría preventiva de aportes PILA.`
        };
    } else {
        const ratioP1 = devengosP1 > 0 ? descuentosP1 / devengosP1 : 0;
        const ratioP2 = devengosP2 > 0 ? descuentosP2 / devengosP2 : 0;
        const ratioDiff = ratioP2 - ratioP1;
        if (Math.abs(ratioDiff) > 0.02) {
            complianceAlert = {
                severity: 'warning',
                title: 'Variación de Ratio de Retención',
                message: `La proporción de deducciones frente a los devengos varió significativamente en el periodo (+${formatPercentage(ratioDiff * 100)}). Valida nuevos préstamos o retenciones especiales.`
            };
        }
    }

    // Calcular magnitud relativa de variación individual en el Top 5
    const totalAbsPayrollDiff = empDetails.reduce((acc, curr) => acc + Math.abs(curr.diff), 0) || 1;
    topEmpImpacts.forEach(emp => {
        emp.magnitudePct = Math.round((Math.abs(emp.diff) / totalAbsPayrollDiff) * 100) || 1;
    });

    return {
        p1,
        p2,
        totals: {
            devengosP1, devengosP2, devengosDiff, devengosPct,
            descuentosP1, descuentosP2, descuentosDiff, descuentosPct,
            netP1, netP2, netDiff, netPct
        },
        conceptDetails,
        cecoDetails,
        cargoDetails,
        empDetails,
        topIncreases,
        topReductions,
        newConcepts,
        inactiveConcepts,
        topCecoIncreases,
        topCargoIncreases,
        topEmpImpacts,
        
        // Retornar campos de headcount
        bajas,
        altas,
        totalBajasAmt,
        totalAltasAmt,
        headcountNetEffect,
        topBaja,
        topAlta,
        headcountPct,
        topBajaPct,
        topAltaPct,
        complianceAlert,
        dataP1,
        dataP2
    };
}

window.exportCompareTableToExcel = function (reportType = 'concepto') {
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

    try {
        const insights = calculateManagerialInsights(reportType);
        let dataToExport = [];
        let headers = ['Nombre', 'Concepto', 'Cédula / Naturaleza / Tipo', 'Jerarquía', 'Valor P1 ($)', 'Valor P2 ($)', 'Variación ($)', 'Variación (%)'];
        let filename = '';

        const employeeNames = {};
        state.data.forEach(d => {
            employeeNames[d.c] = d.n;
        });

        if (reportType === 'persona') {
            let dataP1 = filterDataByPeriod(state.comparePeriod1);
            let dataP2 = filterDataByPeriod(state.comparePeriod2);
            const selectedCecos = state.periodCompareSelectedCecos || [];
            if (selectedCecos.length > 0) {
                dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
                dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
            }
            const people = getUniquePeopleSorted();
            const selectedCeds = state.periodCompareSelectedEmployees || [];
            const filteredPeople = people.filter(p => {
                if (selectedCeds.length === 0) return true;
                return selectedCeds.includes(p.cedula);
            });

            filteredPeople.forEach(person => {
                const cedula = person.cedula;
                const name = person.name;
                const p1Rows = dataP1.filter(d => d.c === cedula);
                const p2Rows = dataP2.filter(d => d.c === cedula);
                if (p1Rows.length === 0 && p2Rows.length === 0) return;

                const p1Concepts = {};
                const p2Concepts = {};
                const allConceptsMeta = {};
                p1Rows.forEach(r => {
                    p1Concepts[r.co] = (p1Concepts[r.co] || 0) + r.v;
                    allConceptsMeta[r.co] = { na: r.na, t: r.t };
                });
                p2Rows.forEach(r => {
                    p2Concepts[r.co] = (p2Concepts[r.co] || 0) + r.v;
                    allConceptsMeta[r.co] = { na: r.na, t: r.t };
                });

                let netP1 = 0, netP2 = 0;
                Object.keys(allConceptsMeta).forEach(co => {
                    const meta = allConceptsMeta[co];
                    const val1 = p1Concepts[co] || 0;
                    const val2 = p2Concepts[co] || 0;
                    const factor = meta.na === 'DEVENGO' ? 1 : -1;
                    netP1 += val1 * factor;
                    netP2 += val2 * factor;
                });
                const diff = netP2 - netP1;
                const pct = netP1 !== 0 ? (diff / Math.abs(netP1)) * 100 : 0;

                dataToExport.push([
                    name,
                    '(Total Neto)',
                    cedula,
                    'Colaborador (Total)',
                    netP1,
                    netP2,
                    diff,
                    pct / 100
                ]);

                const sortedConcepts = Object.keys(allConceptsMeta).sort((a,b) => {
                    const ordA = allConceptsMeta[a].na === 'DEVENGO' ? 1 : allConceptsMeta[a].na === 'DESCUENTO' ? 2 : 3;
                    const ordB = allConceptsMeta[b].na === 'DEVENGO' ? 1 : allConceptsMeta[b].na === 'DESCUENTO' ? 2 : 3;
                    if (ordA !== ordB) return ordA - ordB;
                    return a.localeCompare(b);
                });

                sortedConcepts.forEach(co => {
                    const meta = allConceptsMeta[co];
                    const val1 = p1Concepts[co] || 0;
                    const val2 = p2Concepts[co] || 0;
                    const cDiff = val2 - val1;
                    const cPct = val1 !== 0 ? (cDiff / Math.abs(val1)) * 100 : 0;

                    dataToExport.push([
                        name,
                        co,
                        meta.na,
                        'Concepto Detalle',
                        val1,
                        val2,
                        cDiff,
                        cPct / 100
                    ]);
                });
            });

            filename = `Comparativo_Personas_Jerarquico_${getPeriodLabel(insights.p1).replace(/\s+/g, '_')}_vs_${getPeriodLabel(insights.p2).replace(/\s+/g, '_')}.xlsx`;

        } else if (reportType === 'concepto') {
            let dataP1 = filterDataByPeriod(state.conceptComparePeriod1);
            let dataP2 = filterDataByPeriod(state.conceptComparePeriod2);
            const selectedCecos = state.conceptCompareSelectedCecos || [];
            if (selectedCecos.length > 0) {
                dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
                dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
            }
            const allConcepts = [...new Set(state.data.map(d => d.co))];
            const selectedConcepts = state.conceptCompareSelectedConcepts || [];
            const filteredConcepts = allConcepts.filter(co => {
                if (selectedConcepts.length === 0) return true;
                return selectedConcepts.includes(co);
            });

            filteredConcepts.forEach(co => {
                const p1Rows = dataP1.filter(d => d.co === co);
                const p2Rows = dataP2.filter(d => d.co === co);
                if (p1Rows.length === 0 && p2Rows.length === 0) return;

                const p1Employees = {};
                const p2Employees = {};
                const allEmployees = new Set();
                let conceptNature = 'DEVENGO';
                p1Rows.forEach(r => {
                    p1Employees[r.c] = (p1Employees[r.c] || 0) + r.v;
                    allEmployees.add(r.c);
                    conceptNature = r.na;
                });
                p2Rows.forEach(r => {
                    p2Employees[r.c] = (p2Employees[r.c] || 0) + r.v;
                    allEmployees.add(r.c);
                    conceptNature = r.na;
                });

                let totalP1 = 0, totalP2 = 0;
                allEmployees.forEach(c => {
                    totalP1 += p1Employees[c] || 0;
                    totalP2 += p2Employees[c] || 0;
                });
                const diff = totalP2 - totalP1;
                const pct = totalP1 !== 0 ? (diff / Math.abs(totalP1)) * 100 : 0;

                dataToExport.push([
                    '(Todos)',
                    co,
                    conceptNature,
                    'Concepto (Total)',
                    totalP1,
                    totalP2,
                    diff,
                    pct / 100
                ]);

                const sortedBreakdown = [...allEmployees].map(c => {
                    const ev1 = p1Employees[c] || 0;
                    const ev2 = p2Employees[c] || 0;
                    const ediff = ev2 - ev1;
                    const epct = ev1 !== 0 ? (ediff / Math.abs(ev1)) * 100 : 0;
                    return {
                        cedula: c,
                        name: employeeNames[c] || 'Desconocido',
                        v1: ev1,
                        v2: ev2,
                        diff: ediff,
                        pct: epct
                    };
                }).sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff));

                sortedBreakdown.forEach(emp => {
                    dataToExport.push([
                        emp.name,
                        co,
                        emp.cedula,
                        'Colaborador Detalle',
                        emp.v1,
                        emp.v2,
                        emp.diff,
                        emp.pct / 100
                    ]);
                });
            });

            filename = `Comparativo_Conceptos_Jerarquico_${getPeriodLabel(insights.p1).replace(/\s+/g, '_')}_vs_${getPeriodLabel(insights.p2).replace(/\s+/g, '_')}.xlsx`;

        } else if (reportType === 'cargo') {
            let dataP1 = filterDataByPeriod(state.cargoComparePeriod1);
            let dataP2 = filterDataByPeriod(state.cargoComparePeriod2);
            const selectedCecos = state.cargoCompareSelectedCecos || [];
            if (selectedCecos.length > 0) {
                dataP1 = dataP1.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
                dataP2 = dataP2.filter(d => selectedCecos.includes(`${d.cc} - ${d.dcc}`));
            }
            const cargosSet = new Set();
            [...dataP1, ...dataP2].forEach(d => { if (d.cg) cargosSet.add(d.cg); });
            const selectedCargos = state.cargoCompareSelectedCargos || [];
            const filteredCargos = [...cargosSet].filter(c => {
                if (selectedCargos.length === 0) return true;
                return selectedCargos.includes(c);
            }).sort();

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
                const cargoNetPct = cargoNetP1 !== 0 ? (cargoNetDiff / Math.abs(cargoNetP1)) * 100 : 0;

                dataToExport.push([
                    cargo,
                    '-',
                    '-',
                    'Cargo (Total)',
                    cargoNetP1,
                    cargoNetP2,
                    cargoNetDiff,
                    cargoNetPct / 100
                ]);

                const peopleMap = {};
                [...p1RowsCargo, ...p2RowsCargo].forEach(d => { if (!peopleMap[d.c]) peopleMap[d.c] = d.n; });
                const sortedPeople = Object.keys(peopleMap).sort((a,b) => peopleMap[a].localeCompare(peopleMap[b]));

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
                    const pNetPct = pNetP1 !== 0 ? (pNetDiff / Math.abs(pNetP1)) * 100 : 0;

                    dataToExport.push([
                        personName,
                        '-',
                        cedula,
                        'Colaborador Detalle',
                        pNetP1,
                        pNetP2,
                        pNetDiff,
                        pNetPct / 100
                    ]);
                });
            });

            filename = `Comparativo_Cargos_Jerarquico_${getPeriodLabel(insights.p1).replace(/\s+/g, '_')}_vs_${getPeriodLabel(insights.p2).replace(/\s+/g, '_')}.xlsx`;

        } else if (reportType === 'ceco') {
            let dataP1 = filterDataByPeriod(state.cecoComparePeriod1);
            let dataP2 = filterDataByPeriod(state.cecoComparePeriod2);
            const cecosSet = new Set();
            [...dataP1, ...dataP2].forEach(d => { if (d.cc && d.dcc) cecosSet.add(`${d.cc} - ${d.dcc}`); });
            const selectedCecos = state.cecoCompareSelectedCecos || [];
            const filteredCecos = [...cecosSet].filter(c => {
                if (selectedCecos.length === 0) return true;
                return selectedCecos.includes(c);
            }).sort();

            filteredCecos.forEach(cecoKey => {
                const p1RowsCeco = dataP1.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
                const p2RowsCeco = dataP2.filter(d => `${d.cc} - ${d.dcc}` === cecoKey);
                if (p1RowsCeco.length === 0 && p2RowsCeco.length === 0) return;

                const cecoTotals = { DEVENGO: {p1:0,p2:0}, DESCUENTO: {p1:0,p2:0} };
                p1RowsCeco.forEach(r => { if (cecoTotals[r.na]) cecoTotals[r.na].p1 += r.v; });
                p2RowsCeco.forEach(r => { if (cecoTotals[r.na]) cecoTotals[r.na].p2 += r.v; });

                const cecoNetP1 = cecoTotals.DEVENGO.p1 + cecoTotals.DESCUENTO.p1;
                const cecoNetP2 = cecoTotals.DEVENGO.p2 + cecoTotals.DESCUENTO.p2;
                const cecoNetDiff = cecoNetP2 - cecoNetP1;
                const cecoNetPct = cecoNetP1 !== 0 ? (cecoNetDiff / Math.abs(cecoNetP1)) * 100 : 0;

                dataToExport.push([
                    cecoKey,
                    '-',
                    '-',
                    'Centro de Costo (Total)',
                    cecoNetP1,
                    cecoNetP2,
                    cecoNetDiff,
                    cecoNetPct / 100
                ]);

                const peopleMap = {};
                [...p1RowsCeco, ...p2RowsCeco].forEach(d => { if (!peopleMap[d.c]) peopleMap[d.c] = d.n; });
                const sortedPeople = Object.keys(peopleMap).sort((a,b) => peopleMap[a].localeCompare(peopleMap[b]));

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
                    const pNetPct = pNetP1 !== 0 ? (pNetDiff / Math.abs(pNetP1)) * 100 : 0;

                    dataToExport.push([
                        personName,
                        '-',
                        cedula,
                        'Colaborador Detalle',
                        pNetP1,
                        pNetP2,
                        pNetDiff,
                        pNetPct / 100
                    ]);
                });
            });

            filename = `Comparativo_Cecos_Jerarquico_${getPeriodLabel(insights.p1).replace(/\s+/g, '_')}_vs_${getPeriodLabel(insights.p2).replace(/\s+/g, '_')}.xlsx`;
        }

        if (!dataToExport.length) {
            showAlert('No hay datos disponibles para exportar.');
            return;
        }

        const sheetData = [headers, ...dataToExport];
        const newWb = XLSX.utils.book_new();
        const newWs = XLSX.utils.aoa_to_sheet(sheetData);

        // Auto-ajustar anchos
        const colWidths = headers.map((header, colIndex) => {
            let maxLength = header.length;
            const sampleSize = Math.min(200, dataToExport.length);
            for (let i = 0; i < sampleSize; i++) {
                const val = String(dataToExport[i][colIndex] || '');
                if (val.length > maxLength) {
                    maxLength = val.length;
                }
            }
            return { wch: Math.min(45, maxLength + 3) };
        });
        newWs['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(newWb, newWs, 'Comparación');
        XLSX.writeFile(newWb, filename);

    } catch (error) {
        console.error('Error al exportar tabla a Excel:', error);
        showAlert('Ocurrió un error al exportar la tabla a Excel.');
    }
};

async function generateManagerialReport(reportType = 'concepto') {
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
    
    // Hacer una pausa mínima para que el overlay se dibuje
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
        // Paso 1: Validacion
        updateProgressStep('1-validate', 'processing', 'Validando periodos y filtros...');
        let p1, p2;
        if (reportType === 'persona') {
            p1 = state.comparePeriod1;
            p2 = state.comparePeriod2;
        } else if (reportType === 'ceco') {
            p1 = state.cecoComparePeriod1;
            p2 = state.cecoComparePeriod2;
        } else if (reportType === 'cargo') {
            p1 = state.cargoComparePeriod1;
            p2 = state.cargoComparePeriod2;
        } else {
            p1 = state.conceptComparePeriod1;
            p2 = state.conceptComparePeriod2;
        }
        
        if (!p1 || !p2) {
            throw new Error("Por favor selecciona los periodos (P1 y P2) en la tabla antes de continuar.");
        }
        updateProgressStep('1-validate', 'success', 'Periodos validados correctamente.');
        
        // Paso 2: Insights
        updateProgressStep('2-insights', 'processing', 'Calculando insights gerenciales...');
        const insights = calculateManagerialInsights(reportType);
        if (!insights) {
            throw new Error("No se pudieron calcular los insights. Verifica los filtros seleccionados.");
        }
        updateProgressStep('2-insights', 'success', 'Insights gerenciales calculados.');

        let selectedCecos = [];
        if (reportType === 'persona') {
            selectedCecos = state.periodCompareSelectedCecos || [];
        } else if (reportType === 'cargo') {
            selectedCecos = state.cargoCompareSelectedCecos || [];
        } else if (reportType === 'concepto') {
            selectedCecos = state.conceptCompareSelectedCecos || [];
        }
        const selectedCecosLabel = selectedCecos.length > 0
            ? (selectedCecos.length === 1 ? selectedCecos[0].split(' - ')[0] : `${selectedCecos.length} Seleccionados`)
            : 'Todos';

        let specificFilterLabel = 'Todos';
        let specificFilterTitle = 'Filtro Colaborador';
        if (reportType === 'persona') {
            specificFilterTitle = 'Filtro Colaborador';
            const emps = state.periodCompareSelectedEmployees || [];
            specificFilterLabel = emps.length > 0
                ? (emps.length === 1 ? getEmployeeNameByCedula(emps[0]) : `${emps.length} Seleccionados`)
                : 'Todos';
        } else if (reportType === 'concepto') {
            specificFilterTitle = 'Filtro Concepto';
            const concs = state.conceptCompareSelectedConcepts || [];
            specificFilterLabel = concs.length > 0
                ? (concs.length === 1 ? concs[0] : `${concs.length} Seleccionados`)
                : 'Todos';
        } else if (reportType === 'cargo') {
            specificFilterTitle = 'Filtro Cargo';
            const cargos = state.cargoCompareSelectedCargos || [];
            specificFilterLabel = cargos.length > 0
                ? (cargos.length === 1 ? cargos[0] : `${cargos.length} Seleccionados`)
                : 'Todos';
        } else if (reportType === 'ceco') {
            specificFilterTitle = 'Filtro Ceco';
            const cecos = state.cecoCompareSelectedCecos || [];
            specificFilterLabel = cecos.length > 0
                ? (cecos.length === 1 ? cecos[0].split(' - ')[0] : `${cecos.length} Seleccionados`)
                : 'Todos';
        }
        
        // Paso 3: Logo
        updateProgressStep('3-logo', 'processing', 'Cargando logo corporativo de NomAI...');
        
        // Carga dinámica del logo real con fondo blanco garantizado
        const logoBase64 = await (async () => {
            try {
                const img = new Image();
                // Intentar primero logo-report.png, luego logo-expanded.png como fallback
                const logoSrc = 'logo-report.png';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = logoSrc + '?nocache=' + Date.now();
                });
                // Dibujar sobre canvas con fondo blanco para eliminar transparencias
                const canvas = document.createElement('canvas');
                // Escalar proporcionalmente a max 600px de ancho para el reporte
                const maxW = 600;
                const scale = img.width > maxW ? maxW / img.width : 1;
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            } catch (e) {
                // Fallback: intentar logo-expanded.png
                try {
                    const imgFb = new Image();
                    await new Promise((resolve, reject) => {
                        imgFb.onload = resolve;
                        imgFb.onerror = reject;
                        imgFb.src = 'logo-expanded.png?nocache=' + Date.now();
                    });
                    const cvsFb = document.createElement('canvas');
                    const maxW = 600;
                    const scale = imgFb.width > maxW ? maxW / imgFb.width : 1;
                    cvsFb.width = Math.round(imgFb.width * scale);
                    cvsFb.height = Math.round(imgFb.height * scale);
                    const ctxFb = cvsFb.getContext('2d');
                    ctxFb.fillStyle = '#ffffff';
                    ctxFb.fillRect(0, 0, cvsFb.width, cvsFb.height);
                    ctxFb.drawImage(imgFb, 0, 0, cvsFb.width, cvsFb.height);
                    return cvsFb.toDataURL('image/png');
                } catch (e2) {
                    // Último fallback: texto SVG como logo
                    return 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="200" height="50" fill="white"/><text x="10" y="35" font-family="Arial" font-size="28" font-weight="bold" fill="#1e1b4b">NomAI</text></svg>');
                }
            }
        })();
        updateProgressStep('3-logo', 'success', 'Logo cargado exitosamente.');
        
        // Paso 4: Construyendo maqueta
        updateProgressStep('4-template', 'processing', 'Construyendo maqueta del reporte...');
        
        const formatPercentage = (val) => (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
        
        // Helper para pintar badges de variación (Verde si > 0, Rojo si < 0)
        const getTrendBadge = (diff, pct, label = '') => {
            const isNeutral = Math.abs(diff) < 0.01;
            let color = '#475569';
            let bg = '#f1f5f9';
            let border = '#cbd5e1';
            let icon = '';
            
            if (!isNeutral) {
                if (diff > 0) {
                    color = '#059669'; // verde para positivo
                    bg = 'rgba(16, 185, 129, 0.08)';
                    border = 'rgba(16, 185, 129, 0.2)';
                    icon = '↑';
                } else {
                    color = '#e11d48'; // rojo para negativo
                    bg = 'rgba(244, 63, 94, 0.08)';
                    border = 'rgba(244, 63, 94, 0.2)';
                    icon = '↓';
                }
            }
            
            return `
                <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 8pt; font-weight: 600; color: ${color}; background: ${bg}; border: 1px solid ${border}; white-space: nowrap;">
                    <span>${icon}</span>
                    <span>${formatPercentage(pct)}</span>
                    ${label ? `<span style="font-size: 7.5pt; font-weight: normal; margin-left: 2px; opacity: 0.85;">(${label})</span>` : ''}
                </span>
            `;
        };

        const getTrendBadgeSimple = (diff, pct) => {
            const isPositive = diff >= 0;
            const color = isPositive ? '#059669' : '#e11d48';
            const bg = isPositive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)';
            const border = isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)';
            const icon = isPositive ? '↑' : '↓';
            return `
                <span style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 12px; font-size: 7.5pt; font-weight: 600; color: ${color}; background: ${bg}; border: 1px solid ${border};">
                    <span>${icon}</span>
                    <span>${formatPercentage(pct)}</span>
                </span>
            `;
        };

        // Helper: etiqueta descriptiva del tipo de reporte
        const reportTitles = {
            'concepto': 'Análisis Detallado por Conceptos de Nómina',
            'persona':  'Análisis Masivo por Persona (Colaborador)',
            'ceco':     'Análisis Masivo por Centro de Costo',
            'cargo':    'Análisis Masivo por Cargo'
        };
        const reportTitle = reportTitles[reportType] || reportTitles['concepto'];

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
        
        const devengosIsPositive = insights.totals.devengosDiff >= 0;
        const devengosBg = devengosIsPositive ? '#ecfdf5' : '#fef2f2'; // verde si positivo, rojo si negativo
        const devengosBorder = devengosIsPositive ? '#a7f3d0' : '#fecaca';
        const devengosText = devengosIsPositive ? '#047857' : '#b91c1c';
        const devengosValText = devengosIsPositive ? '#065f46' : '#991b1b';

        const descuentosIsPositive = insights.totals.descuentosDiff >= 0;
        const descuentosBg = descuentosIsPositive ? '#ecfdf5' : '#fef2f2'; // verde si positivo, rojo si negativo
        const descuentosBorder = descuentosIsPositive ? '#a7f3d0' : '#fecaca';
        const descuentosText = descuentosIsPositive ? '#047857' : '#b91c1c';
        const descuentosValText = descuentosIsPositive ? '#065f46' : '#991b1b';

        const netIsPositive = insights.totals.netDiff >= 0;
        const netBg = netIsPositive ? '#ecfdf5' : '#fef2f2'; // verde si positivo, rojo si negativo
        const netBorder = netIsPositive ? '#a7f3d0' : '#fecaca';
        const netText = netIsPositive ? '#047857' : '#b91c1c';
        const netValText = netIsPositive ? '#065f46' : '#991b1b';

        const alert = insights.complianceAlert;
        let alertBg = 'rgba(16, 185, 129, 0.02)';
        let alertBorder = '#a7f3d0';
        let alertText = '#047857';
        let alertIcon = '✔️';
        if (alert.severity === 'danger') {
            alertBg = 'rgba(239, 68, 68, 0.02)';
            alertBorder = '#fecaca';
            alertText = '#b91c1c';
            alertIcon = '⚠️';
        } else if (alert.severity === 'warning') {
            alertBg = 'rgba(245, 158, 11, 0.02)';
            alertBorder = '#fef3c7';
            alertText = '#d97706';
            alertIcon = '⚠️';
        }

        const atipicEmps = insights.empDetails.filter(e => Math.abs(e.pct) >= 30);
        const atipicText = atipicEmps.length > 0 
            ? `Se detectaron desviaciones atípicas de salario neto superiores al 30% en: ${atipicEmps.slice(0, 3).map(e => `<strong>${e.name}</strong> (${formatPercentage(e.pct)})`).join(', ')}. Se sugiere auditar causales de variación.`
            : `No se registraron colaboradores con desviaciones salariales netas superiores al 30%, indicando un comportamiento individual estable.`;

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
                    width: 215.9mm;
                    height: 279.4mm; /* Letter size */
                    background: white;
                    color: #334155;
                    padding: 16mm 20mm;
                    margin-bottom: 40px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    box-sizing: border-box;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .report-header-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #1e1b4b;
                    padding-bottom: 8px;
                    height: 52px;
                    box-sizing: border-box;
                }
                .report-footer-section {
                    border-top: 1px solid #e2e8f0;
                    padding-top: 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 8pt;
                    color: #94a3b8;
                    font-weight: 500;
                    height: 25px;
                    box-sizing: border-box;
                }
                .report-body-container {
                    flex-grow: 1;
                    padding: 15px 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-around;
                }
                .report-page-sheet table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .report-page-sheet table th {
                    background: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                    color: #1e293b;
                    font-weight: 600;
                }
                .report-page-sheet table td {
                    border-bottom: 1px solid #f1f5f9;
                    color: #475569;
                }
                @media (max-width: 768px) {
                    .report-page-sheet {
                        width: 100%;
                        height: auto;
                        min-height: 279mm;
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
                    <h2 class="report-preview-title" style="margin: 0; font-size: 1.2rem; font-weight: 600; color: white;">Previsualización de Informe Gerencial NomAI</h2>
                    <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #cbd5e1;">Periodos: ${getPeriodLabel(insights.p1)} vs ${getPeriodLabel(insights.p2)}</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button id="btn-download-pdf" class="btn btn-primary" style="display: flex; align-items: center; gap: 6px; padding: 6px 18px; border-radius: 20px; font-weight: 500; background: #1e1b4b; border: none; color: white; cursor: pointer; transition: background 0.2s;">
                        <i data-lucide="download" style="width: 16px; height: 16px;"></i> Descargar PDF
                    </button>
                    <button id="btn-close-report-preview" class="btn btn-secondary" style="display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 20px; font-weight: 500; cursor: pointer;">
                        <i data-lucide="x" style="width: 16px; height: 16px;"></i> Cerrar Informe
                    </button>
                </div>
            </div>
            
            <div class="report-preview-body">
                <!-- Page 1: Portada y Resumen Ejecutivo -->
                <div class="report-page-sheet">
                    <div class="report-header-section">
                        <img src="${logoBase64}" alt="NomAI Logo" style="height: 40px;" />
                        <div style="text-align: right; font-size: 8pt; color: #94a3b8; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">${reportTitle}</div>
                    </div>

                    <div class="report-body-container" style="justify-content: flex-start; gap: 15px; margin-top: 10px;">
                        <div>
                            <h1 style="font-size: 20pt; font-weight: 800; line-height: 1.25; color: #1e1b4b; margin: 0 0 5px 0; letter-spacing: -0.5px; border-left: 4px solid #1e1b4b; padding-left: 12px; text-transform: uppercase;">Informe Ejecutivo de Variación de Nómina</h1>
                            <p style="font-size: 8.5pt; color: #64748b; margin: 2px 0 0 12px;">Diseñado para la Dirección de Recursos Humanos, CFO y Gerencia General.</p>
                        </div>

                        <!-- Metadatos de Filtros Aplicados -->
                        <div style="background: #1e1b4b; color: white; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 7.5pt; box-sizing: border-box;">
                            <div>
                                <span style="opacity: 0.75; display: block; text-transform: uppercase; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.2px;">Periodo 1 (Base)</span>
                                <strong style="font-size: 8.5pt; margin-top: 2px; display: block;">${getPeriodLabel(insights.p1)}</strong>
                            </div>
                            <div>
                                <span style="opacity: 0.75; display: block; text-transform: uppercase; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.2px;">Periodo 2 (Comparado)</span>
                                <strong style="font-size: 8.5pt; margin-top: 2px; display: block;">${getPeriodLabel(insights.p2)}</strong>
                            </div>
                            <div>
                                <span style="opacity: 0.75; display: block; text-transform: uppercase; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.2px;">Filtro Centro Costo</span>
                                <strong style="font-size: 8pt; margin-top: 2px; display: block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${selectedCecosLabel}">${selectedCecosLabel}</strong>
                            </div>
                            <div>
                                <span style="opacity: 0.75; display: block; text-transform: uppercase; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.2px;">Filtro Cargo / Específico</span>
                                <strong style="font-size: 8pt; margin-top: 2px; display: block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${specificFilterLabel}">${specificFilterLabel}</strong>
                            </div>
                        </div>

                        <!-- Balance Financiero Comparativo (Macros) -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; box-sizing: border-box;">
                            <h3 style="font-size: 8.5pt; font-weight: 700; color: #1e1b4b; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Balance Financiero Global (P1 vs P2)</h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                                <!-- KPI Devengos -->
                                <div style="border: 1px solid ${devengosBorder}; border-radius: 10px; padding: 10px; background: ${devengosBg};">
                                    <div style="font-size: 7.5pt; font-weight: 600; color: ${devengosText}; text-transform: uppercase;">Total Devengos</div>
                                    <div style="font-size: 11pt; font-weight: 800; color: ${devengosValText}; margin: 3px 0;">${currencyFormatter.format(insights.totals.devengosP2)}</div>
                                    <div style="font-size: 7pt; color: #64748b;">Antes: ${currencyFormatter.format(insights.totals.devengosP1)}</div>
                                    <div style="margin-top: 6px;">
                                        ${getTrendBadge(insights.totals.devengosDiff, insights.totals.devengosPct)}
                                    </div>
                                </div>
                                <!-- KPI Descuentos -->
                                <div style="border: 1px solid ${descuentosBorder}; border-radius: 10px; padding: 10px; background: ${descuentosBg};">
                                    <div style="font-size: 7.5pt; font-weight: 600; color: ${descuentosText}; text-transform: uppercase;">Total Descuentos</div>
                                    <div style="font-size: 11pt; font-weight: 800; color: ${descuentosValText}; margin: 3px 0;">${currencyFormatter.format(insights.totals.descuentosP2)}</div>
                                    <div style="font-size: 7pt; color: #64748b;">Antes: ${currencyFormatter.format(insights.totals.descuentosP1)}</div>
                                    <div style="margin-top: 6px;">
                                        ${getTrendBadge(insights.totals.descuentosDiff, insights.totals.descuentosPct)}
                                    </div>
                                </div>
                                <!-- KPI Neto -->
                                <div style="border: 1px solid ${netBorder}; border-radius: 10px; padding: 10px; background: ${netBg};">
                                    <div style="font-size: 7.5pt; font-weight: 600; color: ${netText}; text-transform: uppercase;">Gasto Neto Nómina</div>
                                    <div style="font-size: 11pt; font-weight: 800; color: ${netValText}; margin: 3px 0;">${currencyFormatter.format(insights.totals.netP2)}</div>
                                    <div style="font-size: 7pt; color: #64748b;">Antes: ${currencyFormatter.format(insights.totals.netP1)}</div>
                                    <div style="margin-top: 6px;">
                                        ${getTrendBadge(insights.totals.netDiff, insights.totals.netPct)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Conector visual dashed direct -->
                        <div style="width: 100%; display: flex; justify-content: center; align-items: center; margin: 2px 0;">
                            <div style="width: 95%; height: 1.5px; border-top: 1.5px dashed #cbd5e1;"></div>
                        </div>

                        <!-- Sección de Headcount (Altas vs Bajas con montos) -->
                        <div style="border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-sizing: border-box;">
                            <div style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 700; font-size: 8pt; color: #1e1b4b; text-transform: uppercase; letter-spacing: 0.5px;">
                                👥 Análisis de Ingresos y Retiros de Personal (Efecto Headcount)
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 12px;">
                                <!-- INGRESOS (Altas) -->
                                <div style="border: 1px solid #a7f3d0; background: rgba(16, 185, 129, 0.01); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div>
                                        <strong style="color: #047857; text-transform: uppercase; font-size: 7.5pt; display: block; margin-bottom: 6px;">Nuevos Ingresos en P2 (${insights.altas.length} Colaboradores)</strong>
                                        <div style="font-size: 11pt; font-weight: 800; color: #065f46; margin-bottom: 8px;">Costo Generado: +${currencyFormatter.format(insights.totalAltasAmt)}</div>
                                        <div style="font-size: 7pt; color: #334155; line-height: 1.45;">
                                            ${insights.altas.slice(0, 3).map(a => `• ${a.name}: +${currencyFormatter.format(a.net)}`).join('<br>')}
                                            ${insights.altas.length > 3 ? `<em style="color:#64748b; font-size:6.5pt; display:block; margin-top:2px;">y ${insights.altas.length - 3} colaboradores más.</em>` : ''}
                                        </div>
                                    </div>
                                </div>
                                <!-- RETIROS (Bajas) -->
                                <div style="border: 1px solid #fecaca; background: rgba(244, 63, 94, 0.01); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div>
                                        <strong style="color: #b91c1c; text-transform: uppercase; font-size: 7.5pt; display: block; margin-bottom: 6px;">Retiros / Bajas en P1 (${insights.bajas.length} Colaboradores)</strong>
                                        <div style="font-size: 11pt; font-weight: 800; color: #991b1b; margin-bottom: 8px;">Ahorro Generado: -${currencyFormatter.format(insights.totalBajasAmt)}</div>
                                        <div style="font-size: 7pt; color: #334155; line-height: 1.45;">
                                            ${insights.bajas.slice(0, 3).map(b => `• ${b.name}: -${currencyFormatter.format(b.net)}`).join('<br>')}
                                            ${insights.bajas.length > 3 ? `<em style="color:#64748b; font-size:6.5pt; display:block; margin-top:2px;">y ${insights.bajas.length - 3} colaboradores más.</em>` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 8px 12px; font-size: 7.8pt; color: #475569; line-height: 1.4;">
                                <strong>Variación Financiera Neta por Headcount:</strong>
                                <span style="font-weight: 700; color: ${insights.headcountNetEffect >= 0 ? '#059669' : '#e11d48'};">
                                    ${insights.headcountNetEffect >= 0 ? '+' : ''}${currencyFormatter.format(insights.headcountNetEffect)}
                                </span>
                                (Explica el <strong>${insights.headcountPct}%</strong> de la variación total del periodo comparado).
                            </div>
                        </div>
                    </div>

                    <div class="report-footer-section">
                        <div>NomAI Dashboard - Inteligencia Financiera de Nómina</div>
                        <div>Confidencial - Página 1 de 4</div>
                    </div>
                </div>

                <!-- Page 2: Desglose y Variación de Estructura de Pagos -->
                <div class="report-page-sheet">
                    <div class="report-header-section">
                        <img src="${logoBase64}" alt="NomAI Logo" style="height: 32px;" />
                        <div style="font-size: 8pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${reportTitle}</div>
                    </div>

                    <div class="report-body-container" style="justify-content: flex-start; gap: 12px;">
                        <div>
                            <h3 style="font-size: 11pt; font-weight: 700; color: #1e1b4b; margin: 0 0 2px 0; border-bottom: 2px solid #1e1b4b; padding-bottom: 3px; display: inline-block;">2. Variación de Estructura de Pagos por Concepto</h3>
                            <p style="font-size: 8pt; color: #64748b; margin: 2px 0 0 0; line-height: 1.35;">
                                Comparativo sin agrupamientos artificiales. Se listan los principales conceptos de nómina liquidados y sus tendencias de variación.
                            </p>
                        </div>

                        <!-- Tabla de Conceptos Detallada (P1 vs P2) -->
                        <div style="margin-top: 2px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background: #1e1b4b; color: white; text-align: left;">
                                        <th style="padding: 5px 8px; font-weight: 600;">Concepto</th>
                                        <th style="padding: 5px 8px; font-weight: 600;">Naturaleza</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Valor P1</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Valor P2</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Variación ($)</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Variación (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${insights.conceptDetails.slice(0, 10).map((c, i) => `
                                        <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? 'white' : '#f8fafc'};">
                                            <td style="padding: 5px 8px; font-weight: 600; color: #1e293b;">${c.co}</td>
                                            <td style="padding: 5px 8px; color: #64748b; text-transform: uppercase;">${c.na}</td>
                                            <td style="padding: 5px 8px; text-align: right;">${currencyFormatter.format(c.v1)}</td>
                                            <td style="padding: 5px 8px; text-align: right;">${currencyFormatter.format(c.v2)}</td>
                                            <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: ${c.diff >= 0 ? '#059669' : '#e11d48'};">
                                                ${c.diff >= 0 ? '+' : ''}${currencyFormatter.format(c.diff)}
                                            </td>
                                            <td style="padding: 5px 8px; text-align: right;">
                                                ${getTrendBadgeSimple(c.diff, c.pct)}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Matriz de Cambios Estructurales -->
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; box-sizing: border-box;">
                            <strong style="color: #1e1b4b; display: block; margin-bottom: 6px; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.5px;">Cambios Estructurales en la Nómina (Nuevos vs Inactivos)</strong>
                            <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
                                <thead>
                                    <tr style="border-bottom: 1px solid #cbd5e1; text-align: left; color: #475569;">
                                        <th style="padding: 4px; font-weight: 600;">Concepto</th>
                                        <th style="padding: 4px; font-weight: 600;">Definición / Significado de Pago</th>
                                        <th style="padding: 4px; font-weight: 600; text-align: right;">Estado</th>
                                        <th style="padding: 4px; font-weight: 600; text-align: right;">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(() => {
                                        const rows = [];
                                        insights.newConcepts.slice(0, 2).forEach(nc => {
                                            rows.push(`
                                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                                    <td style="padding: 4px; font-weight: 600; color: #334155;">${nc.co}</td>
                                                    <td style="padding: 4px; color: #64748b;">${getConceptTranslation(nc.co)}</td>
                                                    <td style="padding: 4px; text-align: right;">
                                                        <span style="background: rgba(16, 185, 129, 0.08); color: #059669; border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 12px; padding: 1px 6px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase;">Nuevo Pago</span>
                                                    </td>
                                                    <td style="padding: 4px; text-align: right; font-weight: 600; color: #059669;">+${currencyFormatter.format(nc.v2)}</td>
                                                </tr>
                                            `);
                                        });
                                        insights.inactiveConcepts.slice(0, 2).forEach(ic => {
                                            rows.push(`
                                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                                    <td style="padding: 4px; font-weight: 600; color: #334155;">${ic.co}</td>
                                                    <td style="padding: 4px; color: #64748b;">${getConceptTranslation(ic.co)}</td>
                                                    <td style="padding: 4px; text-align: right;">
                                                        <span style="background: rgba(244, 63, 94, 0.08); color: #e11d48; border: 1px solid rgba(244, 63, 94, 0.2); border-radius: 12px; padding: 1px 6px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase;">Inactivo / Retirado</span>
                                                    </td>
                                                    <td style="padding: 4px; text-align: right; font-weight: 600; color: #e11d48;">-${currencyFormatter.format(ic.v1)}</td>
                                                </tr>
                                            `);
                                        });
                                        return rows.length > 0 ? rows.join('') : '<tr><td colspan="4" style="padding: 6px; text-align: center; color: #94a3b8;">Sin cambios estructurales en los conceptos comparados.</td></tr>';
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        <!-- Gráfico comparativo de distribución -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 2px;">
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                                <strong style="font-size: 7.5pt; font-weight: 700; color: #1e293b; text-transform: uppercase; display: block; margin-bottom: 6px;">Estructura Devengos vs Descuentos</strong>
                                <canvas id="chart-macro-comparison" width="250" height="110" style="margin: 0 auto;"></canvas>
                            </div>
                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                                <strong style="font-size: 7.5pt; font-weight: 700; color: #1e293b; text-transform: uppercase; display: block; margin-bottom: 6px;">Composición Global del Gasto</strong>
                                <canvas id="chart-macro-pie" width="220" height="110" style="margin: 0 auto;"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="report-footer-section">
                        <div>NomAI Dashboard - Inteligencia Financiera de Nómina</div>
                        <div>Confidencial - Página 2 de 4</div>
                    </div>
                </div>

                <!-- Page 3: Análisis de Variación Individual de Colaboradores / Cargos -->
                <div class="report-page-sheet">
                    <div class="report-header-section">
                        <img src="${logoBase64}" alt="NomAI Logo" style="height: 32px;" />
                        <div style="font-size: 8pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${reportTitle}</div>
                    </div>

                    <div class="report-body-container" style="justify-content: flex-start; gap: 12px;">
                        <div>
                            <h3 style="font-size: 11pt; font-weight: 700; color: #1e1b4b; margin: 0 0 2px 0; border-bottom: 2px solid #1e1b4b; padding-bottom: 3px; display: inline-block;">3. Análisis de Variación por Colaboradores / Cargos</h3>
                            <p style="font-size: 8pt; color: #64748b; margin: 2px 0 0 0; line-height: 1.35;">
                                Se identifican las principales desviaciones y la magnitud del cambio individual con respecto a la variación consolidada de la nómina.
                            </p>
                        </div>

                        <!-- Top 8 Colaboradores/Entidades de Mayor Impacto -->
                        <div style="margin-top: 2px;">
                            <strong style="color: #1e1b4b; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Top Variaciones del Periodo comparado</strong>
                            <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <thead>
                                    <tr style="background: #1e1b4b; color: white; text-align: left;">
                                        <th style="padding: 5px 8px; font-weight: 600;">Entidad</th>
                                        <th style="padding: 5px 8px; font-weight: 600;">Identificación / Categoría</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Valor P1</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Valor P2</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Variación ($)</th>
                                        <th style="padding: 5px 8px; text-align: right; font-weight: 600;">Variación (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(() => {
                                        let items = [];
                                        if (reportType === 'persona') items = insights.topEmpImpacts;
                                        else if (reportType === 'concepto') items = insights.conceptDetails;
                                        else if (reportType === 'ceco') items = insights.cecoDetails;
                                        else if (reportType === 'cargo') items = insights.cargoDetails;
                                        
                                        return items.slice(0, 8).map((emp, i) => `
                                            <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? 'white' : '#f8fafc'};">
                                                <td style="padding: 5px 8px; font-weight: 600; color: #1e293b;">${emp.name || emp.co || emp.cc || emp.cg || '-'}</td>
                                                <td style="padding: 5px 8px; color: #64748b;">${emp.c || emp.na || '-'}</td>
                                                <td style="padding: 5px 8px; text-align: right;">${currencyFormatter.format(emp.v1)}</td>
                                                <td style="padding: 5px 8px; text-align: right;">${currencyFormatter.format(emp.v2)}</td>
                                                <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: ${emp.diff >= 0 ? '#059669' : '#e11d48'};">
                                                    ${emp.diff >= 0 ? '+' : ''}${currencyFormatter.format(emp.diff)}
                                                </td>
                                                <td style="padding: 5px 8px; text-align: right;">
                                                    ${getTrendBadgeSimple(emp.diff, emp.pct)}
                                                </td>
                                            </tr>
                                        `).join('');
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        <!-- Cuadrante de Desviaciones -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <!-- Incrementos (Verde por regla del usuario) -->
                            <div style="background: rgba(16, 185, 129, 0.02); border: 1.5px solid #a7f3d0; border-radius: 10px; padding: 10px 12px; box-sizing: border-box;">
                                <strong style="color: #059669; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.2px;">
                                    <span>▲</span> Mayores Variaciones Positivas
                                </strong>
                                ${(() => {
                                    const topList = insights.empDetails.filter(e => e.diff > 0).slice(0, 3);
                                    return topList.length > 0 ? topList.map(emp => `
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.8pt; margin-bottom: 4px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px;">
                                            <span style="font-weight: 600; color: #1e293b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;">${emp.name}</span>
                                            <span style="font-weight: 700; color: #059669;">+${currencyFormatter.format(emp.diff)}</span>
                                        </div>
                                    `).join('') : '<div style="color:#64748b; font-size: 7.5pt; text-align:center;">Sin variaciones positivas.</div>';
                                })()}
                            </div>

                            <!-- Disminuciones (Rojo por regla del usuario) -->
                            <div style="background: rgba(244, 63, 94, 0.02); border: 1.5px solid #fecaca; border-radius: 10px; padding: 10px 12px; box-sizing: border-box;">
                                <strong style="color: #e11d48; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.2px;">
                                    <span>▼</span> Mayores Variaciones Negativas
                                </strong>
                                ${(() => {
                                    const topList = insights.empDetails.filter(e => e.diff < 0).sort((a,b) => a.diff - b.diff).slice(0, 3);
                                    return topList.length > 0 ? topList.map(emp => `
                                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.8pt; margin-bottom: 4px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px;">
                                            <span style="font-weight: 600; color: #1e293b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;">${emp.name}</span>
                                            <span style="font-weight: 700; color: #e11d48;">-${currencyFormatter.format(Math.abs(emp.diff))}</span>
                                        </div>
                                    `).join('') : '<div style="color:#64748b; font-size: 7.5pt; text-align:center;">Sin variaciones negativas.</div>';
                                })()}
                            </div>
                        </div>

                        <!-- Gráfico de barras horizontal -->
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; text-align: center;">
                            <canvas id="chart-top-concept-variations" width="560" height="135" style="margin: 0 auto;"></canvas>
                        </div>
                    </div>

                    <div class="report-footer-section">
                        <div>NomAI Dashboard - Inteligencia Financiera de Nómina</div>
                        <div>Confidencial - Página 3 de 4</div>
                    </div>
                </div>

                <!-- Page 4: Hallazgos Clave y Gobernanza Estratégica -->
                <div class="report-page-sheet">
                    <div class="report-header-section">
                        <img src="${logoBase64}" alt="NomAI Logo" style="height: 32px;" />
                        <div style="font-size: 8pt; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${reportTitle}</div>
                    </div>

                    <div class="report-body-container" style="justify-content: flex-start; gap: 15px;">
                        <div>
                            <h3 style="font-size: 11pt; font-weight: 700; color: #1e1b4b; margin: 0 0 2px 0; border-bottom: 2px solid #1e1b4b; padding-bottom: 3px; display: inline-block;">4. Plan de Acción y Gobernanza Organizacional</h3>
                            <p style="font-size: 8pt; color: #64748b; margin: 2px 0 0 0; line-height: 1.35;">
                                Recomendaciones analíticas específicas diseñadas para orientar la toma de decisiones por área directiva.
                            </p>
                        </div>

                        <!-- Tablas auxiliares (Slots) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <h4 style="font-size: 8pt; font-weight: 700; color: #1e293b; margin: 0 0 6px 0; text-transform: uppercase; border-left: 3px solid #1e1b4b; padding-left: 8px; letter-spacing: 0.2px;">${reportType === 'concepto' ? 'Principales Ceco por Variación' : 'Principales Conceptos por Variación'}</h4>
                                <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                                    <thead>
                                        <tr style="background: #f8fafc; text-align: left;">
                                            <th style="padding: 5px 6px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${reportType === 'concepto' ? 'Centro de Costo' : 'Concepto de Nómina'}</th>
                                            <th style="padding: 5px 6px; text-align: right; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Variación ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(() => {
                                            const slot1Data = reportType === 'concepto'
                                                ? insights.topCecoIncreases.slice(0, 3).map(cc => ({label: cc.cc, diff: cc.diff}))
                                                : insights.conceptDetails.filter(c => c.diff > 0).slice(0, 3).map(c => ({label: c.co, diff: c.diff}));
                                            return slot1Data.length > 0 ? slot1Data.map((item) => `
                                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                                    <td style="padding: 5px 6px; font-weight: 500; color: #334155;">${item.label}</td>
                                                    <td style="padding: 5px 6px; text-align: right; font-weight: 700; color: ${item.diff >= 0 ? '#059669' : '#e11d48'};">
                                                        ${item.diff >= 0 ? '+' : ''}${currencyFormatter.format(item.diff)}
                                                    </td>
                                                </tr>
                                            `).join('') : '<tr><td colspan="2" style="padding:6px; color:#94a3b8; text-align:center;">Sin variaciones</td></tr>';
                                        })()}
                                    </tbody>
                                </table>
                            </div>

                            <div>
                                <h4 style="font-size: 8pt; font-weight: 700; color: #1e293b; margin: 0 0 6px 0; text-transform: uppercase; border-left: 3px solid #1e1b4b; padding-left: 8px; letter-spacing: 0.2px;">${reportType === 'ceco' ? 'Principales Cargos por Variación' : 'Principales Ceco por Variación'}</h4>
                                <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                                    <thead>
                                        <tr style="background: #f8fafc; text-align: left;">
                                            <th style="padding: 5px 6px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${reportType === 'ceco' ? 'Cargo' : reportType === 'concepto' ? 'Cargo' : 'Centro de Costo'}</th>
                                            <th style="padding: 5px 6px; text-align: right; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Variación ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(() => {
                                            const slot2Data = reportType === 'ceco'
                                                ? insights.topCargoIncreases.map(cg => ({label: cg.cg, diff: cg.diff}))
                                                : reportType === 'concepto'
                                                    ? insights.topCargoIncreases.map(cg => ({label: cg.cg, diff: cg.diff}))
                                                    : reportType === 'cargo'
                                                        ? insights.topCecoIncreases.slice(0, 3).map(cc => ({label: cc.cc, diff: cc.diff}))
                                                        : insights.topCecoIncreases.slice(0, 3).map(cc => ({label: cc.cc, diff: cc.diff}));
                                            return slot2Data.length > 0 ? slot2Data.slice(0, 3).map((item) => `
                                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                                    <td style="padding: 5px 6px; font-weight: 500; color: #334155;">${item.label}</td>
                                                    <td style="padding: 5px 6px; text-align: right; font-weight: 700; color: ${item.diff >= 0 ? '#059669' : '#e11d48'};">
                                                        ${item.diff >= 0 ? '+' : ''}${currencyFormatter.format(item.diff)}
                                                    </td>
                                                </tr>
                                            `).join('') : '<tr><td colspan="2" style="padding:6px; color:#94a3b8; text-align:center;">Sin variaciones</td></tr>';
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Alerta de Cumplimiento / Hallazgo Estratégico -->
                        <div style="background: ${alertBg}; border: 1px solid ${alertBorder}; border-left: 4px solid ${alertBorder}; border-radius: 10px; padding: 12px 14px; box-sizing: border-box;">
                            <strong style="color: ${alertText}; font-size: 8pt; display: flex; align-items: center; gap: 5px; margin-bottom: 4px;">
                                <span>${alertIcon}</span> Hallazgo Estratégico de Nómina
                            </strong>
                            <p style="font-size: 7.5pt; color: #475569; margin: 0; line-height: 1.45;">${alert.message}</p>
                        </div>

                        <!-- Recomendaciones por Audiencia (3 columnas) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                            <!-- CFO -->
                            <div style="background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 10px;">
                                <strong style="color: #3730a3; font-size: 7.5pt; display: flex; align-items: center; gap: 4px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.2px;">
                                    💼 Para el CFO
                                </strong>
                                <ul style="margin: 0; padding-left: 14px; font-size: 7pt; color: #374151; line-height: 1.55; list-style-type: disc;">
                                    <li>Evaluar si la variación de ${formatPercentage(insights.totals.netPct)} en nómina neta es consistente con el presupuesto aprobado para el periodo.</li>
                                    <li>Los conceptos con mayor incremento deben estar alineados con compromisos contractuales o actas sindicales.</li>
                                    <li>Revisar el impacto financiero de los ${insights.altas.length} ingresos (+${currencyFormatter.format(insights.totalAltasAmt)}) contra las proyecciones de headcount.</li>
                                </ul>
                            </div>
                            <!-- Gerencia General -->
                            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px;">
                                <strong style="color: #166534; font-size: 7.5pt; display: flex; align-items: center; gap: 4px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.2px;">
                                    🏢 Gerencia General
                                </strong>
                                <ul style="margin: 0; padding-left: 14px; font-size: 7pt; color: #374151; line-height: 1.55; list-style-type: disc;">
                                    <li>El gasto de nómina pasó de ${currencyFormatter.format(insights.totals.netP1)} a ${currencyFormatter.format(insights.totals.netP2)}, representando una variación de ${currencyFormatter.format(insights.totals.netDiff)}.</li>
                                    <li>${insights.bajas.length > 0 ? `Los ${insights.bajas.length} retiros generaron un ahorro estimado de ${currencyFormatter.format(insights.totalBajasAmt)}, reduciendo la masa salarial.` : 'No se registraron retiros en el periodo comparado.'}</li>
                                    <li>El análisis de estructura revela un comportamiento ${Math.abs(insights.totals.netPct) > 10 ? 'con variación significativa que requiere seguimiento' : 'estable dentro de márgenes esperados'}.</li>
                                </ul>
                            </div>
                            <!-- RRHH -->
                            <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px;">
                                <strong style="color: #9a3412; font-size: 7.5pt; display: flex; align-items: center; gap: 4px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.2px;">
                                    👥 Dir. RRHH
                                </strong>
                                <ul style="margin: 0; padding-left: 14px; font-size: 7pt; color: #374151; line-height: 1.55; list-style-type: disc;">
                                    <li>${atipicEmps.length > 0 ? `Auditar variaciones atípicas (>30%) en ${atipicEmps.length} colaborador(es): ${atipicEmps.slice(0,2).map(e => e.name).join(', ')}.` : 'No se detectaron variaciones atípicas superiores al 30% en salario neto individual.'}</li>
                                    <li>Validar la correcta liquidación de devengos y descuentos en periodos con altas o retiros de personal.</li>
                                    <li>Confirmar que los ${insights.altas.length} nuevos ingresos cuenten con estructura salarial formalizada.</li>
                                </ul>
                            </div>
                        </div>

                        <!-- Firmas -->
                        <div style="margin-top: 10px; display: flex; justify-content: space-around; text-align: center; font-size: 7.5pt; color: #475569;">
                            <div style="width: 160px; border-top: 1px solid #cbd5e1; padding-top: 6px;">
                                <strong>Elaborado por:</strong><br>
                                Analista de Nómina — NomAI
                            </div>
                            <div style="width: 160px; border-top: 1px solid #cbd5e1; padding-top: 6px;">
                                <strong>Revisado por:</strong><br>
                                Dirección de RRHH
                            </div>
                            <div style="width: 160px; border-top: 1px solid #cbd5e1; padding-top: 6px;">
                                <strong>Aprobado por:</strong><br>
                                Gerente de Finanzas (CFO)
                            </div>
                        </div>
                    </div>

                    <!-- Footer Pagina 4 -->
                    <div class="report-footer-section">
                        <div>NomAI Dashboard - Inteligencia Financiera de Nómina</div>
                        <div>Confidencial - Página 4 de 4</div>
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
                        backgroundColor: '#4f46e5', // Indigo
                        borderColor: '#4338ca',
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
                                return '$' + (value / 1e6).toFixed(1) + 'M';
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
                datasets: [
                    {
                        label: 'P2 (Ext)',
                        data: [insights.totals.devengosP2, insights.totals.descuentosP2],
                        backgroundColor: ['#4f46e5', '#f43f5e'], // Indigo para Devengos, Rose para Descuentos
                        borderWidth: 1
                    },
                    {
                        label: 'P1 (Int)',
                        data: [insights.totals.devengosP1, insights.totals.descuentosP1],
                        backgroundColor: ['#a5b4fc', '#fecaca'], // Colores más claros para P1
                        borderWidth: 1
                    }
                ]
            },
            options: {
                animation: false,
                responsive: false,
                cutout: '60%', // Ajustado para dos anillos
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 10, font: { size: 8 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== undefined) {
                                    label += currencyFormatter.format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        // Selección dinámica de datos para el gráfico horizontal de variaciones
        let chartSourceData = insights.conceptDetails;
        let chartLabelKey = 'co';
        if (reportType === 'persona') {
            chartSourceData = insights.empDetails;
            chartLabelKey = 'name';
        } else if (reportType === 'ceco') {
            chartSourceData = insights.cecoDetails;
            chartLabelKey = 'cc';
        } else if (reportType === 'cargo') {
            chartSourceData = insights.cargoDetails;
            chartLabelKey = 'cg';
        }
        const topConceptsForChart = chartSourceData.slice(0, 8);
        const chartLabels = topConceptsForChart.map(c => {
            const label = c[chartLabelKey] || '-';
            return label.length > 25 ? label.substring(0, 22) + '...' : label;
        });

        const chartData = topConceptsForChart.map(c => c.diff);
        const chartColors = topConceptsForChart.map(c => c.diff >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(244, 63, 94, 0.85)');
        const chartBorderColors = topConceptsForChart.map(c => c.diff >= 0 ? '#10b981' : '#f43f5e');

        new Chart(previewOverlay.querySelector('#chart-top-concept-variations'), {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Variación Neta ($)',
                        data: chartData,
                        backgroundColor: chartColors,
                        borderColor: chartBorderColors,
                        borderWidth: 1
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                animation: false,
                responsive: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        stacked: false,
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
                    y: {
                        stacked: false,
                        ticks: {
                            font: { size: 7.5, weight: '500' }
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
        
        // Vincular boton descargar PDF
        previewOverlay.querySelector('#btn-download-pdf').addEventListener('click', async () => {
            const downloadBtn = previewOverlay.querySelector('#btn-download-pdf');
            const originalText = downloadBtn.innerHTML;
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = `<span class="spin-animation" style="border: 2px solid rgba(255,255,255,0.2); border-top: 2px solid white; border-radius: 50%; width: 12px; height: 12px; display: inline-block; margin-right: 5px;"></span> Generando PDF...`;
            
            try {
                const html2pdfLib = await loadHtml2Pdf();
                
                // Clonar las páginas del informe para generar el PDF de manera aislada
                const tempContainer = document.createElement('div');
                tempContainer.style.background = '#ffffff';
                
                const pages = previewOverlay.querySelectorAll('.report-page-sheet');
                pages.forEach((page, idx) => {
                    const pageClone = page.cloneNode(true);
                    pageClone.style.boxShadow = 'none';
                    pageClone.style.marginBottom = '0';
                    pageClone.style.borderRadius = '0';
                    pageClone.style.pageBreakAfter = idx < pages.length - 1 ? 'always' : 'auto';
                    
                    // Copiar imágenes generadas desde los canvas de Chart.js originales al clon
                    const originalCanvases = page.querySelectorAll('canvas');
                    const clonedCanvases = pageClone.querySelectorAll('canvas');
                    
                    originalCanvases.forEach((origCanvas, cIdx) => {
                        const clonedCanvas = clonedCanvases[cIdx];
                        if (clonedCanvas) {
                            const img = document.createElement('img');
                            img.src = origCanvas.toDataURL('image/png');
                            img.style.width = origCanvas.style.width || (origCanvas.width + 'px');
                            img.style.height = origCanvas.style.height || (origCanvas.height + 'px');
                            img.style.display = 'block';
                            img.style.margin = '0 auto';
                            clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
                        }
                    });
                    
                    tempContainer.appendChild(pageClone);
                });
                
                const opt = {
                    margin:       0,
                    filename:     `Reporte_Gerencial_${reportType.charAt(0).toUpperCase() + reportType.slice(1)}_${getPeriodLabel(insights.p1).replace(/\s+/g, '_')}_vs_${getPeriodLabel(insights.p2).replace(/\s+/g, '_')}.pdf`,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { 
                        scale: 2, 
                        useCORS: true, 
                        letterRendering: true,
                        backgroundColor: '#ffffff'
                    },
                    jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
                };
                
                await html2pdfLib().set(opt).from(tempContainer).save();
            } catch (pdfErr) {
                console.error("Error al generar PDF:", pdfErr);
                if (typeof window.showNomaiAlert === 'function') {
                    await window.showNomaiAlert("Hubo un error al generar el archivo PDF: " + pdfErr.message);
                } else {
                    alert("Hubo un error al generar el archivo PDF: " + pdfErr.message);
                }
            } finally {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = originalText;
            }
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
        const steps = ['1-validate', '2-insights', '3-logo', '4-template', '5-charts', '6-show'];
        for (let s of steps) {
            const row = document.getElementById('step-' + s);
            if (row && row.innerHTML.includes('spin-animation')) {
                updateProgressStep(s, 'error', 'Error en este paso.', err.message + "\nStack: " + err.stack);
                break;
            }
        }
        updateProgressStep('1-validate', 'error', 'Fallo de ejecución.', err.message + "\nStack: " + err.stack);
    }
}

// ─── Ordenamiento Genérico de Tablas ──────────────────────────────────────────
(function() {
    document.addEventListener('click', function (e) {
        const th = e.target.closest('th');
        if (!th) return;
        
        // Solo ordenar si tiene la clase sortable-header o contiene .sort-arrow
        if (!th.classList.contains('sortable-header') && !th.querySelector('.sort-arrow')) return;
        
        const table = th.closest('table');
        if (!table) return;
        
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        // Omitir la tabla principal de base de datos ya que tiene su propio ordenamiento virtual
        if (table.id === 'db-main-table') return;
        
        const index = Array.from(th.parentNode.children).indexOf(th);
        const order = th.getAttribute('data-order') === 'asc' ? 'desc' : 'asc';
        
        // Resetear otros encabezados en la misma fila
        Array.from(th.parentNode.children).forEach(sibling => {
            if (sibling !== th) {
                sibling.removeAttribute('data-order');
                const arrow = sibling.querySelector('.sort-arrow');
                if (arrow) arrow.textContent = ' ↕';
            }
        });
        
        th.setAttribute('data-order', order);
        const thArrow = th.querySelector('.sort-arrow');
        if (thArrow) {
            thArrow.textContent = order === 'asc' ? ' ↑' : ' ↓';
        }
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) return;
        
        // Función para buscar descendientes en estructuras jerárquicas
        function getDescendants(parentRow) {
            const parentKey = parentRow.getAttribute('data-cedula') || 
                              parentRow.getAttribute('data-concept-safe') || 
                              parentRow.getAttribute('data-row-key');
            if (!parentKey) return [];
            
            const directChildren = rows.filter(r => r.classList.contains(`child-of-${parentKey}`));
            let descendants = [];
            directChildren.forEach(child => {
                descendants.push(child);
                descendants = descendants.concat(getDescendants(child));
            });
            return descendants;
        }
        
        // Filtrar filas de nivel superior (aquellas que no tienen clase child-of-)
        const topLevelRows = rows.filter(r => {
            return !Array.from(r.classList).some(c => c.startsWith('child-of-'));
        });
        
        if (topLevelRows.length === 0) return;
        
        // Ordenar filas de nivel superior
        topLevelRows.sort((a, b) => {
            const valA = getCellValue(a, index);
            const valB = getCellValue(b, index);
            return compareValues(valA, valB, order);
        });
        
        // Re-apendizar filas al fragmento manteniendo jerarquía
        const fragment = document.createDocumentFragment();
        topLevelRows.forEach(parent => {
            fragment.appendChild(parent);
            getDescendants(parent).forEach(desc => {
                fragment.appendChild(desc);
            });
        });
        tbody.appendChild(fragment);
    });

    function getCellValue(row, index) {
        const cell = row.children[index];
        if (!cell) return '';
        return cell.textContent || cell.innerText || '';
    }

    function compareValues(valA, valB, order) {
        const cleanNum = (str) => {
            if (!str) return 0;
            let s = str.trim();
            if (s === '-' || s === '—' || s === '' || s === '—') return 0;
            
            let isNegative = false;
            if (s.includes('(') && s.includes(')')) {
                isNegative = true;
                s = s.replace(/[()]/g, '');
            } else if (s.startsWith('-')) {
                isNegative = true;
                s = s.substring(1);
            }
            
            s = s.replace(/[$\s%]/g, '');
            
            let hasComma = s.includes(',');
            let hasDot = s.includes('.');
            
            if (hasComma && hasDot) {
                s = s.replace(/\./g, '').replace(/,/g, '.');
            } else if (hasComma && !hasDot) {
                s = s.replace(/,/g, '.');
            } else if (!hasComma && hasDot) {
                const parts = s.split('.');
                if (parts[parts.length - 1].length === 3) {
                    s = s.replace(/\./g, '');
                }
            }
            
            let num = parseFloat(s);
            if (isNaN(num)) return str.trim().toLowerCase();
            return isNegative ? -num : num;
        };
        
        const a = cleanNum(valA);
        const b = cleanNum(valB);
        
        if (typeof a === 'number' && typeof b === 'number') {
            return order === 'asc' ? a - b : b - a;
        }
        
        return order === 'asc' 
            ? String(a).localeCompare(String(b)) 
            : String(b).localeCompare(String(a));
    }
})();




