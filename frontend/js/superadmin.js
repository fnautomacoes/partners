let currentUser = null;
let partners = [];
let plans = [];
let allPlans = [];
let modulePrices = [];
let commissionsData = [];
let tiersData = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth('SUPERADMIN');
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.email.split('@')[0];

    setupNavigation();
    setupForms();
    setupFilters();
    loadDashboard();
});

function setupNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            showSection(section);
        });
    });
}

function showSection(section) {
    document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    document.getElementById('pageTitle').textContent = getSectionTitle(section);

    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) sectionEl.classList.remove('hidden');

    const loaders = {
        dashboard: loadDashboard,
        partners: loadPartners,
        plans: loadPlans,
        clients: loadClients,
        commissions: loadCommissions,
        invoices: loadInvoices,
        proposals: loadProposals,
        config: loadConfig
    };
    if (loaders[section]) loaders[section]();
}

function setupForms() {
    document.getElementById('partnerForm').addEventListener('submit', savePartner);
    document.getElementById('planForm').addEventListener('submit', savePlan);
    document.getElementById('clientForm').addEventListener('submit', saveClient);
    document.getElementById('tierForm').addEventListener('submit', saveTier);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);

    const companyForm = document.getElementById('companyConfigForm');
    if (companyForm) companyForm.addEventListener('submit', saveCompanyConfig);

    const smtpForm = document.getElementById('smtpConfigForm');
    if (smtpForm) smtpForm.addEventListener('submit', saveSmtpConfig);

    const resourceForm = document.getElementById('resourcePricesForm');
    if (resourceForm) resourceForm.addEventListener('submit', saveResourcePrices);

    const moduleForm = document.getElementById('moduleForm');
    if (moduleForm) moduleForm.addEventListener('submit', saveModule);
}

function setupFilters() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filterPlans(tab.dataset.filter);
        });
    });

    populateYearFilters();
    populateMonthFilters();
}

function populateYearFilters() {
    const currentYear = new Date().getFullYear();
    const yearSelects = document.querySelectorAll('#invoiceYearFilter, #commYearFilter');
    yearSelects.forEach(select => {
        if (!select) return;
        for (let y = currentYear; y >= currentYear - 3; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            select.appendChild(opt);
        }
    });
}

