// ==========================================
// NOMAI AI ASSISTANT MODULE
// ==========================================

const AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
const API_KEY_STORAGE = 'nomai_gemini_api_key';

let chatHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    initAIAssistantUI();
});

function initAIAssistantUI() {
    const fab = document.getElementById('ai-chat-fab');
    const panel = document.getElementById('ai-chat-panel');
    const closeBtn = document.getElementById('ai-chat-close');
    const input = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');
    const configBtn = document.getElementById('ai-chat-config');

    if (!fab || !panel) return;

    fab.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            input.focus();
            if (chatHistory.length === 0) {
                addMessageToChat('AI', '¡Hola! Soy tu asistente de Nomai. ¿En qué puedo ayudarte a analizar tu nómina hoy?');
            }
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
    });

    sendBtn.addEventListener('click', handleSendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });

    configBtn.addEventListener('click', promptForApiKey);
}

async function promptForApiKey() {
    const currentKey = localStorage.getItem(API_KEY_STORAGE) || '';
    const newKey = await window.showNomaiPrompt('Por favor, ingresa tu API Key de Gemini para activar el asistente de IA:', currentKey);
    if (newKey !== null) {
        localStorage.setItem(API_KEY_STORAGE, newKey.trim());
        showNomaiAlert('API Key actualizada correctamente.');
    }
}

async function handleSendMessage() {
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
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
    
    // Formatear markdown básico (negritas)
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    
    msgDiv.innerHTML = `<div class="bubble">${formattedText}</div>`;
    messagesContainer.appendChild(msgDiv);
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function generateDataContext(userMessage) {
    const data = window.state ? window.state.data : null;
    if (!data) return "No hay datos.";

    // Agrupar por año y mes
    const summary = {};
    let totalEmpleados = new Set();
    let totalNomina = 0;

    data.forEach(row => {
        const year = row.a || 'Desconocido';
        const month = row.m || 'Desconocido';
        const key = `${year}-${month}`;
        
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
        
        // Promedio per capita anual
        if (summary[year].empleados.size > 0) {
            const prom = summary[year].devengos / summary[year].empleados.size;
            contextStr += `- Ingreso Promedio Anual por Empleado: $${prom.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        }
    }

    // EXTRAER SOLO LOS REGISTROS RELEVANTES A LA PREGUNTA (Para no agotar los tokens de la API)
    if (userMessage) {
        const userWords = userMessage.toLowerCase().split(/\s+/).filter(w => w.length >= 3); // Ignorar conectores
        
        // Buscar coincidencias en CUALQUIER campo (Mes, Concepto, Cedula, Nombre, etc)
        const relevantRows = data.filter(r => {
            const rowText = `${r.a} ${r.m} ${r.c} ${r.n} ${r.co} ${r.na} q${r.pa||'1'}`.toLowerCase();
            return userWords.some(w => rowText.includes(w));
        });
        
        if (relevantRows.length > 0) {
            contextStr += `\nBASE DE DATOS FILTRADA (Registros extraídos específicamente para responder a la pregunta del usuario):\n`;
            contextStr += `Año,Mes,Quincena,Cedula,Nombre,Naturaleza,Concepto,Valor\n`;
            
            // Limitar a 500 filas para mantener un payload bajo y no agotar la cuota de Tokens por Minuto (TPM)
            relevantRows.slice(0, 500).forEach(r => {
                const q = r.pa || '1';
                const na = String(r.na).substring(0,3).toUpperCase();
                const nClean = String(r.n || '').replace(/,/g, '');
                const coClean = String(r.co || '').replace(/,/g, '');
                contextStr += `${r.a},${r.m},Q${q},${r.c},${nClean},${na},${coClean},${parseFloat(r.v).toFixed(0)}\n`;
            });
            
            if (relevantRows.length > 500) {
                contextStr += `... (Se omitieron ${relevantRows.length - 500} registros similares para ahorrar memoria. Si el usuario pide un total, adviértele que esta es una muestra representativa de 500 registros)\n`;
            }
        }
    }

    contextStr += `\nInstrucciones IMPORTANTES para la IA:
Eres el Asistente de IA de Nomai, experto en análisis de nómina. 
Arriba tienes los resúmenes anuales y una BASE DE DATOS FILTRADA en formato CSV con las filas exactas que coinciden con la pregunta del usuario. 
Usa el CSV para sumar valores, buscar personas, o analizar conceptos (horas extras, etc.).
Haz cálculos matemáticos precisos sumando la columna 'Valor'. Si no hay registros en la base filtrada, diles que no encontraste información específica para su búsqueda.`;
    
    return contextStr;
}

// Variable global para cachear el nombre del modelo
let autoDetectedModel = null;

async function fetchGeminiResponse(apiKey, userMessage, dataContext) {
    // 1. Auto-detectar el modelo correcto si no está en caché
    if (!autoDetectedModel) {
        try {
            const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const modelsRes = await fetch(modelsUrl);
            if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                // Buscar un modelo que soporte generateContent y sea de la familia gemini (preferiblemente flash o pro)
                const validModels = modelsData.models.filter(m => 
                    m.supportedGenerationMethods && 
                    m.supportedGenerationMethods.includes('generateContent') &&
                    m.name.includes('gemini')
                );
                
                if (validModels.length > 0) {
                    // Preferir cualquier modelo 'flash' (son los que tienen cuota gratuita alta), si no 'pro', si no el primero
                    const flashModel = validModels.find(m => m.name.includes('flash'));
                    const proModel = validModels.find(m => m.name.includes('pro'));
                    autoDetectedModel = (flashModel || proModel || validModels[0]).name;
                }
            }
        } catch (e) {
            console.warn("Error auto-detectando modelos:", e);
        }
    }
    
    // Fallback de seguridad si falla la detección
    const modelName = autoDetectedModel || 'models/gemini-1.5-flash';
    
    // Construir la URL final
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
    
    // Filtrar mensajes y asegurar que el historial empiece con 'user' (Gemini requiere alternancia estricta y empezar con user)
    let geminiHistory = chatHistory.filter(msg => msg.role === 'user' || msg.role === 'model');
    if (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
        geminiHistory.shift(); // Quitar el saludo inicial de la IA para el historial
    }
    
    // Como handleSendMessage ya hizo push del mensaje actual a chatHistory, 
    // necesitamos sacarlo de geminiHistory para no enviarlo duplicado y romper la alternancia estricta.
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
        geminiHistory.pop();
    }
    
    // Inyectar el contexto de forma transparente en el último mensaje para compatibilidad
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

window.showNomaiPrompt = window.showNomaiPrompt || function(msg, def) { return prompt(msg, def); };
window.showNomaiAlert = window.showNomaiAlert || function(msg) { alert(msg); };
