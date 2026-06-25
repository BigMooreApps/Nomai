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

    // Verificar sesión actual
    const { data: { session } } = await sb.auth.getSession();

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
// Convierte registros SQL al formato abreviado JS que usa app_v14.js
async function loadPayrollFromSupabase() {
    const sb = window.NomaiAuth.supabase;

    // 1. Cargar lotes (batches)
    const { data: batchesData, error: batchesErr } = await sb
        .from('payroll_batches')
        .select('*')
        .order('uploaded_at', { ascending: true });

    if (batchesErr) {
        console.error('[NomaiAuth] Error cargando lotes:', batchesErr);
    }

    // 2. Cargar registros
    const { data, error } = await sb
        .from('payroll_records')
        .select('*');

    if (error) {
        console.error('[NomaiAuth] Error cargando nómina:', error);
        return [];
    }

    // Mapear formato SQL → formato abreviado JS (el que usa toda la app)
    const mapped = data.map(r => ({
        c:    r.identificacion,
        n:    r.nombre_completo,
        fa:   r.fecha_acumulado,
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
async function savePayrollBatchToSupabase(batchName, records) {
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