function populateMonthFilters() {
    const months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const currentMonth = new Date().getMonth();
    const monthSelect = document.getElementById('commMonthFilter');
    if (monthSelect) {
        monthSelect.innerHTML = months.map((m, i) =>
            `<option value="${i+1}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`
        ).join('');
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const [dashRes, partnersRes] = await Promise.all([
            apiRequest('/api/admin/dashboard'),
            apiRequest('/api/partners')
        ]);

        if (dashRes.success) {
            const d = dashRes.data;
            document.getElementById('statPartners').textContent = d.activePartners || 0;
            document.getElementById('statClients').textContent = d.activeClients || 0;
            document.getElementById('statPendingCommissions').textContent = formatCurrency(d.pendingCommissions || 0);
            document.getElementById('statRevenue').textContent = formatCurrency(d.monthlyRevenue || 0);

            renderTierDistribution(d.tierDistribution || []);
            renderTopPartners(d.topPartners || []);
            renderRecentActivities(d.recentActivities || []);
        }

        if (partnersRes.success) {
            partners = partnersRes.data;
            populatePartnerFilters();
        }
    } catch (e) {
        console.error('Dashboard error:', e);
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderTierDistribution(tiers) {
    const container = document.getElementById('tierDistribution');
    if (!tiers || tiers.length === 0) {
        container.innerHTML = '<div class="text-gray text-center py-4">Nenhum tier configurado</div>';
        return;
    }

    const colors = ['tier-item-yellow', 'tier-item-green', 'tier-item-blue'];
    container.innerHTML = tiers.map((t, i) => `
        <div class="tier-item ${colors[i % colors.length]}">
            <div class="tier-item-info">
                <div class="tier-item-name">${escapeHtml(t.name)} - ${t.percentage || 0}%</div>
                <div class="tier-item-range">${t.minClients || 0}${t.maxClients ? '-' + t.maxClients : '+'} clientes</div>
            </div>
            <div class="tier-item-count">${t.count || 0}</div>
        </div>
    `).join('');
}

function renderTopPartners(topPartners) {
    const tbody = document.getElementById('topPartnersTable');
    if (!topPartners || topPartners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-gray">Nenhum parceiro</td></tr>';
        return;
    }

    tbody.innerHTML = topPartners.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.tier || '-')}</span></td>
            <td>${p.activeClients || 0}</td>
        </tr>
    `).join('');
}

function renderRecentActivities(activities) {
    const container = document.getElementById('recentActivities');
    if (!activities || activities.length === 0) {
        container.innerHTML = '<div class="text-gray text-center py-4">Nenhuma atividade recente</div>';
        return;
    }

    container.innerHTML = activities.map(a => `
        <div class="activity-item">
            <span class="activity-badge">${escapeHtml(a.action)}</span>
            <span class="activity-text">${escapeHtml(a.description || '')}</span>
            <span class="activity-date">${formatDate(a.createdAt)}</span>
        </div>
    `).join('');
}

function populatePartnerFilters() {
    const options = partners.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    ['clientPartnerFilter', 'commPartnerFilter', 'proposalPartnerFilter', 'clientPartnerSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const firstOpt = el.querySelector('option');
            el.innerHTML = (firstOpt ? firstOpt.outerHTML : '<option value="">Todos</option>') + options;
        }
    });
}

// Partners
async function loadPartners() {
    try {
        const res = await apiRequest('/api/partners');
        if (res.success) {
            partners = res.data;
            renderPartners();
            populatePartnerFilters();
        }
    } catch (e) {
        showToast('Erro ao carregar parceiros', 'error');
    }
}

function renderPartners() {
    const tbody = document.getElementById('partnersTable');
    tbody.innerHTML = partners.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.phone || '-')}</td>
            <td>${escapeHtml(p.document || '-')}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.tier || '-')}</span></td>
            <td>${p.activeClients || 0}</td>
            <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-link" onclick="editPartner('${p.id}')">Editar</button>
                <button class="btn-link" onclick="viewPartnerClients('${p.id}')">Ver Clientes</button>
                <button class="btn-link btn-link-danger" onclick="togglePartner('${p.id}', '${p.status}')">${p.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center text-gray">Nenhum parceiro</td></tr>';
}

function showPartnerModal(partner = null) {
    const form = document.getElementById('partnerForm');
    form.reset();
    document.getElementById('partnerFormId').value = partner?.id || '';
    document.getElementById('partnerModalTitle').textContent = partner ? 'Editar Parceiro' : 'Novo Parceiro';
    document.getElementById('partnerPasswordGroup').style.display = partner ? 'none' : 'block';

    if (partner) {
        form.name.value = partner.name;
        form.email.value = partner.email;
        form.phone.value = partner.phone || '';
        form.document.value = partner.document || '';
        form.canSetRecurrence.checked = partner.canSetRecurrence || false;
        form.canSetDueDate.checked = partner.canSetDueDate || false;
    }

    document.getElementById('partnerModal').classList.remove('hidden');
}

function editPartner(id) {
    const partner = partners.find(p => p.id === id);
    if (partner) showPartnerModal(partner);
}

function viewPartnerClients(id) {
    document.getElementById('clientPartnerFilter').value = id;
    showSection('clients');
}

async function savePartner(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('partnerFormId').value;

    const data = {
        name: form.name.value,
        email: form.email.value,
        phone: form.phone.value || null,
        document: form.document.value || null,
        canSetRecurrence: form.canSetRecurrence.checked,
        canSetDueDate: form.canSetDueDate.checked
    };

    if (!id) {
        data.password = form.password.value;
        if (!data.password || data.password.length < 8) {
            showToast('Senha deve ter no minimo 8 caracteres', 'error');
            return;
        }
    }

    try {
        const url = id ? `/api/partners/${id}` : '/api/partners';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Parceiro atualizado!' : 'Parceiro criado!', 'success');
            closeModal('partnerModal');
            loadPartners();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar parceiro', 'error');
    }
}

async function togglePartner(id, currentStatus) {
    if (!confirm(`${currentStatus === 'ACTIVE' ? 'Desativar' : 'Ativar'} este parceiro?`)) return;

    try {
        const res = await apiRequest(`/api/partners/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
        });

        if (res.success) {
            showToast('Status atualizado!', 'success');
            loadPartners();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao atualizar status', 'error');
    }
}

// Plans
async function loadPlans() {
    try {
        const [plansRes, modulesRes] = await Promise.all([
            apiRequest('/api/plans'),
            apiRequest('/api/plans/modules/prices')
        ]);

        if (plansRes.success) {
            // Filter only actual plans (isActive and has valid data)
            allPlans = plansRes.data.filter(p => p.isActive && p.name);
            filterPlans('all');
            populatePlanFilters();
        }

        if (modulesRes.success) {
            modulePrices = modulesRes.data;
            renderPlanModuleCheckboxes();
        }
    } catch (e) {
        showToast('Erro ao carregar planos', 'error');
    }
}

function filterPlans(filter = 'all') {
    let filtered = allPlans;

    if (filter === 'global') {
        filtered = allPlans.filter(p => !p.ownerId);
    } else if (filter === 'partner') {
        filtered = allPlans.filter(p => p.ownerId);
    }

    plans = filtered;
    renderPlansGrid();
}

function populatePlanFilters() {
    const select = document.getElementById('clientPlanFilter');
    if (select) {
        select.innerHTML = '<option value="">Todos os planos</option>' +
            allPlans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    }

    const clientSelect = document.getElementById('clientPlanSelect');
    if (clientSelect) {
        clientSelect.innerHTML = '<option value="">Selecione...</option>' +
            allPlans.filter(p => p.isActive).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    }
}

