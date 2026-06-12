let currentUser = null;
let partnerData = null;
let plans = [];
let globalPlans = [];
let myPlans = [];
let modulePrices = [];
let resourcePrices = [];
let stages = [];
let leads = [];
let currentLead = null;
let selectedPlan = null;
let tiersData = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth('PARTNER');
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.email.split('@')[0];
    document.getElementById('userAvatar').textContent = currentUser.email[0].toUpperCase();

    setupNavigation();
    setupForms();
    setCommissionFilters();
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

    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) sectionEl.classList.remove('hidden');

    document.getElementById('pageTitle').textContent = getSectionTitle(section);

    const summaryPanel = document.getElementById('proposalSummaryPanel');
    if (summaryPanel) {
        if (section === 'proposals') {
            summaryPanel.classList.remove('hidden');
        } else {
            summaryPanel.classList.add('hidden');
        }
    }

    const loaders = {
        dashboard: loadDashboard,
        funnel: loadFunnel,
        clients: loadClients,
        commissions: loadCommissions,
        pricing: loadPricing,
        proposals: loadProposals,
        profile: loadProfile
    };
    if (loaders[section]) loaders[section]();
}

function setupForms() {
    document.getElementById('clientForm').addEventListener('submit', saveClient);
    document.getElementById('leadForm').addEventListener('submit', saveLead);
    document.getElementById('partnerPlanForm').addEventListener('submit', savePartnerPlan);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);

    const profileForm = document.getElementById('profileForm');
    if (profileForm) profileForm.addEventListener('submit', saveProfile);
}

function setCommissionFilters() {
    const now = new Date();
    const monthFilter = document.getElementById('commMonthFilter');
    const yearFilter = document.getElementById('commYearFilter');
    if (monthFilter) monthFilter.value = now.getMonth() + 1;
    if (yearFilter) yearFilter.value = now.getFullYear();
}

