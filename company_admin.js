/**
 * NOMAI COMPANY ADMIN LOGIC
 */

let analystsList = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Proteger página. Solo admin (de empresa) permitido.
    const profile = await requireAuth(['admin']);
    if (!profile) return;

    // Verificar si el rol del administrador tiene el permiso 'manage_analysts'
    if (!window.NomaiAuth.hasPermission('manage_analysts')) {
        if (typeof window.showNomaiAlert === 'function') {
            await window.showNomaiAlert('No tienes permisos para gestionar los analistas de la empresa.');
        } else {
            alert('No tienes permisos para gestionar los analistas de la empresa.');
        }
        window.location.href = 'index.html';
        return;
    }

    // Configurar UI de usuario en el header
    const nameEl = document.querySelector('.profile-name');
    const roleEl = document.querySelector('.profile-role');
    const avatarEl = document.querySelector('.avatar-letter');
    if (nameEl) nameEl.textContent = profile.full_name || 'Admin Empresa';
    if (roleEl) roleEl.textContent = profile.role.toUpperCase();
    if (avatarEl && profile.full_name) {
        avatarEl.textContent = profile.full_name.substring(0, 2).toUpperCase();
    }

    // Inicializar Lucide Icons
    lucide.createIcons();

    // Actualizar nombre de la empresa en subtítulo si está disponible
    if (window.NomaiAuth.company) {
        document.getElementById('company-subtitle').textContent = 
            `Gestiona los analistas autorizados de ${window.NomaiAuth.company.name}.`;
    }

    // Cargar analistas
    await refreshAnalysts();

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

async function refreshAnalysts() {
    const sb = window.NomaiAuth.supabase;

    // Obtener los analistas de la misma empresa (RLS ya se encarga de filtrar)
    const { data: analysts, error } = await sb
        .from('profiles')
        .select('*')
        .eq('role', 'analyst')
        .order('full_name');

    if (error) {
        showAlert('Error cargando analistas: ' + error.message, 'danger');
        return;
    }

    analystsList = analysts || [];
    renderAnalysts();
}

