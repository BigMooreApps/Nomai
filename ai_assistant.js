// ==========================================
// NOMAI AI ASSISTANT MODULE
// ==========================================

const AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
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

    if (!window.dashboardData || window.dashboardData.length === 0) {
        addMessageToChat('AI', 'Actualmente no hay datos de nómina cargados en el dashboard. Por favor carga un archivo primero para poder analizarlo.');
        return;
    }

    setTypingIndicator(true);

    try {
        const context = generateDataContext();
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

function generateDataContext() {
    const data = window.dashboardData;
    if (!data) return "No hay datos.";

    // Agrupar por año y mes
    const summary = {};
    let totalEmpleados = new Set();
    let totalNomina = 0;

    data.forEach(row => {
        const year = row.Periodo_Anio;
        const month = row.Periodo_Mes;
        const key = `${year}-${month}`;
        
        if (!summary[year]) summary[year] = { total: 0, devengos: 0, deducciones: 0, empleados: new Set(), byMonth: {} };
        if (!summary[year].byMonth[month]) summary[year].byMonth[month] = { total: 0, devengos: 0, deducciones: 0, empleados: new Set() };
        
        const valor = parseFloat(row.Valor) || 0;
        const isDevengo = String(row.Concepto_Tipo).trim() === '1';
        const isDeduccion = String(row.Concepto_Tipo).trim() === '2';
        
        summary[year].total += valor;
        summary[year].byMonth[month].total += valor;

        if (isDevengo) {
            summary[year].devengos += valor;
            summary[year].byMonth[month].devengos += valor;
        } else if (isDeduccion) {
            summary[year].deducciones += valor;
            summary[year].byMonth[month].deducciones += valor;
        }
        
        const empId = row.ID_Empleado || row.Nombre_Empleado;
        if (empId) {
            summary[year].empleados.add(empId);
            summary[year].byMonth[month].empleados.add(empId);
            totalEmpleados.add(empId);
        }
    });

    let contextStr = `Contexto de los datos de nómina actuales en el dashboard:\n`;
    contextStr += `- Total Empleados Únicos Históricos: ${totalEmpleados.size}\n`;
    
    for (const year in summary) {
        contextStr += `\nAño ${year}:\n`;
        contextStr += `- Devengos Totales (Ingresos): $${summary[year].devengos.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        contextStr += `- Deducciones Totales: $${summary[year].deducciones.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        contextStr += `- Empleados únicos en el año: ${summary[year].empleados.size}\n`;
        
        // Promedio per capita anual
        if (summary[year].empleados.size > 0) {
            const prom = summary[year].devengos / summary[year].empleados.size;
            contextStr += `- Ingreso Promedio Anual por Empleado: $${prom.toLocaleString('es-CO', {maximumFractionDigits:0})}\n`;
        }

        // Months
        const sortedMonths = Object.keys(summary[year].byMonth).sort((a,b) => parseInt(a) - parseInt(b));
        contextStr += `  Por mes:\n`;
        sortedMonths.forEach(m => {
            const mData = summary[year].byMonth[m];
            contextStr += `    Mes ${m}: Devengos $${mData.devengos.toLocaleString('es-CO', {maximumFractionDigits:0})} (${mData.empleados.size} emp)\n`;
        });
    }

    contextStr += `\nInstrucciones para la IA:\nEres el Asistente de IA oficial de Nomai, una plataforma premium de análisis de nómina. Usa EXCLUSIVAMENTE la información de contexto de arriba para responder a las preguntas del usuario sobre su nómina. Sé conciso, profesional y directo. Tu objetivo es generar "insights" precisos basados en matemáticas simples. Si preguntan por qué aumentaron los sueldos en un año, analiza los datos mensuales y el número de empleados para deducir si fue por incremento de personal o por aumento del ingreso promedio por empleado. NO inventes datos ni menciones que no tienes acceso a la base de datos completa.`;
    
    return contextStr;
}

async function fetchGeminiResponse(apiKey, userMessage, dataContext) {
    const url = `${AI_API_URL}?key=${apiKey}`;
    
    const geminiHistory = chatHistory.filter(msg => msg.role === 'user' || msg.role === 'model');
    
    const requestBody = {
        systemInstruction: {
            parts: [{ text: dataContext }]
        },
        contents: [
            ...geminiHistory,
            { role: 'user', parts: [{ text: userMessage }] }
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
