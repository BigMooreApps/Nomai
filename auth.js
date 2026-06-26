/**
 * NOMAI AUTH MODULE
 * Gestión de autenticación Multi-Tenant con Supabase
 * Versión: 1.0.0
 */

// ─── Configuración Supabase ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://zgwhdebnwviotcejgpnr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnd2hkZWJud3Zpb3RjZWpncG5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTA5ODksImV4cCI6MjA5Nzk2Njk4OX0.2Igq7wRYBL2RCRNlRZCeq9UUbIm6vxY-CBLA3cpzzBk';

// ─── Estado global de autenticación ──────────────────────────────────────────
window.NomaiAuth = {
    supabase: null,
    session: null,
    user: null,
    profile: null,      // { id, company_id, role, full_name, is_active }
    company: null,      // { id, name, status, slug }
    permissions: {},    // { [permName]: boolean }
    initialized: false,
    hasPermission(permissionName) {
        if (this.profile && this.profile.role === 'super_admin') {
            return true;
        }
        return !!this.permissions[permissionName];
    }
};

// ─── Inicialización ───────────────────────────────────────────────────────────
async function initNomaiAuth() {
    // Cargar Supabase SDK desde CDN si no está disponible
    if (!window.supabase) {
        console.error('[NomaiAuth] Supabase SDK no cargado. Agrega el script antes de auth.js');
        return false;
    }

    const { createClient } = window.supabase;
    window.NomaiAuth.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        }
    });

    const sb = window.NomaiAuth.supabase;

    // Escuchar cambios de sesión
    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            clearAuthState();
            redirectToLogin();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            window.NomaiAuth.session = session;
            window.NomaiAuth.user = session.user;
        }
    });

    const { data, error } = await sb.auth.getSession();
    if (error) {
        console.error('[NomaiAuth] Error getting session:', error);
    }
    const session = data ? data.session : null;

    if (!session) {
        return false; // Sin sesión activa
    }

    window.NomaiAuth.session = session;
    window.NomaiAuth.user = session.user;

    // Cargar contexto del usuario (rol, empresa, estado)
    const loaded = await loadUserContext();
    if (!loaded) return false;

    window.NomaiAuth.initialized = true;
    return true;
}