function renderAnalysts() {
    const tbody = document.getElementById('analysts-table-body');
    if (!tbody) return;

    if (analystsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No hay analistas registrados.</td></tr>';
        return;
    }

    tbody.innerHTML = analystsList.map(a => {
        const statusBadge = a.is_active 
            ? '<span class="status-pill active">Activo</span>'
            : '<span class="status-pill inactive">Inactivo</span>';

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${a.full_name || 'Sin Nombre'}</td>
                <td style="text-transform: capitalize;">${a.role === 'analyst' ? 'Analista' : a.role}</td>
                <td>${statusBadge}</td>
                <td>${new Date(a.created_at).toLocaleDateString('es-CO')}</td>
                <td>
                    <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: nowrap; align-items: center;">
                        <button class="admin-action-btn" onclick="openEditAnalystModal('${a.id}')" title="Editar Analista">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="admin-action-btn" onclick="openResetPasswordModal('${a.id}')" title="Restablecer Contraseña">
                            <i data-lucide="key" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="admin-action-btn ${a.is_active ? 'admin-action-btn-danger' : ''}" onclick="toggleAnalystStatus('${a.id}', ${!a.is_active})" title="${a.is_active ? 'Desactivar' : 'Activar'}">
                            <i data-lucide="${a.is_active ? 'user-x' : 'user-check'}" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="admin-action-btn admin-action-btn-danger" onclick="deleteAnalyst('${a.id}')" title="Eliminar Analista">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Renderizar iconos de Lucide creados dinámicamente
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// ─── Analyst Operations ──────────────────────────────────────────────────────
function openCreateAnalystModal() {
    document.getElementById('modal-title').textContent = 'Crear Usuario Analista';
    document.getElementById('analyst-id').value = '';
    document.getElementById('analyst-name').value = '';
    document.getElementById('analyst-email').value = '';
    document.getElementById('analyst-password').value = '';
    document.getElementById('analyst-status').value = 'true';

    document.getElementById('analyst-email-group').style.display = 'flex';
    document.getElementById('analyst-pass-group').style.display = 'flex';
    document.getElementById('analyst-password').required = true;
    openModal('analyst-modal');
}

function openEditAnalystModal(id) {
    const analyst = analystsList.find(a => a.id === id);
    if (!analyst) return;

    document.getElementById('modal-title').textContent = 'Editar Usuario Analista';
    document.getElementById('analyst-id').value = analyst.id;
    document.getElementById('analyst-name').value = analyst.full_name || '';
    document.getElementById('analyst-email').value = analyst.email || '';
    document.getElementById('analyst-password').value = '';
    document.getElementById('analyst-status').value = analyst.is_active ? 'true' : 'false';

    document.getElementById('analyst-email-group').style.display = 'flex';
    document.getElementById('analyst-pass-group').style.display = 'none';
    document.getElementById('analyst-password').required = false;
    openModal('analyst-modal');
}

async function deleteAnalyst(id) {
    const analyst = analystsList.find(a => a.id === id);
    if (!analyst) return;

    const confirmMessage = `¿Estás seguro de que deseas eliminar permanentemente al analista "${analyst.full_name || analyst.email}"? Esta acción no se puede deshacer y desvinculará sus importaciones anteriores.`;
    const proceed = await window.showNomaiConfirm(confirmMessage);
    if (!proceed) return;

    const sb = window.NomaiAuth.supabase;
    const { error } = await sb.rpc('admin_delete_user', {
        target_user_id: id
    });

    if (error) {
        showAlert('Error al eliminar analista: ' + error.message, 'danger');
    } else {
        showAlert('Analista eliminado correctamente', 'success');
        await refreshAnalysts();
    }
}

async function saveAnalyst(e) {
    e.preventDefault();
    const sb = window.NomaiAuth.supabase;
    const id = document.getElementById('analyst-id').value;

    if (id) {
        const name = document.getElementById('analyst-name').value.trim();
        const email = document.getElementById('analyst-email').value.trim();
        const is_active = document.getElementById('analyst-status').value === 'true';

        // 1. Actualizar email y nombre completo via RPC
        const { error: updateError } = await sb.rpc('admin_update_user', {
            target_user_id: id,
            new_email: email,
            new_full_name: name
        });

        if (updateError) {
            showAlert('Error al actualizar analista: ' + updateError.message, 'danger');
            return;
        }

        // 2. Actualizar estado
        const { error: statusError } = await sb.from('profiles')
            .update({ is_active })
            .eq('id', id);

        if (statusError) {
            showAlert('Error al actualizar estado: ' + statusError.message, 'danger');
        } else {
            showAlert('Analista actualizado correctamente', 'success');
            closeModal('analyst-modal');
            await refreshAnalysts();
        }
    } else {
        // Crear analista via RPC
        const email = document.getElementById('analyst-email').value.trim();
        const password = document.getElementById('analyst-password').value;
        const fullName = document.getElementById('analyst-name').value.trim();

        const { data, error } = await sb.rpc('create_company_analyst', {
            analyst_email: email,
            analyst_password: password,
            analyst_full_name: fullName
        });

        if (error) {
            showAlert('Error al crear analista: ' + error.message, 'danger');
        } else {
            showAlert('Analista creado correctamente', 'success');
            closeModal('analyst-modal');
            await refreshAnalysts();
        }
    }
}

async function toggleAnalystStatus(id, active) {
    const sb = window.NomaiAuth.supabase;
    const { error } = await sb.from('profiles')
        .update({ is_active: active })
        .eq('id', id);

    if (error) {
        showAlert('Error al cambiar estado: ' + error.message, 'danger');
    } else {
        showAlert('Estado de usuario actualizado correctamente', 'success');
        await refreshAnalysts();
    }
}

async function openResetPasswordModal(userId) {
    const password = await window.showNomaiPrompt('Ingresa la nueva contraseña para este analista:');
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

function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
}

async function triggerLogoutWithConfirm() {
    const confirmMessage = '¿Estás seguro de que deseas cerrar sesión?';
    const proceed = await window.showNomaiConfirm(confirmMessage);
    if (proceed) {
        nomaiLogout();
    }
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