// Dashboard
async function loadDashboard() {
    try {
        const res = await apiRequest('/api/partners/me/dashboard');
        if (res.success) {
            partnerData = res.data;
            renderDashboard(res.data);
        }
    } catch (e) {
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderDashboard(data) {
    const userName = data.name || currentUser.email.split('@')[0];
    document.getElementById('dashboardUserName').textContent = userName;

    document.getElementById('dashTierName').textContent = data.tier?.name || 'Indicador';
    document.getElementById('dashTierPercentage').textContent = (data.tier?.percentage || 15) + '%';

    const activeClients = data.activeClients || 0;
    const nextTierMin = data.nextTier?.minClients || 3;
    const progress = Math.min((activeClients / nextTierMin) * 100, 100);
    document.getElementById('dashTierProgress').style.width = progress + '%';

    const remaining = Math.max(0, nextTierMin - activeClients);
    const tierText = `${activeClients} clientes ativos - Faltam <span>${remaining}</span> clientes para o proximo nivel`;
    document.getElementById('dashTierText').innerHTML = tierText;

    document.getElementById('statClients').textContent = activeClients;
    document.getElementById('statCommission').textContent = formatCurrency(data.pendingCommission || 0);
    document.getElementById('statCommissionStatus').textContent = data.pendingCommission > 0 ? 'Pendente' : 'Nenhuma';
    document.getElementById('statInvoicesPaid').textContent = data.paidInvoicesCount || 0;
    document.getElementById('statNextDue').textContent = data.nextDueDate ? formatDate(data.nextDueDate) : 'Nenhum';
}

// Funnel
async function loadFunnel() {
    try {
        const [stagesRes, leadsRes] = await Promise.all([
            apiRequest('/api/funnel/stages'),
            apiRequest('/api/funnel/leads')
        ]);

        if (stagesRes.success) {
            stages = stagesRes.data;
            populateStageSelects();
            populateLeadPlanSelect();
        }

        if (leadsRes.success) {
            leads = leadsRes.data;
            document.getElementById('funnelLeadsCount').textContent = `${leads.length} leads ativos`;
            renderKanban();
        }
    } catch (e) {
        showToast('Erro ao carregar funil', 'error');
    }
}

function populateStageSelects() {
    const options = stages.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    document.getElementById('leadStageSelect').innerHTML = options;
}

function populateLeadPlanSelect() {
    const select = document.getElementById('leadPlanSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Nenhum --</option>' +
        plans.filter(p => p.isActive).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function renderKanban() {
    const board = document.getElementById('funnelBoard');
    const stageColors = ['#3b82f6', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444'];

    board.innerHTML = stages.map((stage, i) => {
        const stageLeads = leads.filter(l => l.stageId === stage.id);
        return `
            <div class="kanban-column" data-stage="${stage.id}">
                <div class="kanban-column-header">
                    <span class="kanban-stage-dot" style="background: ${stageColors[i % stageColors.length]}"></span>
                    <span class="kanban-column-title">${escapeHtml(stage.name)}</span>
                    <span class="kanban-column-count">${stageLeads.length}</span>
                </div>
                <div class="kanban-cards">
                    ${stageLeads.length === 0
                        ? '<div class="text-center text-gray text-sm py-4">Nenhum lead</div>'
                        : stageLeads.map(lead => renderKanbanCard(lead)).join('')}
                </div>
                <div class="kanban-add-btn" onclick="showLeadModal(null, '${stage.id}')">
                    + Adicionar lead
                </div>
            </div>
        `;
    }).join('');
}

function renderKanbanCard(lead) {
    return `
        <div class="kanban-card" onclick="openLeadDetail('${lead.id}')">
            <div class="kanban-card-title">${escapeHtml(lead.name)}</div>
            ${lead.companyName ? `<div class="kanban-card-company">${escapeHtml(lead.companyName)}</div>` : ''}
            ${lead.planName ? `<div class="kanban-card-plan">${escapeHtml(lead.planName)}</div>` : ''}
            <div class="kanban-card-footer">
                <span>${lead.activitiesCount || 0} atividades</span>
                <span>${formatDate(lead.createdAt)}</span>
            </div>
        </div>
    `;
}

function showLeadModal(lead = null, stageId = null) {
    const form = document.getElementById('leadForm');
    form.reset();
    document.getElementById('leadFormId').value = lead?.id || '';
    document.getElementById('leadModalTitle').textContent = lead ? 'Editar Lead' : 'Novo Lead';

    populateLeadPlanSelect();

    if (lead) {
        form.name.value = lead.name || '';
        form.companyName.value = lead.companyName || '';
        form.email.value = lead.email || '';
        form.phone.value = lead.phone || '';
        form.stageId.value = lead.stageId || '';
        form.planId.value = lead.planId || '';
        form.estimatedValue.value = lead.estimatedValue || '';
        form.notes.value = lead.notes || '';
    } else if (stageId) {
        form.stageId.value = stageId;
    }

    document.getElementById('leadModal').classList.remove('hidden');
}

async function saveLead(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('leadFormId').value;

    const data = {
        name: form.name.value,
        companyName: form.companyName.value || null,
        email: form.email.value || null,
        phone: form.phone.value || null,
        stageId: form.stageId.value,
        planId: form.planId.value || null,
        estimatedValue: form.estimatedValue.value ? parseFloat(form.estimatedValue.value) : null,
        notes: form.notes.value || null
    };

    try {
        const url = id ? `/api/funnel/leads/${id}` : '/api/funnel/leads';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Lead atualizado!' : 'Lead criado!', 'success');
            closeModal('leadModal');
            loadFunnel();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar lead', 'error');
    }
}

async function openLeadDetail(id) {
    try {
        const [leadRes, activitiesRes] = await Promise.all([
            apiRequest(`/api/funnel/leads/${id}`),
            apiRequest(`/api/funnel/leads/${id}/activities`)
        ]);

        if (leadRes.success) {
            currentLead = leadRes.data;
            renderLeadDetail(currentLead, activitiesRes.success ? activitiesRes.data : []);
            document.getElementById('leadDetailModal').classList.remove('hidden');
        }
    } catch (e) {
        showToast('Erro ao carregar lead', 'error');
    }
}

function renderLeadDetail(lead, activities) {
    document.getElementById('leadDetailName').textContent = lead.name;
    document.getElementById('leadDetailCompany').textContent = lead.companyName || '';
    document.getElementById('leadDetailPhone').textContent = lead.phone || '-';

    const emailEl = document.getElementById('leadDetailEmail');
    emailEl.textContent = lead.email || '-';
    emailEl.href = lead.email ? `mailto:${lead.email}` : '#';

    const currentStage = stages.find(s => s.id === lead.stageId);
    document.getElementById('leadDetailStage').textContent = currentStage?.name || '-';

    const buttonsHtml = stages.map(s => `
        <button class="lead-stage-btn ${s.id === lead.stageId ? 'active' : ''}"
                onclick="moveLeadToStage('${s.id}')">
            ${escapeHtml(s.name)}
        </button>
    `).join('');
    document.getElementById('leadStageButtons').innerHTML = buttonsHtml;

    const activitiesHtml = activities.length === 0
        ? '<div class="text-center text-gray py-4">Nenhuma atividade</div>'
        : activities.map(a => `
            <div class="lead-activity-item">
                <span class="lead-activity-dot"></span>
                <span class="lead-activity-text">${escapeHtml(a.description)}</span>
                <span class="lead-activity-date">${formatDate(a.createdAt)}</span>
            </div>
        `).join('');
    document.getElementById('leadActivities').innerHTML = activitiesHtml;
}

async function moveLeadToStage(stageId) {
    if (!currentLead || currentLead.stageId === stageId) return;

    try {
        const res = await apiRequest(`/api/funnel/leads/${currentLead.id}`, {
            method: 'PUT',
            body: JSON.stringify({ stageId })
        });

        if (res.success) {
            showToast('Lead movido!', 'success');
            currentLead.stageId = stageId;
            renderLeadDetail(currentLead, []);
            loadFunnel();
        }
    } catch (e) {
        showToast('Erro ao mover lead', 'error');
    }
}

async function markLeadWon() {
    if (!currentLead) return;
    if (!confirm('Converter este lead em cliente?')) return;

    try {
        const res = await apiRequest(`/api/funnel/leads/${currentLead.id}/promote`, { method: 'POST' });
        if (res.success) {
            showToast('Lead convertido em cliente!', 'success');
            closeModal('leadDetailModal');
            loadFunnel();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao converter lead', 'error');
    }
}

async function markLeadLost() {
    if (!currentLead) return;
    if (!confirm('Marcar lead como perdido?')) return;

    const lostStage = stages.find(s => s.name.toLowerCase().includes('perdido'));
    if (lostStage) {
        await moveLeadToStage(lostStage.id);
    } else {
        showToast('Estagio "Perdido" nao encontrado', 'error');
    }
}

function editCurrentLead() {
    if (!currentLead) return;
    closeModal('leadDetailModal');
    showLeadModal(currentLead);
}

async function deleteCurrentLead() {
    if (!currentLead) return;
    if (!confirm('Excluir este lead?')) return;

    try {
        const res = await apiRequest(`/api/funnel/leads/${currentLead.id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Lead excluido!', 'success');
            closeModal('leadDetailModal');
            loadFunnel();
        }
    } catch (e) {
        showToast('Erro ao excluir lead', 'error');
    }
}

async function addLeadNote() {
    if (!currentLead) return;
    const input = document.getElementById('leadNoteInput');
    const note = input.value.trim();
    if (!note) return;

    try {
        const res = await apiRequest(`/api/funnel/leads/${currentLead.id}/activities`, {
            method: 'POST',
            body: JSON.stringify({ type: 'NOTE', description: note })
        });

        if (res.success) {
            input.value = '';
            openLeadDetail(currentLead.id);
        }
    } catch (e) {
        showToast('Erro ao adicionar nota', 'error');
    }
}

// Clients
async function loadClients() {
    try {
        const res = await apiRequest('/api/clients');
        if (res.success) {
            renderClients(res.data);
        }
    } catch (e) {
        showToast('Erro ao carregar clientes', 'error');
    }
}

function renderClients(clients) {
    const tbody = document.getElementById('clientsTable');

    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray">Nenhum cliente encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = clients.map(c => `
        <tr>
            <td>
                <div class="font-medium">${escapeHtml(c.companyName)}</div>
                <div class="text-xs text-gray">${escapeHtml(c.contactName || '')}</div>
            </td>
            <td>
                <div>${escapeHtml(c.planName || '-')}</div>
                ${c.pacoticketId ? `<div class="text-xs text-primary">PT#${c.pacoticketId}</div>` : ''}
            </td>
            <td>
                ${c.modules && c.modules.length > 0
                    ? c.modules.slice(0, 2).map(m => `<span class="mr-2" title="${escapeHtml(m)}">&#x1F4E6;</span>`).join('')
                    : '-'}
            </td>
            <td>${formatCurrency(c.monthlyValue || c.planPrice || 0)}</td>
            <td>${getRecurrenceLabel(c.recurrence)}</td>
            <td class="${isOverdue(c.dueDate) ? 'text-danger' : ''}">${c.dueDate ? formatDate(c.dueDate) : '-'}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
            <td>${c.lastInvoiceStatus ? `<span class="badge ${getInvoiceStatusBadge(c.lastInvoiceStatus)}">${getInvoiceStatusLabel(c.lastInvoiceStatus)}</span>` : '<span class="badge badge-secondary">Sem fatura</span>'}</td>
            <td>
                <button class="btn-link" onclick="editClient('${c.id}')">Editar</button>
                <button class="btn-link btn-link-danger" onclick="deleteClient('${c.id}')">Excluir</button>
            </td>
        </tr>
    `).join('');
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

    loadPlanOptions();

    if (client) {
        form.companyName.value = client.companyName || '';
        form.cnpj.value = client.cnpj || '';
        form.contactName.value = client.contactName || '';
        form.email.value = client.email || '';
        form.phone.value = client.phone || '';
        form.planId.value = client.planId || '';
        form.recurrence.value = client.recurrence || 'MONTHLY';
        form.dueDate.value = client.dueDate ? client.dueDate.split('T')[0] : '';
    }

    document.getElementById('clientModal').classList.remove('hidden');
}

async function loadPlanOptions() {
    if (plans.length === 0) {
        try {
            const res = await apiRequest('/api/plans');
            if (res.success) plans = res.data;
        } catch (e) { }
    }

    const select = document.getElementById('clientPlanSelect');
    select.innerHTML = '<option value="">Selecione um plano</option>' +
        plans.filter(p => p.isActive).map(p => `<option value="${p.id}">${escapeHtml(p.name)} - ${formatCurrency(p.basePrice)}</option>`).join('');
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
        cnpj: form.cnpj.value || null,
        contactName: form.contactName.value,
        email: form.email.value,
        phone: form.phone.value || null,
        planId: form.planId.value,
        recurrence: form.recurrence.value,
        dueDate: form.dueDate.value || null,
        password: form.password.value || null
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

async function deleteClient(id) {
    if (!confirm('Excluir este cliente?')) return;

    try {
        const res = await apiRequest(`/api/clients/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Cliente excluido!', 'success');
            loadClients();
        }
    } catch (e) {
        showToast('Erro ao excluir cliente', 'error');
    }
}

// Commissions
async function loadCommissions() {
    const month = document.getElementById('commMonthFilter').value;
    const year = document.getElementById('commYearFilter').value;

    try {
        const [listRes, summaryRes] = await Promise.all([
            apiRequest(`/api/commissions?month=${month}&year=${year}`),
            apiRequest(`/api/commissions/summary?month=${month}&year=${year}`)
        ]);

        if (summaryRes.success) {
            document.getElementById('commPendingMonthly').textContent = formatCurrency(summaryRes.data.pending || 0);
            document.getElementById('commPaid').textContent = formatCurrency(summaryRes.data.paid || 0);
            document.getElementById('commTotal').textContent = formatCurrency(summaryRes.data.total || 0);
        }

        if (listRes.success) {
            renderCommissions(listRes.data);
        }
    } catch (e) {
        showToast('Erro ao carregar comissoes', 'error');
    }
}

function renderCommissions(commissions) {
    const tbody = document.getElementById('commissionsTable');

    if (commissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray">Nenhuma comissao encontrada para este periodo</td></tr>';
        return;
    }

    tbody.innerHTML = commissions.map(c => `
        <tr>
            <td>${c.periodMonth}/${c.periodYear}</td>
            <td>${escapeHtml(c.clientName || '-')}</td>
            <td><span class="badge badge-secondary">${escapeHtml(c.tierName || '-')}</span></td>
            <td>${formatCurrency(c.monthlyCommission || 0)}</td>
            <td>${formatCurrency(c.setupCommission || 0)}</td>
            <td class="font-semibold">${formatCurrency(c.totalCommission)}</td>
            <td><span class="badge ${c.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${c.status === 'PAID' ? 'Pago' : 'Pendente'}</span></td>
            <td>${c.paidAt ? formatDate(c.paidAt) : '-'}</td>
        </tr>
    `).join('');
}

// Pricing
async function loadPricing() {
    try {
        const [plansRes, modulesRes, tiersRes, resourcesRes] = await Promise.all([
            apiRequest('/api/plans'),
            apiRequest('/api/plans/modules/prices'),
            apiRequest('/api/commission-tiers'),
            apiRequest('/api/resource-prices')
        ]);

        if (plansRes.success) {
            plans = plansRes.data;
            globalPlans = plans.filter(p => !p.ownerId && p.isActive);
            myPlans = plans.filter(p => p.ownerId && p.isActive);
            renderGlobalPlans();
            renderMyPlans();
            populateBasePlanSelect();
        }

        if (modulesRes.success) {
            modulePrices = modulesRes.data.filter(m => m.isVisible);
            renderModulesGrid();
        }

        if (tiersRes.success) {
            tiersData = tiersRes.data;
            renderTiersDisplay();
        }

        if (resourcesRes.success) {
            resourcePrices = resourcesRes.data;
            renderResourcePrices();
        }
    } catch (e) {
        showToast('Erro ao carregar precos', 'error');
    }
}

function renderGlobalPlans() {
    const container = document.getElementById('globalPlansGrid');
    container.innerHTML = globalPlans.map(p => renderPricingCard(p, false)).join('');
}

function renderMyPlans() {
    const container = document.getElementById('myPlansGrid');
    if (myPlans.length === 0) {
        container.innerHTML = '<div class="text-center text-gray py-4 col-span-3">Nenhum plano personalizado criado</div>';
        return;
    }
    container.innerHTML = myPlans.map(p => renderPricingCard(p, true)).join('');
}

function renderPricingCard(plan, isOwn) {
    const users = plan.usersIncluded || plan.resources?.users || 1;
    const queues = plan.queuesIncluded || plan.resources?.queues || 1;
    const connections = plan.connectionsIncluded || plan.resources?.connections || 1;
    const commission = partnerData?.tier?.percentage || 15;

    return `
        <div class="pricing-card">
            <div class="pricing-card-header">
                <div class="pricing-card-name">${escapeHtml(plan.name)}</div>
                <div class="pricing-card-price">${formatCurrency(plan.basePrice)}<span class="pricing-card-price-sub">/mes</span></div>
            </div>
            <div class="pricing-card-resources">
                <span class="pricing-card-resource">${users} usuarios</span>
                <span class="pricing-card-resource">${queues} filas</span>
                <span class="pricing-card-resource">${connections} conexoes</span>
            </div>
            <div class="pricing-card-info">
                <div class="pricing-card-row">
                    <span>Taxa de ativacao (1x)</span>
                    <span>${formatCurrency(plan.setupFee || 0)}</span>
                </div>
                <div class="pricing-card-row">
                    <span>Taxa para pagamento unico</span>
                    <span>${formatCurrency((plan.setupFee || 0) + (plan.basePrice || 0) * 12 * 0.85)}</span>
                </div>
                <div class="pricing-card-row">
                    <span>Comissao por venda (${commission}%)</span>
                    <span class="pricing-card-commission">${formatCurrency((plan.basePrice || 0) * commission / 100)}</span>
                </div>
            </div>
            ${isOwn ? `
                <div class="plan-card-actions">
                    <button class="btn-link" onclick="editPartnerPlan('${plan.id}')">Editar</button>
                    <button class="btn-link btn-link-danger" onclick="deletePartnerPlan('${plan.id}')">Excluir</button>
                </div>
            ` : ''}
        </div>
    `;
}

function renderModulesGrid() {
    const container = document.getElementById('modulesGrid');
    container.innerHTML = modulePrices.map(m => `
        <div class="module-card">
            <div class="module-card-icon">&#x1F4E6;</div>
            <div class="module-card-name">${escapeHtml(m.label)}</div>
            <div class="module-card-price">+ ${formatCurrency(m.price)}</div>
        </div>
    `).join('');
}

function renderTiersDisplay() {
    const container = document.getElementById('tiersDisplay');
    const currentTier = partnerData?.tier?.id;

    container.innerHTML = tiersData.filter(t => t.isActive).map(t => `
        <div class="tier-display-card ${t.id === currentTier ? 'active' : ''}">
            <div class="tier-display-name">${escapeHtml(t.name)}</div>
            <div class="tier-display-percentage">${t.percentage}%</div>
            <div class="tier-display-range">${t.minClients}${t.maxClients ? '-' + t.maxClients : '+'} clientes</div>
        </div>
    `).join('');
}

function renderResourcePrices() {
    const tbody = document.getElementById('resourcePricesTable');
    const labels = {
        whatsappUnofficial: 'WhatsApp Nao Oficial (por conexao)',
        whatsappOfficial: 'WhatsApp Oficial / WABA (por conexao)',
        instagram: 'Instagram (por conexao)',
        user: 'Usuario adicional (por usuario)',
        queue: 'Fila adicional (por fila)'
    };

    tbody.innerHTML = resourcePrices.map(r => `
        <tr>
            <td>${labels[r.key] || r.key}</td>
            <td class="text-right">${formatCurrency(r.price)}</td>
        </tr>
    `).join('');
}

function populateBasePlanSelect() {
    const select = document.getElementById('basePlanSelect');
    select.innerHTML = '<option value="">Selecione um plano base</option>' +
        globalPlans.map(p => `<option value="${p.id}">${escapeHtml(p.name)} - ${formatCurrency(p.basePrice)}</option>`).join('');
}

function showPartnerPlanModal(plan = null) {
    const form = document.getElementById('partnerPlanForm');
    form.reset();
    document.getElementById('partnerPlanFormId').value = plan?.id || '';
    document.getElementById('partnerPlanModalTitle').textContent = plan ? 'Editar Plano' : 'Criar Plano Personalizado';

    if (plan) {
        form.basePlanId.value = plan.basePlanId || '';
        form.name.value = plan.name || '';
        form.priceAddition.value = plan.priceAddition || 0;
        form.setupAddition.value = plan.setupAddition || 0;
    }

    document.getElementById('partnerPlanModal').classList.remove('hidden');
}

function editPartnerPlan(id) {
    const plan = myPlans.find(p => p.id === id);
    if (plan) showPartnerPlanModal(plan);
}

async function savePartnerPlan(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('partnerPlanFormId').value;

    const data = {
        basePlanId: form.basePlanId.value,
        name: form.name.value,
        priceAddition: parseFloat(form.priceAddition.value) || 0,
        setupAddition: parseFloat(form.setupAddition.value) || 0
    };

    try {
        const url = id ? `/api/plans/partner/${id}` : '/api/plans/partner';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Plano atualizado!' : 'Plano criado!', 'success');
            closeModal('partnerPlanModal');
            loadPricing();
        } else {
            showToast(res.message || 'Erro ao salvar', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar plano', 'error');
    }
}

async function deletePartnerPlan(id) {
    if (!confirm('Excluir este plano?')) return;

    try {
        const res = await apiRequest(`/api/plans/partner/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Plano excluido!', 'success');
            loadPricing();
        }
    } catch (e) {
        showToast('Erro ao excluir plano', 'error');
    }
}

// Proposals
async function loadProposals() {
    try {
        const [proposalsRes, plansRes, leadsRes] = await Promise.all([
            apiRequest('/api/pdf/proposals'),
            apiRequest('/api/plans'),
            apiRequest('/api/funnel/leads')
        ]);

        if (proposalsRes.success) {
            renderProposalsTable(proposalsRes.data);
        }

        if (plansRes.success) {
            plans = plansRes.data;
            globalPlans = plans.filter(p => !p.ownerId && p.isActive);
            renderProposalPlansGrid();
        }

        if (leadsRes.success) {
            leads = leadsRes.data;
            populateLeadSelect();
        }

        renderProposalModulesGrid();
    } catch (e) {
        showToast('Erro ao carregar propostas', 'error');
    }
}

function renderProposalsTable(proposals) {
    const tbody = document.getElementById('proposalsTable');

    if (proposals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray">Nenhuma proposta gerada</td></tr>';
        return;
    }

    tbody.innerHTML = proposals.map(p => `
        <tr>
            <td class="font-mono text-primary">${escapeHtml(p.proposalCode || p.id?.substring(0, 8))}</td>
            <td>${escapeHtml(p.planName || '-')}</td>
            <td>${escapeHtml(p.leadName || '-')}</td>
            <td>${formatDate(p.createdAt)}</td>
            <td>
                <button class="btn-link" onclick="downloadProposal('${p.id}')">Baixar</button>
            </td>
        </tr>
    `).join('');
}

function renderProposalPlansGrid() {
    const container = document.getElementById('proposalPlansGrid');
    container.innerHTML = globalPlans.map(p => `
        <div class="pricing-card ${selectedPlan?.id === p.id ? 'selected' : ''}" onclick="selectPlanForProposal('${p.id}')">
            <div class="pricing-card-header">
                <div class="pricing-card-name">${escapeHtml(p.name)}</div>
                <div class="pricing-card-price">${formatCurrency(p.basePrice)}<span class="pricing-card-price-sub">/mes</span></div>
            </div>
            <div class="pricing-card-info">
                <div class="pricing-card-row">
                    <span>Taxa de setup</span>
                    <span>${formatCurrency(p.setupFee || 0)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function selectPlanForProposal(planId) {
    selectedPlan = globalPlans.find(p => p.id === planId);
    renderProposalPlansGrid();
    updateProposalSummary();
}

function renderProposalModulesGrid() {
    const container = document.getElementById('proposalModulesGrid');
    if (modulePrices.length === 0) {
        container.innerHTML = '<div class="text-gray">Carregando modulos...</div>';
        return;
    }

    container.innerHTML = modulePrices.map(m => `
        <label class="module-checkbox" onclick="toggleModule(this)">
            <input type="checkbox" name="module_${m.moduleKey}" value="${m.price}">
            <span class="module-checkbox-icon">&#x1F4E6;</span>
            <span class="module-checkbox-info">
                <span class="module-checkbox-name">${escapeHtml(m.label)}</span>
                <span class="module-checkbox-price">+ ${formatCurrency(m.price)}/mes</span>
            </span>
        </label>
    `).join('');
}

function toggleModule(el) {
    el.classList.toggle('checked');
    updateProposalSummary();
}

function populateLeadSelect() {
    const select = document.getElementById('propLeadSelect');
    select.innerHTML = '<option value="">- Nenhum lead -</option>' +
        leads.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
}

function changeResource(type, delta) {
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    const inputId = 'prop' + capitalizedType;
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    updateProposalSummary();
}

function updateProposalSummary() {
    if (!selectedPlan) {
        document.getElementById('summaryPlanPrice').textContent = 'R$ 0,00/mes';
        document.getElementById('summaryMonthlyTotal').textContent = 'R$ 0,00';
        document.getElementById('summarySetupFee').textContent = 'R$ 0,00';
        document.getElementById('summaryCommission').textContent = 'R$ 0,00/mes';
        document.getElementById('summaryTotalSetup').textContent = 'R$ 0,00';
        return;
    }

    let monthlyTotal = selectedPlan.basePrice || 0;
    let setupFee = selectedPlan.setupFee || 0;

    document.querySelectorAll('.module-checkbox.checked input').forEach(cb => {
        monthlyTotal += parseFloat(cb.value) || 0;
    });

    const resourceMap = {
        whatsappUnofficial: 'WhatsappUnofficial',
        whatsappOfficial: 'WhatsappOfficial',
        instagram: 'Instagram',
        user: 'User',
        queue: 'Queue'
    };

    Object.keys(resourceMap).forEach(rid => {
        const cap = resourceMap[rid];
        const qty = parseInt(document.getElementById('prop' + cap)?.value) || 0;
        const price = resourcePrices.find(r => r.key === rid)?.price || 0;
        const total = qty * price;
        monthlyTotal += total;
        const totalEl = document.getElementById('total' + cap);
        if (totalEl) totalEl.textContent = formatCurrency(total);
    });

    const setupExtra = parseFloat(document.getElementById('propSetupExtra')?.value) || 0;
    const totalSetup = setupFee + setupExtra;

    const commission = partnerData?.tier?.percentage || 15;
    const monthlyCommission = monthlyTotal * commission / 100;

    document.getElementById('summaryPlanPrice').textContent = formatCurrency(selectedPlan.basePrice) + '/mes';
    document.getElementById('summaryMonthlyTotal').textContent = formatCurrency(monthlyTotal);
    document.getElementById('summarySetupFee').textContent = formatCurrency(setupFee);
    document.getElementById('summaryCommission').textContent = formatCurrency(monthlyCommission) + '/mes';
    document.getElementById('summaryTotalSetup').textContent = formatCurrency(totalSetup);
}

async function generateProposalPDF() {
    if (!selectedPlan) {
        showToast('Selecione um plano primeiro', 'warning');
        return;
    }

    const modules = [];
    document.querySelectorAll('.module-checkbox.checked input').forEach(cb => {
        modules.push(cb.name.replace('module_', ''));
    });

    const data = {
        planId: selectedPlan.id,
        modules,
        extraWhatsappUnofficial: parseInt(document.getElementById('propWhatsappUnofficial')?.value) || 0,
        extraWhatsappOfficial: parseInt(document.getElementById('propWhatsappOfficial')?.value) || 0,
        extraInstagram: parseInt(document.getElementById('propInstagram')?.value) || 0,
        extraUsers: parseInt(document.getElementById('propUser')?.value) || 0,
        extraQueues: parseInt(document.getElementById('propQueue')?.value) || 0,
        setupFeeExtra: parseFloat(document.getElementById('propSetupExtra')?.value) || 0,
        customPlanName: document.getElementById('propCustomPlanName')?.value || null,
        leadId: document.getElementById('propLeadSelect')?.value || null,
        savePlan: !document.getElementById('propSavePlan')?.checked
    };

    try {
        const res = await apiRequest('/api/pdf/plan', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (res.success) {
            showToast('Proposta gerada!', 'success');
            if (res.data.downloadUrl) {
                window.open(res.data.downloadUrl, '_blank');
            }
            loadProposals();
        } else {
            showToast(res.message || 'Erro ao gerar proposta', 'error');
        }
    } catch (e) {
        showToast('Erro ao gerar proposta', 'error');
    }
}

async function savePlanOnly() {
    if (!selectedPlan) {
        showToast('Selecione um plano primeiro', 'warning');
        return;
    }

    const customName = document.getElementById('propCustomPlanName')?.value;
    if (!customName) {
        showToast('Informe o nome do plano personalizado', 'warning');
        return;
    }

    const data = {
        basePlanId: selectedPlan.id,
        name: customName,
        priceAddition: 0,
        setupAddition: parseFloat(document.getElementById('propSetupExtra')?.value) || 0
    };

    try {
        const res = await apiRequest('/api/plans/partner', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (res.success) {
            showToast('Plano salvo!', 'success');
        } else {
            showToast(res.message || 'Erro ao salvar plano', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar plano', 'error');
    }
}

function downloadProposal(id) {
    window.open(`/api/pdf/proposals/${id}/download`, '_blank');
}

// Profile
async function loadProfile() {
    try {
        const res = await apiRequest('/api/auth/me');
        if (res.success) {
            const user = res.data;
            document.getElementById('profileName').textContent = user.name || user.email;
            document.getElementById('profileEmail').textContent = user.email || '-';
            document.getElementById('profilePhone').textContent = user.phone || '-';
            document.getElementById('profileTier').textContent = partnerData?.tier?.name || 'Indicador';
        }
    } catch (e) {
        showToast('Erro ao carregar perfil', 'error');
    }
}

function editProfile() {
    document.getElementById('profileFormName').value = document.getElementById('profileName').textContent;
    document.getElementById('profileFormPhone').value = document.getElementById('profilePhone').textContent === '-' ? '' : document.getElementById('profilePhone').textContent;
    document.getElementById('profileModal').classList.remove('hidden');
}

async function saveProfile(e) {
    e.preventDefault();
    const form = e.target;

    try {
        const res = await apiRequest('/api/partners/me', {
            method: 'PUT',
            body: JSON.stringify({
                name: form.name.value,
                phone: form.phone.value || null
            })
        });

        if (res.success) {
            showToast('Perfil atualizado!', 'success');
            closeModal('profileModal');
            loadProfile();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar perfil', 'error');
    }
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

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.add('hidden');
    }
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
        funnel: 'Funil de Vendas',
        clients: 'Meus Clientes',
        commissions: 'Comissoes',
        pricing: 'Tabela de Precos',
        proposals: 'Propostas',
        profile: 'Meu Perfil'
    };
    return titles[section] || 'Dashboard';
}