// ─── Cargar contexto del usuario ─────────────────────────────────────────────
async function loadUserContext() {
    const sb = window.NomaiAuth.supabase;

    try {
        // Usar la función SQL que creamos: get_user_context()
        const { data, error } = await sb.rpc('get_user_context');

        if (error || !data) {
            console.error('[NomaiAuth] Error cargando contexto:', error);
            return false;
        }

        window.NomaiAuth.profile = {
            id: data.user_id,
            company_id: data.company_id,
            role: data.role,
            full_name: data.full_name,
            is_active: data.is_active,
        };

        window.NomaiAuth.company = data.company_id ? {
            id: data.company_id,
            name: data.company_name,
            status: data.company_status,
        } : null;

        // Cargar permisos del rol del usuario activo
        const { data: permData, error: permError } = await sb.rpc('get_my_permissions');
        window.NomaiAuth.permissions = {};
        if (permError) {
            console.error('[NomaiAuth] Error cargando permisos:', permError);
        } else if (permData) {
            permData.forEach(p => {
                window.NomaiAuth.permissions[p.permission] = p.is_enabled;
            });
        }

        return true;
    } catch (e) {
        console.error('[NomaiAuth] Excepción cargando contexto:', e);
        return false;
    }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function nomaiLogin(email, password) {
    if (!window.NomaiAuth.supabase) {
        await initNomaiAuth();
    }
    const sb = window.NomaiAuth.supabase;
    if (!sb) {
        return { success: false, error: 'El SDK de Supabase no se ha podido inicializar.' };
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        return { success: false, error: error.message };
    }

    window.NomaiAuth.session = data.session;
    window.NomaiAuth.user = data.user;

    // Cargar perfil y empresa
    const loaded = await loadUserContext();
    if (!loaded) {
        await sb.auth.signOut();
        return { success: false, error: 'No se pudo cargar el perfil del usuario.' };
    }

    const profile = window.NomaiAuth.profile;
    const company = window.NomaiAuth.company;

    // Verificar que el usuario esté activo
    if (!profile.is_active) {
        await sb.auth.signOut();
        return { success: false, error: 'Tu cuenta ha sido desactivada. Contacta a tu administrador.' };
    }

    // Verificar estado de la empresa (solo para no super_admin)
    if (profile.role !== 'super_admin' && company) {
        if (company.status === 'suspended') {
            await sb.auth.signOut();
            return { success: false, error: 'Tu empresa está suspendida por falta de pago. Contacta a soporte.' };
        }
        if (company.status === 'inactive') {
            await sb.auth.signOut();
            return { success: false, error: 'Tu empresa está inactiva. Contacta a tu administrador.' };
        }
    }

    window.NomaiAuth.initialized = true;
    return { success: true, profile, company };
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function nomaiLogout() {
    const sb = window.NomaiAuth.supabase;
    await sb.auth.signOut();
    clearAuthState();
    redirectToLogin();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearAuthState() {
    window.NomaiAuth.session = null;
    window.NomaiAuth.user = null;
    window.NomaiAuth.profile = null;
    window.NomaiAuth.company = null;
    window.NomaiAuth.permissions = {};
    window.NomaiAuth.initialized = false;
}

function redirectToLogin() {
    const currentPage = window.location.pathname;
    if (!currentPage.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

function redirectToDashboard() {
    window.location.href = 'index.html';
}

// ─── Verificar acceso a una página ───────────────────────────────────────────
// Llámalo al inicio de cada página protegida
async function requireAuth(allowedRoles = null) {
    // Inicializar cliente Supabase si no existe
    if (!window.NomaiAuth.supabase) {
        if (!window.supabase) {
            redirectToLogin();
            return null;
        }
        const { createClient } = window.supabase;
        window.NomaiAuth.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { autoRefreshToken: true, persistSession: true }
        });
    }

    const authenticated = await initNomaiAuth();

    if (!authenticated) {
        redirectToLogin();
        return null;
    }

    const profile = window.NomaiAuth.profile;

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
        // Redirigir al dashboard si no tiene permisos para esta página
        window.location.href = 'index.html';
        return null;
    }

    return profile;
}

// ─── Cargar datos de nómina desde Supabase ────────────────────────────────────
// Cargar todos los registros desde Supabase para el usuario actual
async function loadPayrollFromSupabase(onProgress) {
    const sb = window.NomaiAuth.supabase;

    // 1. Cargar lotes (batches)
    const { data: batchesData, error: batchesErr } = await sb
        .from('payroll_batches')
        .select('*')
        .order('uploaded_at', { ascending: true });

    if (batchesErr) {
        console.error('[NomaiAuth] Error cargando lotes:', batchesErr);
    }

    // 2. Cargar TODOS los registros via RPC function (server-side, una sola llamada sin RLS overhead por fila)
    let allRecords = [];
    const pageSize = 1000; // Límite de PostgREST por petición
    let page = 0;
    let hasMore = true;
    
    if (typeof onProgress === 'function') onProgress(5);
    
    while (hasMore) {
        try {
            const { data: chunk, error } = await sb
                .rpc('get_my_payroll_records')
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (error) throw error;
            
            if (chunk && chunk.length > 0) {
                allRecords = allRecords.concat(chunk);
                page++;
                if (chunk.length < pageSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
            
            // Progreso visual basado en registros cargados vs total conocido del batch
            if (typeof onProgress === 'function') {
                const estimatedTotal = batchesData && batchesData.length > 0 ? 150000 : 10000;
                const pct = Math.min(99, Math.round((allRecords.length / estimatedTotal) * 99));
                onProgress(pct);
            }
        } catch (e) {
            console.error('[NomaiAuth] Error en RPC get_my_payroll_records:', e);
            return [];
        }
    }
    
    if (typeof onProgress === 'function') onProgress(100);
    
    const data = allRecords;

    // Mapear formato SQL → formato abreviado JS (el que usa toda la app)
    const mapped = data.map(r => ({
        c:    r.identificacion,
        n:    r.nombre_completo,
        fa:   r.fecha_acumulado,
        a:    r.fecha_acumulado ? parseInt(r.fecha_acumulado.slice(-4)) : null,  // Extraer año de DD/MM/YYYY
        coc:  r.codigo_concepto,
        co:   r.nombre_concepto,
        cant: r.cantidad ? parseFloat(r.cantidad) : 0,
        v:    r.valor ? parseFloat(r.valor) : 0,
        cc:   r.codigo_ceco || '',
        dcc:  r.nombre_ceco || '',
        cgc:  r.codigo_cargo || '',
        cg:   r.nombre_cargo || '',
        tn:   r.tipo_nomina || 'Normal',
        m:    r.mes || '',
        pa:   r.quincena,
        na:   r.naturaleza,
        t:    r.tipo_concepto,
        _batch_id: r.batch_id,
        _company_id: r.company_id,
    }));

    // 3. Sincronizar window.state.batches agrupando registros
    if (window.state) {
        window.state.batches = (batchesData || []).map(b => ({
            id: b.id,
            name: b.name,
            date: new Date(b.uploaded_at).toLocaleString('es-CO'),
            data: mapped.filter(r => r._batch_id === b.id)
        }));
    }

    return mapped;
}

// ─── Guardar lote de nómina en Supabase ──────────────────────────────────────
async function savePayrollBatchToSupabase(batchName, records, onProgress) {
    const sb = window.NomaiAuth.supabase;
    const profile = window.NomaiAuth.profile;

    if (!profile || !profile.company_id) {
        return { success: false, error: 'Sin empresa asociada' };
    }

    try {
        // 1. Crear el lote
        const { data: batch, error: batchError } = await sb
            .from('payroll_batches')
            .insert({
                company_id: profile.company_id,
                name: batchName,
                record_count: records.length,
                uploaded_by: profile.id,
            })
            .select()
            .single();

        if (batchError) throw batchError;

        if (typeof onProgress === 'function') onProgress(5); // Progreso inicial después de crear el lote

        // 2. Mapear registros JS abreviados → formato SQL
        const sqlRecords = records.map(r => ({
            company_id:       profile.company_id,
            batch_id:         batch.id,
            identificacion:   r.c,
            nombre_completo:  r.n,
            fecha_acumulado:  r.fa,
            codigo_concepto:  r.coc,
            nombre_concepto:  r.co,
            cantidad:         r.cant,
            valor:            r.v,
            codigo_ceco:      r.cc,
            nombre_ceco:      r.dcc,
            codigo_cargo:     r.cgc,
            nombre_cargo:     r.cg,
            tipo_nomina:      r.tn,
            mes:              r.m,
            quincena:         r.pa,
            naturaleza:       r.na,
            tipo_concepto:    r.t,
        }));

        // 3. Insertar en chunks de 1000 para evitar timeouts
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < sqlRecords.length; i += CHUNK_SIZE) {
            const chunk = sqlRecords.slice(i, i + CHUNK_SIZE);
            const { error: insertError } = await sb
                .from('payroll_records')
                .insert(chunk);

            if (insertError) throw insertError;
            
            if (typeof onProgress === 'function') {
                const percent = 5 + Math.round(((i + chunk.length) / sqlRecords.length) * 95);
                onProgress(Math.min(100, percent));
            }
        }

        return { success: true, batchId: batch.id, count: records.length };
    } catch (e) {
        console.error('[NomaiAuth] Error guardando lote:', e);
        return { success: false, error: e.message };
    }
}


// ─── Modal de Confirmación Estilo Nomai ──────────────────────────────────────
function showNomaiConfirm(message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('nomai-confirm-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nomai-confirm-modal';
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(26, 5, 51, 0.45);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            `;
            modal.innerHTML = `
                <div class="modal-content" style="background: #FFFFFF; border-radius: 12px; width: 90%; max-width: 450px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(108, 0, 211, 0.15); border: 1px solid rgba(108, 0, 211, 0.2); font-family: 'Outfit', sans-serif;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 700; color: #1e293b;"><strong>Confirmación</strong></h3>
                    <p id="nomai-confirm-message" style="color: #475569; font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5; text-align: left;"></p>
                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                        <button id="nomai-confirm-cancel" class="btn" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit;">Cancelar</button>
                        <button id="nomai-confirm-accept" class="btn btn-primary" style="background: linear-gradient(135deg, #6C00D3 0%, #3B008A 100%); border: none; color: white; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 4px rgba(108,0,211,0.3);">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const msgEl = modal.querySelector('#nomai-confirm-message') || document.getElementById('nomai-confirm-message');
        const btnCancel = modal.querySelector('#nomai-confirm-cancel') || document.getElementById('nomai-confirm-cancel');
        const btnConfirm = modal.querySelector('#nomai-confirm-accept') || document.getElementById('nomai-confirm-accept');

        if (msgEl) msgEl.textContent = message;

        // Mostrar
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
        }, 10);

        const closeAndResolve = (val) => {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            
            if (btnCancel) btnCancel.removeEventListener('click', onCancel);
            if (btnConfirm) btnConfirm.removeEventListener('click', onConfirm);
            document.removeEventListener('keydown', onKeyDown);
            
            resolve(val);
        };

        const onCancel = () => closeAndResolve(false);
        const onConfirm = () => closeAndResolve(true);
        const onKeyDown = (e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        };

        if (btnCancel) btnCancel.addEventListener('click', onCancel);
        if (btnConfirm) btnConfirm.addEventListener('click', onConfirm);
        document.addEventListener('keydown', onKeyDown);
    });
}

