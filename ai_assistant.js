// ==========================================
// NOMAI AI ASSISTANT MODULE
// ==========================================

const API_KEY_STORAGE = 'nomai_gemini_api_key';

let chatHistory = [];
let autoDetectedModel = null;

// Speech Recognition (Speech-to-Text) globals
let recognition = null;
let isListening = false;

// Voice Synthesis (Text-to-Speech) globals
let isVoiceEnabled = localStorage.getItem('nomai_voice_enabled') !== 'false';

document.addEventListener('DOMContentLoaded', () => {
    initAIAssistantUI();
    initSpeechRecognition();
    initVoiceToggle();
});

function initAIAssistantUI() {
    const input = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');
    const configBtn = document.getElementById('ai-chat-config');
    const micBtn = document.getElementById('ai-chat-mic');
    const configPanelBtn = document.getElementById('btn-configure-api-key-panel');

    if (!input || !sendBtn) return;

    sendBtn.addEventListener('click', handleSendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });

    if (configBtn) {
        configBtn.addEventListener('click', promptForApiKey);
    }
    
    if (configPanelBtn) {
        configPanelBtn.addEventListener('click', promptForApiKey);
    }
    
    if (micBtn) {
        micBtn.addEventListener('click', toggleSpeechListening);
    }

    // Configurar clicks de sugerencias
    document.querySelectorAll('.suggested-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            if (input && prompt) {
                input.value = prompt;
                handleSendMessage();
            }
        });
    });

    // Actualizar el estado de la API key al inicio
    updateApiKeyStatus();
}

function updateApiKeyStatus() {
    const badge = document.getElementById('api-status-badge');
    if (!badge) return;

    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (apiKey && apiKey.trim().length > 0) {
        badge.className = 'api-status-badge active';
        badge.querySelector('.status-text').textContent = 'Configurada (Activa)';
    } else {
        badge.className = 'api-status-badge inactive';
        badge.querySelector('.status-text').textContent = 'Sin configurar';
    }
}

function initAssistantChatIfNeeded() {
    const input = document.getElementById('ai-chat-input');
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!input || !messagesContainer) return;
    
    if (chatHistory.length === 0) {
        const greeting = '¡Hola! Soy tu asistente de Nomai. ¿En qué puedo ayudarte a analizar tu nómina hoy?';
        addMessageToChat('AI', greeting);
    }
    input.focus();
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
}
window.initAssistantChatIfNeeded = initAssistantChatIfNeeded;

async function promptForApiKey() {
    const currentKey = localStorage.getItem(API_KEY_STORAGE) || '';
    const newKey = await window.showNomaiPrompt('Por favor, ingresa tu API Key de Gemini para activar el asistente de IA:', currentKey);
    if (newKey !== null) {
        localStorage.setItem(API_KEY_STORAGE, newKey.trim());
        showNomaiAlert('API Key actualizada correctamente.');
        updateApiKeyStatus();
    }
}

async function handleSendMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    
    // Stop recognition if it's currently running
    if (isListening && recognition) {
        recognition.stop();
    }

    addMessageToChat('USER', message);

    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (!apiKey) {
        addMessageToChat('AI', 'Necesitas configurar tu API Key de Gemini para que pueda responder. Haz clic en el ícono de engranaje arriba para ingresarla.');
        return;
    }

    if (!window.state || !window.state.data || window.state.data.length === 0) {
        addMessageToChat('AI', 'Actualmente no hay datos de nómina cargados en el dashboard. Por favor carga un archivo primero para poder analizarlo.');
        return;
    }

    setTypingIndicator(true);

    try {
        const context = generateDataContext(message);
        const response = await fetchGeminiResponse(apiKey, message, context);
        addMessageToChat('AI', response);
    } catch (error) {
        console.error('Error fetching AI response:', error);
        addMessageToChat('AI', 'Lo siento, ocurrió un error al comunicarme con la IA. ' + error.message);
    } finally {
        setTypingIndicator(false);
    }
}