function renderPlansGrid() {
    const container = document.getElementById('plansGrid');

    if (plans.length === 0) {
        container.innerHTML = '<div class="text-center text-gray py-4">Nenhum plano encontrado</div>';
        return;
    }

    container.innerHTML = plans.map(p => {
        const isGlobal = !p.ownerId;
        const users = p.usersIncluded || p.resources?.users || p.users || 1;
        const queues = p.queuesIncluded || p.resources?.queues || p.queues || 1;
        const connections = (p.connectionsWhatsappUnofficial || 0) + (p.connectionsWhatsappOfficial || 0) + (p.connectionsInstagram || 0) || p.resources?.connections || p.connections || 1;

        const planModules = getPlanModules(p);

        return `
            <div class="plan-card">
                <div class="plan-card-header">
                    <div>
                        <h3 class="plan-card-title">${escapeHtml(p.name)}</h3>
                        ${!isGlobal ? `<div class="plan-card-subtitle">${escapeHtml(p.ownerName || 'Parceiro')}</div>` : ''}
                    </div>
                    <span class="badge ${isGlobal ? 'badge-primary' : 'badge-secondary'}">${isGlobal ? 'Global' : 'Parceiro'}</span>
                </div>
                <div class="plan-card-price">
                    ${formatCurrency(p.basePrice)}
                    <span class="plan-card-price-sub">/mes</span>
                </div>
                <div class="plan-card-resources">
                    <span class="plan-resource-icon" title="Usuarios">&#128100; ${users}</span>
                    <span class="plan-resource-icon" title="Filas">&#128209; ${queues}</span>
                    <span class="plan-resource-icon" title="Conexoes">&#128241; ${connections}</span>
                </div>
                ${planModules.length > 0 ? `
                <div class="plan-card-modules">
                    ${planModules.map(m => `<span class="plan-module-tag">&#128230; ${escapeHtml(m)}</span>`).join('')}
                </div>
                ` : ''}
                <div class="plan-card-info">
                    <div class="plan-card-info-row">
                        <span>Taxa de setup (cobrada 1x)</span>
                        <span>${formatCurrency(p.setupFee || 0)}</span>
                    </div>
                    <div class="plan-card-info-row">
                        <span>Clientes no plano</span>
                        <span>${p.clientCount || 0}</span>
                    </div>
                </div>
                ${isGlobal ? `
                <div class="plan-card-actions">
                    <button class="btn-link" onclick="editPlan('${p.id}')">Editar</button>
                    <button class="btn-link btn-link-danger" onclick="deletePlan('${p.id}')">Desativar</button>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function getPlanModules(plan) {
    const modules = [];
    modulePrices.forEach(m => {
        if (plan[m.moduleKey] === true || plan.modules?.[m.moduleKey] === true) {
            modules.push(m.label);
        }
    });
    return modules;
}

function renderPlanModuleCheckboxes() {
    const container = document.getElementById('planModulesCheckboxes');
    if (!container) return;

    container.innerHTML = modulePrices.filter(m => m.isVisible).map(m => `
        <label class="form-checkbox">
            <input type="checkbox" name="${m.moduleKey}">
            <span>${escapeHtml(m.label)} (+${formatCurrency(m.price)})</span>
        </label>
    `).join('');
}

function showPlanModal(plan = null) {
    const form = document.getElementById('planForm');
    form.reset();
    document.getElementById('planFormId').value = plan?.id || '';
    document.getElementById('planModalTitle').textContent = plan ? 'Editar Plano' : 'Novo Plano';

    if (plan) {
        form.name.value = plan.name || '';
        form.description.value = plan.description || '';
        form.basePrice.value = plan.basePrice || 0;
        form.setupFee.value = plan.setupFee || 0;
        form.sortOrder.value = plan.sortOrder || 0;
        form.pacoticketPlanId.value = plan.pacoticketPlanId || '';
        form.users.value = plan.usersIncluded || plan.resources?.users || 1;
        form.queues.value = plan.queuesIncluded || plan.resources?.queues || 1;
        form.connectionsWhatsappUnofficial.value = plan.resources?.connectionsWhatsappUnofficial || 0;
        form.connectionsWhatsappOfficial.value = plan.resources?.connectionsWhatsappOfficial || 0;
        form.connectionsInstagram.value = plan.resources?.connectionsInstagram || 0;

        modulePrices.forEach(m => {
            const cb = form.querySelector(`[name="${m.moduleKey}"]`);
            if (cb) cb.checked = plan.modules?.[m.moduleKey] || plan[m.moduleKey] || false;
        });
    }

    document.getElementById('planModal').classList.remove('hidden');
}

function editPlan(id) {
    const plan = allPlans.find(p => p.id === id);
    if (plan) showPlanModal(plan);
}

async function savePlan(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('planFormId').value;

    const data = {
        name: form.name.value,
        description: form.description.value || null,
        basePrice: parseFloat(form.basePrice.value) || 0,
        setupFee: parseFloat(form.setupFee.value) || 0,
        sortOrder: parseInt(form.sortOrder.value) || 0,
        pacoticketPlanId: form.pacoticketPlanId.value ? parseInt(form.pacoticketPlanId.value) : null,
        users: parseInt(form.users.value) || 1,
        queues: parseInt(form.queues.value) || 1,
        connections: parseInt(form.connectionsWhatsappUnofficial.value) + parseInt(form.connectionsWhatsappOfficial.value) || 1,
        connectionsWhatsappUnofficial: parseInt(form.connectionsWhatsappUnofficial.value) || 0,
        connectionsWhatsappOfficial: parseInt(form.connectionsWhatsappOfficial.value) || 0,
        connectionsInstagram: parseInt(form.connectionsInstagram.value) || 0
    };

    modulePrices.forEach(m => {
        const cb = form.querySelector(`[name="${m.moduleKey}"]`);
        data[m.moduleKey] = cb?.checked || false;
    });

    try {
        const url = id ? `/api/plans/${id}` : '/api/plans';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Plano atualizado!' : 'Plano criado!', 'success');
            closeModal('planModal');
            loadPlans();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar plano', 'error');
    }
}

async function deletePlan(id) {
    if (!confirm('Desativar este plano?')) return;

    try {
        const res = await apiRequest(`/api/plans/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Plano desativado!', 'success');
            loadPlans();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao desativar plano', 'error');
    }
}

// Clients
async function loadClients() {
    const partnerId = document.getElementById('clientPartnerFilter').value;
    const status = document.getElementById('clientStatusFilter').value;
    const planId = document.getElementById('clientPlanFilter').value;

    let url = '/api/clients?';
    if (partnerId) url += `partnerId=${partnerId}&`;
    if (status) url += `status=${status}&`;
    if (planId) url += `planId=${planId}&`;

    try {
        const res = await apiRequest(url);
        if (res.success) {
            renderClients(res.data);
        }
    } catch (e) {
        showToast('Erro ao carregar clientes', 'error');
    }
}

function clearClientFilters() {
    document.getElementById('clientPartnerFilter').value = '';
    document.getElementById('clientStatusFilter').value = '';
    document.getElementById('clientPlanFilter').value = '';
    loadClients();
}

function renderClients(clients) {
    const tbody = document.getElementById('clientsTable');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td>${escapeHtml(c.companyName)}</td>
            <td>
                <div>${escapeHtml(c.contactName || '-')}</div>
                <div class="text-xs text-gray">${escapeHtml(c.email || '')}</div>
            </td>
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>
                <div>${escapeHtml(c.planName || '-')}</div>
                ${c.pacoticketId ? `<div class="text-xs text-gray">PT#${c.pacoticketId}</div>` : ''}
            </td>
            <td>${getRecurrenceLabel(c.recurrence)}</td>
            <td class="${isOverdue(c.dueDate) ? 'text-danger' : ''}">${c.dueDate ? formatDate(c.dueDate) : '-'}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
            <td>${c.lastInvoiceStatus ? `<span class="badge ${getInvoiceStatusBadge(c.lastInvoiceStatus)}">${getInvoiceStatusLabel(c.lastInvoiceStatus)}</span>` : '<span class="text-gray">Sem fatura</span>'}</td>
            <td>
                <button class="btn-link" onclick="editClient('${c.id}')">Editar</button>
                <button class="btn-link btn-link-danger" onclick="deactivateClient('${c.id}')">Desativar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-gray">Nenhum cliente</td></tr>';
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
}

function showClientModal(client = null) {
    const form = document.getElementById('clientForm');
    form.reset();
    document.getElementById('clientFormId').value = client?.id || '';
    document.getElementById('clientModalTitle').textContent = client ? 'Editar Cliente' : 'Novo Cliente';

    if (client) {
        form.companyName.value = client.companyName || '';
        form.contactName.value = client.contactName || '';
        form.email.value = client.email || '';
        form.phone.value = client.phone || '';
        form.partnerId.value = client.partnerId || '';
        form.planId.value = client.planId || '';
        form.recurrence.value = client.recurrence || 'MONTHLY';
        form.dueDate.value = client.dueDate ? client.dueDate.split('T')[0] : '';
    }

    document.getElementById('clientModal').classList.remove('hidden');
}

function editClient(id) {
    apiRequest(`/api/clients/${id}`).then(res => {
        if (res.success) showClientModal(res.data);
    });
}

async function saveClient(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('clientFormId').value;

    const data = {
        companyName: form.companyName.value,
        contactName: form.contactName.value,
        email: form.email.value,
        phone: form.phone.value,
        partnerId: form.partnerId.value,
        planId: form.planId.value,
        recurrence: form.recurrence.value,
        dueDate: form.dueDate.value,
        password: form.password.value
    };

    try {
        const url = id ? `/api/clients/${id}` : '/api/clients';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Cliente atualizado!' : 'Cliente criado!', 'success');
            closeModal('clientModal');
            loadClients();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar cliente', 'error');
    }
}

async function deactivateClient(id) {
    if (!confirm('Desativar este cliente?')) return;

    try {
        const res = await apiRequest(`/api/clients/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Cliente desativado!', 'success');
            loadClients();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao desativar cliente', 'error');
    }
}

// Commissions
async function loadCommissions() {
    const month = document.getElementById('commMonthFilter')?.value || '';
    const year = document.getElementById('commYearFilter')?.value || '';
    const partnerId = document.getElementById('commPartnerFilter')?.value || '';
    const status = document.getElementById('commStatusFilter')?.value || '';

    let url = '/api/commissions?';
    if (month) url += `month=${month}&`;
    if (year) url += `year=${year}&`;
    if (partnerId) url += `partnerId=${partnerId}&`;
    if (status) url += `status=${status}&`;

    try {
        const [listRes, summaryRes] = await Promise.all([
            apiRequest(url),
            apiRequest('/api/commissions/summary' + (month || year ? `?month=${month}&year=${year}` : ''))
        ]);

        if (listRes.success) {
            commissionsData = listRes.data;
            renderCommissions(commissionsData);
        }

        if (summaryRes.success) {
            document.getElementById('commPending').textContent = formatCurrency(summaryRes.data.pending || 0);
            document.getElementById('commPaid').textContent = formatCurrency(summaryRes.data.paid || 0);
            document.getElementById('commTotal').textContent = formatCurrency(summaryRes.data.total || 0);
        }
    } catch (e) {
        showToast('Erro ao carregar comissoes', 'error');
    }
}

function renderCommissions(commissions) {
    const tbody = document.getElementById('commissionsTable');
    if (!commissions.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray">Nenhuma comissao encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = commissions.map(c => `
        <tr>
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>${escapeHtml(c.clientName || '-')}</td>
            <td>${c.periodMonth}/${c.periodYear}</td>
            <td><span class="badge badge-secondary">${escapeHtml(c.tierName || '-')}</span></td>
            <td>${c.percentage}%</td>
            <td>${formatCurrency(c.baseAmount)}</td>
            <td class="font-semibold">${formatCurrency(c.totalCommission)}</td>
            <td><span class="badge ${c.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${c.status === 'PAID' ? 'Pago' : 'Pendente'}</span></td>
            <td>
                ${c.status === 'PAID' ? formatDate(c.paidAt) : `<button class="btn btn-sm btn-success" onclick="payCommission('${c.id}')">Marcar Pago</button>`}
            </td>
        </tr>
    `).join('');
}

function exportCommissionsCSV() {
    if (!commissionsData.length) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }

    const headers = ['Parceiro', 'Cliente', 'Periodo', 'Tier', '%', 'Base', 'Comissao', 'Status', 'Pago em'];
    const rows = commissionsData.map(c => [
        c.partnerName || '',
        c.clientName || '',
        `${c.periodMonth}/${c.periodYear}`,
        c.tierName || '',
        c.percentage,
        c.baseAmount,
        c.totalCommission,
        c.status === 'PAID' ? 'Pago' : 'Pendente',
        c.paidAt ? formatDate(c.paidAt) : ''
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `comissoes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    showToast('CSV exportado!', 'success');
}

async function calculateCommissions() {
    const month = document.getElementById('commMonthFilter')?.value || new Date().getMonth() + 1;
    const year = document.getElementById('commYearFilter')?.value || new Date().getFullYear();

    if (!confirm(`Calcular comissoes para ${month}/${year}?`)) return;

    try {
        const res = await apiRequest('/api/commissions/calculate', {
            method: 'POST',
            body: JSON.stringify({ month: parseInt(month), year: parseInt(year) })
        });

        if (res.success) {
            showToast(`${res.data.created || 0} comissoes calculadas!`, 'success');
            loadCommissions();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao calcular comissoes', 'error');
    }
}

async function payCommission(id) {
    if (!confirm('Marcar esta comissao como paga?')) return;

    try {
        const res = await apiRequest(`/api/commissions/${id}/pay`, { method: 'PUT' });
        if (res.success) {
            showToast('Comissao marcada como paga!', 'success');
            loadCommissions();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao pagar comissao', 'error');
    }
}

// Invoices
async function loadInvoices() {
    const month = document.getElementById('invoiceMonthFilter')?.value || '';
    const year = document.getElementById('invoiceYearFilter')?.value || '';
    const status = document.getElementById('invoiceStatusFilter')?.value || '';

    let url = '/api/invoices?';
    if (month) url += `month=${month}&`;
    if (year) url += `year=${year}&`;
    if (status) url += `status=${status}&`;

    try {
        const res = await apiRequest(url);
        if (res.success) renderInvoices(res.data);
    } catch (e) {
        showToast('Erro ao carregar faturas', 'error');
    }
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoicesTable');
    if (!invoices.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray">Nenhuma fatura encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = invoices.map(i => `
        <tr>
            <td>${escapeHtml(i.clientName || '-')}</td>
            <td>${escapeHtml(i.partnerName || '-')}</td>
            <td>${escapeHtml(i.planName || '-')}</td>
            <td>${formatCurrency(i.amount)}</td>
            <td>${i.dueDate ? formatDate(i.dueDate) : '-'}</td>
            <td><span class="badge ${getInvoiceStatusBadge(i.status)}">${getInvoiceStatusLabel(i.status)}</span></td>
            <td>${i.paidAt ? formatDate(i.paidAt) : '-'}</td>
        </tr>
    `).join('');
}

async function syncInvoices() {
    if (!confirm('Sincronizar faturas com PacoTicket?')) return;

    try {
        const res = await apiRequest('/api/invoices/sync', { method: 'POST' });
        if (res.success) {
            showToast(`${res.data.synced || 0} faturas sincronizadas!`, 'success');
            loadInvoices();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao sincronizar', 'error');
    }
}

// Proposals
async function loadProposals() {
    const partnerId = document.getElementById('proposalPartnerFilter')?.value || '';
    const search = document.getElementById('proposalSearch')?.value || '';

    let url = '/api/pdf/proposals/all?';
    if (partnerId) url += `partnerId=${partnerId}&`;

    try {
        const res = await apiRequest(url);
        if (res.success) {
            let data = res.data;
            if (search) {
                const s = search.toLowerCase();
                data = data.filter(p =>
                    (p.proposalCode || '').toLowerCase().includes(s) ||
                    (p.leadName || '').toLowerCase().includes(s)
                );
            }
            renderProposals(data);
        }
    } catch (e) {
        showToast('Erro ao carregar propostas', 'error');
    }
}

function renderProposals(proposals) {
    const tbody = document.getElementById('proposalsTable');
    if (!proposals.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray">Nenhuma proposta encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = proposals.map(p => `
        <tr>
            <td class="font-mono text-primary">${escapeHtml(p.proposalCode || p.id?.substring(0,8))}</td>
            <td>${escapeHtml(p.planName || '-')}</td>
            <td>${escapeHtml(p.partnerName || '-')}</td>
            <td>
                ${p.leadName ? `<div>${escapeHtml(p.leadName)}</div>` : '-'}
            </td>
            <td>${formatCurrency(p.setupFeeBase || 0)}</td>
            <td>${formatCurrency(p.setupFeeExtra || 0)}</td>
            <td>${formatDate(p.createdAt)}</td>
            <td>
                <button class="btn-link" onclick="downloadProposal('${p.id}')">Baixar</button>
                <button class="btn-link btn-link-danger" onclick="deleteProposal('${p.id}')">Excluir</button>
            </td>
        </tr>
    `).join('');
}

async function downloadProposal(id) {
    window.open(`/api/pdf/proposals/${id}/download`, '_blank');
}

async function deleteProposal(id) {
    if (!confirm('Excluir esta proposta?')) return;

    try {
        const res = await apiRequest(`/api/pdf/proposals/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Proposta excluida!', 'success');
            loadProposals();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir proposta', 'error');
    }
}

// Config
async function loadConfig() {
    try {
        const [configRes, modulesRes, tiersRes, resourcesRes] = await Promise.all([
            apiRequest('/api/system-config/admin'),
            apiRequest('/api/plans/modules/prices'),
            apiRequest('/api/commission-tiers'),
            apiRequest('/api/resource-prices')
        ]);

        if (configRes.success) {
            const data = configRes.data;
            populateConfigForm('companyConfigForm', data);
            populateConfigForm('smtpConfigForm', data);
        }

        if (modulesRes.success) {
            modulePrices = modulesRes.data;
            renderModulePricesTable();
        }

        if (tiersRes.success) {
            tiersData = tiersRes.data;
            renderTiersTable();
        }

        if (resourcesRes.success) {
            renderResourcePricesTable(resourcesRes.data);
        }
    } catch (e) {
        showToast('Erro ao carregar configuracoes', 'error');
    }
}

function populateConfigForm(formId, data) {
    const form = document.getElementById(formId);
    if (!form) return;

    Object.entries(data).forEach(([key, value]) => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = value || '';
    });
}

function renderModulePricesTable() {
    const tbody = document.getElementById('modulePricesTable');
    if (!tbody) return;

    tbody.innerHTML = modulePrices.map(m => `
        <tr data-module-key="${m.moduleKey}">
            <td>
                <label class="form-checkbox">
                    <input type="checkbox" name="${m.moduleKey}_visible" ${m.isVisible ? 'checked' : ''}>
                    <span></span>
                </label>
            </td>
            <td>${escapeHtml(m.label)}</td>
            <td>
                <input type="number" step="0.01" class="form-input" name="${m.moduleKey}_price" value="${m.price || 0}" style="max-width: 100px">
            </td>
            <td>
                <input type="number" step="0.01" class="form-input" name="${m.moduleKey}_setup" value="${m.setupFee || 0}" style="max-width: 100px">
            </td>
            <td>
                <button class="btn-link btn-link-danger" onclick="deleteModule('${m.moduleKey}')">Excluir</button>
            </td>
        </tr>
    `).join('');
}

async function deleteModule(moduleKey) {
    if (!confirm('Excluir este modulo?')) return;

    try {
        const res = await apiRequest(`/api/plans/modules/prices/${moduleKey}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Modulo excluido!', 'success');
            loadConfig();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir modulo', 'error');
    }
}

async function editModulePrice(moduleKey, currentPrice, isVisible) {
    const newPrice = prompt('Novo preco:', currentPrice);
    if (newPrice === null) return;

    try {
        const res = await apiRequest('/api/plans/modules/prices', {
            method: 'PUT',
            body: JSON.stringify({ modules: [{ moduleKey, price: parseFloat(newPrice), isVisible }] })
        });

        if (res.success) {
            showToast('Preco atualizado!', 'success');
            loadConfig();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao atualizar preco', 'error');
    }
}

function renderTiersTable() {
    const tbody = document.getElementById('tiersTable');
    if (!tbody) return;

    tbody.innerHTML = tiersData.map(t => `
        <tr>
            <td>${t.order}</td>
            <td>${escapeHtml(t.name)}</td>
            <td>${t.minClients}</td>
            <td>${t.maxClients || 'Ilimitado'}</td>
            <td>${t.percentage}%</td>
            <td><span class="badge ${t.isActive ? 'badge-success' : 'badge-danger'}">${t.isActive ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-link" onclick="editTier('${t.id}')">Editar</button>
                <button class="btn-link btn-link-danger" onclick="deleteTier('${t.id}')">Excluir</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-gray">Nenhum tier</td></tr>';
}

function renderResourcePricesTable(resources) {
    const tbody = document.getElementById('resourcePricesTable');
    if (!tbody) return;

    const labels = {
        user: 'Usuario adicional (por usuario)',
        queue: 'Fila adicional (por fila)',
        whatsappUnofficial: 'WhatsApp Nao Oficial (por conexao)',
        whatsappOfficial: 'WhatsApp Oficial / WABA (por conexao)',
        instagram: 'Instagram (por conexao)'
    };

    tbody.innerHTML = resources.map(r => `
        <tr>
            <td>${labels[r.key] || r.key}</td>
            <td>
                <input type="number" step="0.01" class="form-input" name="resource_${r.key}" value="${r.price}" style="max-width: 120px">
            </td>
        </tr>
    `).join('');
}

function showTierModal(tier = null) {
    const form = document.getElementById('tierForm');
    form.reset();
    document.getElementById('tierFormId').value = tier?.id || '';
    document.getElementById('tierModalTitle').textContent = tier ? 'Editar Tier' : 'Novo Tier';

    if (tier) {
        form.name.value = tier.name;
        form.minClients.value = tier.minClients;
        form.maxClients.value = tier.maxClients || '';
        form.percentage.value = tier.percentage;
        form.order.value = tier.order;
        if (form.commissionDuration) form.commissionDuration.value = tier.commissionDuration || '';
        if (form.supportMode) form.supportMode.value = tier.supportMode || 'CLIENT';
        if (form.notes) form.notes.value = tier.notes || '';
        if (form.allowNewSales) form.allowNewSales.checked = tier.allowNewSales !== false;
        if (form.setupCommission) form.setupCommission.checked = tier.setupCommission || false;
    }

    document.getElementById('tierModal').classList.remove('hidden');
}

function editTier(id) {
    const tier = tiersData.find(t => t.id === id);
    if (tier) showTierModal(tier);
}

async function saveTier(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('tierFormId').value;

    const data = {
        name: form.name.value,
        minClients: parseInt(form.minClients.value),
        maxClients: form.maxClients.value ? parseInt(form.maxClients.value) : null,
        percentage: parseFloat(form.percentage.value),
        order: parseInt(form.order.value),
        commissionDuration: form.commissionDuration?.value ? parseInt(form.commissionDuration.value) : null,
        supportMode: form.supportMode?.value || 'CLIENT',
        notes: form.notes?.value || null,
        allowNewSales: form.allowNewSales?.checked !== false,
        setupCommission: form.setupCommission?.checked || false
    };

    try {
        const url = id ? `/api/commission-tiers/${id}` : '/api/commission-tiers';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Tier atualizado!' : 'Tier criado!', 'success');
            closeModal('tierModal');
            loadConfig();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar tier', 'error');
    }
}

async function deleteTier(id) {
    if (!confirm('Excluir este tier?')) return;

    try {
        const res = await apiRequest(`/api/commission-tiers/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Tier excluido!', 'success');
            loadConfig();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir tier', 'error');
    }
}

async function saveCompanyConfig(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        const res = await apiRequest('/api/system-config', {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        if (res.success) {
            showToast('Configuracoes salvas!', 'success');
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar configuracoes', 'error');
    }
}

async function saveSmtpConfig(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        const res = await apiRequest('/api/system-config', {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        if (res.success) {
            showToast('SMTP salvo!', 'success');
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar SMTP', 'error');
    }
}

async function testSmtp() {
    const email = prompt('Email para teste:');
    if (!email) return;

    try {
        const res = await apiRequest('/api/system-config/smtp-test', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        if (res.success) {
            showToast('Email de teste enviado!', 'success');
        } else {
            showToast(res.message || 'Falha no teste', 'error');
        }
    } catch (e) {
        showToast('Erro ao testar SMTP', 'error');
    }
}

async function saveResourcePrices(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const resources = [];

    formData.forEach((value, key) => {
        if (key.startsWith('resource_')) {
            resources.push({
                key: key.replace('resource_', ''),
                price: parseFloat(value) || 0
            });
        }
    });

    try {
        const res = await apiRequest('/api/resource-prices', {
            method: 'PUT',
            body: JSON.stringify({ resources })
        });

        if (res.success) {
            showToast('Precos de infraestrutura salvos!', 'success');
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar precos', 'error');
    }
}

// Password
function showChangePassword() {
    document.getElementById('passwordForm').reset();
    document.getElementById('passwordModal').classList.remove('hidden');
    closeUserMenu();
}

async function changePassword(e) {
    e.preventDefault();
    const form = e.target;

    if (form.newPassword.value !== form.confirmPassword.value) {
        showToast('Senhas nao conferem', 'error');
        return;
    }

    try {
        const res = await apiRequest('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({
                currentPassword: form.currentPassword.value,
                newPassword: form.newPassword.value
            })
        });

        if (res.success) {
            showToast('Senha alterada! Faca login novamente.', 'success');
            setTimeout(() => logout(), 2000);
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao alterar senha', 'error');
    }
}

// Utils
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('hidden');
}

function closeUserMenu() {
    document.getElementById('userDropdown').classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) closeUserMenu();
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
}

function formatDateTime(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getStatusBadge(status) {
    const map = { ACTIVE: 'badge-success', INACTIVE: 'badge-danger', SUSPENDED: 'badge-warning', PENDING: 'badge-secondary' };
    return map[status] || 'badge-secondary';
}

function getStatusLabel(status) {
    const map = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', SUSPENDED: 'Suspenso', PENDING: 'Pendente' };
    return map[status] || status;
}

function getRecurrenceLabel(recurrence) {
    const map = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };
    return map[recurrence] || recurrence || '-';
}

function getInvoiceStatusBadge(status) {
    const map = { PAID: 'badge-success', PENDING: 'badge-warning', OVERDUE: 'badge-danger', CANCELLED: 'badge-secondary' };
    return map[status] || 'badge-secondary';
}

function getInvoiceStatusLabel(status) {
    const map = { PAID: 'Pago', PENDING: 'Pendente', OVERDUE: 'Vencido', CANCELLED: 'Cancelado' };
    return map[status] || status;
}

function getSectionTitle(section) {
    const titles = {
        dashboard: 'Dashboard',
        partners: 'Parceiros',
        plans: 'Planos',
        clients: 'Clientes',
        commissions: 'Comissoes',
        invoices: 'Faturas',
        proposals: 'Propostas',
        config: 'Configuracoes'
    };
    return titles[section] || 'Dashboard';
}

function saveModulePrices() {
    const rows = document.querySelectorAll('#modulePricesTable tr[data-module-key]');
    const modules = [];

    rows.forEach(row => {
        const moduleKey = row.dataset.moduleKey;
        const checkbox = row.querySelector(`input[name="${moduleKey}_visible"]`);
        const priceInput = row.querySelector(`input[name="${moduleKey}_price"]`);
        const setupInput = row.querySelector(`input[name="${moduleKey}_setup"]`);
        const moduleData = modulePrices.find(m => m.moduleKey === moduleKey);

        if (moduleKey) {
            modules.push({
                moduleKey,
                label: moduleData?.label || moduleKey,
                price: parseFloat(priceInput?.value) || 0,
                setupFee: parseFloat(setupInput?.value) || 0,
                isVisible: checkbox?.checked || false
            });
        }
    });

    apiRequest('/api/plans/modules/prices', {
        method: 'PUT',
        body: JSON.stringify({ modules })
    }).then(res => {
        if (res.success) {
            showToast('Precos de modulos salvos!', 'success');
            loadConfig();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    }).catch(() => showToast('Erro ao salvar precos de modulos', 'error'));
}

function showModuleModal(module = null) {
    const form = document.getElementById('moduleForm');
    form.reset();
    document.getElementById('moduleFormId').value = module?.moduleKey || '';
    document.getElementById('moduleModalTitle').textContent = module ? 'Editar Modulo' : 'Novo Modulo';

    if (module) {
        form.moduleKey.value = module.moduleKey;
        form.moduleKey.disabled = true;
        form.label.value = module.label;
        form.price.value = module.price || 0;
        form.setupFee.value = module.setupFee || 0;
        form.isVisible.checked = module.isVisible !== false;
    } else {
        form.moduleKey.disabled = false;
    }

    document.getElementById('moduleModal').classList.remove('hidden');
}

async function saveModule(e) {
    e.preventDefault();
    const form = e.target;
    const isEdit = !!document.getElementById('moduleFormId').value;

    const data = {
        moduleKey: form.moduleKey.value,
        label: form.label.value,
        price: parseFloat(form.price.value) || 0,
        setupFee: parseFloat(form.setupFee.value) || 0,
        isVisible: form.isVisible.checked
    };

    try {
        const res = await apiRequest('/api/plans/modules/prices', {
            method: 'PUT',
            body: JSON.stringify({ modules: [data] })
        });

        if (res.success) {
            showToast(isEdit ? 'Modulo atualizado!' : 'Modulo criado!', 'success');
            closeModal('moduleModal');
            loadConfig();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar modulo', 'error');
    }
}