// ─── Modal Prompt Estilo Nomai ──────────────────────────────────────
window.showNomaiPrompt = function(message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('nomai-prompt-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nomai-prompt-modal';
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(26, 5, 51, 0.45);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            `;
            modal.innerHTML = `
                <div class="modal-content" style="background: #FFFFFF; border-radius: 12px; width: 90%; max-width: 450px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(108, 0, 211, 0.15); border: 1px solid rgba(108, 0, 211, 0.2); font-family: 'Outfit', sans-serif;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 700; color: #1e293b;"><strong>Confirmación de Seguridad</strong></h3>
                    <p id="nomai-prompt-message" style="color: #475569; font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.5; text-align: left;"></p>
                    <input type="text" id="nomai-prompt-input" autocomplete="off" style="width: 100%; padding: 0.75rem; margin-bottom: 1.5rem; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; font-size: 1rem; color: #1e293b; box-sizing: border-box;" />
                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                        <button id="nomai-prompt-cancel" class="btn" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit;">Cancelar</button>
                        <button id="nomai-prompt-accept" class="btn btn-primary" style="background: linear-gradient(135deg, #6C00D3 0%, #3B008A 100%); border: none; color: white; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 4px rgba(108,0,211,0.3);">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const msgEl = modal.querySelector('#nomai-prompt-message');
        const inputEl = modal.querySelector('#nomai-prompt-input');
        const btnCancel = modal.querySelector('#nomai-prompt-cancel');
        const btnConfirm = modal.querySelector('#nomai-prompt-accept');

        if (msgEl) msgEl.textContent = message;
        if (inputEl) inputEl.value = '';

        // Mostrar
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
            if (inputEl) inputEl.focus();
        }, 10);

        const closeAndResolve = (val) => {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            
            if (btnCancel) btnCancel.removeEventListener('click', onCancel);
            if (btnConfirm) btnConfirm.removeEventListener('click', onConfirm);
            document.removeEventListener('keydown', onKeyDown);
            
            resolve(val);
        };

        const onCancel = () => closeAndResolve(null);
        const onConfirm = () => closeAndResolve(inputEl ? inputEl.value.trim() : null);
        const onKeyDown = (e) => {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        };

        if (btnCancel) btnCancel.addEventListener('click', onCancel);
        if (btnConfirm) btnConfirm.addEventListener('click', onConfirm);
        document.addEventListener('keydown', onKeyDown);
    });
};

