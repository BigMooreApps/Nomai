/**
 * NOMAI SUPER ADMIN LOGIC
 */

let activeTab = 'companies';
let companiesList = [];
let usersList = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Proteger la página. Solo super_admin permitido.
    const profile = await requireAuth(['super_admin']);
    if (!profile) return;

    // Configurar UI de usuario en el header
    const nameEl = document.querySelector('.profile-name');
    const roleEl = document.querySelector('.profile-role');
    const avatarEl = document.querySelector('.avatar-letter');
    if (nameEl) nameEl.textContent = profile.full_name || 'Super Admin';
    if (roleEl) roleEl.textContent = profile.role.toUpperCase();
    if (avatarEl && profile.full_name) {
        avatarEl.textContent = profile.full_name.substring(0, 2).toUpperCase();
    }

    // Inicializar Lucide Icons
    lucide.createIcons();

    // Cargar datos iniciales
    await refreshData();

    // Toggle del Sidebar colapsable y Móvil
    const sidebar = document.getElementById('sidebar');
    const toggleBtnBottom = document.getElementById('sidebar-toggle-bottom');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.add('mobile-open');
            sidebarOverlay.classList.add('active');
        });
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
        });
    }

    if (sidebar && toggleBtnBottom) {
        toggleBtnBottom.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            
            // Actualizar icono del botón de toggle
            const icon = toggleBtnBottom.querySelector('i');
            if (icon) {
                if (sidebar.classList.contains('collapsed')) {
                    icon.setAttribute('data-lucide', 'chevron-right');
                } else {
                    icon.setAttribute('data-lucide', 'chevron-left');
                }
            }
            
            // Re-inicializar iconos de Lucide
            if (window.lucide) {
                window.lucide.createIcons();
            }
        });
    }

    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('profile-dropdown');
        const profileMenu = document.getElementById('user-profile-menu');
        if (dropdown && profileMenu && !profileMenu.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
});

// Funciones del Dropdown del Perfil (Header)
function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
}

async function triggerLogoutWithConfirm() {
    const confirmMessage = '¿Estás seguro de que deseas cerrar sesión?';
    let proceed = false;
    if (typeof window.showNomaiConfirm === 'function') {
        proceed = await window.showNomaiConfirm(confirmMessage);
    } else {
        proceed = confirm(confirmMessage);
    }
    if (proceed) {
        nomaiLogout();
    }
}

function switchTab(tab) {
    activeTab = tab;
    
    // UI Classes (Sidebar)
    document.getElementById('tab-btn-companies').classList.toggle('active', tab === 'companies');
    document.getElementById('tab-btn-users').classList.toggle('active', tab === 'users');
    document.getElementById('tab-btn-permissions').classList.toggle('active', tab === 'permissions');
    
    // Hide/Show Sections
    document.getElementById('section-companies').style.display = tab === 'companies' ? 'block' : 'none';
    document.getElementById('section-users').style.display = tab === 'users' ? 'block' : 'none';
    document.getElementById('section-permissions').style.display = tab === 'permissions' ? 'block' : 'none';

    // Page titles & button setup
    const btn = document.getElementById('btn-create-item');
    if (tab === 'companies') {
        btn.style.display = 'flex';
        document.getElementById('page-title').textContent = 'Administración de Empresas';
        document.getElementById('page-subtitle').textContent = 'Crea, edita y suspende el acceso a empresas clientes.';
        btn.innerHTML = '<i data-lucide="plus" style="width: 16px; height: 16px;"></i><span>Crear Empresa</span>';
        btn.setAttribute('onclick', 'openCreateCompanyModal()');
    } else if (tab === 'users') {
        btn.style.display = 'flex';
        document.getElementById('page-title').textContent = 'Administración de Usuarios';
        document.getElementById('page-subtitle').textContent = 'Gestiona los administradores principales de cada empresa.';
        btn.innerHTML = '<i data-lucide="plus" style="width: 16px; height: 16px;"></i><span>Crear Administrador</span>';
        btn.setAttribute('onclick', 'openCreateUserModal()');
    } else if (tab === 'permissions') {
        btn.style.display = 'none';
        document.getElementById('page-title').textContent = 'Permisos de Roles';
        document.getElementById('page-subtitle').textContent = 'Configura el acceso a funcionalidades SaaS para los roles de la plataforma.';
        loadPermissionsMatrix();
    }
    lucide.createIcons();
}

