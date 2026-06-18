/**
 * Nomai Importer - Lógica del Importador y Homologador
 * Diseñado desde cero para Nomai Dashboard
 */
(function() {
    // Configuración de Columnas Destino requeridas
    const TARGET_COLUMNS = [
        { key: 'identificacion', name: 'Identificación', required: true, desc: 'Identificación única del empleado.', synonyms: ['identificacion', 'identificación', 'cedula', 'cédula', 'documento', 'id', 'cc', 'documento de identidad', 'nit', 'nro_documento', 'rut', 'empleado id'] },
        { key: 'nombre_completo', name: 'Nombre Completo', required: true, desc: 'Apellidos y Nombres (en ese orden).', synonyms: ['nombre completo', 'nombre', 'nombres', 'empleado', 'nombre empleado', 'nombre y apellido', 'colaborador', 'trabajador', 'nombre_completo', 'nombres y apellidos', 'empleado_nombre'] },
        { key: 'fecha_acumulado', name: 'Fecha de Acumulado', required: true, desc: 'Fecha de la nómina (formato dd/mm/aaaa).', synonyms: ['fecha de acumulado', 'fecha acumulado', 'fecha', 'periodo', 'fecha de pago', 'fecha pago', 'fecha_acumulado', 'fec_acumulado', 'fecha_pago', 'dia'] },
        { key: 'codigo_concepto', name: 'Código Concepto', required: false, desc: 'Código del concepto (opcional).', synonyms: ['codigo concepto', 'código concepto', 'cod concepto', 'concepto cod', 'cod.concepto', 'codigo_concepto', 'cod_concepto', 'concepto_codigo', 'cod_con'] },
        { key: 'nombre_concepto', name: 'Nombre Concepto', required: true, desc: 'Nombre o descripción del concepto de nómina.', synonyms: ['nombre concepto', 'concepto', 'descripcion', 'descripción', 'descripción concepto', 'nombre_concepto', 'nombre del concepto', 'concepto_nombre', 'desc_concepto'] },
        { key: 'cantidad', name: 'Cantidad', required: false, desc: 'Valor numérico de cantidad (ej. horas, días).', synonyms: ['cantidad', 'horas', 'días', 'cant', 'dias', 'cantidad horas', 'horas_trabajadas', 'unidades'] },
        { key: 'valor', name: 'Valor', required: true, desc: 'Valor neto del concepto (ingreso o descuento).', synonyms: ['valor', 'neto', 'total', 'monto', 'importe', 'valor concepto', 'valor_neto', 'monto concepto', 'valor_concepto', 'neto a pagar'] },
        { key: 'codigo_ceco', name: 'Código Centro de Costo', required: false, desc: 'Código del centro de costos (opcional).', synonyms: ['codigo centro de costo', 'codigo centro costo', 'cod ceco', 'ceco cod', 'cod.ceco', 'codigo_ceco', 'centro_costo_codigo', 'cod_centro_costo'] },
        { key: 'nombre_ceco', name: 'Nombre Centro de Costo', required: false, desc: 'Nombre del centro de costos.', synonyms: ['nombre centro de costo', 'nombre centro costo', 'centro de costo', 'centro costo', 'ceco', 'nombre_ceco', 'centro_de_costos', 'centro_costo_nombre'] },
        { key: 'codigo_cargo', name: 'Código Cargo', required: false, desc: 'Código del cargo (opcional).', synonyms: ['codigo cargo', 'codigo_cargo', 'cod cargo', 'cod_cargo', 'cargo_codigo'] },
        { key: 'nombre_cargo', name: 'Nombre Cargo', required: false, desc: 'Nombre del cargo.', synonyms: ['nombre cargo', 'cargo', 'puesto', 'nombre_cargo', 'posicion', 'posición', 'cargo_nombre', 'puesto_trabajo'] },
        { key: 'tipo_nomina', name: 'Tipo de Nómina', required: true, desc: 'Tipo de nómina (ej. Normal, Adicional).', synonyms: ['tipo de nomina', 'tipo de nmina', 'tipo nomina', 'tipo_nomina', 'tipo_de_nomina', 'clase_nomina'] },
        { key: 'quincena', name: 'Quincena', required: true, desc: 'Periodo de pago (ej. 1Q, 2Q, Mensual).', synonyms: ['quincena', 'periodo quincena', 'periodo_quincena', 'quincena_periodo', 'periodo', 'periodo_pago'] },
        { key: 'naturaleza', name: 'Naturaleza', required: true, desc: 'Auto-calculada: valor ≥ 0 → INGRESO · valor < 0 → DESCUENTO.', synonyms: ['naturaleza', 'tipo concepto', 'tipo_concepto', 'naturaleza_concepto', 'naturaleza del concepto', 'naturaleza_con'] }
    ];

    // Estado Local del Importador
    let appState = {
        currentStep: 1,
        fileName: '',
        workbook: null,
        sheetNames: [],
        selectedSheet: '',
        rawHeaders: [], 
        rawRows: [],    
        columnMappings: {}, 
        combineNames: false,
        combineSurnamesList: [],
        combineNamesList: [],
        detectedSplitNames: false, 
        quincenaRule: 'quincenal', 
        defaultTipoNomina: 'Normal', 
        fechaAcumuladoIsMonthName: false,
        convertMonthToDate: true,
        convertMonthYear: '2026',
        convertMonthDayRule: 'last',
        combineMonthYear: false,
        monthColumn: '',
        yearColumn: '',
        dayColumn: '', 
        monthYearDayRule: 'last',
        detectedSplitMonthYear: false,
        suggestedMonthColumn: '',
        suggestedYearColumn: '',
        suggestedDayColumn: '', 
        transformedData: [],
        validationErrors: [],
        genericUnifications: {} 
    };

    // Mapa de meses en español/inglés
    const MONTHS_MAP = {
        'enero': 0, 'ene': 0, 'january': 0, 'jan': 0,
        'febrero': 1, 'feb': 1, 'february': 1,
        'marzo': 2, 'mar': 2, 'march': 2,
        'abril': 3, 'abr': 3, 'april': 3, 'apr': 3,
        'mayo': 4, 'may': 4,
        'junio': 5, 'jun': 5, 'june': 5,
        'julio': 6, 'jul': 6, 'july': 6,
        'agosto': 7, 'ago': 7, 'august': 7, 'aug': 7,
        'septiembre': 8, 'sep': 8, 'september': 8, 'sept': 8,
        'octubre': 9, 'oct': 9, 'october': 9,
        'noviembre': 10, 'nov': 10, 'november': 10,
        'diciembre': 11, 'dic': 11, 'december': 11, 'dec': 11
    };

    // Inicializar listeners al cargar el DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Enlazar elementos del Paso 1
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-btn');
        
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleFileSelect);
        }
        
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    processFile(e.dataTransfer.files[0]);
                }
            });
        }

        // Enlazar botones de navegación del Wizard
        const backTo1Btn = document.getElementById('back-to-1-btn');
        if (backTo1Btn) backTo1Btn.addEventListener('click', () => setStep(1));
        
        const goTo3Btn = document.getElementById('go-to-3-btn');
        if (goTo3Btn) goTo3Btn.addEventListener('click', validateAndGoToStep3);
        
        const backTo2Btn = document.getElementById('back-to-2-btn');
        if (backTo2Btn) backTo2Btn.addEventListener('click', () => setStep(2));
        
        const downloadExcelBtn = document.getElementById('download-excel-btn');
        if (downloadExcelBtn) downloadExcelBtn.addEventListener('click', downloadTransformedExcel);
        
        const loadToDashboardBtn = document.getElementById('load-to-dashboard-btn');
        if (loadToDashboardBtn) loadToDashboardBtn.addEventListener('click', loadDataToDashboard);

        // --- Configuración de Plantillas e Historial ---
        const saveTplBtn = document.getElementById('save-template-btn');
        if (saveTplBtn) saveTplBtn.addEventListener('click', saveCurrentTemplate);
        
        const loadTplBtn = document.getElementById('load-template-btn');
        if (loadTplBtn) loadTplBtn.addEventListener('click', loadSelectedTemplate);
        
        const viewHistBtn = document.getElementById('view-history-btn');
        if (viewHistBtn) viewHistBtn.addEventListener('click', showHistoryModal);
        
        const closeHistBtn = document.getElementById('close-history-btn');
        if (closeHistBtn) closeHistBtn.addEventListener('click', hideHistoryModal);
        
        const clearHistBtn = document.getElementById('clear-history-btn');
        if (clearHistBtn) clearHistBtn.addEventListener('click', clearHistory);
        
        setTimeout(loadConfigTemplates, 100);
    });

    // Control de Pasos (Wizard)
    function setStep(stepNum) {
        appState.currentStep = stepNum;
        
        for (let i = 1; i <= 3; i++) {
            const stepBtn = document.getElementById(`step-btn-${i}`);
            const panel = document.getElementById(`panel-${i}`);
            
            if (stepBtn && panel) {
                if (i < stepNum) {
                    stepBtn.classList.remove('active');
                    stepBtn.classList.add('completed');
                    panel.classList.add('hide');
                } else if (i === stepNum) {
                    stepBtn.classList.add('active');
                    stepBtn.classList.remove('completed');
                    panel.classList.remove('hide');
                } else {
                    stepBtn.classList.remove('active');
                    stepBtn.classList.remove('completed');
                    panel.classList.add('hide');
                }
            }
        }
        
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            const progressPercent = stepNum === 1 ? 16.6 : (stepNum === 2 ? 50 : 100);
            progressFill.style.width = `${progressPercent}%`;
        }
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Cargador
    function updateLoadingProgress(percent) {
        const container = document.getElementById('loading-progress-container');
        const bar = document.getElementById('loading-progress-bar');
        const percentText = document.getElementById('loading-percent');
        
        if (container && bar && percentText) {
            container.classList.remove('hide');
            percentText.classList.remove('hide');
            const p = Math.min(100, Math.max(0, percent));
            bar.style.width = p + '%';
            percentText.innerText = Math.round(p) + '%';
        }
    }

    function showLoading(text) {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        if (overlay && loadingText) {
            loadingText.innerText = text;
            overlay.classList.remove('hide');
        }
    }

    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hide');
        }
        setTimeout(() => {
            const container = document.getElementById('loading-progress-container');
            const bar = document.getElementById('loading-progress-bar');
            const percentText = document.getElementById('loading-percent');
            if (container) container.classList.add('hide');
            if (percentText) percentText.classList.add('hide');
            if (bar) bar.style.width = '0%';
        }, 300);
    }

    // Archivo y Carga
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
        // Limpiar el valor para permitir seleccionar el mismo archivo u otros sin tener que recargar la página
        e.target.value = '';
    }

    function processFile(file) {
        if (!window.XLSX) {
            alert('La librería SheetJS no está cargada. Por favor verifica tu conexión a internet.');
            return;
        }
        
        showLoading('Leyendo archivo...');
        updateLoadingProgress(5);
        
        const reader = new FileReader();
        
        reader.onprogress = function(e) {
            if (e.lengthComputable) {
                const percent = 5 + (e.loaded / e.total) * 30;
                updateLoadingProgress(percent);
            }
        };

        reader.onload = function(e) {
            updateLoadingProgress(35);
            showLoading('Procesando datos internos (Esto puede tardar unos segundos)...');
            
            setTimeout(() => {
                try {
                    const data = new Uint8Array(e.target.result);
                    updateLoadingProgress(45);
                    
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    updateLoadingProgress(80);
                    
                    appState.workbook = workbook;
                    appState.sheetNames = workbook.SheetNames;
                    appState.fileName = file.name;
                    
                    setTimeout(() => {
                        updateLoadingProgress(90);
                        if (appState.sheetNames.length > 1) {
                            updateLoadingProgress(100);
                            setTimeout(() => {
                                hideLoading();
                                renderSheetSelector();
                            }, 200);
                        } else {
                            loadSheetData(appState.sheetNames[0]);
                        }
                    }, 50);
                } catch (err) {
                    console.error(err);
                    alert('No se pudo leer el archivo. Asegúrate de que sea un archivo de Excel o CSV válido.');
                    hideLoading();
                }
            }, 50);
        };
        reader.onerror = function() {
            alert('Error al leer el archivo.');
            hideLoading();
        };
        reader.readAsArrayBuffer(file);
    }

    function renderSheetSelector() {
        const selectorContainer = document.getElementById('sheet-selector-container');
        const optionsList = document.getElementById('sheet-options-list');
        
        if (!selectorContainer || !optionsList) return;
        
        optionsList.innerHTML = '';
        appState.sheetNames.forEach(sheetName => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-outline';
            btn.style.margin = '0.25rem';
            btn.innerHTML = `<i data-lucide="sheet"></i> ${sheetName}`;
            btn.addEventListener('click', () => {
                selectorContainer.classList.add('hide');
                loadSheetData(sheetName);
            });
            optionsList.appendChild(btn);
        });
        
        selectorContainer.classList.remove('hide');
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // Desplazar suavemente hasta el selector
        selectorContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function loadSheetData(sheetName) {
        try {
            showLoading('Cargando hoja...');
            appState.selectedSheet = sheetName;
            const sheet = appState.workbook.Sheets[sheetName];
            
            // Cargar datos a matriz bidimensional
            const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            if (rawMatrix.length === 0) {
                alert('La pestaña seleccionada está vacía.');
                hideLoading();
                return;
            }

            // Detectar cabecera buscando la fila con más celdas llenas en las primeras 10
            let headerRowIndex = 0;
            let maxCols = 0;
            const searchDepth = Math.min(10, rawMatrix.length);
            
            for (let i = 0; i < searchDepth; i++) {
                const colsCount = rawMatrix[i].filter(val => val !== null && val !== undefined && val !== '').length;
                if (colsCount > maxCols) {
                    maxCols = colsCount;
                    headerRowIndex = i;
                }
            }
            
            const headers = rawMatrix[headerRowIndex].map((h, index) => {
                const val = String(h).trim();
                return val !== '' ? val : `Columna_${index + 1}`;
            });
            
            appState.rawHeaders = headers;
            
            const dataRows = [];
            for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
                const isEmptyRow = rawMatrix[i].every(val => val === null || val === undefined || val === '');
                if (!isEmptyRow) {
                    const rowObj = {};
                    headers.forEach((h, index) => {
                        rowObj[h] = rawMatrix[i][index] !== undefined ? rawMatrix[i][index] : '';
                    });
                    dataRows.push(rowObj);
                }
            }
            
            appState.rawRows = dataRows;
            
            showLoading('Analizando la estructura del archivo y auto-mapeando...');
            updateLoadingProgress(95);
            
            setTimeout(() => {
                runAutoMapping();
                
                if (appState.detectedSplitNames) {
                    appState.combineNames = true;
                }
                if (appState.detectedSplitMonthYear) {
                    appState.combineMonthYear = true;
                }
                
                updateLoadingProgress(100);
                setTimeout(() => {
                    hideLoading();
                    renderMappingUI();
                    setStep(2);
                }, 400);
            }, 800);
        } catch (err) {
            console.error(err);
            alert('Error al procesar los datos de la hoja.');
            hideLoading();
        }
    }

    // Auto-mapeador
    function runAutoMapping() {
        appState.columnMappings = {};
        
        TARGET_COLUMNS.forEach(target => {
            let matchedHeader = '';
            for (let header of appState.rawHeaders) {
                const normalizedHeader = cleanString(header);
                if (target.synonyms.includes(normalizedHeader)) {
                    matchedHeader = header;
                    break;
                }
            }
            appState.columnMappings[target.key] = matchedHeader || '';
        });

        detectSplitNames();
        detectSplitMonthYear();
    }

    function cleanString(str) {
        if (!str) return '';
        return str.toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") 
            .replace(/[^a-z0-9]/g, " ")     
            .replace(/\s+/g, " ")           
            .trim();
    }

    function detectSplitNames() {
        const surnameKeywords = ['apellido', 'apellidos', 'primer apellido', 'segundo apellido', 'apellido paterno', 'apellido materno'];
        const nameKeywords = ['nombre', 'nombres', 'primer nombre', 'segundo nombre', 'nombre de pila'];
        
        const matchedSurnames = [];
        const matchedNames = [];
        
        appState.rawHeaders.forEach(header => {
            const cleaned = cleanString(header);
            if (cleaned === 'nombre completo' || cleaned === 'nombre_completo' || cleaned === 'nombre y apellido' || cleaned === 'nombre y apellidos') {
                return;
            }
            if (surnameKeywords.some(keyword => cleaned === keyword || cleaned.includes('apellido'))) {
                matchedSurnames.push(header);
            } else if (nameKeywords.some(keyword => cleaned === keyword || (cleaned.includes('nombre') && !cleaned.includes('ceco') && !cleaned.includes('cargo') && !cleaned.includes('concepto')))) {
                matchedNames.push(header);
            }
        });

        if (matchedSurnames.length > 0 || matchedNames.length > 0) {
            appState.detectedSplitNames = true;
            appState.combineNames = false;
            appState.combineSurnamesList = matchedSurnames;
            appState.combineNamesList = matchedNames;
        } else {
            appState.detectedSplitNames = false;
            appState.combineNames = false;
            appState.combineSurnamesList = [];
            appState.combineNamesList = [];
        }
    }

    function detectSplitMonthYear() {
        const monthKeywords = ['mes', 'periodo_mes', 'mes_pago', 'mes pago', 'mes_periodo', 'mes_acumulado'];
        const yearKeywords = ['año', 'anio', 'year', 'periodo_año', 'periodo_anio', 'anio_pago', 'año pago', 'año_periodo', 'anio_periodo', 'ano'];
        const dayKeywords = ['dia', 'día', 'fecha_dia', 'dia_pago', 'dia pago', 'dia_acumulado'];
        
        let matchedMonth = '';
        let matchedYear = '';
        let matchedDay = '';
        
        for (let header of appState.rawHeaders) {
            const cleaned = cleanString(header);
            if (monthKeywords.includes(cleaned) || (cleaned.includes('mes') && !cleaned.includes('ceco') && !cleaned.includes('cargo') && !cleaned.includes('concepto'))) {
                if (!matchedMonth) matchedMonth = header;
            }
            if (yearKeywords.includes(cleaned) || cleaned.includes('año') || cleaned.includes('anio') || cleaned.includes('year') || cleaned === 'ano') {
                if (!matchedYear) matchedYear = header;
            }
            if (dayKeywords.includes(cleaned) || (cleaned.includes('dia') && !cleaned.includes('ceco') && !cleaned.includes('cargo') && !cleaned.includes('concepto'))) {
                if (!matchedDay) matchedDay = header;
            }
        }
        
        if (matchedMonth && matchedYear) {
            appState.detectedSplitMonthYear = true;
            appState.suggestedMonthColumn = matchedMonth;
            appState.suggestedYearColumn = matchedYear;
            appState.suggestedDayColumn = matchedDay;
            
            appState.combineMonthYear = false;
            appState.monthColumn = matchedMonth;
            appState.yearColumn = matchedYear;
            appState.dayColumn = matchedDay;
        } else {
            appState.detectedSplitMonthYear = false;
            appState.suggestedMonthColumn = '';
            appState.suggestedYearColumn = '';
            appState.suggestedDayColumn = '';
            appState.combineMonthYear = false;
            appState.monthColumn = '';
            appState.yearColumn = '';
            appState.dayColumn = '';
        }
    }

    // Resolutores de valores
    function getFieldValue(targetKey, rawRow) {
        if (targetKey === 'nombre_completo' && appState.combineNames) {
            if (appState.combineSurnamesList && appState.combineSurnamesList.length > 0) {
                const surnames = appState.combineSurnamesList.map(col => String(rawRow[col] || '').trim()).filter(val => val !== '');
                const names = appState.combineNamesList.map(col => String(rawRow[col] || '').trim()).filter(val => val !== '');
                return (surnames.join(' ') + ' ' + names.join(' ')).trim();
            } else {
                const parts = appState.combineNamesList.map(col => String(rawRow[col] || '').trim()).filter(val => val !== '');
                return parts.join(' ').trim();
            }
        }
        
        if (targetKey === 'fecha_acumulado' && appState.combineMonthYear) {
            const rawMonth = rawRow[appState.monthColumn];
            const rawYear = rawRow[appState.yearColumn];
            const rawDay = appState.dayColumn ? rawRow[appState.dayColumn] : '';
            const parsedDate = parseMonthNameToDate(rawMonth, rawYear || '2026', appState.monthYearDayRule, rawDay);
            return parsedDate.formattedString;
        }

        if (targetKey === 'tipo_nomina') {
            const mappedHeader = appState.columnMappings['tipo_nomina'];
            if (mappedHeader === '__unified__' || !mappedHeader) {
                return appState.defaultTipoNomina || 'Normal';
            }
        }
        
        if (targetKey === 'quincena') {
            const mappedHeader = appState.columnMappings['quincena'];
            if (mappedHeader === '__unified__' || !mappedHeader) {
                if (appState.quincenaRule === 'quincenal') {
                    const dateVal = getFieldValue('fecha_acumulado', rawRow);
                    const parsedDate = parseDate(dateVal);
                    if (parsedDate.isValid && parsedDate.dateObject) {
                        const day = parsedDate.dateObject.getDate();
                        return day <= 15 ? '1Q' : '2Q';
                    }
                    return '1Q';
                } else {
                    return 'Mensual';
                }
            }
        }
        
        if (targetKey === 'naturaleza') {
            const mappedHeader = appState.columnMappings['naturaleza'];
            if (mappedHeader === '__unified__' || !mappedHeader) {
                const valStr = getFieldValue('valor', rawRow);
                const valNum = parseNumber(valStr);
                return valNum >= 0 ? 'INGRESO' : 'DESCUENTO';
            }
        }

        if (appState.columnMappings[targetKey] === '__unified__' && appState.genericUnifications[targetKey]) {
            const config = appState.genericUnifications[targetKey];
            const parts = config.columns.map(col => String(rawRow[col] || '').trim()).filter(val => val !== '');
            return parts.join(config.separator).trim();
        }
        
        const mappedHeader = appState.columnMappings[targetKey];
        if (!mappedHeader) return '';
        const val = rawRow[mappedHeader];
        return val !== undefined && val !== null ? String(val).trim() : '';
    }

    function getFieldValuePreview(targetKey) {
        for (let row of appState.rawRows) {
            const val = getFieldValue(targetKey, row);
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
            }
        }
        return '';
    }

    function getColumnPreviewText(sourceHeader) {
        if (!sourceHeader) return '';
        for (let row of appState.rawRows) {
            const val = row[sourceHeader];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
            }
        }
        return 'Sin datos';
    }

    function getCombinedNamesPreviewText() {
        if (appState.combineSurnamesList.length === 0 && appState.combineNamesList.length === 0) {
            return 'Sin datos';
        }
        for (let row of appState.rawRows) {
            let fullName = '';
            if (appState.combineSurnamesList.length > 0) {
                const surnames = appState.combineSurnamesList.map(col => String(row[col] || '').trim()).filter(val => val !== '');
                const names = appState.combineNamesList.map(col => String(row[col] || '').trim()).filter(val => val !== '');
                fullName = (surnames.join(' ') + ' ' + names.join(' ')).trim().toUpperCase();
            } else {
                const parts = appState.combineNamesList.map(col => String(row[col] || '').trim()).filter(val => val !== '');
                fullName = parts.join(' ').trim().toUpperCase();
            }
            if (fullName !== '') {
                return fullName;
            }
        }
        return 'Sin datos';
    }

    function getCombinedMonthYearPreviewText() {
        if (!appState.monthColumn || !appState.yearColumn) {
            return 'Sin datos';
        }
        for (let row of appState.rawRows) {
            const rawMonth = row[appState.monthColumn];
            const rawYear = row[appState.yearColumn];
            const rawDay = appState.dayColumn ? row[appState.dayColumn] : '';
            
            if (rawMonth !== undefined && rawMonth !== null && String(rawMonth).trim() !== '') {
                const parsed = parseMonthNameToDate(rawMonth, rawYear || '2026', appState.monthYearDayRule, rawDay);
                if (parsed.isValid) {
                    return parsed.formattedString;
                }
            }
        }
        return 'Sin datos';
    }

    function updateRowPreview(targetKey) {
        const previewContainer = document.getElementById(`preview-val-container-${targetKey}`);
        if (!previewContainer) return;
        
        let previewText = '';
        let isMappedOrUnified = false;
        
        if (targetKey === 'nombre_completo' && appState.combineNames) {
            previewText = getCombinedNamesPreviewText();
            isMappedOrUnified = true;
        } else if (targetKey === 'fecha_acumulado' && appState.combineMonthYear) {
            previewText = getCombinedMonthYearPreviewText();
            isMappedOrUnified = true;
        } else if (targetKey === 'tipo_nomina') {
            previewText = getFieldValuePreview(targetKey);
            isMappedOrUnified = true;
        } else if (targetKey === 'quincena') {
            previewText = getFieldValuePreview(targetKey);
            isMappedOrUnified = true;
        } else if (targetKey === 'naturaleza') {
            previewText = getFieldValuePreview(targetKey);
            isMappedOrUnified = true;
        } else if (appState.columnMappings[targetKey] === '__unified__') {
            previewText = getFieldValuePreview(targetKey);
            isMappedOrUnified = true;
        } else {
            const mappedHeader = appState.columnMappings[targetKey];
            if (mappedHeader) {
                previewText = getColumnPreviewText(mappedHeader);
                isMappedOrUnified = true;
            }
        }
        
        if (isMappedOrUnified && previewText !== '') {
            previewContainer.style.display = 'block';
            previewContainer.innerHTML = `Muestra: <strong>${previewText}</strong>`;
        } else {
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
        }
    }

    // Renderizado del Paso 2 (Mapeo)
    function renderMappingUI() {
        const container = document.getElementById('mapping-grid-container');
        if (!container) return;
        container.innerHTML = '';
        
        TARGET_COLUMNS.forEach(target => {
            const mappedHeader = appState.columnMappings[target.key] || '';
            
            let isMapped = false;
            let isUnified = false;
            
            if (target.key === 'nombre_completo' && appState.combineNames) {
                isMapped = true;
                isUnified = true;
            } else if (target.key === 'fecha_acumulado' && appState.combineMonthYear) {
                isMapped = true;
                isUnified = true;
            } else if (target.key === 'naturaleza' && (mappedHeader === '' || mappedHeader === '__unified__')) {
                isMapped = true;
                isUnified = true;
            } else if (mappedHeader === '__unified__') {
                isMapped = true;
                isUnified = true;
            } else if (mappedHeader !== '') {
                isMapped = true;
            }
            
            const row = document.createElement('div');
            row.id = `mapping-row-${target.key}`;
            row.className = `mapping-row ${isMapped ? 'mapped' : (target.required ? 'missing-required' : 'unmapped')}`;
            
            // Info Destino
            const info = document.createElement('div');
            info.className = 'mapping-dest-info';
            
            const name = document.createElement('div');
            name.className = 'mapping-dest-name';
            name.innerHTML = `${target.name} ${target.required ? '<span class="required-dot">*</span>' : ''}`;
            
            const desc = document.createElement('div');
            desc.className = 'mapping-dest-desc';
            desc.innerText = target.desc;
            desc.title = target.desc;
            
            info.appendChild(name);
            info.appendChild(desc);
            
            // Contenedor de acciones
            const actionsPreview = document.createElement('div');
            actionsPreview.className = 'mapping-actions-preview';
            
            // Dropdown select
            const select = document.createElement('select');
            select.className = `mapping-select ${isMapped ? 'mapped' : 'unmapped'}`;
            select.id = `select-map-${target.key}`;
            
            if (isUnified) {
                const optUnified = document.createElement('option');
                optUnified.value = '__unified__';
                optUnified.innerText = 'Personalizada';
                optUnified.selected = true;
                select.appendChild(optUnified);
            }
            
            const optEmpty = document.createElement('option');
            optEmpty.value = '';
            optEmpty.innerText = target.required ? '-- Seleccionar --' : 'Omitir';
            select.appendChild(optEmpty);
            
            appState.rawHeaders.forEach(header => {
                const opt = document.createElement('option');
                opt.value = header;
                opt.innerText = header;
                if (!isUnified && header === mappedHeader) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
            
            select.addEventListener('change', (e) => {
                const val = e.target.value;
                if (target.key === 'nombre_completo' && val !== '__unified__') {
                    appState.combineNames = false;
                } else if (target.key === 'fecha_acumulado' && val !== '__unified__') {
                    appState.combineMonthYear = false;
                }
                appState.columnMappings[target.key] = val === '__unified__' ? '' : val;
                if (val !== '__unified__') {
                    delete appState.genericUnifications[target.key];
                }
                renderMappingUI();
            });
            
            // Botón Personalizar
            const btnPersonalizar = document.createElement('button');
            btnPersonalizar.className = 'btn btn-secondary btn-sm btn-personalizar';
            btnPersonalizar.innerText = 'Personalizar';
            btnPersonalizar.style.fontSize = '0.75rem';
            btnPersonalizar.style.padding = '0.35rem 0.75rem';
            btnPersonalizar.style.borderRadius = '6px';
            btnPersonalizar.style.marginRight = '0.5rem';
            btnPersonalizar.style.border = '1px solid #D1D5DB';
            btnPersonalizar.style.background = '#FFFFFF';
            btnPersonalizar.style.cursor = 'pointer';
            btnPersonalizar.style.fontWeight = '600';
            btnPersonalizar.style.color = '#4B5563';
            btnPersonalizar.style.display = 'inline-flex';
            btnPersonalizar.style.alignItems = 'center';
            btnPersonalizar.style.transition = 'all 0.15s ease';
            
            btnPersonalizar.addEventListener('click', () => {
                openCustomizeModal(target.key);
            });
            
            // Hover styling
            btnPersonalizar.addEventListener('mouseenter', () => {
                btnPersonalizar.style.background = '#F3E8FF';
                btnPersonalizar.style.borderColor = '#6C00D3';
                btnPersonalizar.style.color = '#6C00D3';
            });
            btnPersonalizar.addEventListener('mouseleave', () => {
                btnPersonalizar.style.background = '#FFFFFF';
                btnPersonalizar.style.borderColor = '#D1D5DB';
                btnPersonalizar.style.color = '#4B5563';
            });
            
            actionsPreview.appendChild(btnPersonalizar);

            // Icono de estado
            const icon = document.createElement('span');
            icon.className = 'alert-status-icon';
            if (isMapped) {
                icon.title = isUnified ? 'Personalización activa' : 'Columna mapeada';
                icon.innerHTML = `<i data-lucide="check-circle" class="text-success"></i>`;
            } else if (target.required || target.key === 'tipo_nomina' || target.key === 'quincena') {
                if (target.key === 'nombre_completo' && appState.detectedSplitNames) {
                    icon.title = 'Apellidos y Nombres separados.';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                } else if (target.key === 'fecha_acumulado' && appState.detectedSplitMonthYear) {
                    icon.title = 'Mes y Año separados.';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                } else if (target.key === 'tipo_nomina') {
                    icon.title = 'Sin Tipo de Nómina.';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                } else if (target.key === 'quincena') {
                    icon.title = 'Sin Quincena.';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                } else {
                    icon.title = 'Campo obligatorio pendiente de mapear';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                }
            } else {
                icon.title = 'Campo opcional sin mapear';
                icon.innerHTML = `<i data-lucide="circle" style="opacity: 0.15;"></i>`;
            }
            actionsPreview.appendChild(icon);
            
            // Previsualización de muestra
            const preview = document.createElement('span');
            preview.className = 'mapping-single-preview';
            preview.id = `preview-val-container-${target.key}`;
            actionsPreview.appendChild(preview);
            
            row.appendChild(info);
            row.appendChild(select);
            row.appendChild(actionsPreview);
            container.appendChild(row);
            
            updateRowPreview(target.key);
        });
        
        updateMappedCountBadge();
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    function updateMappedCountBadge() {
        let requiredTotal = 0;
        let requiredMapped = 0;
        
        TARGET_COLUMNS.forEach(target => {
            if (target.required) {
                requiredTotal++;
                
                if (target.key === 'nombre_completo' && appState.combineNames) {
                    if (appState.combineSurnamesList.length > 0 || appState.combineNamesList.length > 0) {
                        requiredMapped++;
                    }
                } else if (target.key === 'fecha_acumulado' && appState.combineMonthYear) {
                    if (appState.monthColumn && appState.yearColumn) {
                        requiredMapped++;
                    }
                } else if (
                    target.key === 'tipo_nomina' ||
                    target.key === 'quincena' ||
                    target.key === 'naturaleza'
                ) {
                    requiredMapped++;
                } else if (appState.columnMappings[target.key]) {
                    requiredMapped++;
                }
            }
        });
        
        const badge = document.getElementById('mapped-count-badge');
        if (badge) {
            badge.innerText = `${requiredMapped} / ${requiredTotal} Obligatorios`;
            if (requiredMapped === requiredTotal) {
                badge.className = 'badge badge-success';
            } else {
                badge.className = 'badge badge-warning';
            }
        }
    }



    // Análisis de tipo de campo Fecha
    function detectFechaAcumuladoType() {
        appState.fechaAcumuladoIsMonthName = false;
        const mappedHeader = appState.columnMappings['fecha_acumulado'];
        if (!mappedHeader) return;
        
        let monthMatchCount = 0;
        let nonEmptyCount = 0;
        
        const checkRows = appState.rawRows.slice(0, 10);
        checkRows.forEach(row => {
            const val = row[mappedHeader];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                nonEmptyCount++;
                const cleanVal = cleanString(val);
                const num = parseInt(cleanVal);
                
                if (MONTHS_MAP[cleanVal] !== undefined || (!isNaN(num) && num >= 1 && num <= 12)) {
                    monthMatchCount++;
                }
            }
        });
        
        if (nonEmptyCount > 0 && (monthMatchCount / nonEmptyCount) >= 0.5) {
            appState.fechaAcumuladoIsMonthName = true;
        }
    }

    // Formateador de mes a fecha dd/mm/aaaa
    function parseMonthNameToDate(rawVal, yearStr, dayRule, rawDay) {
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
            return { isValid: false, formattedString: 'FECHA INVÁLIDA', dateObject: null };
        }
        
        const cleanVal = cleanString(rawVal);
        let monthIndex = -1;
        
        if (MONTHS_MAP[cleanVal] !== undefined) {
            monthIndex = MONTHS_MAP[cleanVal];
        } else {
            const num = parseInt(cleanVal);
            if (!isNaN(num) && num >= 1 && num <= 12) {
                monthIndex = num - 1;
            }
        }
        
        if (monthIndex === -1) {
            return { isValid: false, formattedString: 'FECHA INVÁLIDA', dateObject: null };
        }
        
        const year = parseInt(yearStr) || 2026;
        let day = 15; 
        const lastDay = new Date(year, monthIndex + 1, 0).getDate(); 
        
        if (dayRule === 'none' || dayRule === 'no_aplica') {
            if (rawDay !== undefined && rawDay !== null && String(rawDay).trim() !== '') {
                const dayNum = parseInt(String(rawDay).replace(/\D/g, '').trim());
                if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= lastDay) {
                    day = dayNum;
                } else {
                    day = 1;
                }
            } else {
                day = 1;
            }
        } else if (dayRule === '30') {
            day = Math.min(30, lastDay);
        } else {
            day = lastDay;
        }
        
        const dateObj = new Date(year, monthIndex, day);
        return formatJSDate(dateObj);
    }

    // Validación y paso a paso
    function validateAndGoToStep3() {
        let missingRequired = [];
        
        TARGET_COLUMNS.forEach(target => {
            if (target.required) {
                if (target.key === 'nombre_completo' && appState.combineNames) {
                    if (appState.combineSurnamesList.length === 0 && appState.combineNamesList.length === 0) {
                        missingRequired.push(target.name + ' (Combinación vacía)');
                    }
                } else if (target.key === 'fecha_acumulado' && appState.combineMonthYear) {
                    if (!appState.monthColumn || !appState.yearColumn) {
                        missingRequired.push(target.name + ' (Unificación de Mes y Año vacía)');
                    }
                } else if (
                    target.key === 'tipo_nomina' ||
                    target.key === 'quincena' ||
                    target.key === 'naturaleza'
                ) {
                    // Automáticos
                } else if (!appState.columnMappings[target.key]) {
                    missingRequired.push(target.name);
                }
            }
        });
        
        if (missingRequired.length > 0) {
            alert('Faltan mapear columnas obligatorias:\n- ' + missingRequired.join('\n- ') + '\n\nPor favor, selecciona una columna del archivo origen o configura la unificación correspondiente.');
            return;
        }
        
        showLoading('Procesando datos y aplicando reglas de homologación...');
        
        setTimeout(() => {
            try {
                detectFechaAcumuladoType();
                transformData();
                renderPreviewUI();
                hideLoading();
                setStep(3); 
                
                if (appState.validationErrors.length === 0 && window.confetti) {
                    window.confetti({
                        particleCount: 40,
                        spread: 60,
                        origin: { y: 0.8 }
                    });
                }
            } catch (err) {
                console.error(err);
                alert('Ocurrió un error al procesar los datos de nómina: ' + err.message);
                hideLoading();
            }
        }, 150);
    }

    // Transformación de datos
    function transformData() {
        appState.transformedData = [];
        appState.validationErrors = [];
        
        const results = [];
        let invalidDatesCount = 0;
        let invalidNumbersCount = 0;
        let missingIdCount = 0;
        
        appState.rawRows.forEach((rawRow, rowIndex) => {
            const rowNum = rowIndex + 2; 
            const transformedRow = {};
            
            // 1. Identificación
            const idVal = getFieldValue('identificacion', rawRow);
            transformedRow['identificacion'] = idVal;
            if (idVal === '') {
                missingIdCount++;
            }
            
            // 2. Nombre Completo
            const fullName = getFieldValue('nombre_completo', rawRow);
            transformedRow['nombre_completo'] = fullName.toUpperCase();
            
            // 3. Fecha de Acumulado
            let parsedDate;
            if (appState.combineMonthYear) {
                const rawMonth = rawRow[appState.monthColumn];
                const rawYear = rawRow[appState.yearColumn];
                const rawDay = appState.dayColumn ? rawRow[appState.dayColumn] : '';
                parsedDate = parseMonthNameToDate(rawMonth, rawYear || '2026', appState.monthYearDayRule, rawDay);
            } else {
                const rawDate = getFieldValue('fecha_acumulado', rawRow);
                if (appState.fechaAcumuladoIsMonthName && appState.convertMonthToDate) {
                    parsedDate = parseMonthNameToDate(rawDate, appState.convertMonthYear, appState.convertMonthDayRule);
                } else {
                    parsedDate = parseDate(rawDate);
                }
            }
            transformedRow['fecha_acumulado'] = parsedDate.formattedString;
            if (!parsedDate.isValid) {
                invalidDatesCount++;
            }
            
            // 4. Código Concepto (Opcional)
            transformedRow['codigo_concepto'] = getFieldValue('codigo_concepto', rawRow);
            
            // 5. Nombre Concepto
            transformedRow['nombre_concepto'] = getFieldValue('nombre_concepto', rawRow);
            
            // 6. Cantidad (Numérico)
            let qtyNum = '';
            const rawQty = getFieldValue('cantidad', rawRow);
            if (rawQty !== '') {
                qtyNum = parseNumber(rawQty);
                if (isNaN(qtyNum)) {
                    qtyNum = 0;
                    invalidNumbersCount++;
                }
            }
            transformedRow['cantidad'] = qtyNum;
            
            // 7. Valor (Numérico)
            const rawVal = getFieldValue('valor', rawRow);
            const valNum = parseNumber(rawVal);
            transformedRow['valor'] = valNum;
            if (isNaN(valNum)) {
                invalidNumbersCount++;
            }
            
            // 8. Código Centro de Costo (Opcional)
            transformedRow['codigo_ceco'] = getFieldValue('codigo_ceco', rawRow);
            
            // 9. Nombre Centro de Costo (Opcional)
            transformedRow['nombre_ceco'] = getFieldValue('nombre_ceco', rawRow);
            
            // 10. Código Cargo (Opcional)
            transformedRow['codigo_cargo'] = getFieldValue('codigo_cargo', rawRow);
            
            // 11. Nombre Cargo (Opcional)
            transformedRow['nombre_cargo'] = getFieldValue('nombre_cargo', rawRow);
            
            // 12. Tipo de Nómina
            transformedRow['tipo_nomina'] = getFieldValue('tipo_nomina', rawRow);
            
            // 13. Mes Acumulado
            let mesAcumulado = '';
            if (parsedDate.isValid && parsedDate.dateObject) {
                mesAcumulado = String(parsedDate.dateObject.getMonth() + 1); 
            }
            transformedRow['mes_acumulado'] = mesAcumulado;
            
            // 14. Quincena
            transformedRow['quincena'] = getFieldValue('quincena', rawRow);
            
            // 15. Naturaleza
            let naturalezaVal = '';
            const rawNat = getFieldValue('naturaleza', rawRow);
            if (rawNat !== '') {
                const cleanNat = String(rawNat).trim().toUpperCase();
                if (cleanNat === 'INGRESO' || cleanNat === 'DESCUENTO' || cleanNat === 'EGRESO' || cleanNat === 'DEDUCCION' || cleanNat === 'DEDUCCIÓN') {
                    naturalezaVal = (cleanNat === 'INGRESO') ? 'INGRESO' : 'DESCUENTO';
                } else {
                    naturalezaVal = cleanNat;
                }
            }
            
            if (naturalezaVal === '' || (naturalezaVal !== 'INGRESO' && naturalezaVal !== 'DESCUENTO')) {
                naturalezaVal = (valNum >= 0) ? 'INGRESO' : 'DESCUENTO';
            }
            transformedRow['naturaleza'] = naturalezaVal;
            transformedRow['_originalRow'] = rowNum;
            
            results.push(transformedRow);
        });
        
        appState.transformedData = results;
        
        // Cargar errores y advertencias
        if (missingIdCount > 0) {
            appState.validationErrors.push({
                type: 'danger',
                msg: `Se detectaron ${missingIdCount} filas con el campo "Identificación" vacío. Este campo es obligatorio.`
            });
        }
        if (invalidDatesCount > 0) {
            appState.validationErrors.push({
                type: 'warning',
                msg: `Se detectaron ${invalidDatesCount} fechas que no se pudieron formatear. En la vista previa se marcarán con error.`
            });
        }
        if (invalidNumbersCount > 0) {
            appState.validationErrors.push({
                type: 'warning',
                msg: `Se detectaron ${invalidNumbersCount} valores numéricos (Cantidad o Valor) ilegibles. Se procesarán como 0.`
            });
        }
    }

    // Parsers robustos de números y fechas
    function parseNumber(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        
        let cleaned = String(val).trim();
        cleaned = cleaned.replace(/[\$\s\€]/g, '');
        
        const commaIndex = cleaned.lastIndexOf(',');
        const dotIndex = cleaned.lastIndexOf('.');
        
        if (commaIndex > dotIndex) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (dotIndex > commaIndex && commaIndex !== -1) {
            cleaned = cleaned.replace(/,/g, '');
        } else if (commaIndex !== -1 && dotIndex === -1) {
            const parts = cleaned.split(',');
            if (parts[parts.length - 1].length <= 2) {
                cleaned = cleaned.replace(',', '.');
            } else {
                cleaned = cleaned.replace(',', '');
            }
        }
        
        const num = parseFloat(cleaned);
        return isNaN(num) ? NaN : num;
    }

    function parseDate(val) {
        if (val === undefined || val === null || val === '') {
            return { isValid: false, formattedString: 'FECHA INVÁLIDA', dateObject: null };
        }
        
        if (val instanceof Date) {
            return formatJSDate(val);
        }
        
        let strVal = String(val).trim();
        
        // Formato dd/mm/aaaa
        let matches = strVal.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (matches) {
            const day = parseInt(matches[1]);
            const month = parseInt(matches[2]) - 1;
            const year = parseInt(matches[3]);
            const d = new Date(year, month, day);
            if (isValidDate(d) && d.getDate() === day && d.getMonth() === month) {
                return formatJSDate(d);
            }
        }
        
        // Formato aaaa-mm-dd
        matches = strVal.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (matches) {
            const year = parseInt(matches[1]);
            const month = parseInt(matches[2]) - 1;
            const day = parseInt(matches[3]);
            const d = new Date(year, month, day);
            if (isValidDate(d) && d.getDate() === day && d.getMonth() === month) {
                return formatJSDate(d);
            }
        }
        
        // Formato número de serie de Excel
        const serialNum = parseFloat(strVal);
        if (!isNaN(serialNum) && serialNum > 20000 && serialNum < 100000) {
            const dateObj = new Date((serialNum - 25569) * 86400 * 1000);
            if (isValidDate(dateObj)) {
                return formatJSDate(dateObj);
            }
        }
        
        // Formato de texto con mes de palabra "31-Ene-2026"
        matches = strVal.match(/^(\d{1,2})[\/\-. ]([a-zA-Z]{3,10})[\/\-. ](\d{2,4})$/);
        if (matches) {
            const day = parseInt(matches[1]);
            const monthName = cleanString(matches[2]);
            let year = parseInt(matches[3]);
            if (year < 100) year += 2000;
            
            const monthIndex = MONTHS_MAP[monthName];
            if (monthIndex !== undefined) {
                const d = new Date(year, monthIndex, day);
                if (isValidDate(d) && d.getDate() === day) {
                    return formatJSDate(d);
                }
            }
        }

        // NUEVO: Intentar parsear como un nombre de mes o número de mes directo si falla lo anterior
        const cleanVal = cleanString(strVal);
        let monthIndex = -1;
        if (MONTHS_MAP[cleanVal] !== undefined) {
            monthIndex = MONTHS_MAP[cleanVal];
        } else {
            const num = parseInt(cleanVal);
            if (!isNaN(num) && num >= 1 && num <= 12) {
                monthIndex = num - 1;
            }
        }
        
        if (monthIndex !== -1) {
            const year = parseInt(appState.convertMonthYear) || new Date().getFullYear();
            const lastDay = new Date(year, monthIndex + 1, 0).getDate();
            let day = lastDay;
            if (appState.monthYearDayRule === '30') {
                day = Math.min(30, lastDay);
            } else if (appState.monthYearDayRule === 'none' || appState.monthYearDayRule === 'no_aplica') {
                day = 1;
            }
            const d = new Date(year, monthIndex, day);
            return formatJSDate(d);
        }
        
        return { isValid: false, formattedString: 'FECHA INVÁLIDA', dateObject: null };
    }

    function isValidDate(d) {
        return d instanceof Date && !isNaN(d.getTime());
    }

    function formatJSDate(dateObj) {
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        return {
            isValid: true,
            formattedString: `${day}/${month}/${year}`,
            dateObject: dateObj
        };
    }

    // Renderizado Paso 3 (Preview & KPIs)
    function renderPreviewUI() {
        // KPIs
        const totalRows = appState.transformedData.length;
        document.getElementById('stat-total-rows').innerText = totalRows;
        
        const uniqueIds = new Set(appState.transformedData.map(r => r.identificacion).filter(id => id !== ''));
        document.getElementById('stat-unique-employees').innerText = uniqueIds.size;
        
        let totalEarnings = 0;
        let totalDeductions = 0;
        
        appState.transformedData.forEach(row => {
            if (row.naturaleza === 'INGRESO') {
                totalEarnings += row.valor;
            } else {
                totalDeductions += Math.abs(row.valor);
            }
        });
        
        document.getElementById('stat-total-earnings').innerText = formatCurrency(totalEarnings);
        document.getElementById('stat-total-deductions').innerText = formatCurrency(totalDeductions);
        
        // Alertas de validaciones
        const valContainer = document.getElementById('validations-container');
        const valList = document.getElementById('validation-errors-list');
        if (valList && valContainer) {
            valList.innerHTML = '';
            
            if (appState.validationErrors.length > 0) {
                appState.validationErrors.forEach(err => {
                    const li = document.createElement('li');
                    li.className = err.type; 
                    
                    const icon = document.createElement('i');
                    icon.setAttribute('data-lucide', err.type === 'danger' ? 'alert-octagon' : 'alert-triangle');
                    if (err.type === 'danger') icon.style.color = 'var(--color-danger)';
                    else icon.style.color = 'var(--color-warning)';
                    
                    const textSpan = document.createElement('span');
                    textSpan.innerText = err.msg;
                    
                    li.appendChild(icon);
                    li.appendChild(textSpan);
                    valList.appendChild(li);
                });
                valContainer.classList.remove('hide');
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            } else {
                valContainer.classList.add('hide');
            }
        }
        
        // Renderizar tabla (primeras 50 filas)
        const tbody = document.getElementById('preview-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const previewRows = appState.transformedData.slice(0, 50);
        
        previewRows.forEach(row => {
            const tr = document.createElement('tr');
            
            // Identificación
            const tdId = document.createElement('td');
            tdId.innerText = row.identificacion;
            if (row.identificacion === '') {
                tdId.className = 'error-cell';
                tdId.innerText = '[VACÍO]';
            }
            tr.appendChild(tdId);
            
            // Nombre
            const tdName = document.createElement('td');
            tdName.innerText = row.nombre_completo;
            if (row.nombre_completo === '') {
                tdName.className = 'error-cell';
                tdName.innerText = '[VACÍO]';
            }
            tr.appendChild(tdName);
            
            // Fecha
            const tdDate = document.createElement('td');
            tdDate.innerText = row.fecha_acumulado;
            if (row.fecha_acumulado === 'FECHA INVÁLIDA') {
                tdDate.className = 'error-cell';
            }
            tr.appendChild(tdDate);
            
            // Concepto Cod
            const tdCodCon = document.createElement('td');
            tdCodCon.innerText = row.codigo_concepto;
            tr.appendChild(tdCodCon);
            
            // Concepto Nombre
            const tdNameCon = document.createElement('td');
            tdNameCon.innerText = row.nombre_concepto;
            if (row.nombre_concepto === '') {
                tdNameCon.className = 'error-cell';
                tdNameCon.innerText = '[VACÍO]';
            }
            tr.appendChild(tdNameCon);
            
            // Cantidad
            const tdQty = document.createElement('td');
            tdQty.innerText = row.cantidad;
            if (row.cantidad !== '' && isNaN(row.cantidad)) {
                tdQty.className = 'error-cell';
                tdQty.innerText = '0 (Error)';
            }
            tr.appendChild(tdQty);
            
            // Valor
            const tdVal = document.createElement('td');
            tdVal.innerText = formatCurrency(row.valor);
            if (isNaN(row.valor)) {
                tdVal.className = 'error-cell';
                tdVal.innerText = '$0.00 (Error)';
            }
            tr.appendChild(tdVal);
            
            // Ceco Cod & Name
            const tdCodCeco = document.createElement('td');
            tdCodCeco.innerText = row.codigo_ceco;
            tr.appendChild(tdCodCeco);
            
            const tdNameCeco = document.createElement('td');
            tdNameCeco.innerText = row.nombre_ceco;
            tr.appendChild(tdNameCeco);
            
            // Cargo Cod & Name
            const tdCodCargo = document.createElement('td');
            tdCodCargo.innerText = row.codigo_cargo;
            tr.appendChild(tdCodCargo);
            
            const tdNameCargo = document.createElement('td');
            tdNameCargo.innerText = row.nombre_cargo;
            tr.appendChild(tdNameCargo);
            
            // Tipo Nomina
            const tdTipo = document.createElement('td');
            tdTipo.innerText = row.tipo_nomina;
            tr.appendChild(tdTipo);
            
            // Mes Acumulado
            const tdMes = document.createElement('td');
            tdMes.innerText = row.mes_acumulado;
            tr.appendChild(tdMes);
            
            // Quincena
            const tdQuin = document.createElement('td');
            tdQuin.innerText = row.quincena;
            tr.appendChild(tdQuin);
            
            // Naturaleza
            const tdNat = document.createElement('td');
            tdNat.innerText = row.naturaleza;
            tdNat.className = row.naturaleza === 'INGRESO' ? 'text-success' : 'text-danger';
            tr.appendChild(tdNat);
            
            tbody.appendChild(tr);
        });
    }

    function formatCurrency(val) {
        if (isNaN(val)) return '$0.00';
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
    }

    // Descarga de Excel homologado
    function downloadTransformedExcel() {
        try {
            showLoading('Generando archivo de Excel...');
            
            const EXPORT_HEADERS = [
                'Identificación', 'Nombre Completo', 'Fecha de Acumulado', 
                'Codigo Concepto', 'Nombre Concepto', 'Cantidad', 'Valor', 
                'Codigo Centro de Costo', 'Nombre Centro de Costo', 
                'Codigo Cargo', 'Nombre Cargo', 'Tipo de Nómina', 
                'Mes Acumulado', 'Quincena', 'Naturaleza'
            ];
            
            const rowsToExport = appState.transformedData.map(row => [
                row.identificacion,
                row.nombre_completo,
                row.fecha_acumulado,
                row.codigo_concepto,
                row.nombre_concepto,
                row.cantidad,
                row.valor,
                row.codigo_ceco,
                row.nombre_ceco,
                row.codigo_cargo,
                row.nombre_cargo,
                row.tipo_nomina,
                row.mes_acumulado,
                row.quincena,
                row.naturaleza
            ]);
            
            const sheetData = [EXPORT_HEADERS, ...rowsToExport];
            
            const newWb = XLSX.utils.book_new();
            const newWs = XLSX.utils.aoa_to_sheet(sheetData);
            
            const colWidths = EXPORT_HEADERS.map((header, colIndex) => {
                let maxLength = header.length;
                for (let i = 0; i < Math.min(100, rowsToExport.length); i++) {
                    const val = String(rowsToExport[i][colIndex] || '');
                    if (val.length > maxLength) {
                        maxLength = val.length;
                    }
                }
                return { wch: Math.min(30, maxLength + 3) }; 
            });
            newWs['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(newWb, newWs, 'Nómina Homologada');
            
            let originalBaseName = appState.fileName.substring(0, appState.fileName.lastIndexOf('.')) || 'nomina';
            let exportName = `${originalBaseName}_homologada.xlsx`;
            
            XLSX.writeFile(newWb, exportName);
            
            hideLoading();
            
            if (window.confetti) {
                window.confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 }
                });
            }
            
            setTimeout(() => {
                alert('¡Archivo de nómina homologado exportado exitosamente!');
            }, 300);
            
        } catch (err) {
            console.error(err);
            alert('Error al generar o descargar el archivo de Excel: ' + err.message);
            hideLoading();
        }
    }

    // Cargar al Dashboard
    async function loadDataToDashboard() {
        if (!appState.transformedData || appState.transformedData.length === 0) {
            alert('Primero debes cargar un archivo y transformarlo.');
            return;
        }

        if (appState.validationErrors.some(err => err.type === 'danger')) {
            const proceed = await showNomaiConfirm('Existen errores críticos (rojo) en la validación de los datos. ¿Estás seguro de que deseas cargarlos de todas formas? Esto podría romper los gráficos del dashboard.');
            if (!proceed) return;
        }

        showLoading('Cargando datos en el dashboard...');

        setTimeout(() => {
            try {
                const TIPO_MAP = {
                    'NORMAL': 'N',
                    'COMPLEMENTARIA': 'C',
                    'AJUSTE': 'A',
                    'DIRECTIVO': 'D',
                    'VACACIONES': 'V',
                    'EXTRA': 'X',
                    'NORMALES': 'N',
                    'COMPLEMENTARIAS': 'C',
                    'AJUSTES': 'A',
                    'DIRECTIVOS': 'D',
                    'EXTRAS': 'X',
                    'DEF': 'N',
                    'DEFINITIVA': 'N',
                    'CESANTIAS': 'C',
                    'PRIMA': 'C'
                };

                const dashboardMonthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

                const converted = appState.transformedData.map(r => {
                    const mesNum = parseInt(r.mes_acumulado) || 1;
                    const mesName = dashboardMonthNames[mesNum - 1] || "Enero";
                    
                    let anio = 2026;
                    if (r.fecha_acumulado) {
                        const parts = r.fecha_acumulado.split('/');
                        if (parts.length === 3) anio = parseInt(parts[2]) || 2026;
                    }
                    
                    const qUpper = String(r.quincena || '').trim().toUpperCase();
                    let pa = null;
                    if (qUpper.includes('1') || qUpper.includes('Q1') || qUpper.includes('QUINCENA 1') || qUpper.includes('PRIMERA')) {
                        pa = (mesNum - 1) * 2 + 1;
                    } else if (qUpper.includes('2') || qUpper.includes('Q2') || qUpper.includes('QUINCENA 2') || qUpper.includes('SEGUNDA')) {
                        pa = (mesNum - 1) * 2 + 2;
                    } else {
                        pa = null;
                    }
                    
                    let tipo = "SALARIAL";
                    const conceptUpper = (r.nombre_concepto || "").toUpperCase();
                    if (r.naturaleza === "DESCUENTO") {
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

                    const tipoNominaClean = String(r.tipo_nomina || '').trim().toUpperCase();

                    return {
                        c: r.identificacion ? r.identificacion.toString().trim() : "",
                        n: r.nombre_completo ? r.nombre_completo.toString().trim().toUpperCase() : "",
                        co: r.nombre_concepto ? r.nombre_concepto.toString().trim().toUpperCase() : "N/A",
                        v: parseFloat(r.valor) || 0.0,
                        cant: Math.round(parseFloat(r.cantidad)) || 0,
                        m: mesName,
                        a: anio,
                        t: tipo,
                        tn: r.tipo_nomina ? r.tipo_nomina.toString().trim() : "Normal",
                        na: (r.naturaleza === 'INGRESO' || r.naturaleza === 'DEVENGO') ? 'DEVENGO' : (r.naturaleza || 'DEVENGO'),
                        cc: r.codigo_ceco ? r.codigo_ceco.toString().trim() : "",
                        dcc: r.nombre_ceco ? r.nombre_ceco.toString().trim() : (r.codigo_ceco ? r.codigo_ceco.toString().trim() : ""),
                        cg: r.nombre_cargo ? r.nombre_cargo.toString().trim().toUpperCase() : "",
                        pa: pa
                    };
                });

                // Sobrescribir los datos cargados excluyendo 'BENEFICIO'
                window.state.data = converted.filter(d => d.na !== 'BENEFICIO');

                // Inicializar caché de valores únicos y procesar filtros
                if (typeof window.initUniqueValuesCache === 'function') {
                    window.initUniqueValuesCache();
                }
                
                // Forzar la selección de filtros a todos los años, meses, quincenas recién cargados
                if (typeof window.getUniqueYears === 'function') {
                    window.state.selectedYears = window.getUniqueYears();
                }
                if (typeof window.getUniqueMonths === 'function') {
                    window.state.selectedMonths = window.getUniqueMonths();
                }
                if (typeof window.getUniqueQuincenas === 'function') {
                    window.state.selectedQuincenas = window.getUniqueQuincenas();
                }
                window.state.selectedTipoNomina = []; // Sin filtro de tipo por defecto

                if (typeof window.processData === 'function') {
                    window.processData();
                }

                hideLoading();

                // --- Guardar Historial de Cargas ---
                try {
                    const devengos = converted.filter(d => d.t === 'INGRESO' || d.na === 'DEVENGO').reduce((acc, curr) => acc + (parseFloat(curr.v) || 0), 0);
                    const descuentos = converted.filter(d => d.t === 'DESCUENTO' || d.na === 'DESCUENTO').reduce((acc, curr) => acc + (parseFloat(curr.v) || 0), 0);
                    const empIds = new Set(converted.map(d => d.c).filter(id => id !== ''));
                    
                    const historyEntry = {
                        timestamp: Date.now(),
                        fileName: appState.fileName,
                        totalRows: converted.length,
                        uniqueEmployees: empIds.size,
                        totalIngresos: devengos,
                        totalDescuentos: Math.abs(descuentos)
                    };
                    let history = [];
                    const savedHist = localStorage.getItem('nomai_load_history');
                    if (savedHist) history = JSON.parse(savedHist);
                    history.push(historyEntry);
                    localStorage.setItem('nomai_load_history', JSON.stringify(history));
                } catch(e) { console.error('Error saving load history:', e); }

                // Cambiar a la pestaña de resumen general
                if (typeof window.switchTab === 'function') {
                    window.switchTab('overview');
                }

                if (window.confetti) {
                    window.confetti({
                        particleCount: 180,
                        spread: 90,
                        origin: { y: 0.6 }
                    });
                }
            } catch (err) {
                console.error(err);
                alert('Ocurrió un error al cargar los datos en el dashboard: ' + err.message);
                hideLoading();
            }
        }, 300);
    }

    function openCustomizeModal(targetKey) {
        const target = TARGET_COLUMNS.find(t => t.key === targetKey);
        if (!target) return;

        // Inyectar estilos CSS para el modal personalizado de unificación si no existen
        if (!document.getElementById('nomai-custom-modal-styles')) {
            const s = document.createElement('style');
            s.id = 'nomai-custom-modal-styles';
            s.textContent = `
                #nomai-custom-modal-overlay {
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 999999 !important;
                    background: rgba(10, 0, 30, 0.72) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 1rem !important;
                    font-family: 'Inter', sans-serif !important;
                }
                #nomai-custom-modal-card {
                    background: #ffffff !important;
                    border: 2px solid #6C00D3 !important;
                    border-radius: 16px !important;
                    width: 100% !important;
                    max-width: 500px !important;
                    box-shadow: 0 10px 30px rgba(108, 0, 211, 0.2), 0 32px 80px rgba(0, 0, 0, 0.5) !important;
                    display: flex !important;
                    flex-direction: column !important;
                    max-height: 90vh !important;
                    overflow: hidden !important;
                    animation: nomaiFadeIn 0.22s ease-out !important;
                }
                @keyframes nomaiFadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                #nomai-custom-modal-header {
                    background: #ffffff !important;
                    padding: 1.25rem 1.5rem !important;
                    color: #1F2937 !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.75rem !important;
                    border-radius: 16px 16px 0 0 !important;
                    border-bottom: 1.5px solid #F3F4F6 !important;
                }
                #nomai-custom-modal-header h3 {
                    margin: 0 !important;
                    font-size: 1.15rem !important;
                    font-weight: 700 !important;
                    color: #1E1B4B !important;
                }
                #nomai-custom-modal-header svg {
                    color: #6C00D3 !important;
                }
                #nomai-custom-modal-body {
                    padding: 1.25rem 1.5rem !important;
                    overflow-y: auto !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.9rem !important;
                }
                #nomai-custom-modal-body p {
                    font-size: 0.85rem !important;
                    color: #4B5563 !important;
                    line-height: 1.45 !important;
                    margin: 0 !important;
                }
                .nomai-custom-columns-list {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.4rem !important;
                    padding: 0.6rem !important;
                    background: #F9FAFB !important;
                    border: 1.5px solid #E5E7EB !important;
                    border-radius: 10px !important;
                    max-height: 220px !important;
                    overflow-y: auto !important;
                }
                .nomai-custom-column-item {
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.6rem !important;
                    padding: 0.45rem 0.65rem !important;
                    background: #ffffff !important;
                    border: 1px solid #E5E7EB !important;
                    border-radius: 8px !important;
                    font-size: 0.82rem !important;
                    color: #374151 !important;
                    cursor: pointer !important;
                    user-select: none !important;
                    transition: all 0.12s !important;
                }
                .nomai-custom-column-item:hover {
                    background: #F3E8FF !important;
                    border-color: #6C00D3 !important;
                    color: #6C00D3 !important;
                }
                .nomai-custom-column-item.selected {
                    background: #EDE9FE !important;
                    border-color: #6C00D3 !important;
                    color: #6C00D3 !important;
                    font-weight: 600 !important;
                }
                .nomai-custom-column-item input[type=checkbox] {
                    accent-color: #6C00D3 !important;
                    cursor: pointer !important;
                    width: 15px !important;
                    height: 15px !important;
                    margin: 0 !important;
                }
                .nomai-custom-preview-box {
                    background: #F3E8FF !important;
                    border: 1.5px dashed #6C00D3 !important;
                    border-radius: 10px !important;
                    padding: 0.8rem !important;
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.25rem !important;
                }
                .nomai-custom-preview-title {
                    font-size: 0.68rem !important;
                    font-weight: 700 !important;
                    text-transform: uppercase !important;
                    color: #6C00D3 !important;
                    letter-spacing: 0.5px !important;
                    margin: 0 !important;
                }
                .nomai-custom-preview-value {
                    font-size: 0.9rem !important;
                    font-weight: 700 !important;
                    color: #1F2937 !important;
                    margin: 0 !important;
                    word-break: break-all !important;
                }
                #nomai-custom-modal-footer {
                    display: flex !important;
                    justify-content: flex-end !important;
                    gap: 0.75rem !important;
                    border-top: 1.5px solid #F3F4F6 !important;
                    padding: 1.15rem 1.5rem !important;
                    background: #ffffff !important;
                    border-radius: 0 0 16px 16px !important;
                }
                .nomai-custom-btn {
                    padding: 0.6rem 1.5rem !important;
                    font-size: 0.875rem !important;
                    font-weight: 600 !important;
                    border-radius: 10px !important;
                    border: none !important;
                    cursor: pointer !important;
                    line-height: 1.25 !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.15s ease !important;
                }
                .nomai-custom-btn-primary {
                    background: #6C00D3 !important;
                    color: #ffffff !important;
                    box-shadow: 0 4px 12px rgba(108, 0, 211, 0.18) !important;
                }
                .nomai-custom-btn-primary:hover {
                    background: #5900B3 !important;
                    box-shadow: 0 4px 16px rgba(108, 0, 211, 0.3) !important;
                }
                .nomai-custom-btn-secondary {
                    background: #ffffff !important;
                    color: #1F2937 !important;
                    border: 1.5px solid #D1D5DB !important;
                }
                .nomai-custom-btn-secondary:hover {
                    background: #F9FAFB !important;
                    border-color: #9CA3AF !important;
                }
                /* Estilos específicos de las tarjetas de selección para quincena */
                .nomai-card-radio-group {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.75rem !important;
                    margin-bottom: 0.5rem !important;
                }
                .nomai-card-radio {
                    display: flex !important;
                    align-items: flex-start !important;
                    gap: 1rem !important;
                    padding: 1.15rem !important;
                    background: #F9FAFB !important;
                    border: 1.5px solid #E5E7EB !important;
                    border-radius: 12px !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                    user-select: none !important;
                }
                .nomai-card-radio:hover {
                    border-color: #A78BFA !important;
                    background: #F5F3FF !important;
                }
                .nomai-card-radio.active {
                    background: #EDE9FE !important;
                    border-color: #6C00D3 !important;
                    box-shadow: 0 4px 12px rgba(108, 0, 211, 0.08) !important;
                }
                .nomai-card-radio-input {
                    margin-top: 0.2rem !important;
                    accent-color: #6C00D3 !important;
                    cursor: pointer !important;
                    width: 18px !important;
                    height: 18px !important;
                }
                .nomai-card-radio-content {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 0.3rem !important;
                }
                .nomai-card-radio-title {
                    font-size: 0.92rem !important;
                    font-weight: 700 !important;
                    color: #1E1B4B !important;
                }
                .nomai-card-radio-desc {
                    font-size: 0.82rem !important;
                    color: #4B5563 !important;
                    line-height: 1.45 !important;
                }
            `;
            document.head.appendChild(s);
        }

        // Obtener las columnas seleccionadas actuales para este campo
        let currentSelection = [];
        const mappedVal = appState.columnMappings[targetKey] || '';
        if (mappedVal === '__unified__') {
            if (targetKey === 'nombre_completo') {
                currentSelection = [...appState.combineNamesList];
            } else if (targetKey === 'fecha_acumulado') {
                if (appState.dayColumn) currentSelection.push(appState.dayColumn);
                if (appState.monthColumn) currentSelection.push(appState.monthColumn);
                if (appState.yearColumn) currentSelection.push(appState.yearColumn);
            } else if (appState.genericUnifications[targetKey]) {
                currentSelection = [...appState.genericUnifications[targetKey].columns];
            }
        } else if (mappedVal !== '') {
            currentSelection = [mappedVal];
        }

        // Crear contenedor overlay
        const overlay = document.createElement('div');
        overlay.id = 'nomai-custom-modal-overlay';

        const card = document.createElement('div');
        card.id = 'nomai-custom-modal-card';

        // Header
        const header = document.createElement('div');
        header.id = 'nomai-custom-modal-header';

        const iconSvg = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
        `;

        let headerTitle = `Personalizar: ${target.name}`;
        if (targetKey === 'quincena') {
            headerTitle = `Personalizar columna: Quincena`;
        } else if (targetKey === 'fecha_acumulado') {
            headerTitle = `Personalizar columna: Fecha de Acumulado`;
        } else if (targetKey === 'naturaleza') {
            headerTitle = `Personalizar columna: Naturaleza`;
        }

        header.innerHTML = `${iconSvg} <h3>${headerTitle}</h3>`;

        // Body
        const body = document.createElement('div');
        body.id = 'nomai-custom-modal-body';
        
        let constantSelect = null;
        let dayRuleSelect = null;

        if (targetKey === 'tipo_nomina') {
            body.innerHTML = `
                <p>Configura el <b>Tipo de Nómina</b> por defecto o mapea desde el archivo:</p>
                <div class="form-group" style="display:flex; flex-direction:column; gap:0.35rem; width:100%; margin-bottom: 0.5rem;">
                    <label style="font-weight:600; font-size:0.82rem; color:#374151;">Asignar un valor constante (Por Defecto):</label>
                    <select id="nomai-custom-constant-select" class="mapping-select" style="width: 100%; padding: 0.5rem 0.75rem; border: 1.5px solid #D1D5DB; border-radius: 7px; font-size: 0.875rem;">
                        <option value="">-- No usar valor constante (Mapear columna) --</option>
                        <option value="Normal">Normal</option>
                        <option value="Adicional">Adicional</option>
                        <option value="Vacaciones">Vacaciones</option>
                        <option value="Definitiva">Definitiva</option>
                        <option value="Prima">Prima</option>
                        <option value="Cesantias">Cesantías</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>
                <p style="margin-top: 0.25rem;">O selecciona una columna del archivo origen:</p>
            `;
        } else if (targetKey === 'quincena') {
            body.innerHTML = `
                <p style="margin-bottom: 0.5rem; color: #4B5563;">No se identificó la columna de Quincena en el archivo origen. Selecciona la regla de cálculo del periodo de pago:</p>
                <div class="nomai-card-radio-group">
                    <label class="nomai-card-radio" id="nomai-card-quincenal">
                        <input type="radio" name="nomai-quincena-rule" value="quincenal" class="nomai-card-radio-input" />
                        <div class="nomai-card-radio-content">
                            <span class="nomai-card-radio-title">Nómina Quincenal</span>
                            <span class="nomai-card-radio-desc">Día 1-15 se asigna como "1Q". Día 16-fin de mes se asigna como "2Q" (usando Fecha de Acumulado).</span>
                        </div>
                    </label>
                    <label class="nomai-card-radio" id="nomai-card-mensual">
                        <input type="radio" name="nomai-quincena-rule" value="mensual" class="nomai-card-radio-input" />
                        <div class="nomai-card-radio-content">
                            <span class="nomai-card-radio-title">Nómina Mensual</span>
                            <span class="nomai-card-radio-desc">Toda la nómina se asigna con el valor de periodo "Mensual".</span>
                        </div>
                    </label>
                </div>
                <p style="margin-top: 0.5rem; margin-bottom: 0.4rem; color: #4B5563;">O selecciona una columna del archivo origen:</p>
            `;
        } else if (targetKey === 'fecha_acumulado') {
            body.innerHTML = `
                <p style="margin-bottom: 0.5rem; color: #4B5563;">Selecciona las columnas en orden: Día (1), Mes (2) y Año (3) [o solo Mes (1) y Año (2)]:</p>
            `;
        } else if (targetKey === 'naturaleza') {
            const mappedHeader = appState.columnMappings['naturaleza'] || 'NATURALEZA';
            body.innerHTML = `
                <p style="color: #4B5563; line-height: 1.5; margin-bottom: 0.75rem; font-size: 0.85rem;">
                    La columna <b>${mappedHeader}</b> del archivo origen está siendo usada para determinar la naturaleza de cada concepto.
                </p>
                <p style="color: #4B5563; line-height: 1.5; margin-bottom: 1rem; font-size: 0.85rem;">
                    Si el valor en esa columna no se reconoce como <b>INGRESO</b> o <b>DESCUENTO</b>, se aplicará automáticamente la regla por signo del <b>Valor</b>:
                </p>
                <div style="display: flex; gap: 1rem; width: 100%; margin-bottom: 0.5rem;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; flex: 1; padding: 1.25rem 1rem; background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 12px; text-align: center;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                            <polyline points="17 6 23 6 23 12"></polyline>
                        </svg>
                        <span style="font-weight: 700; font-size: 0.95rem; color: #047857; margin-top: 0.2rem;">INGRESO</span>
                        <span style="font-size: 0.78rem; color: #4B5563;">Valor ≥ 0</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; flex: 1; padding: 1.25rem 1rem; background: #FEF2F2; border: 1.5px solid #EF4444; border-radius: 12px; text-align: center;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
                            <polyline points="17 18 23 18 23 12"></polyline>
                        </svg>
                        <span style="font-weight: 700; font-size: 0.95rem; color: #B91C1C; margin-top: 0.2rem;">DESCUENTO</span>
                        <span style="font-size: 0.78rem; color: #4B5563;">Valor &lt; 0</span>
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = `
                <p>Selecciona una o más columnas del archivo de origen para mapear o unificar al campo de destino <b>${target.name}</b>:</p>
            `;
        }

        const columnsList = document.createElement('div');
        columnsList.className = 'nomai-custom-columns-list';

        // Inicializar select constante o radio cards (Solo si no es naturaleza)
        if (targetKey !== 'naturaleza') {
            constantSelect = body.querySelector('#nomai-custom-constant-select');
            if (targetKey === 'quincena') {
                const radioQuincenal = body.querySelector('#nomai-card-quincenal input');
                const radioMensual = body.querySelector('#nomai-card-mensual input');
                const cards = body.querySelectorAll('.nomai-card-radio');

                let currentRule = '';
                if (mappedVal === '__unified__' || mappedVal === '') {
                    currentRule = appState.quincenaRule || 'quincenal';
                }

                // Establecer estado inicial
                if (currentRule === 'quincenal') {
                    radioQuincenal.checked = true;
                    body.querySelector('#nomai-card-quincenal').classList.add('active');
                } else if (currentRule === 'mensual') {
                    radioMensual.checked = true;
                    body.querySelector('#nomai-card-mensual').classList.add('active');
                }

                // Event listener para cambios en los radio buttons
                cards.forEach(card => {
                    const radio = card.querySelector('input');
                    card.addEventListener('click', (e) => {
                        // Si el click no fue en el input, disparar el click en el input
                        if (e.target !== radio) {
                            radio.checked = true;
                        }
                        
                        // Actualizar clases active
                        cards.forEach(c => c.classList.remove('active'));
                        card.classList.add('active');

                        // Desmarcar todos los checkboxes de columnas origen
                        const chks = columnsList.querySelectorAll('input[type=checkbox]');
                        chks.forEach(chk => {
                            chk.checked = false;
                            chk.parentElement.classList.remove('selected');
                        });
                        currentSelection = [];
                        updateLivePreview();
                    });
                });
            } else if (constantSelect) {
                if (mappedVal === '__unified__' || mappedVal === '') {
                    if (targetKey === 'tipo_nomina') {
                        constantSelect.value = appState.defaultTipoNomina || 'Normal';
                    }
                } else {
                    constantSelect.value = '';
                }

                constantSelect.addEventListener('change', () => {
                    if (constantSelect.value !== '') {
                        // Desmarcar todos los checkboxes
                        const chks = columnsList.querySelectorAll('input[type=checkbox]');
                        chks.forEach(chk => {
                            chk.checked = false;
                            chk.parentElement.classList.remove('selected');
                        });
                        currentSelection = [];
                    }
                    updateLivePreview();
                });
            }

            // Agregar checkboxes para cada columna origen
            appState.rawHeaders.forEach(colHeader => {
                const item = document.createElement('label');
                item.className = 'nomai-custom-column-item';
                
                // Si el mapeo actual es de columna simple y coincide, o si está en unificación, pre-seleccionar
                // Pero si el mapeo actual es unificado con constante de tipo_nomina/quincena, no marcar checkboxes
                let isColSelected = currentSelection.includes(colHeader);
                if (targetKey === 'quincena') {
                    const hasQuincenaRule = (mappedVal === '__unified__' || mappedVal === '') && appState.quincenaRule;
                    if (hasQuincenaRule) {
                        isColSelected = false;
                    }
                } else if (constantSelect && constantSelect.value !== '') {
                    isColSelected = false;
                }
                
                if (isColSelected) {
                    item.classList.add('selected');
                }

                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.value = colHeader;
                chk.checked = isColSelected;

                const labelText = document.createElement('span');
                labelText.innerText = colHeader;

                chk.addEventListener('change', () => {
                    if (chk.checked) {
                        item.classList.add('selected');
                        if (!currentSelection.includes(colHeader)) {
                            currentSelection.push(colHeader);
                        }
                        if (constantSelect) {
                            constantSelect.value = '';
                        }
                        if (targetKey === 'quincena') {
                            // Desmarcar radios y quitar clase active
                            const radios = body.querySelectorAll('input[name="nomai-quincena-rule"]');
                            radios.forEach(r => r.checked = false);
                            const cards = body.querySelectorAll('.nomai-card-radio');
                            cards.forEach(c => c.classList.remove('active'));
                        }
                    } else {
                        item.classList.remove('selected');
                        currentSelection = currentSelection.filter(c => c !== colHeader);
                    }

                    if (targetKey === 'fecha_acumulado') {
                        updateDateOrderBadges();
                        if (dayRuleSelect) {
                            if (currentSelection.length === 3) {
                                dayRuleSelect.value = 'none';
                                dayRuleSelect.disabled = true;
                            } else {
                                dayRuleSelect.disabled = false;
                                if (dayRuleSelect.value === 'none') {
                                    dayRuleSelect.value = 'last';
                                }
                            }
                        }
                    }

                    updateLivePreview();
                });

                item.appendChild(chk);
                item.appendChild(labelText);
                columnsList.appendChild(item);
            });
            body.appendChild(columnsList);

            // Si es fecha_acumulado, inyectar el selector de Día del Mes a Asignar
            if (targetKey === 'fecha_acumulado') {
                const dayGroup = document.createElement('div');
                dayGroup.className = 'form-group';
                dayGroup.style.cssText = 'display:flex; flex-direction:column; gap:0.35rem; width:100%; margin-top: 0.5rem; margin-bottom: 0.5rem;';
                dayGroup.innerHTML = `
                    <label style="font-weight:600; font-size:0.82rem; color:#374151;">Día del Mes a Asignar</label>
                    <select id="nomai-custom-day-rule-select" class="mapping-select" style="width: 100%; padding: 0.5rem 0.75rem; border: 1.5px solid #D1D5DB; border-radius: 7px; font-size: 0.875rem; color: #1F2937; background-color: #ffffff;">
                        <option value="none">No aplica (El día está en las columnas)</option>
                        <option value="30">Día 30</option>
                        <option value="last">Fin de mes (Día 28, 30, 31)</option>
                    </select>
                `;
                body.appendChild(dayGroup);

                dayRuleSelect = dayGroup.querySelector('#nomai-custom-day-rule-select');
                
                if (currentSelection.length === 3) {
                    dayRuleSelect.value = 'none';
                    dayRuleSelect.disabled = true;
                } else {
                    dayRuleSelect.value = appState.monthYearDayRule || 'last';
                    dayRuleSelect.disabled = false;
                }

                dayRuleSelect.addEventListener('change', () => {
                    updateLivePreview();
                });

                // Función para actualizar badges de orden visual (1), (2), (3)
                updateDateOrderBadges();
            }
        }

        function updateDateOrderBadges() {
            const items = columnsList.querySelectorAll('.nomai-custom-column-item');
            items.forEach(item => {
                const chk = item.querySelector('input');
                const badge = item.querySelector('.nomai-date-order-badge');
                if (badge) badge.remove();
                
                if (chk.checked) {
                    const idx = currentSelection.indexOf(chk.value);
                    if (idx !== -1) {
                        const b = document.createElement('span');
                        b.className = 'nomai-date-order-badge';
                        b.style.cssText = 'margin-left:auto; background:#6C00D3; color:#ffffff; font-size:0.75rem; font-weight:700; border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center;';
                        b.innerText = idx + 1;
                        item.appendChild(b);
                    }
                }
            });
        }

        // Caja de Vista Previa (Solo si no es naturaleza)
        if (targetKey !== 'naturaleza') {
            const previewBox = document.createElement('div');
            previewBox.className = 'nomai-custom-preview-box';
            previewBox.innerHTML = `
                <div class="nomai-custom-preview-title">Vista Previa del Valor Resultante</div>
                <div class="nomai-custom-preview-value" id="nomai-custom-preview-val" style="font-size: 1.15rem !important; font-weight: 800 !important; color: #111827 !important;">Selecciona alguna columna...</div>
            `;
            body.appendChild(previewBox);

            const previewValEl = previewBox.querySelector('#nomai-custom-preview-val');

            function updateLivePreview() {
                if (targetKey === 'quincena') {
                    const checkedRadio = body.querySelector('input[name="nomai-quincena-rule"]:checked');
                    if (checkedRadio) {
                        previewValEl.innerText = `Regla por defecto: ${checkedRadio.value === 'quincenal' ? 'Nómina Quincenal (1Q/2Q)' : 'Nómina Mensual'}`;
                        return;
                    }
                } else if (constantSelect && constantSelect.value !== '') {
                    if (targetKey === 'tipo_nomina') {
                        previewValEl.innerText = `Valor Constante: ${constantSelect.value}`;
                    }
                    return;
                }

                if (currentSelection.length === 0) {
                    previewValEl.innerText = 'Sin columnas seleccionadas';
                    return;
                }

                if (appState.rawRows.length === 0) {
                    previewValEl.innerText = 'Sin filas de muestra';
                    return;
                }

                const rowSample = appState.rawRows[0];
                if (targetKey === 'fecha_acumulado') {
                    let parsed;
                    if (currentSelection.length === 1) {
                        const rawVal = rowSample[currentSelection[0]];
                        const ruleToUse = dayRuleSelect ? dayRuleSelect.value : 'last';
                        parsed = parseMonthNameToDate(rawVal, appState.convertMonthYear || '2026', ruleToUse);
                        if (!parsed.isValid) {
                            parsed = parseDate(rawVal);
                        }
                    } else if (currentSelection.length >= 2) {
                        const ruleToUse = currentSelection.length === 3 ? 'none' : (dayRuleSelect ? dayRuleSelect.value : 'last');
                        if (currentSelection.length === 2) {
                            parsed = parseMonthNameToDate(rowSample[currentSelection[0]], rowSample[currentSelection[1]] || '2026', ruleToUse);
                        } else {
                            parsed = parseMonthNameToDate(rowSample[currentSelection[1]], rowSample[currentSelection[2]] || '2026', ruleToUse, rowSample[currentSelection[0]]);
                        }
                    }
                    previewValEl.innerText = parsed ? (parsed.formattedString || 'FECHA INVÁLIDA') : 'FECHA INVÁLIDA';
                } else {
                    const values = currentSelection.map(col => String(rowSample[col] || '').trim()).filter(v => v !== '');
                    previewValEl.innerText = values.join(' ').trim() || '[Vacío en fila 1]';
                }
            }

            updateLivePreview();
        }

        // Footer
        const footer = document.createElement('div');
        footer.id = 'nomai-custom-modal-footer';

        const saveCheckSvg = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px; flex-shrink: 0;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;

        if (targetKey === 'naturaleza') {
            const btnOk = document.createElement('button');
            btnOk.className = 'nomai-custom-btn nomai-custom-btn-primary';
            btnOk.innerHTML = `Entendido ${saveCheckSvg}`;
            btnOk.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
            footer.appendChild(btnOk);
        } else {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'nomai-custom-btn nomai-custom-btn-secondary';
            btnCancel.innerText = 'Cancelar';
            btnCancel.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });

            const btnSave = document.createElement('button');
            btnSave.className = 'nomai-custom-btn nomai-custom-btn-primary';
            btnSave.innerHTML = `Aceptar ${saveCheckSvg}`;
            btnSave.addEventListener('click', () => {
                let hasConstant = false;
                let constantValue = '';

                if (targetKey === 'quincena') {
                    const checkedRadio = body.querySelector('input[name="nomai-quincena-rule"]:checked');
                    if (checkedRadio) {
                        hasConstant = true;
                        constantValue = checkedRadio.value;
                    }
                } else if (constantSelect && constantSelect.value !== '') {
                    hasConstant = true;
                    constantValue = constantSelect.value;
                }

                if (currentSelection.length === 0 && !hasConstant) {
                    alert('Por favor selecciona al menos una columna o define un valor/regla por defecto.');
                    return;
                }

                if (hasConstant) {
                    appState.columnMappings[targetKey] = '__unified__';
                    if (targetKey === 'tipo_nomina') {
                        appState.defaultTipoNomina = constantValue;
                    } else if (targetKey === 'quincena') {
                        appState.quincenaRule = constantValue;
                    }
                } else {
                    if (currentSelection.length === 1) {
                        appState.columnMappings[targetKey] = currentSelection[0];
                        delete appState.genericUnifications[targetKey];
                        if (targetKey === 'nombre_completo') {
                            appState.combineNames = false;
                        } else if (targetKey === 'fecha_acumulado') {
                            appState.combineMonthYear = false;
                            if (dayRuleSelect) {
                                appState.convertMonthDayRule = dayRuleSelect.value;
                            }
                        }
                    } else {
                        appState.columnMappings[targetKey] = '__unified__';
                        if (targetKey === 'nombre_completo') {
                            appState.combineNames = true;
                            appState.combineSurnamesList = [];
                            appState.combineNamesList = [...currentSelection];
                        } else if (targetKey === 'fecha_acumulado') {
                            appState.combineMonthYear = true;
                            if (dayRuleSelect) {
                                appState.monthYearDayRule = dayRuleSelect.value;
                            }
                            if (currentSelection.length === 2) {
                                appState.monthColumn = currentSelection[0];
                                appState.yearColumn = currentSelection[1];
                                appState.dayColumn = '';
                            } else {
                                appState.dayColumn = currentSelection[0];
                                appState.monthColumn = currentSelection[1];
                                appState.yearColumn = currentSelection[2];
                            }
                        } else {
                            appState.genericUnifications[targetKey] = {
                                columns: [...currentSelection],
                                separator: ' '
                            };
                        }
                    }
                }

                document.body.removeChild(overlay);
                renderMappingUI();
            });

            footer.appendChild(btnCancel);
            footer.appendChild(btnSave);
        }

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);

        // Cerrar al hacer click fuera del card
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        document.body.appendChild(overlay);
    }

    // =========================================================================
    // PLANTILLAS DE CONFIGURACIÓN Y MANTENIMIENTO DEL HISTORIAL
    // =========================================================================

    function loadConfigTemplates() {
        const select = document.getElementById('config-template-select');
        if (!select) return;
        
        let configs = [];
        try {
            const saved = localStorage.getItem('nomai_saved_configs');
            if (saved) configs = JSON.parse(saved);
        } catch (e) { console.error('Error loading configs:', e); }
        
        select.innerHTML = '<option value="">-- Seleccionar Plantilla --</option>';
        configs.forEach((c, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = c.name;
            select.appendChild(opt);
        });
    }

    function showNomaiPrompt(title, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('nomai-prompt-modal');
            const titleEl = document.getElementById('nomai-prompt-title');
            const inputEl = document.getElementById('nomai-prompt-input');
            const btnCancel = document.getElementById('nomai-prompt-cancel');
            const btnConfirm = document.getElementById('nomai-prompt-confirm');

            if (!modal) {
                resolve(prompt(title, defaultValue));
                return;
            }

            titleEl.innerText = title;
            inputEl.value = defaultValue;

            modal.classList.remove('hide');
            setTimeout(() => {
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
                inputEl.focus();
                inputEl.select();
            }, 10);

            const closeAndResolve = (val) => {
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                setTimeout(() => {
                    modal.classList.add('hide');
                }, 200);
                
                btnCancel.removeEventListener('click', onCancel);
                btnConfirm.removeEventListener('click', onConfirm);
                inputEl.removeEventListener('keyup', onKeyUp);
                
                resolve(val);
            };

            const onCancel = () => closeAndResolve(null);
            const onConfirm = () => {
                const val = inputEl.value.trim();
                closeAndResolve(val === '' ? null : val);
            };
            const onKeyUp = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };

            btnCancel.addEventListener('click', onCancel);
            btnConfirm.addEventListener('click', onConfirm);
            inputEl.addEventListener('keyup', onKeyUp);
        });
    }

    function showNomaiConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('nomai-confirm-modal');
            const msgEl = document.getElementById('nomai-confirm-message');
            const btnCancel = document.getElementById('nomai-confirm-cancel');
            const btnConfirm = document.getElementById('nomai-confirm-accept');

            if (!modal) {
                resolve(confirm(message));
                return;
            }

            msgEl.innerText = message;

            modal.classList.remove('hide');
            setTimeout(() => {
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
            }, 10);

            const closeAndResolve = (val) => {
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                setTimeout(() => {
                    modal.classList.add('hide');
                }, 200);
                
                btnCancel.removeEventListener('click', onCancel);
                btnConfirm.removeEventListener('click', onConfirm);
                document.removeEventListener('keydown', onKeyDown);
                
                resolve(val);
            };

            const onCancel = () => closeAndResolve(false);
            const onConfirm = () => closeAndResolve(true);
            const onKeyDown = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };

            btnCancel.addEventListener('click', onCancel);
            btnConfirm.addEventListener('click', onConfirm);
            document.addEventListener('keydown', onKeyDown);
        });
    }

    async function saveCurrentTemplate() {
        const name = await showNomaiPrompt('Ingresa un nombre para esta plantilla de configuración:', 'Mi Plantilla');
        if (!name) return;
        
        const template = {
            name: name,
            timestamp: Date.now(),
            columnMappings: JSON.parse(JSON.stringify(appState.columnMappings)),
            combineNames: appState.combineNames,
            combineSurnamesList: [...appState.combineSurnamesList],
            combineNamesList: [...appState.combineNamesList],
            quincenaRule: appState.quincenaRule,
            defaultTipoNomina: appState.defaultTipoNomina,
            fechaAcumuladoIsMonthName: appState.fechaAcumuladoIsMonthName,
            convertMonthToDate: appState.convertMonthToDate,
            convertMonthYear: appState.convertMonthYear,
            convertMonthDayRule: appState.convertMonthDayRule,
            combineMonthYear: appState.combineMonthYear,
            monthColumn: appState.monthColumn,
            yearColumn: appState.yearColumn,
            dayColumn: appState.dayColumn,
            monthYearDayRule: appState.monthYearDayRule,
            genericUnifications: JSON.parse(JSON.stringify(appState.genericUnifications))
        };
        
        let configs = [];
        try {
            const saved = localStorage.getItem('nomai_saved_configs');
            if (saved) configs = JSON.parse(saved);
        } catch (e) {}
        
        configs.push(template);
        localStorage.setItem('nomai_saved_configs', JSON.stringify(configs));
        loadConfigTemplates();
        
        const select = document.getElementById('config-template-select');
        if (select) select.value = configs.length - 1;
        alert('Plantilla guardada con éxito.');
    }

    async function loadSelectedTemplate() {
        const select = document.getElementById('config-template-select');
        if (!select || select.value === '') {
            alert('Por favor selecciona una plantilla de la lista.');
            return;
        }
        
        let configs = [];
        try {
            const saved = localStorage.getItem('nomai_saved_configs');
            if (saved) configs = JSON.parse(saved);
        } catch (e) {}
        
        const template = configs[select.value];
        if (!template) return;
        
        const proceed = await showNomaiConfirm(`¿Estás seguro de sobreescribir la configuración actual con la plantilla "${template.name}"?`);
        if (!proceed) return;
        
        appState.columnMappings = JSON.parse(JSON.stringify(template.columnMappings || {}));
        appState.combineNames = !!template.combineNames;
        appState.combineSurnamesList = template.combineSurnamesList || [];
        appState.combineNamesList = template.combineNamesList || [];
        appState.quincenaRule = template.quincenaRule || 'quincenal';
        appState.defaultTipoNomina = template.defaultTipoNomina || 'Normal';
        appState.fechaAcumuladoIsMonthName = !!template.fechaAcumuladoIsMonthName;
        appState.convertMonthToDate = !!template.convertMonthToDate;
        appState.convertMonthYear = template.convertMonthYear || new Date().getFullYear().toString();
        appState.convertMonthDayRule = template.convertMonthDayRule || 'last';
        appState.combineMonthYear = !!template.combineMonthYear;
        appState.monthColumn = template.monthColumn || '';
        appState.yearColumn = template.yearColumn || '';
        appState.dayColumn = template.dayColumn || '';
        appState.monthYearDayRule = template.monthYearDayRule || 'last';
        appState.genericUnifications = JSON.parse(JSON.stringify(template.genericUnifications || {}));
        
        renderMappingUI();
    }

    // --- Historial de Cargas ---
    function formatCurrencyHistory(val) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
    }

    function renderHistoryTable() {
        const container = document.getElementById('history-table-container');
        if (!container) return;
        
        let history = [];
        try {
            const saved = localStorage.getItem('nomai_load_history');
            if (saved) history = JSON.parse(saved);
        } catch (e) {}
        
        if (history.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #64748b; padding: 2rem;">No hay cargas previas registradas.</p>';
            return;
        }
        
        history.sort((a, b) => b.timestamp - a.timestamp);
        
        let tableHTML = `
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0;">Fecha de Carga</th>
                        <th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0;">Archivo</th>
                        <th style="text-align: right; padding: 10px; border-bottom: 2px solid #e2e8f0;">Registros</th>
                        <th style="text-align: right; padding: 10px; border-bottom: 2px solid #e2e8f0;">Empleados</th>
                        <th style="text-align: right; padding: 10px; border-bottom: 2px solid #e2e8f0;">Tot. Ingresos</th>
                        <th style="text-align: right; padding: 10px; border-bottom: 2px solid #e2e8f0;">Tot. Descuentos</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        history.forEach(h => {
            const dateStr = new Date(h.timestamp).toLocaleString('es-CO');
            tableHTML += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${dateStr}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #3b82f6;">${h.fileName || 'N/A'}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${h.totalRows || 0}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${h.uniqueEmployees || 0}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #10b981;">${formatCurrencyHistory(h.totalIngresos || 0)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right; color: #ef4444;">${formatCurrencyHistory(h.totalDescuentos || 0)}</td>
                </tr>
            `;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    function showHistoryModal() {
        const modal = document.getElementById('history-modal');
        if (modal) {
            renderHistoryTable();
            modal.classList.remove('hide');
            setTimeout(() => {
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
            }, 10);
        }
    }

    function hideHistoryModal() {
        const modal = document.getElementById('history-modal');
        if (modal) {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            setTimeout(() => {
                modal.classList.add('hide');
            }, 200);
        }
    }

    async function clearHistory() {
        const proceed = await showNomaiConfirm('¿Estás seguro de que deseas eliminar todo el historial de cargas? Esta acción no se puede deshacer.');
        if (proceed) {
            localStorage.removeItem('nomai_load_history');
            renderHistoryTable();
        }
    }

    // Exponer para depuración y pruebas automatizadas
    window.NomaiImporterDebug = {
        appState: appState,
        loadDataToDashboard: loadDataToDashboard,
        transformData: transformData
    };
    
})();