// ─── Modal de Alerta Estilo Nomai ───────────────────────────────────────────
function showNomaiAlert(message) {
    return new Promise((resolve) => {
        let modal = document.getElementById('nomai-alert-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nomai-alert-modal';
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(26, 5, 51, 0.45);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            `;
            modal.innerHTML = `
                <div class="modal-content" style="background: #FFFFFF; border-radius: 12px; width: 90%; max-width: 450px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(108, 0, 211, 0.15); border: 1px solid rgba(108, 0, 211, 0.2); font-family: 'Outfit', sans-serif;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 700; color: #1e293b;"><strong>Notificación</strong></h3>
                    <p id="nomai-alert-message" style="color: #475569; font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5; text-align: left; white-space: pre-wrap;"></p>
                    <div style="display: flex; justify-content: flex-end;">
                        <button id="nomai-alert-accept" class="btn btn-primary" style="background: linear-gradient(135deg, #6C00D3 0%, #3B008A 100%); border: none; color: white; padding: 0.5rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 4px rgba(108,0,211,0.3);">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const msgEl = modal.querySelector('#nomai-alert-message') || document.getElementById('nomai-alert-message');
        const btnAccept = modal.querySelector('#nomai-alert-accept') || document.getElementById('nomai-alert-accept');

        if (msgEl) msgEl.textContent = message;

        // Mostrar
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
            if (btnAccept) btnAccept.focus();
        }, 10);

        const closeAndResolve = () => {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            if (btnAccept) btnAccept.removeEventListener('click', onClose);
            document.removeEventListener('keydown', onKeyDown);
            resolve();
        };

        const onClose = () => closeAndResolve();
        const onKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        if (btnAccept) btnAccept.addEventListener('click', onClose);
        document.addEventListener('keydown', onKeyDown);
    });
}

