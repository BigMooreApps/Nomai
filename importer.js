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
    }

    // Archivo y Carga
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    }

    function processFile(file) {
        if (!window.XLSX) {
            alert('La librería SheetJS no está cargada. Por favor verifica tu conexión a internet.');
            return;
        }
        
        showLoading('Leyendo archivo...');
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                appState.workbook = workbook;
                appState.sheetNames = workbook.SheetNames;
                appState.fileName = file.name;
                
                if (appState.sheetNames.length > 1) {
                    hideLoading();
                    renderSheetSelector();
                } else {
                    loadSheetData(appState.sheetNames[0]);
                }
            } catch (err) {
                console.error(err);
                alert('No se pudo leer el archivo. Asegúrate de que sea un archivo de Excel o CSV válido.');
                hideLoading();
            }
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
            
            setTimeout(() => {
                runAutoMapping();
                
                if (appState.detectedSplitNames) {
                    appState.combineNames = true;
                }
                if (appState.detectedSplitMonthYear) {
                    appState.combineMonthYear = true;
                }
                
                hideLoading();
                renderMappingUI();
                setStep(2);
                
                // Mostrar cuadro de unificación detectada si aplica
                if (appState.detectedSplitNames || appState.detectedSplitMonthYear) {
                    showUnificationModal(appState.detectedSplitNames, appState.detectedSplitMonthYear, () => {
                        renderMappingUI();
                    });
                }
            }, 1200);
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
            
            // Botón configurar unificación
            const btnUnify = document.createElement('button');
            btnUnify.className = `btn-icon-unify ${isUnified ? 'active' : ''}`;
            btnUnify.title = `Personalizar columna: ${target.name}`;
            btnUnify.innerHTML = `<i data-lucide="sliders-horizontal"></i>`;
            
            btnUnify.addEventListener('click', () => {
                if (target.key === 'nombre_completo') {
                    openCombineNamesModal();
                } else if (target.key === 'fecha_acumulado') {
                    openCombineMonthYearModal();
                } else if (target.key === 'tipo_nomina') {
                    openTipoNominaCustomizationModal();
                } else if (target.key === 'quincena') {
                    openQuincenaCustomizationModal();
                } else if (target.key === 'naturaleza') {
                    openNaturalezaInfoModal();
                } else {
                    openGenericUnificationModal(target.key);
                }
            });
            actionsPreview.appendChild(btnUnify);
            
            // Icono de estado
            const icon = document.createElement('span');
            icon.className = 'alert-status-icon';
            if (isMapped) {
                icon.title = isUnified ? 'Personalización activa' : 'Columna mapeada';
                icon.innerHTML = `<i data-lucide="check-circle" class="text-success"></i>`;
            } else if (target.required || target.key === 'tipo_nomina' || target.key === 'quincena') {
                icon.style.cursor = 'pointer';
                if (target.key === 'nombre_completo' && appState.detectedSplitNames) {
                    icon.title = 'Apellidos y Nombres separados. ¡Haz clic para combinarlos!';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                    icon.addEventListener('click', openCombineNamesModal);
                } else if (target.key === 'fecha_acumulado' && appState.detectedSplitMonthYear) {
                    icon.title = 'Mes y Año separados. ¡Haz clic para combinarlos!';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                    icon.addEventListener('click', openCombineMonthYearModal);
                } else if (target.key === 'tipo_nomina') {
                    icon.title = 'Sin Tipo de Nómina. ¡Haz clic para definir un valor por defecto!';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                    icon.addEventListener('click', openTipoNominaCustomizationModal);
                } else if (target.key === 'quincena') {
                    icon.title = 'Sin Quincena. ¡Haz clic para definir la regla por defecto!';
                    icon.innerHTML = `<i data-lucide="alert-circle" class="text-warning"></i>`;
                    icon.addEventListener('click', openQuincenaCustomizationModal);
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

    function appendModalToBody(overlay) {
        const wrapper = document.createElement('div');
        wrapper.className = 'payroll-adapter-scope';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '0';
        wrapper.style.height = '0';
        wrapper.style.minHeight = '0';
        wrapper.style.background = 'transparent';
        wrapper.style.border = 'none';
        wrapper.style.padding = '0';
        wrapper.style.margin = '0';
        wrapper.style.overflow = 'visible';
        wrapper.style.display = 'block';
        
        wrapper.appendChild(overlay);
        document.body.appendChild(wrapper);
        return wrapper;
    }

    // Modal: Unión de Nombres
    function openCombineNamesModal() {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'names-unification-modal';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '600px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: Nombre Completo</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        const selectionContainer = document.createElement('div');
        selectionContainer.className = 'form-group';
        selectionContainer.innerHTML = '<label style="margin-bottom: 0.75rem; display: block; font-weight: 600; color: #374151;">Selecciona las columnas en el orden en que deseas unificar el nombre completo:</label>';
        
        const columnsList = document.createElement('div');
        columnsList.className = 'modal-columns-list';
        selectionContainer.appendChild(columnsList);
        
        let tempOrderedList = [];
        if (appState.combineNames) {
            if (appState.combineSurnamesList.length > 0) {
                tempOrderedList = [...appState.combineSurnamesList, ...appState.combineNamesList];
            } else {
                tempOrderedList = [...appState.combineNamesList];
            }
        } else if (appState.detectedSplitNames) {
            tempOrderedList = [...appState.combineSurnamesList, ...appState.combineNamesList];
        }
        
        const previewBox = document.createElement('div');
        previewBox.className = 'modal-preview-box';
        
        const previewTitle = document.createElement('div');
        previewTitle.className = 'modal-preview-title';
        previewTitle.innerText = 'VISTA PREVIA DEL NOMBRE COMPLETO';
        
        const previewValue = document.createElement('div');
        previewValue.className = 'modal-preview-value';
        previewValue.innerText = 'Selecciona alguna columna para ver el resultado.';
        
        previewBox.appendChild(previewTitle);
        previewBox.appendChild(previewValue);
        
        body.appendChild(selectionContainer);
        body.appendChild(previewBox);
        
        function updateColumnsState() {
            const items = columnsList.querySelectorAll('.column-list-item');
            items.forEach(label => {
                const headerName = label.dataset.header;
                const input = label.querySelector('input');
                const nameSpan = label.querySelector('.column-name-span');
                
                const isChecked = tempOrderedList.includes(headerName);
                const orderIndex = tempOrderedList.indexOf(headerName);
                
                input.checked = isChecked;
                if (isChecked) {
                    label.classList.add('selected');
                    nameSpan.innerText = `${headerName} (${orderIndex + 1})`;
                } else {
                    label.classList.remove('selected');
                    nameSpan.innerText = headerName;
                }
            });
        }

        function updateLivePreview() {
            if (tempOrderedList.length === 0) {
                previewValue.innerText = 'Selecciona alguna columna para ver el resultado.';
                return;
            }
            
            const previewValues = [];
            for (let row of appState.rawRows) {
                const parts = tempOrderedList.map(col => String(row[col] || '').trim()).filter(val => val !== '');
                const fullName = parts.join(' ').trim().toUpperCase();
                if (fullName !== '') {
                    previewValues.push(fullName);
                    break; 
                }
            }
            
            if (previewValues.length === 0) {
                previewValue.innerText = 'Sin datos';
            } else {
                previewValue.innerHTML = `<span>${previewValues[0]}</span>`;
            }
        }
        
        function renderColumns() {
            columnsList.innerHTML = '';
            appState.rawHeaders.forEach(headerName => {
                const label = document.createElement('label');
                label.className = 'column-list-item';
                label.dataset.header = headerName;
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = headerName;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'column-name-span';
                
                input.addEventListener('change', () => {
                    if (input.checked) {
                        if (!tempOrderedList.includes(headerName)) {
                            tempOrderedList.push(headerName);
                        }
                    } else {
                        tempOrderedList = tempOrderedList.filter(item => item !== headerName);
                    }
                    updateColumnsState();
                    updateLivePreview();
                });
                
                label.appendChild(input);
                label.appendChild(nameSpan);
                columnsList.appendChild(label);
            });
            
            updateColumnsState();
            updateLivePreview();
        }
        
        renderColumns();
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Cancelar';
        btnCancel.addEventListener('click', () => {
            wrapper.remove();
        });
        
        const btnAccept = document.createElement('button');
        btnAccept.className = 'btn btn-primary';
        btnAccept.innerHTML = 'Aceptar &nbsp; ✔';
        btnAccept.addEventListener('click', () => {
            if (tempOrderedList.length === 0) {
                alert('Por favor selecciona al menos una columna para unificar.');
                return;
            }
            appState.combineNames = true;
            appState.combineSurnamesList = [];
            appState.combineNamesList = tempOrderedList;
            
            wrapper.remove();
            renderMappingUI();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnAccept);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal: Unión de Fechas
    function openCombineMonthYearModal() {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'dates-unification-modal';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '550px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: Fecha de Acumulado</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        const selectionContainer = document.createElement('div');
        selectionContainer.className = 'form-group';
        selectionContainer.innerHTML = '<label style="margin-bottom: 0.75rem; display: block; font-weight: 600; color: #374151;">Selecciona las columnas en orden: Día (1), Mes (2) y Año (3) [o solo Mes (1) y Año (2)]:</label>';
        
        const columnsList = document.createElement('div');
        columnsList.className = 'modal-columns-list';
        selectionContainer.appendChild(columnsList);
        
        let tempOrderedList = [];
        if (appState.combineMonthYear) {
            if (appState.dayColumn) {
                tempOrderedList = [appState.dayColumn, appState.monthColumn, appState.yearColumn];
            } else if (appState.monthColumn && appState.yearColumn) {
                tempOrderedList = [appState.monthColumn, appState.yearColumn];
            }
        } else if (appState.detectedSplitMonthYear) {
            if (appState.suggestedDayColumn) {
                tempOrderedList = [appState.suggestedDayColumn, appState.suggestedMonthColumn, appState.suggestedYearColumn];
            } else {
                tempOrderedList = [appState.suggestedMonthColumn, appState.suggestedYearColumn];
            }
        }
        
        const formDay = document.createElement('div');
        formDay.className = 'form-group';
        formDay.style.marginTop = '0.5rem';
        formDay.innerHTML = '<label style="font-weight: 600; color: #374151; margin-bottom: 0.5rem; display: block;">Día del Mes a Asignar</label>';
        
        const selectDay = document.createElement('select');
        selectDay.className = 'mapping-select';
        selectDay.style.width = '100%';
        
        const dayOptions = [
            { value: 'none', text: 'No aplica (El día está en las columnas)' },
            { value: '30', text: 'Día 30' },
            { value: 'last', text: 'Fin de mes (Día 28, 30, 31)' }
        ];
        dayOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.innerText = opt.text;
            if (opt.value === appState.monthYearDayRule) el.selected = true;
            selectDay.appendChild(el);
        });
        formDay.appendChild(selectDay);
        
        let tempDayRule = appState.monthYearDayRule;
        selectDay.addEventListener('change', (e) => {
            tempDayRule = e.target.value;
        });
        
        body.appendChild(selectionContainer);
        body.appendChild(formDay);
        
        function updateColumnsState() {
            const items = columnsList.querySelectorAll('.column-list-item');
            items.forEach(label => {
                const headerName = label.dataset.header;
                const input = label.querySelector('input');
                const nameSpan = label.querySelector('.column-name-span');
                
                const isChecked = tempOrderedList.includes(headerName);
                const orderIndex = tempOrderedList.indexOf(headerName);
                
                input.checked = isChecked;
                if (isChecked) {
                    label.classList.add('selected');
                    nameSpan.innerText = `${headerName} (${orderIndex + 1})`;
                } else {
                    label.classList.remove('selected');
                    nameSpan.innerText = headerName;
                }
            });
        }
        
        function renderColumns() {
            columnsList.innerHTML = '';
            appState.rawHeaders.forEach(headerName => {
                const label = document.createElement('label');
                label.className = 'column-list-item';
                label.dataset.header = headerName;
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = headerName;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'column-name-span';
                
                input.addEventListener('change', () => {
                    if (input.checked) {
                        if (tempOrderedList.length >= 3) {
                            alert('Solo puedes seleccionar un máximo de 3 columnas (Día, Mes y Año).');
                            input.checked = false;
                            return;
                        }
                        if (!tempOrderedList.includes(headerName)) {
                            tempOrderedList.push(headerName);
                        }
                    } else {
                        tempOrderedList = tempOrderedList.filter(item => item !== headerName);
                    }
                    
                    if (tempOrderedList.length === 3) {
                        selectDay.value = 'none';
                        tempDayRule = 'none';
                    } else if (tempOrderedList.length === 2 && tempDayRule === 'none') {
                        selectDay.value = 'last';
                        tempDayRule = 'last';
                    }
                    
                    updateColumnsState();
                });
                
                label.appendChild(input);
                label.appendChild(nameSpan);
                columnsList.appendChild(label);
            });
            
            updateColumnsState();
        }
        
        renderColumns();
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Cancelar';
        btnCancel.addEventListener('click', () => {
            wrapper.remove();
        });
        
        const btnAccept = document.createElement('button');
        btnAccept.className = 'btn btn-primary';
        btnAccept.innerHTML = 'Aceptar &nbsp; ✔';
        btnAccept.addEventListener('click', () => {
            if (tempOrderedList.length < 2) {
                alert('Por favor selecciona al menos las columnas de Mes y Año.');
                return;
            }
            appState.combineMonthYear = true;
            if (tempOrderedList.length === 3) {
                appState.dayColumn = tempOrderedList[0];
                appState.monthColumn = tempOrderedList[1];
                appState.yearColumn = tempOrderedList[2];
            } else {
                appState.dayColumn = '';
                appState.monthColumn = tempOrderedList[0];
                appState.yearColumn = tempOrderedList[1];
            }
            appState.monthYearDayRule = tempDayRule;
            
            wrapper.remove();
            renderMappingUI();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnAccept);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal: Unificaciones Genéricas
    function openGenericUnificationModal(targetKey) {
        let wrapper;
        const target = TARGET_COLUMNS.find(t => t.key === targetKey);
        if (!target) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'generic-unification-modal';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '550px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: ${target.name}</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        const selectionContainer = document.createElement('div');
        selectionContainer.className = 'form-group';
        selectionContainer.innerHTML = '<label style="margin-bottom: 0.75rem; display: block; font-weight: 600; color: #374151;">Selecciona las columnas del archivo origen en el orden en que deseas unificarlas:</label>';
        
        const columnsList = document.createElement('div');
        columnsList.className = 'modal-columns-list';
        selectionContainer.appendChild(columnsList);
        
        let tempOrderedList = [];
        let tempSeparator = ' ';
        
        if (appState.columnMappings[targetKey] === '__unified__' && appState.genericUnifications[targetKey]) {
            tempOrderedList = [...appState.genericUnifications[targetKey].columns];
            tempSeparator = appState.genericUnifications[targetKey].separator || ' ';
        }
        
        const formSeparator = document.createElement('div');
        formSeparator.className = 'form-group';
        formSeparator.style.marginTop = '0.5rem';
        formSeparator.innerHTML = '<label style="font-weight: 600; color: #374151; margin-bottom: 0.5rem; display: block;">Separador de Columnas</label>';
        
        const selectSeparator = document.createElement('select');
        selectSeparator.className = 'mapping-select';
        selectSeparator.style.width = '100%';
        
        const separatorOptions = [
            { value: ' ', text: 'Espacio ( )' },
            { value: ', ', text: 'Coma (, )' },
            { value: '-', text: 'Guion (-)' },
            { value: '', text: 'Sin separador' }
        ];
        separatorOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.innerText = opt.text;
            if (opt.value === tempSeparator) el.selected = true;
            selectSeparator.appendChild(el);
        });
        formSeparator.appendChild(selectSeparator);
        
        selectSeparator.addEventListener('change', (e) => {
            tempSeparator = e.target.value;
            updateLivePreview();
        });
        
        const previewBox = document.createElement('div');
        previewBox.className = 'modal-preview-box';
        
        const previewTitle = document.createElement('div');
        previewTitle.className = 'modal-preview-title';
        previewTitle.innerText = 'VISTA PREVIA DEL VALOR UNIFICADO';
        
        const previewValue = document.createElement('div');
        previewValue.className = 'modal-preview-value';
        previewValue.innerText = 'Selecciona alguna columna para ver el resultado.';
        
        previewBox.appendChild(previewTitle);
        previewBox.appendChild(previewValue);
        
        body.appendChild(selectionContainer);
        body.appendChild(formSeparator);
        body.appendChild(previewBox);
        
        function updateColumnsState() {
            const items = columnsList.querySelectorAll('.column-list-item');
            items.forEach(label => {
                const headerName = label.dataset.header;
                const input = label.querySelector('input');
                const nameSpan = label.querySelector('.column-name-span');
                
                const isChecked = tempOrderedList.includes(headerName);
                const orderIndex = tempOrderedList.indexOf(headerName);
                
                input.checked = isChecked;
                if (isChecked) {
                    label.classList.add('selected');
                    nameSpan.innerText = `${headerName} (${orderIndex + 1})`;
                } else {
                    label.classList.remove('selected');
                    nameSpan.innerText = headerName;
                }
            });
        }

        function updateLivePreview() {
            if (tempOrderedList.length === 0) {
                previewValue.innerText = 'Selecciona alguna columna para ver el resultado.';
                return;
            }
            
            const previewValues = [];
            for (let row of appState.rawRows) {
                const parts = tempOrderedList.map(col => String(row[col] || '').trim()).filter(val => val !== '');
                const combined = parts.join(tempSeparator).trim();
                if (combined !== '') {
                    previewValues.push(combined);
                    break;
                }
            }
            
            if (previewValues.length === 0) {
                previewValue.innerText = 'Sin datos';
            } else {
                previewValue.innerHTML = `<span>${previewValues[0]}</span>`;
            }
        }
        
        function renderColumns() {
            columnsList.innerHTML = '';
            appState.rawHeaders.forEach(headerName => {
                const label = document.createElement('label');
                label.className = 'column-list-item';
                label.dataset.header = headerName;
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = headerName;
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'column-name-span';
                
                input.addEventListener('change', () => {
                    if (input.checked) {
                        if (!tempOrderedList.includes(headerName)) {
                            tempOrderedList.push(headerName);
                        }
                    } else {
                        tempOrderedList = tempOrderedList.filter(item => item !== headerName);
                    }
                    updateColumnsState();
                    updateLivePreview();
                });
                
                label.appendChild(input);
                label.appendChild(nameSpan);
                columnsList.appendChild(label);
            });
            
            updateColumnsState();
            updateLivePreview();
        }
        
        renderColumns();
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Cancelar';
        btnCancel.addEventListener('click', () => {
            wrapper.remove();
        });
        
        const btnAccept = document.createElement('button');
        btnAccept.className = 'btn btn-primary';
        btnAccept.innerHTML = 'Aceptar &nbsp; ✔';
        btnAccept.addEventListener('click', () => {
            if (tempOrderedList.length === 0) {
                alert('Por favor selecciona al menos una columna para unificar.');
                return;
            }
            appState.columnMappings[targetKey] = '__unified__';
            appState.genericUnifications[targetKey] = {
                columns: tempOrderedList,
                separator: tempSeparator
            };
            
            wrapper.remove();
            renderMappingUI();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnAccept);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal: Personalización Tipo Nómina por defecto
    function openTipoNominaCustomizationModal() {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'tipo-nomina-customization-modal';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '450px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: Tipo de Nómina</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = `
            <p style="color: #4b5563; font-size: 0.9rem;">No se identificó la columna de Tipo de Nómina en el archivo origen. Selecciona el tipo de nómina por defecto a aplicar para todas las filas de este cargue:</p>
            <div class="form-group" style="margin-top: 0.5rem; width: 100%;">
                <select id="modal-default-tipo-nomina" class="mapping-select" style="width: 100%;">
                    <option value="Normal">Normal</option>
                    <option value="Adicional">Adicional</option>
                    <option value="Vacaciones">Vacaciones</option>
                    <option value="Definitiva">Definitiva</option>
                    <option value="Prima">Prima</option>
                    <option value="Cesantias">Cesantías</option>
                    <option value="Otro">Otro</option>
                </select>
            </div>
        `;
        
        const select = body.querySelector('#modal-default-tipo-nomina');
        select.value = appState.defaultTipoNomina || 'Normal';
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Cancelar';
        btnCancel.addEventListener('click', () => wrapper.remove());
        
        const btnAccept = document.createElement('button');
        btnAccept.className = 'btn btn-primary';
        btnAccept.innerHTML = 'Aceptar &nbsp; ✔';
        btnAccept.addEventListener('click', () => {
            appState.defaultTipoNomina = select.value;
            appState.columnMappings['tipo_nomina'] = '__unified__';
            wrapper.remove();
            renderMappingUI();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnAccept);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal: Personalización regla de Quincena
    function openQuincenaCustomizationModal() {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'quincena-customization-modal';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '500px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: Quincena</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = `
            <p style="color: #4b5563; font-size: 0.9rem;">No se identificó la columna de Quincena en el archivo origen. Selecciona la regla de cálculo del periodo de pago:</p>
            <div class="options-group" style="grid-template-columns: 1fr; gap: 1rem; width: 100%;">
                <label class="option-btn" style="width: 100%; display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; background: #fafafa;">
                    <input type="radio" name="modal-quincena-rule" value="quincenal" ${appState.quincenaRule === 'quincenal' ? 'checked' : ''} style="margin-top:0.25rem;">
                    <div class="option-content">
                        <span class="option-title" style="font-weight: 600; color: #1f2937;">Nómina Quincenal</span>
                        <span class="option-desc" style="font-size: 0.75rem; color: #4b5563; display: block; margin-top: 0.25rem;">Día 1-15 se asigna como "1Q". Día 16-fin de mes se asigna como "2Q" (usando la Fecha de Acumulado).</span>
                    </div>
                </label>
                <label class="option-btn" style="width: 100%; display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; background: #fafafa;">
                    <input type="radio" name="modal-quincena-rule" value="mensual" ${appState.quincenaRule === 'mensual' ? 'checked' : ''} style="margin-top:0.25rem;">
                    <div class="option-content">
                        <span class="option-title" style="font-weight: 600; color: #1f2937;">Nómina Mensual</span>
                        <span class="option-desc" style="font-size: 0.75rem; color: #4b5563; display: block; margin-top: 0.25rem;">Toda la nómina se asigna con el valor de periodo "Mensual".</span>
                    </div>
                </label>
            </div>
        `;
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Cancelar';
        btnCancel.addEventListener('click', () => wrapper.remove());
        
        const btnAccept = document.createElement('button');
        btnAccept.className = 'btn btn-primary';
        btnAccept.innerHTML = 'Aceptar &nbsp; ✔';
        btnAccept.addEventListener('click', () => {
            const checked = body.querySelector('input[name="modal-quincena-rule"]:checked');
            if (checked) {
                appState.quincenaRule = checked.value;
            }
            appState.columnMappings['quincena'] = '__unified__';
            wrapper.remove();
            renderMappingUI();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnAccept);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal: Info Naturaleza
    function openNaturalezaInfoModal() {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'naturaleza-info-modal';

        const card = document.createElement('div');
        card.className = 'modal-card';
        card.style.maxWidth = '480px';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="sliders-horizontal"></i>
            <h3>Personalizar columna: Naturaleza</h3>
        `;

        const mappedHeader = appState.columnMappings['naturaleza'];
        const isMappedFromFile = mappedHeader && mappedHeader !== '__unified__';

        const body = document.createElement('div');
        body.className = 'modal-body';

        if (isMappedFromFile) {
            body.innerHTML = `
                <p style="color: #4b5563; font-size: 0.9rem;">La columna <strong>${mappedHeader}</strong> del archivo origen está siendo usada para determinar la naturaleza de cada concepto.</p>
                <p style="color: #4b5563; font-size: 0.9rem;">Si el valor en esa columna no se reconoce como <strong>INGRESO</strong> o <strong>DESCUENTO</strong>, se aplicará automáticamente la regla por signo del <strong>Valor</strong>:</p>
                <div style="display:flex; gap:1rem; margin-top:0.5rem;">
                    <div style="flex:1; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:1rem; text-align:center;">
                        <i data-lucide="trending-up" style="color:#10b981; width:28px; height:28px; margin-bottom:0.5rem;"></i>
                        <div style="font-weight:700; color:#10b981; font-size:1rem;">INGRESO</div>
                        <div style="font-size:0.8rem; color:#6b7280; margin-top:0.25rem;">Valor ≥ 0</div>
                    </div>
                    <div style="flex:1; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:1rem; text-align:center;">
                        <i data-lucide="trending-down" style="color:#ef4444; width:28px; height:28px; margin-bottom:0.5rem;"></i>
                        <div style="font-weight:700; color:#ef4444; font-size:1rem;">DESCUENTO</div>
                        <div style="font-size:0.8rem; color:#6b7280; margin-top:0.25rem;">Valor < 0</div>
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = `
                <p style="color: #4b5563; font-size: 0.9rem;">No se encontró la columna de Naturaleza en el archivo origen. Se aplicará automáticamente la siguiente regla basada en el <strong>Valor</strong> de cada fila:</p>
                <div style="display:flex; gap:1rem; margin-top:0.5rem;">
                    <div style="flex:1; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:1rem; text-align:center;">
                        <i data-lucide="trending-up" style="color:#10b981; width:28px; height:28px; margin-bottom:0.5rem;"></i>
                        <div style="font-weight:700; color:#10b981; font-size:1rem;">INGRESO</div>
                        <div style="font-size:0.8rem; color:#6b7280; margin-top:0.25rem;">Valor ≥ 0</div>
                    </div>
                    <div style="flex:1; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:1rem; text-align:center;">
                        <i data-lucide="trending-down" style="color:#ef4444; width:28px; height:28px; margin-bottom:0.5rem;"></i>
                        <div style="font-weight:700; color:#ef4444; font-size:1rem;">DESCUENTO</div>
                        <div style="font-size:0.8rem; color:#6b7280; margin-top:0.25rem;">Valor < 0</div>
                    </div>
                </div>
                <p style="margin-top:0.5rem; font-size:0.85rem; color:#6b7280;">Esta regla se aplica automáticamente — no es necesaria ninguna configuración adicional.</p>
            `;
        }

        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        const btnClose = document.createElement('button');
        btnClose.className = 'btn btn-primary';
        btnClose.innerHTML = 'Entendido &nbsp; ✔';
        btnClose.addEventListener('click', () => wrapper.remove());

        footer.appendChild(btnClose);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Modal interactivo inicial de sugerencias de unificación
    function showUnificationModal(hasSplitNames, hasSplitMonthYear, callback) {
        let wrapper;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'unification-modal-overlay';
        
        const card = document.createElement('div');
        card.className = 'modal-card';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <i data-lucide="git-merge"></i>
            <h3>Estructura del Archivo Detectada</h3>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        let descriptionText = 'Hemos analizado la estructura de tu archivo y detectamos columnas que pueden ser unificadas automáticamente para facilitar el mapeo:';
        let optionsHtml = '';
        
        if (hasSplitNames) {
            const colsSurnames = appState.combineSurnamesList.join(', ');
            const colsNames = appState.combineNamesList.join(', ');
            optionsHtml += `
                <div class="modal-option-item" id="opt-item-names" style="border: 1.5px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start; cursor: pointer; background: #fff;">
                    <input type="checkbox" id="modal-chk-names" class="modal-option-checkbox" checked style="margin-top: 0.25rem; transform: scale(1.2);">
                    <div class="modal-option-content">
                        <span class="modal-option-title" style="font-weight: 600; color:#1f2937;">Unificar Nombre y Apellido</span>
                        <span class="modal-option-desc" style="font-size: 0.8rem; color:#4b5563; line-height: 1.4; display:block; margin-top:0.25rem;">Se detectaron columnas separadas para apellidos (<b>${colsSurnames}</b>) y nombres (<b>${colsNames}</b>). Se unificarán en el campo <b>Nombre Completo</b> (Formato: Apellidos Nombres).</span>
                    </div>
                </div>
            `;
        }
        
        if (hasSplitMonthYear) {
            optionsHtml += `
                <div class="modal-option-item" id="opt-item-dates" style="border: 1.5px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: flex; gap: 1rem; align-items: flex-start; cursor: pointer; background: #fff; margin-top: 1rem;">
                    <input type="checkbox" id="modal-chk-dates" class="modal-option-checkbox" checked style="margin-top: 0.25rem; transform: scale(1.2);">
                    <div class="modal-option-content">
                        <span class="modal-option-title" style="font-weight: 600; color:#1f2937;">Unificar Mes y Año (Fecha de Acumulado)</span>
                        <span class="modal-option-desc" style="font-size: 0.8rem; color:#4b5563; line-height: 1.4; display:block; margin-top:0.25rem;">Se detectó que el mes (columna <b>${appState.suggestedMonthColumn}</b>) y el año (columna <b>${appState.suggestedYearColumn}</b>) vienen separados. Se unificarán para construir la <b>Fecha de Acumulado</b>.</span>
                    </div>
                </div>
            `;
        }
        
        body.innerHTML = `
            <p style="color:#4b5563; font-size:0.9rem;">${descriptionText}</p>
            <div class="modal-options-list">
                ${optionsHtml}
            </div>
        `;
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn btn-secondary';
        btnCancel.innerText = 'Mapear Manualmente';
        btnCancel.addEventListener('click', () => {
            wrapper.remove();
            callback();
        });
        
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn btn-primary';
        btnConfirm.innerHTML = 'Aplicar Selección &nbsp; ✔';
        btnConfirm.addEventListener('click', () => {
            if (hasSplitNames) {
                const chkNames = document.getElementById('modal-chk-names');
                appState.combineNames = chkNames ? chkNames.checked : false;
            }
            if (hasSplitMonthYear) {
                const chkDates = document.getElementById('modal-chk-dates');
                appState.combineMonthYear = chkDates ? chkDates.checked : false;
            }
            wrapper.remove();
            callback();
        });
        
        footer.appendChild(btnCancel);
        footer.appendChild(btnConfirm);
        
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        wrapper = appendModalToBody(overlay);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        if (hasSplitNames) {
            document.getElementById('opt-item-names').addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const chk = document.getElementById('modal-chk-names');
                    chk.checked = !chk.checked;
                }
            });
        }
        if (hasSplitMonthYear) {
            document.getElementById('opt-item-dates').addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const chk = document.getElementById('modal-chk-dates');
                    chk.checked = !chk.checked;
                }
            });
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
    function loadDataToDashboard() {
        if (!appState.transformedData || appState.transformedData.length === 0) {
            alert('Primero debes cargar un archivo y transformarlo.');
            return;
        }

        if (appState.validationErrors.some(err => err.type === 'danger')) {
            const proceed = confirm('Existen errores críticos (rojo) en la validación de los datos. ¿Estás seguro de que deseas cargarlos de todas formas? Esto podría romper los gráficos del dashboard.');
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
                    
                    const isSecondQuincena = (r.quincena || '').toUpperCase().includes('2');
                    const pa = (mesNum - 1) * 2 + (isSecondQuincena ? 2 : 1);
                    
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
                        tn: TIPO_MAP[tipoNominaClean] || "N",
                        na: r.naturaleza || "INGRESO",
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
    
})();