// ─── Fetching Data ───────────────────────────────────────────────────────────
async function refreshData() {
    const sb = window.NomaiAuth.supabase;
    
    // Cargar empresas
    const { data: companies, error: compErr } = await sb
        .from('companies')
        .select('*')
        .order('name');
        
    if (compErr) {
        showAlert('Error cargando empresas: ' + compErr.message, 'danger');
        return;
    }
    
    companiesList = companies || [];
    renderCompanies();

    // Cargar usuarios administradores
    const { data: users, error: userErr } = await sb
        .from('profiles')
        .select(`
            id,
            full_name,
            email,
            role,
            is_active,
            company_id,
            companies (
                name
            )
        `)
        .in('role', ['admin', 'analyst'])
        .order('full_name');
        
    if (userErr) {
        showAlert('Error cargando usuarios: ' + userErr.message, 'danger');
        return;
    }

    usersList = users || [];
    renderUsers();
    
    // Rellenar select de empresas en el modal de usuario
    const select = document.getElementById('user-company');
    if (select) {
        select.innerHTML = '<option value="">Selecciona una empresa...</option>' + 
            companiesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
}

// ─── Renders ─────────────────────────────────────────────────────────────────
function renderCompanies() {
    const tbody = document.getElementById('companies-table-body');
    if (!tbody) return;

    if (companiesList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay empresas registradas.</td></tr>';
        return;
    }

    tbody.innerHTML = companiesList.map(c => {
        let statusBadge = '';
        if (c.status === 'active') statusBadge = '<span class="status-pill active">Activa</span>';
        else if (c.status === 'inactive') statusBadge = '<span class="status-pill inactive">Inactiva</span>';
        else if (c.status === 'suspended') statusBadge = '<span class="status-pill suspended">Suspendida</span>';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${c.name}</td>
                <td style="font-family: monospace; color: var(--text-secondary); font-size: 0.85rem;">${c.slug}</td>
                <td>${statusBadge}</td>
                <td style="color: var(--text-secondary); font-size: 0.9rem;">${new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: nowrap; align-items: center;">
                        <button class="admin-action-btn" onclick="openEditCompanyModal('${c.id}')" title="Editar">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        ${c.status !== 'suspended' 
                            ? `<button class="admin-action-btn admin-action-btn-danger" onclick="toggleCompanySuspension('${c.id}', true)" title="Suspender">
                                <i data-lucide="slash" style="width: 16px; height: 16px;"></i>
                               </button>`
                            : `<button class="admin-action-btn" onclick="toggleCompanySuspension('${c.id}', false)" title="Reactivar">
                                <i data-lucide="check" style="width: 16px; height: 16px;"></i>
                               </button>`
                        }
                        <button class="admin-action-btn admin-action-btn-danger" onclick="deleteCompany('${c.id}')" title="Eliminar">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

function renderUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (usersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay administradores registrados.</td></tr>';
        return;
    }

    tbody.innerHTML = usersList.map(u => {
        const companyName = u.companies ? u.companies.name : 'Ninguna';
        const statusBadge = u.is_active 
            ? '<span class="status-pill active">Activo</span>'
            : '<span class="status-pill inactive">Inactivo</span>';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${u.full_name || 'Sin Nombre'}</td>
                <td style="color: var(--text-secondary); font-size: 0.9rem;">${u.email || 'N/A'}</td>
                <td style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${companyName}</td>
                <td style="text-transform: capitalize; color: var(--text-secondary); font-size: 0.85rem;">${u.role === 'analyst' ? 'Analista' : (u.role === 'admin' ? 'Administrador' : u.role)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: nowrap; align-items: center;">
                        <button class="admin-action-btn" onclick="openEditUserModal('${u.id}')" title="Editar">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="admin-action-btn" onclick="openResetPasswordModal('${u.id}')" title="Cambiar Clave">
                            <i data-lucide="key" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="admin-action-btn ${u.is_active ? 'admin-action-btn-danger' : ''}" onclick="toggleUserStatus('${u.id}', ${!u.is_active})" title="${u.is_active ? 'Desactivar' : 'Activar'}">
                            ${u.is_active 
                                ? '<i data-lucide="user-x" style="width: 16px; height: 16px;"></i>' 
                                : '<i data-lucide="user-check" style="width: 16px; height: 16px;"></i>'
                            }
                        </button>
                        <button class="admin-action-btn admin-action-btn-danger" onclick="deleteUser('${u.id}')" title="Eliminar">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// ─── Company Operations ──────────────────────────────────────────────────────
function openCreateCompanyModal() {
    document.getElementById('company-modal-title').textContent = 'Crear Nueva Empresa';
    document.getElementById('company-id').value = '';
    document.getElementById('company-name').value = '';
    document.getElementById('company-slug').value = '';
    document.getElementById('company-status').value = 'active';
    openModal('company-modal');
}

function openEditCompanyModal(id) {
    const company = companiesList.find(c => c.id === id);
    if (!company) return;

    document.getElementById('company-modal-title').textContent = 'Editar Empresa';
    document.getElementById('company-id').value = company.id;
    document.getElementById('company-name').value = company.name;
    document.getElementById('company-slug').value = company.slug;
    document.getElementById('company-status').value = company.status;
    openModal('company-modal');
}

async function saveCompany(e) {
    e.preventDefault();
    const sb = window.NomaiAuth.supabase;
    const id = document.getElementById('company-id').value;
    const name = document.getElementById('company-name').value.trim();
    const slug = document.getElementById('company-slug').value.trim();
    const status = document.getElementById('company-status').value;

    let res;
    if (id) {
        // Update
        res = await sb.from('companies')
            .update({ name, slug, status, suspended_at: status === 'suspended' ? new Date().toISOString() : null })
            .eq('id', id);
    } else {
        // Insert
        res = await sb.from('companies')
            .insert({ name, slug, status });
    }

    if (res.error) {
        showAlert('Error al guardar empresa: ' + res.error.message, 'danger');
    } else {
        showAlert('Empresa guardada correctamente', 'success');
        closeModal('company-modal');
        await refreshData();
    }
}

async function toggleCompanySuspension(id, suspend) {
    const sb = window.NomaiAuth.supabase;
    const status = suspend ? 'suspended' : 'active';
    const suspended_at = suspend ? new Date().toISOString() : null;

    const { error } = await sb.from('companies')
        .update({ status, suspended_at })
        .eq('id', id);

    if (error) {
        showAlert('Error al modificar suspensión: ' + error.message, 'danger');
    } else {
        showAlert(suspend ? 'Empresa suspendida temporalmente' : 'Empresa reactivada correctamente', 'success');
        await refreshData();
    }
}

async function deleteCompany(id) {
    const company = companiesList.find(c => c.id === id);
    if (!company) return;

    const confirm1 = await window.showNomaiConfirm(`¿Estás seguro de eliminar permanentemente la empresa "${company.name}"?`);
    if (!confirm1) return;

    // Pedir confirmación escrita con estilo Nomai
    const text = await window.showNomaiPrompt(`Para confirmar la eliminación, escribe la palabra exacta: BORRAR`);
    if (text !== 'BORRAR') {
        window.showNomaiAlert('Operación cancelada. La palabra de seguridad no coincide o fue cancelada.');
        return;
    }

    const sb = window.NomaiAuth.supabase;
    const { error } = await sb.from('companies').delete().eq('id', id);

    if (error) {
        if (error.message.includes('foreign key constraint') || error.message.includes('violates foreign key')) {
            window.showNomaiAlert('No se puede eliminar la empresa porque tiene usuarios o datos asociados.');
        } else {
            window.showNomaiAlert('Error al eliminar empresa: ' + error.message);
        }
    } else {
        window.showNomaiAlert('Empresa eliminada exitosamente.');
        await refreshData();
    }
}

// ─── User Operations ─────────────────────────────────────────────────────────
function openCreateUserModal() {
    document.getElementById('user-modal-title').textContent = 'Crear Administrador de Empresa';
    
    const submitBtn = document.querySelector('#user-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Guardar Administrador';
    }

    document.getElementById('user-id').value = '';
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-company').value = '';
    document.getElementById('user-status').value = 'true';
    
    document.getElementById('user-email-group').style.display = 'flex';
    document.getElementById('user-pass-group').style.display = 'flex';
    document.getElementById('user-password').required = true;
    openModal('user-modal');
}

function openEditUserModal(id) {
    const user = usersList.find(u => u.id === id);
    if (!user) return;

    const isAnalyst = user.role === 'analyst';
    document.getElementById('user-modal-title').textContent = isAnalyst ? 'Editar Usuario Analista' : 'Editar Administrador de Empresa';
    
    const submitBtn = document.querySelector('#user-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = isAnalyst ? 'Guardar Analista' : 'Guardar Administrador';
    }

    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.full_name || '';
    document.getElementById('user-email').value = user.email || '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-company').value = user.company_id || '';
    document.getElementById('user-status').value = user.is_active ? 'true' : 'false';

    document.getElementById('user-email-group').style.display = 'flex';
    document.getElementById('user-pass-group').style.display = 'none';
    document.getElementById('user-password').required = false;
    openModal('user-modal');
}

async function deleteUser(id) {
    // Evitar auto-eliminación
    if (window.NomaiAuth.user && window.NomaiAuth.user.id === id) {
        await window.showNomaiAlert('No puedes eliminarte a ti mismo.');
        return;
    }

    const user = usersList.find(u => u.id === id);
    if (!user) return;

    const confirmMessage = `¿Estás seguro de que deseas eliminar permanentemente al usuario "${user.full_name || user.email}"? Esta acción no se puede deshacer.`;
    const proceed = await window.showNomaiConfirm(confirmMessage);
    if (!proceed) return;

    const sb = window.NomaiAuth.supabase;
    const { error } = await sb.rpc('admin_delete_user', {
        target_user_id: id
    });

    if (error) {
        showAlert('Error al eliminar usuario: ' + error.message, 'danger');
    } else {
        showAlert('Usuario eliminado correctamente', 'success');
        await refreshData();
    }
}

async function saveUser(e) {
    e.preventDefault();
    const sb = window.NomaiAuth.supabase;
    const id = document.getElementById('user-id').value;
    
    if (id) {
        // Edit flow
        const name = document.getElementById('user-name').value.trim();
        const email = document.getElementById('user-email').value.trim();
        const companyId = document.getElementById('user-company').value || null;
        const is_active = document.getElementById('user-status').value === 'true';

        // 1. Actualizar datos de usuario y empresa via RPC
        const { error: updateError } = await sb.rpc('admin_update_user', {
            target_user_id: id,
            new_email: email,
            new_full_name: name,
            new_company_id: companyId
        });

        if (updateError) {
            showAlert('Error al actualizar usuario: ' + updateError.message, 'danger');
            return;
        }

        // 2. Actualizar estado
        const { error: statusError } = await sb.from('profiles')
            .update({ is_active })
            .eq('id', id);

        if (statusError) {
            showAlert('Error al actualizar estado: ' + statusError.message, 'danger');
        } else {
            showAlert('Usuario actualizado correctamente', 'success');
            closeModal('user-modal');
            await refreshData();
        }
    } else {
        // Create user via secure Postgres function (RPC)
        const email = document.getElementById('user-email').value.trim();
        const password = document.getElementById('user-password').value;
        const fullName = document.getElementById('user-name').value.trim();
        const companyId = document.getElementById('user-company').value;

        if (!companyId) {
            showAlert('Debes seleccionar una empresa', 'danger');
            return;
        }

        const { data, error } = await sb.rpc('create_company_admin', {
            admin_email: email,
            admin_password: password,
            admin_full_name: fullName,
            admin_company_id: companyId
        });

        if (error) {
            showAlert('Error al crear administrador: ' + error.message, 'danger');
        } else {
            showAlert('Administrador de empresa creado correctamente', 'success');
            closeModal('user-modal');
            await refreshData();
        }
    }
}

async function toggleUserStatus(id, active) {
    const sb = window.NomaiAuth.supabase;
    const { error } = await sb.from('profiles')
        .update({ is_active: active })
        .eq('id', id);

    if (error) {
        showAlert('Error al cambiar estado de usuario: ' + error.message, 'danger');
    } else {
        showAlert('Estado de usuario modificado correctamente', 'success');
        await refreshData();
    }
}

async function openResetPasswordModal(userId) {
    const password = await window.showNomaiPrompt('Ingresa la nueva contraseña para este usuario:');
    if (password === null || password === '') return;
    if (password.length < 6) {
        await window.showNomaiAlert('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    const sb = window.NomaiAuth.supabase;
    const { data, error } = await sb.rpc('admin_update_user_password', {
        target_user_id: userId,
        new_password: password
    });

    if (error) {
        await window.showNomaiAlert('Error restableciendo contraseña: ' + error.message);
    } else {
        await window.showNomaiAlert('Contraseña restablecida correctamente.');
    }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showAlert(msg, type) {
    const box = document.getElementById('alert-box');
    box.textContent = msg;
    box.style.display = 'block';
    
    if (type === 'success') {
        box.style.background = '#dcfce7';
        box.style.color = '#15803d';
        box.style.border = '1px solid #bbf7d0';
    } else {
        box.style.background = '#fee2e2';
        box.style.color = '#b91c1c';
        box.style.border = '1px solid #fecaca';
    }

    setTimeout(() => {
        box.style.display = 'none';
    }, 5000);
}

async function loadPermissionsMatrix() {
    const container = document.getElementById('permissions-matrix-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">Cargando matriz de permisos...</div>';
    
    const sb = window.NomaiAuth.supabase;
    const { data, error } = await sb.from('role_permissions')
        .select('*')
        .order('role', { ascending: true });
        
    if (error) {
        showAlert('Error al cargar permisos: ' + error.message, 'danger');
        container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 24px;">No se pudo cargar la configuración de permisos.</div>';
        return;
    }
    
    // Agrupar permisos por rol
    const permissionsByRole = {};
    data.forEach(item => {
        if (!permissionsByRole[item.role]) {
            permissionsByRole[item.role] = [];
        }
        permissionsByRole[item.role].push(item);
    });
    
    // Nombres amigables para permisos y roles
    const permNames = {
        'import_data': { title: 'Carga de Datos', desc: 'Permite importar archivos Excel de nómina a la base de datos.' },
        'delete_data': { title: 'Eliminación de Datos', desc: 'Permite eliminar lotes de nómina cargados.' },
        'use_ai_assistant': { title: 'Asistente IA (Gemini)', desc: 'Permite chatear con el asistente inteligente para análisis de nómina.' },
        'manage_analysts': { title: 'Gestión de Analistas', desc: 'Permite acceder al panel de la empresa y gestionar usuarios analistas.' },
        'view_reports': { title: 'Descarga de Reportes', desc: 'Permite visualizar y exportar reportes en PDF y Excel.' },
        'view_database': { title: 'Consultar Base de Datos', desc: 'Permite visualizar y consultar la base de datos de nómina cargada.' }
    };
    
    const roleNames = {
        'admin': 'Administrador de Empresa',
        'analyst': 'Analista de Nómina'
    };
    
    // Crear el HTML para la matriz
    let html = `
        <table class="custom-table" style="font-size: 0.85rem;">
            <thead>
                <tr>
                    <th style="width: 50%; text-align: left; position: sticky; top: 0; background: #f8fafc; z-index: 10; font-size: 0.8rem; padding-top: 12px; padding-bottom: 12px;">Funcionalidad / Permiso</th>
                    <th style="width: 25%; text-align: center; position: sticky; top: 0; background: #f8fafc; z-index: 10; font-size: 0.8rem; padding-top: 12px; padding-bottom: 12px;">${roleNames['admin']}</th>
                    <th style="width: 25%; text-align: center; position: sticky; top: 0; background: #f8fafc; z-index: 10; font-size: 0.8rem; padding-top: 12px; padding-bottom: 12px;">${roleNames['analyst']}</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Lista ordenada de claves de permisos
    const permKeys = ['import_data', 'delete_data', 'use_ai_assistant', 'manage_analysts', 'view_reports', 'view_database'];
    
    permKeys.forEach(key => {
        const permInfo = permNames[key] || { title: key, desc: '' };
        
        // Encontrar is_enabled para cada rol
        const adminPerm = data.find(p => p.role === 'admin' && p.permission === key);
        const analystPerm = data.find(p => p.role === 'analyst' && p.permission === key);
        
        const adminEnabled = adminPerm ? adminPerm.is_enabled : false;
        const analystEnabled = analystPerm ? analystPerm.is_enabled : false;
        
        html += `
            <tr>
                <td>
                    <span class="permission-title">${permInfo.title}</span>
                    <span class="permission-desc">${permInfo.desc}</span>
                </td>
                <td style="text-align: center;">
                    <label class="nomai-switch">
                        <input type="checkbox" ${adminEnabled ? 'checked' : ''} onchange="handlePermissionChange('admin', '${key}', this.checked)">
                        <span class="nomai-slider"></span>
                    </label>
                </td>
                <td style="text-align: center;">
                    <label class="nomai-switch">
                        <input type="checkbox" ${analystEnabled ? 'checked' : ''} onchange="handlePermissionChange('analyst', '${key}', this.checked)">
                        <span class="nomai-slider"></span>
                    </label>
                </td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function handlePermissionChange(role, permission, isChecked) {
    const sb = window.NomaiAuth.supabase;
    
    try {
        const { data, error } = await sb.rpc('update_role_permission', {
            target_role: role,
            target_permission: permission,
            enabled: isChecked
        });
        
        if (error) {
            showAlert('Error al actualizar permiso: ' + error.message, 'danger');
            // Re-renderizar la matriz para revertir el toggle en la UI
            loadPermissionsMatrix();
        } else {
            showAlert('Permiso actualizado correctamente', 'success');
        }
    } catch (e) {
        showAlert('Excepción al actualizar permiso: ' + e.message, 'danger');
        loadPermissionsMatrix();
    }
}

window.handlePermissionChange = handlePermissionChange;