// ─── Modal de Entrada (Prompt) Estilo Nomai ──────────────────────────────────
function showNomaiPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        let modal = document.getElementById('nomai-prompt-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nomai-prompt-modal';
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(26, 5, 51, 0.45);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            `;
            modal.innerHTML = `
                <div class="modal-content" style="background: #FFFFFF; border-radius: 12px; width: 90%; max-width: 450px; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(108, 0, 211, 0.15); border: 1px solid rgba(108, 0, 211, 0.2); font-family: 'Outfit', sans-serif;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 700; color: #1e293b;"><strong>Entrada de datos</strong></h3>
                    <p id="nomai-prompt-message" style="color: #475569; font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.5; text-align: left;"></p>
                    <input type="text" id="nomai-prompt-input" style="width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; margin-bottom: 1.5rem; outline: none; box-sizing: border-box; font-family: inherit; transition: all 0.2s;" autocomplete="off">
                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                        <button id="nomai-prompt-cancel" class="btn" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit;">Cancelar</button>
                        <button id="nomai-prompt-confirm" class="btn btn-primary" style="background: linear-gradient(135deg, #6C00D3 0%, #3B008A 100%); border: none; color: white; padding: 0.5rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 4px rgba(108,0,211,0.3);">Aceptar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Estilos dinámicos de focus
            const inputEl = modal.querySelector('#nomai-prompt-input');
            inputEl.addEventListener('focus', () => {
                inputEl.style.borderColor = '#6C00D3';
                inputEl.style.boxShadow = '0 0 0 3px rgba(108, 0, 211, 0.15)';
            });
            inputEl.addEventListener('blur', () => {
                inputEl.style.borderColor = '#cbd5e1';
                inputEl.style.boxShadow = 'none';
            });
        }

        const msgEl = modal.querySelector('#nomai-prompt-message') || document.getElementById('nomai-prompt-message');
        const inputEl = modal.querySelector('#nomai-prompt-input') || document.getElementById('nomai-prompt-input');
        const btnCancel = modal.querySelector('#nomai-prompt-cancel') || document.getElementById('nomai-prompt-cancel');
        const btnConfirm = modal.querySelector('#nomai-prompt-confirm') || document.getElementById('nomai-prompt-confirm');

        if (msgEl) msgEl.textContent = message;
        if (inputEl) {
            inputEl.value = defaultValue;
        }

        // Mostrar
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
            if (inputEl) {
                inputEl.focus();
                inputEl.select();
            }
        }, 10);

        const closeAndResolve = (val) => {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            
            if (btnCancel) btnCancel.removeEventListener('click', onCancel);
            if (btnConfirm) btnConfirm.removeEventListener('click', onConfirm);
            if (inputEl) inputEl.removeEventListener('keydown', onInputKeyDown);
            document.removeEventListener('keydown', onKeyDown);
            
            resolve(val);
        };

        const onCancel = () => closeAndResolve(null);
        const onConfirm = () => {
            const val = inputEl ? inputEl.value : '';
            closeAndResolve(val);
        };
        const onInputKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };

        if (btnCancel) btnCancel.addEventListener('click', onCancel);
        if (btnConfirm) btnConfirm.addEventListener('click', onConfirm);
        if (inputEl) inputEl.addEventListener('keydown', onInputKeyDown);
        document.addEventListener('keydown', onKeyDown);
    });
}