function addMessageToChat(sender, text) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    if (!messagesContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender.toLowerCase()}`;
    
    let displayText = text;
    let chartConfig = null;

    // Check for Chart configuration block
    if (sender === 'AI') {
        const chartStartIdx = text.indexOf('[CHART_START]');
        const chartEndIdx = text.indexOf('[CHART_END]');
        
        if (chartStartIdx !== -1 && chartEndIdx !== -1 && chartEndIdx > chartStartIdx) {
            const chartJsonStr = text.substring(chartStartIdx + 13, chartEndIdx).trim();
            displayText = (text.substring(0, chartStartIdx) + text.substring(chartEndIdx + 11)).trim();
            try {
                chartConfig = JSON.parse(chartJsonStr);
            } catch (e) {
                console.error("Failed to parse chart JSON:", e);
            }
        }
    }

    // Format basic markdown (bold/italic) and line breaks
    const formattedText = displayText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    
    // Create the message bubble content
    if (sender === 'AI') {
        msgDiv.innerHTML = `
            <div class="bubble">
                <div class="message-text">${formattedText}</div>
                <div class="message-actions">
                    <button class="btn-replay-audio" title="Escuchar mensaje">
                        <i data-lucide="volume-2" style="width: 14px; height: 14px;"></i> Escuchar
                    </button>
                </div>
            </div>
        `;
        
        // Add speech trigger to replay button
        const replayBtn = msgDiv.querySelector('.btn-replay-audio');
        if (replayBtn) {
            replayBtn.addEventListener('click', () => {
                speakText(displayText);
            });
        }
    } else {
        msgDiv.innerHTML = `<div class="bubble">${formattedText}</div>`;
    }
    
    messagesContainer.appendChild(msgDiv);

    // If chart config was successfully parsed, create canvas and render it
    if (chartConfig) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'ai-chart-container';
            
            // Insert it before actions or at the end
            const actions = bubble.querySelector('.message-actions');
            if (actions) {
                bubble.insertBefore(chartContainer, actions);
            } else {
                bubble.appendChild(chartContainer);
            }
            
            renderChartInMessage(chartContainer, chartConfig);
        }
    }
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // If AI sent the message and voice is enabled, speak it
    if (sender === 'AI') {
        speakText(displayText);
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }

    chatHistory.push({ role: sender === 'AI' ? 'model' : 'user', parts: [{ text }] });
}

function setTypingIndicator(isTyping) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    let indicator = document.getElementById('ai-typing-indicator');
    
    if (isTyping) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ai-typing-indicator';
            indicator.className = 'chat-message ai typing-indicator-msg';
            indicator.innerHTML = `<div class="bubble typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
            messagesContainer.appendChild(indicator);
        }
    } else {
        if (indicator) indicator.remove();
    }
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function generateDataContext(userMessage) {
    const data = window.state ? window.state.data : null;
    if (!data) return "No hay datos.";

    // Group by year and month
    const summary = {};
    let totalEmpleados = new Set();

    data.forEach(row => {
        const year = row.a || 'Desconocido';
        const month = row.m || 'Desconocido';
        
        if (!summary[year]) summary[year] = { total: 0, devengos: 0, deducciones: 0, empleados: new Set(), byMonth: {} };
        if (!summary[year].byMonth[month]) summary[year].byMonth[month] = { total: 0, devengos: 0, deducciones: 0, empleados: new Set() };
        
        const valor = parseFloat(row.v) || 0;
        const isDevengo = String(row.na).trim().toUpperCase() === 'DEVENGO';
        const isDeduccion = String(row.na).trim().toUpperCase() === 'DESCUENTO';
        
        summary[year].total += valor;
        summary[year].byMonth[month].total += valor;

        if (isDevengo) {
            summary[year].devengos += valor;
            summary[year].byMonth[month].devengos += valor;
        } else if (isDeduccion) {
            summary[year].deducciones += valor;
            summary[year].byMonth[month].deducciones += valor;
        }
        
        const empId = row.c || row.n;
        if (empId) {
            summary[year].empleados.add(empId);
            summary[year].byMonth[month].empleados.add(empId);
            totalEmpleados.add(empId);
            if (row.c && row.n) {
                if (!summary.empNames) summary.empNames = {};
                summary.empNames[row.c] = row.n;
            }
        }
    });

    let contextStr = `Contexto de los datos de nómina actuales en el dashboard:\n`;
    contextStr += `- Total Empleados Únicos Históricos: ${totalEmpleados.size}\n`;
    
    for (const year in summary) {
        if (year === 'empNames') continue;
        contextStr += `\nAño ${year}:\n`;
        contextStr += `- Devengos Totales (Ingresos): $${summary[year].devengos.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        contextStr += `- Deducciones Totales: $${summary[year].deducciones.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        contextStr += `- Empleados únicos en el año: ${summary[year].empleados.size}\n`;
        
        if (summary[year].empleados.size > 0) {
            const prom = summary[year].devengos / summary[year].empleados.size;
            contextStr += `- Ingreso Promedio Anual por Empleado: $${prom.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        }
    }

    // SCORING RELEVANCE TO FILTER LARGER DATASETS
    if (userMessage) {
        const stopWords = ['dame', 'dime', 'cuanto', 'cuantos', 'como', 'cual', 'quien', 'para', 'los', 'las', 'del', 'con', 'por', 'que', 'una', 'uno', 'realizados', 'hubieron', 'hay', 'tiene', 'tienen', 'este', 'esta', 'ese', 'esa', 'pago', 'pagos', 'total', 'cantidad', 'persona', 'personas', 'empleado', 'empleados', 'realizo', 'realizó', 'sobre'];
        const userWords = userMessage.toLowerCase().split(/[\s,¿?¡!]+/).filter(w => w.length >= 2 && !stopWords.includes(w));
        
        if (userWords.length > 0) {
            const scoredRows = [];
            data.forEach(r => {
                const rowText = `${r.a} ${r.m} ${r.c} ${r.n} ${r.co} ${r.na} ${r.cg} q${r.pa||'1'} quincena ${r.pa||'1'}`.toLowerCase();
                let score = 0;
                userWords.forEach(w => {
                    if (rowText.includes(w)) score++;
                });
                if (score > 0) {
                    scoredRows.push({ r, score });
                }
            });
            
            scoredRows.sort((a, b) => b.score - a.score);
            const relevantRows = scoredRows.map(item => item.r);
            
            if (relevantRows.length > 0) {
                contextStr += `\nBASE DE DATOS FILTRADA (Ordenada por relevancia a la pregunta):\n`;
                contextStr += `Año,Mes,Quincena,Cedula,Nombre,Cargo,Naturaleza,Concepto,Valor\n`;
                
                relevantRows.slice(0, 800).forEach(r => {
                    const q = r.pa || '1';
                    const na = String(r.na).substring(0,3).toUpperCase();
                    const nClean = String(r.n || '').replace(/,/g, '');
                    const coClean = String(r.co || '').replace(/,/g, '');
                    const cgClean = String(r.cg || 'N/A').replace(/,/g, '');
                    contextStr += `${r.a},${r.m},Q${q},${r.c},${nClean},${cgClean},${na},${coClean},${parseFloat(r.v).toFixed(0)}\n`;
                });
                
                if (relevantRows.length > 800) {
                    contextStr += `... (Se omitieron ${relevantRows.length - 800} registros con menor puntaje de relevancia para ahorrar cuota de API)\n`;
                }
            }
        }
    }

    contextStr += `\nInstrucciones IMPORTANTES para la IA:
Eres el Asistente de IA de Nomai, experto en análisis de nómina. 
Arriba tienes la BASE DE DATOS FILTRADA en CSV con las filas exactas más relevantes para la pregunta del usuario. 
Usa el CSV para responder de forma concisa. Puedes ver el CARGO de la persona en la columna Cargo.
Si la base de datos dice "Se omitieron X registros", aclárale al usuario que estás usando una muestra de los 800 registros más relevantes, por lo que las sumas totales masivas pueden ser estimaciones.

CRÍTICO - GENERACIÓN DE GRÁFICOS:
Si el usuario solicita expresamente un gráfico o una visualización de datos (ej. "haz un gráfico de barras", "gráfico de líneas de X", "gráfico circular de cecos"), DEBES incluir un bloque de configuración de gráfico al final de tu respuesta en este formato exacto:
[CHART_START]
{
  "chartType": "bar" | "line" | "pie" | "doughnut",
  "title": "Título descriptivo del gráfico",
  "labels": ["Etiqueta 1", "Etiqueta 2", ...],
  "datasets": [
    {
      "label": "Nombre del Dataset",
      "data": [valor1, valor2, ...]
    }
  ]
}
[CHART_END]
Reglas para el gráfico:
1. No uses bloques de código markdown \`\`\` para envolver el JSON. Escríbelo tal cual entre [CHART_START] y [CHART_END].
2. Asegúrate de que el JSON sea estrictamente válido (usa comillas dobles).
3. Adapta las etiquetas y datos según los cálculos reales de los datos de nómina correspondientes a la consulta del usuario.`;
    
    return contextStr;
}

async function fetchGeminiResponse(apiKey, userMessage, dataContext) {
    if (!autoDetectedModel) {
        try {
            const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const modelsRes = await fetch(modelsUrl);
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                const validModels = modelsData.models.filter(m => 
                    m.supportedGenerationMethods && 
                    m.supportedGenerationMethods.includes('generateContent') &&
                    m.name.includes('gemini')
                );
                
                if (validModels.length > 0) {
                    const flash15Model = validModels.find(m => m.name.includes('1.5-flash'));
                    const anyFlashModel = validModels.find(m => m.name.includes('flash'));
                    const proModel = validModels.find(m => m.name.includes('pro'));
                    autoDetectedModel = (flash15Model || anyFlashModel || proModel || validModels[0]).name;
                }
            }
        } catch (e) {
            console.warn("Error auto-detectando modelos:", e);
        }
    }
    
    const modelName = autoDetectedModel || 'models/gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
    
    let geminiHistory = chatHistory.filter(msg => msg.role === 'user' || msg.role === 'model');
    if (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
        geminiHistory.shift();
    }
    
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
        geminiHistory.pop();
    }
    
    const combinedMessage = `CONTEXTO DE DATOS:\n${dataContext}\n\nPREGUNTA DEL USUARIO:\n${userMessage}`;

    const requestBody = {
        contents: [
            ...geminiHistory,
            { role: 'user', parts: [{ text: combinedMessage }] }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Error en la API');
    }

    const data = await response.json();
    if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
    } else {
        throw new Error('Respuesta vacía de la API');
    }
}

// ==========================================
// SPEECH-TO-TEXT (STT) IMPLEMENTATION
// ==========================================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition API not supported in this browser.");
        const micBtn = document.getElementById('ai-chat-mic');
        if (micBtn) micBtn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isListening = true;
        const micBtn = document.getElementById('ai-chat-mic');
        if (micBtn) {
            micBtn.classList.add('listening');
            micBtn.setAttribute('title', 'Escuchando... Haz clic para detener');
            micBtn.innerHTML = '<i data-lucide="mic-off" style="width: 20px; height: 20px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
        window.speechSynthesis.cancel();
    };

    recognition.onend = () => {
        isListening = false;
        const micBtn = document.getElementById('ai-chat-mic');
        if (micBtn) {
            micBtn.classList.remove('listening');
            micBtn.setAttribute('title', 'Preguntar con voz');
            micBtn.innerHTML = '<i data-lucide="mic" style="width: 20px; height: 20px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        isListening = false;
        const micBtn = document.getElementById('ai-chat-mic');
        if (micBtn) {
            micBtn.classList.remove('listening');
            micBtn.innerHTML = '<i data-lucide="mic" style="width: 20px; height: 20px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
        if (event.error === 'not-allowed') {
            showNomaiAlert("Permiso para usar el micrófono denegado. Por favor, habilítalo en la configuración de tu navegador.");
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('ai-chat-input');
        if (input) {
            input.value = transcript;
            handleSendMessage();
        }
    };
}

function toggleSpeechListening() {
    if (!recognition) initSpeechRecognition();
    if (!recognition) return;

    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch (e) {
            console.error("Error starting speech recognition:", e);
        }
    }
}

// ==========================================
// TEXT-TO-SPEECH (TTS) IMPLEMENTATION
// ==========================================
function initVoiceToggle() {
    const toggleBtn = document.getElementById('ai-chat-voice-toggle');
    if (!toggleBtn) return;

    updateVoiceToggleUI();

    toggleBtn.addEventListener('click', () => {
        isVoiceEnabled = !isVoiceEnabled;
        localStorage.setItem('nomai_voice_enabled', isVoiceEnabled);
        updateVoiceToggleUI();
        
        if (!isVoiceEnabled) {
            window.speechSynthesis.cancel();
        }
    });
}

function updateVoiceToggleUI() {
    const toggleBtn = document.getElementById('ai-chat-voice-toggle');
    if (!toggleBtn) return;

    if (isVoiceEnabled) {
        toggleBtn.classList.remove('muted');
        toggleBtn.setAttribute('title', 'Desactivar respuesta por voz');
        toggleBtn.innerHTML = '<i data-lucide="volume-2" style="width: 20px; height: 20px;"></i>';
    } else {
        toggleBtn.classList.add('muted');
        toggleBtn.setAttribute('title', 'Activar respuesta por voz');
        toggleBtn.innerHTML = '<i data-lucide="volume-x" style="width: 20px; height: 20px;"></i>';
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function speakText(text) {
    if (!isVoiceEnabled) return;
    
    window.speechSynthesis.cancel();
    
    let cleanText = text
        .replace(/\[CHART_START\][\s\S]*?\[CHART_END\]/g, '')
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .trim();
        
    if (!cleanText) return;
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es-') || v.lang.includes('Spanish'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }
    
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// CHART RENDERING IMPLEMENTATION (CHART.JS)
// ==========================================
function renderChartInMessage(container, config) {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    
    const brandColors = [
        'rgba(168, 85, 247, 0.85)', // purple
        'rgba(34, 211, 238, 0.85)',  // cyan
        'rgba(244, 63, 94, 0.85)',   // rose
        'rgba(251, 191, 36, 0.85)',  // amber
        'rgba(52, 211, 153, 0.85)'   // emerald
    ];
    
    const borderColors = [
        '#a855f7',
        '#22d3ee',
        '#f43f5e',
        '#fbbf24',
        '#34d399'
    ];

    const datasets = config.datasets.map((ds, idx) => {
        const colorIdx = idx % brandColors.length;
        
        let bg = brandColors[colorIdx];
        if (config.chartType === 'line' || config.chartType === 'bar') {
            const gradient = ctx.createLinearGradient(0, 0, 0, 180);
            gradient.addColorStop(0, brandColors[colorIdx]);
            gradient.addColorStop(1, 'rgba(108, 0, 211, 0.05)');
            bg = gradient;
        }

        return {
            label: ds.label || 'Monto',
            data: ds.data,
            backgroundColor: config.chartType === 'pie' || config.chartType === 'doughnut' ? brandColors : bg,
            borderColor: config.chartType === 'pie' || config.chartType === 'doughnut' ? '#1a0533' : borderColors[colorIdx],
            borderWidth: 2,
            borderRadius: config.chartType === 'bar' ? 6 : 0,
            tension: 0.35,
            fill: config.chartType === 'line'
        };
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: !!config.title,
                text: config.title || '',
                color: '#f8fafc',
                font: {
                    family: "'Inter', 'sans-serif'",
                    size: 13,
                    weight: 'bold'
                },
                padding: { bottom: 8 }
            },
            legend: {
                display: config.chartType === 'pie' || config.chartType === 'doughnut' || datasets.length > 1,
                position: 'bottom',
                labels: {
                    color: '#cbd5e1',
                    boxWidth: 10,
                    padding: 8,
                    font: { size: 9 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(26, 5, 51, 0.95)',
                titleColor: '#fff',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(168, 85, 247, 0.3)',
                borderWidth: 1,
                padding: 8,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        
                        let val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                        if (val !== undefined) {
                            label += '$' + val.toLocaleString('es-CO', { maximumFractionDigits: 0 });
                        }
                        return label;
                    }
                }
            }
        },
        scales: {}
    };

    if (config.chartType !== 'pie' && config.chartType !== 'doughnut') {
        chartOptions.scales = {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 8 }
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 8 },
                    callback: function(value) {
                        if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
                        if (value >= 1e3) return '$' + (value / 1e3).toFixed(0) + 'k';
                        return '$' + value;
                    }
                }
            }
        };
    }

    new Chart(ctx, {
        type: config.chartType,
        data: {
            labels: config.labels,
            datasets: datasets
        },
        options: chartOptions
    });
}

window.showNomaiPrompt = window.showNomaiPrompt || function(msg, def) { return prompt(msg, def); };
window.showNomaiAlert = window.showNomaiAlert || function(msg) { alert(msg); };