// ─── Exponer globalmente ──────────────────────────────────────────────────────
window.nomaiLogin = nomaiLogin;
window.nomaiLogout = nomaiLogout;
window.requireAuth = requireAuth;
window.loadPayrollFromSupabase = loadPayrollFromSupabase;
window.savePayrollBatchToSupabase = savePayrollBatchToSupabase;
window.initNomaiAuth = initNomaiAuth;
window.showNomaiConfirm = showNomaiConfirm;
window.showNomaiAlert = showNomaiAlert;
window.showNomaiPrompt = showNomaiPrompt;

// ─── Auto-Logout por Inactividad ─────────────────────────────────────────────
let inactivityTimer = null;
let inactivityWarningTimer = null;
let inactivityCountdownInterval = null;
let isWarningModalOpen = false;
const INACTIVITY_LIMIT = 2 * 60 * 1000; // 2 minutos

function resetInactivityTimer() {
    if (isWarningModalOpen) return; // No resetear si ya está la advertencia en pantalla
    
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    // Solo activar el temporizador si el usuario está autenticado y no está en la página de login
    if (window.NomaiAuth && window.NomaiAuth.user && !window.location.pathname.includes('login.html')) {
        inactivityTimer = setTimeout(() => {
            console.log('Inactividad de 2 minutos detectada. Mostrando advertencia...');
            showInactivityWarningModal();
        }, INACTIVITY_LIMIT);
    }
}

function showInactivityWarningModal() {
    isWarningModalOpen = true;
    
    // Crear el modal de advertencia si no existe
    let modal = document.getElementById('nomai-inactivity-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'nomai-inactivity-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(26, 5, 51, 0.6);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="background: #FFFFFF; border-radius: 16px; width: 90%; max-width: 440px; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(108, 0, 211, 0.25); border: 1px solid rgba(108, 0, 211, 0.15); font-family: 'Outfit', sans-serif; text-align: center;">
                <div style="width: 56px; height: 56px; background: rgba(108, 0, 211, 0.08); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
                    <i data-lucide="clock" style="width: 28px; height: 28px; color: #6C00D3;"></i>
                </div>
                <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; font-weight: 700; color: #1e293b;">¿Sigues ahí?</h3>
                <p style="color: #475569; font-size: 0.95rem; margin-bottom: 1.25rem; line-height: 1.5;">
                    Tu sesión está a punto de cerrarse por inactividad por motivos de seguridad.
                </p>
                <div id="nomai-inactivity-countdown" style="font-size: 1.75rem; font-weight: 800; color: #D946EF; margin-bottom: 1.5rem; letter-spacing: -0.5px;">
                    03:00
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <button id="nomai-inactivity-keep" class="btn btn-primary" style="width: 100%; background: linear-gradient(135deg, #6C00D3 0%, #3B008A 100%); border: none; color: white; padding: 0.75rem; border-radius: 10px; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(108,0,211,0.2);">
                        Mantener sesión abierta
                    </button>
                    <button id="nomai-inactivity-logout" style="width: 100%; background: transparent; border: 1px solid #e2e8f0; color: #64748b; padding: 0.65rem; border-radius: 10px; font-weight: 500; cursor: pointer; font-family: inherit; font-size: 0.9rem; transition: background 0.2s;">
                        Cerrar sesión ahora
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) window.lucide.createIcons();
        
        // Agregar eventos de hover para el botón de logout
        const btnLogout = document.getElementById('nomai-inactivity-logout');
        btnLogout.addEventListener('mouseenter', () => btnLogout.style.background = '#f8fafc');
        btnLogout.addEventListener('mouseleave', () => btnLogout.style.background = 'transparent');
    }
    
    const countdownEl = document.getElementById('nomai-inactivity-countdown');
    const btnKeep = document.getElementById('nomai-inactivity-keep');
    const btnLogout = document.getElementById('nomai-inactivity-logout');
    
    // Mostrar modal
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    
    let secondsLeft = 180; // 3 minutos = 180 segundos (para llegar a 5 minutos en total)
    
    const updateCountdownText = () => {
        const mins = Math.floor(secondsLeft / 60);
        const secs = secondsLeft % 60;
        countdownEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    updateCountdownText();
    
    const cleanup = () => {
        isWarningModalOpen = false;
        if (inactivityCountdownInterval) clearInterval(inactivityCountdownInterval);
        if (inactivityWarningTimer) clearTimeout(inactivityWarningTimer);
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    };
    
    // Timer definitivo de logout (3 minutos / 180 segundos)
    inactivityWarningTimer = setTimeout(() => {
        cleanup();
        console.log('Sesión cerrada definitivamente por inactividad tras 5 minutos.');
        nomaiLogout();
    }, 180 * 1000);
    
    // Intervalo de countdown para actualizar el texto
    inactivityCountdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(inactivityCountdownInterval);
        } else {
            updateCountdownText();
        }
    }, 1000);
    
    // Eventos de botones
    btnKeep.onclick = () => {
        cleanup();
        resetInactivityTimer(); // Reiniciar el temporizador principal
    };
    
    btnLogout.onclick = () => {
        cleanup();
        nomaiLogout();
    };
}

function setupInactivityTracking() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
        // Usar passive: true para mejor rendimiento en scroll/touch
        document.addEventListener(event, resetInactivityTimer, { capture: true, passive: true });
    });
    // Iniciar el temporizador
    resetInactivityTimer();
}

// Sobrescribir initNomaiAuth para inicializar el tracking después de cargar el usuario
const originalInitNomaiAuth = window.initNomaiAuth;
window.initNomaiAuth = async function() {
    const result = await originalInitNomaiAuth();
    setupInactivityTracking();
    return result;
};
