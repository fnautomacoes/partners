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

// ---- Shared module visuals (emoji + color), keyed by real backend moduleKey ----
const MODULE_VISUALS = {
    useWhatsapp:     { emoji: '💬', bg: '#dcfce7', text: '#166534' },
    useFacebook:     { emoji: '📘', bg: '#dbeafe', text: '#1e40af' },
    useInstagram:    { emoji: '📷', bg: '#fce7f3', text: '#9d174d' },
    useCampaigns:    { emoji: '📣', bg: '#ffedd5', text: '#9a3412' },
    useSchedules:    { emoji: '📅', bg: '#dbeafe', text: '#1e40af' },
    useInternalChat: { emoji: '💬', bg: '#ede9fe', text: '#5b21b6' },
    useExternalApi:  { emoji: '🔌', bg: '#fee2e2', text: '#991b1b' },
    useKanban:       { emoji: '📋', bg: '#ffedd5', text: '#9a3412' },
    usePixel:        { emoji: '🎯', bg: '#dbeafe', text: '#1e40af' },
    useAI:           { emoji: '🤖', bg: '#dbeafe', text: '#1e40af' },
    useGPT:          { emoji: '🧠', bg: '#fce7f3', text: '#9d174d' },
    useGPTA:         { emoji: '🧠', bg: '#fce7f3', text: '#9d174d' },
    useCRM:          { emoji: '🛍️', bg: '#fce7f3', text: '#9d174d' },
    useFLOW:         { emoji: '🔀', bg: '#dbeafe', text: '#1e40af' },
    useBTN:          { emoji: '⚪', bg: '#f3f4f6', text: '#4b5563' },
    useCALL:         { emoji: '📞', bg: '#fce7f3', text: '#9d174d' },
    useCHAMA:        { emoji: '📞', bg: '#fce7f3', text: '#9d174d' },
    useVOIP:         { emoji: '📞', bg: '#dbeafe', text: '#1e40af' },
    useTYPE:         { emoji: '🤖', bg: '#fce7f3', text: '#9d174d' },
    useZAIA:         { emoji: '🤖', bg: '#dbeafe', text: '#1e40af' },
    useDIFY:         { emoji: '🤖', bg: '#ede9fe', text: '#5b21b6' },
    useWABAOWN:      { emoji: '✅', bg: '#dcfce7', text: '#166534' },
    useWABAAINI:     { emoji: '✅', bg: '#dcfce7', text: '#166534' },
    usePUSH:         { emoji: '📱', bg: '#dbeafe', text: '#1e40af' },
    useProducts:     { emoji: '🛒', bg: '#fef9c3', text: '#854d0e' },
    useServices:     { emoji: '🧰', bg: '#fef9c3', text: '#854d0e' },
    useWEBCHAT:      { emoji: '💬', bg: '#e0f2fe', text: '#0369a1' },
    useInternal:     { emoji: '💬', bg: '#ede9fe', text: '#5b21b6' },
    usePerfex:       { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
    useRD:           { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
    useCV:           { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
    useIXC:          { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
    useHS:           { emoji: '🗄️', bg: '#f3f4f6', text: '#4b5563' },
    useNNN:          { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
    useHUB:          { emoji: '🔗', bg: '#e0e7ff', text: '#3730a3' },
};
const DEFAULT_MODULE_VISUAL = { emoji: '🔧', bg: '#f3f4f6', text: '#4b5563' };

function moduleVisual(moduleKey) {
    return MODULE_VISUALS[moduleKey] || DEFAULT_MODULE_VISUAL;
}

function ptIconPerson(size = 13, color = '#374151') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></svg>`;
}
function ptIconDoc(size = 13, color = '#374151') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="M6 2h8l6 6v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm7 1.5V8h4.5L13 3.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h5v1.5H8V18z"/></svg>`;
}
function ptIconConn(size = 13, color = '#374151') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`;
}

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

    document.getElementById('dashTierName').textContent = data.tier || 'Indicador';
    document.getElementById('dashTierPercentage').textContent = (data.tierPercentage || 15) + '%';

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
    const users = plan.usersIncluded || plan.resources?.users || plan.users || 1;
    const queues = plan.queuesIncluded || plan.resources?.queues || plan.queues || 1;
    const wapp = plan.resources?.connectionsWhatsappUnofficial || 0;
    const waba = plan.resources?.connectionsWhatsappOfficial || 0;
    const insta = plan.resources?.connectionsInstagram || 0;
    const commission = Number(partnerData?.tierPercentage) || 15;
    const planModules = getPlanModulesPartner(plan);
    const setupFee = plan.setupFee || 0;

    // BASE resources list
    const baseItems = [
        `<span class="pt-base-item pt-base-half">${ptIconPerson()} ${users} usuário${users !== 1 ? 's' : ''}</span>`,
        `<span class="pt-base-item pt-base-half">${ptIconDoc()} ${queues} fila${queues !== 1 ? 's' : ''}</span>`,
    ];
    const connItems = [];
    if (wapp > 0) connItems.push(`${wapp}× WApp Não Oficial`);
    if (waba > 0) connItems.push(`${waba}× WApp Oficial`);
    if (insta > 0) connItems.push(`${insta}× Instagram`);
    if (connItems.length === 0) connItems.push('1× WApp Não Oficial');
    const connHtml = connItems.map(c => `<span class="pt-base-item pt-base-full">${ptIconConn()} ${c}</span>`).join('');

    // Header badge / subtitle
    let headBadge, subtitle;
    if (isOwn) {
        headBadge = '';
        subtitle = plan.basePlan?.name ? `<span class="pt-plan-based">Baseado em: ${escapeHtml(plan.basePlan.name)}</span>` : '';
    } else {
        headBadge = plan.pacoticketPlanId ? `<span class="pt-plan-badge">PacoTicket #${plan.pacoticketPlanId}</span>` : '';
        subtitle = '';
    }

    // Setup block
    let setupHtml;
    if (isOwn) {
        const baseSetup = plan.basePlan?.setupFee || 0;
        const addition = setupFee - baseSetup;
        setupHtml = `
            <div class="pt-setup-row"><span>Setup base do plano</span><span>${formatCurrency(baseSetup)}</span></div>
            <div class="pt-setup-row"><span>Seu acréscimo de setup</span><span class="pt-setup-add">+ ${formatCurrency(addition)}</span></div>
            <div class="pt-setup-row pt-setup-total-row"><span>Total setup (cobrado 1×)</span><span class="pt-setup-total">${formatCurrency(setupFee)}</span></div>`;
    } else {
        setupHtml = `
            <div class="pt-setup-row"><span>Taxa de setup (cobrada 1×)</span><span class="pt-setup-total">${formatCurrency(setupFee)}</span></div>`;
    }

    const commissionValue = (plan.basePrice || 0) * commission / 100;

    const footer = isOwn ? `
        <div class="pt-plan-actions">
            <a href="#" class="pt-link-edit" onclick="editPartnerPlan('${plan.id}'); return false;">Editar</a>
            <a href="#" class="pt-link-delete" onclick="deletePartnerPlan('${plan.id}'); return false;">Excluir</a>
        </div>` : `
        <a href="#" class="pt-create-from-base" onclick="createPlanFromBase('${plan.id}'); return false;">+ Criar plano baseado neste</a>`;

    return `
        <div class="pt-plan-card">
            <div class="pt-plan-header">
                <div class="pt-plan-title">
                    <span class="pt-plan-name">${escapeHtml(plan.name)}</span>
                    ${subtitle}
                    ${headBadge}
                </div>
                <div class="pt-plan-price">${formatCurrency(plan.basePrice)}<span class="pt-plan-price-sub">/mês</span></div>
            </div>

            <div class="pt-plan-block-label">BASE</div>
            <div class="pt-plan-base">
                ${baseItems.join('')}
                ${connHtml}
            </div>

            ${planModules.length > 0 ? `
            <div class="pt-plan-block-label">MÓDULOS INCLUÍDOS</div>
            <div class="pt-plan-modules">
                ${planModules.map(m => { const v = moduleVisual(m.key); return `<span class="pt-module-tag" style="background-color: ${v.bg}; color: ${v.text};">${v.emoji} ${escapeHtml(m.label)}</span>`; }).join('')}
            </div>
            ` : ''}

            <div class="pt-plan-setup">
                ${setupHtml}
            </div>

            <div class="pt-commission-box">
                <div class="pt-commission-label">Sua comissão estimada (${commission}%)</div>
                <div class="pt-commission-value">${formatCurrency(commissionValue)}<span class="pt-commission-sub">/mês</span></div>
                <div class="pt-commission-note">Baseado no seu tier atual &middot; por cliente neste plano</div>
            </div>

            <div class="pt-plan-footer">
                ${footer}
            </div>
        </div>
    `;
}

function getPlanModulesPartner(plan) {
    const modules = [];
    modulePrices.forEach(m => {
        if (plan[m.moduleKey] === true || plan.modules?.[m.moduleKey] === true) {
            modules.push({ label: m.label, key: m.moduleKey });
        }
    });
    return modules;
}

function createPlanFromBase(basePlanId) {
    showPartnerPlanModal();
    const sel = document.getElementById('basePlanSelect');
    if (sel) sel.value = basePlanId;
}

function renderModulesGrid() {
    const container = document.getElementById('modulesGrid');
    container.innerHTML = modulePrices.map(m => {
        const v = moduleVisual(m.moduleKey);
        return `
        <div class="pt-module-card">
            <div class="pt-module-icon" style="background-color: ${v.bg}; color: ${v.text};">${v.emoji}</div>
            <div class="pt-module-name">${escapeHtml(m.label)}</div>
            ${m.description ? `<div class="pt-module-desc">${escapeHtml(m.description)}</div>` : ''}
            <div class="pt-module-prices">
                <div class="pt-module-price-row"><span>Mensalidade</span><span class="pt-module-price-month">${formatCurrency(m.price)}</span></div>
                ${m.setupFee > 0 ? `<div class="pt-module-price-row"><span>setup (1x)</span><span class="pt-module-price-setup">${formatCurrency(m.setupFee)}</span></div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function tierSupportText(mode) {
    return mode === 'PACOTICKET_DIRECT'
        ? 'PacoTicket atende o cliente diretamente'
        : 'Você é o ponto de contato do cliente';
}

// Resolve o tier atual do parceiro a partir de tiersData (DB), de forma robusta:
// 1) por nome (partnerData.tier); 2) pela faixa de clientes ativos; 3) tier de entrada.
function resolveCurrentTier() {
    const active = (tiersData || []).filter(t => t.isActive).sort((a, b) => a.order - b.order);
    if (active.length === 0) return null;

    const name = partnerData?.tier;
    let tier = name ? active.find(t => t.name === name) : null;

    if (!tier) {
        const c = partnerData?.activeClients || 0;
        active.forEach(t => {
            const min = t.minClients;
            const max = t.maxClients == null ? Infinity : t.maxClients;
            if (c >= min && c <= max) tier = t;
        });
    }

    return tier || active[0];
}

function renderTiersDisplay() {
    const container = document.getElementById('tiersDisplay');
    const activeTiers = tiersData.filter(t => t.isActive).sort((a, b) => a.order - b.order);
    const currentTier = resolveCurrentTier();

    container.innerHTML = activeTiers.map(t => {
        const range = `${t.minClients}${t.maxClients ? '-' + t.maxClients : '+'} clientes`;
        const isCurrent = currentTier && t.id === currentTier.id;
        return `
        <div class="pt-tier-card ${isCurrent ? 'active' : ''}">
            <div class="pt-tier-range">${range}</div>
            <div class="pt-tier-name">${escapeHtml(t.name)}</div>
            <div class="pt-tier-pct">${t.percentage}%</div>
            <div class="pt-tier-support">Suporte: ${tierSupportText(t.supportMode)}</div>
            ${t.notes ? `<div class="pt-tier-notes">${escapeHtml(t.notes)}</div>` : ''}
            ${isCurrent ? `<div class="pt-tier-current">Seu tier atual</div>` : ''}
        </div>`;
    }).join('');

    renderTierProgress(activeTiers, currentTier);
    renderCommissionInfoBoxes(currentTier);
}

function renderTierProgress(activeTiers, currentTier) {
    const el = document.getElementById('tierProgress');
    if (!el) return;
    const activeClients = partnerData?.activeClients || 0;
    const idx = currentTier ? activeTiers.findIndex(t => t.id === currentTier.id) : -1;
    const nextTier = idx >= 0 ? activeTiers[idx + 1] : null;

    if (!nextTier) {
        el.innerHTML = `
        <div class="pt-progress-block">
            <div class="pt-progress-labels"><span>${activeClients} clientes ativos</span><span>Tier máximo atingido</span></div>
            <div class="pt-progress-bar"><div class="pt-progress-fill" style="width:100%"></div></div>
        </div>`;
        return;
    }

    const nextMin = nextTier.minClients;
    const remaining = Math.max(0, nextMin - activeClients);
    const pct = Math.min(100, nextMin > 0 ? (activeClients / nextMin) * 100 : 100);
    el.innerHTML = `
        <div class="pt-progress-block">
            <div class="pt-progress-labels"><span>${activeClients} clientes ativos</span><span>Faltam ${remaining} para próximo tier</span></div>
            <div class="pt-progress-bar"><div class="pt-progress-fill" style="width:${pct}%"></div></div>
            <div class="pt-progress-caption">${nextMin} clientes &middot; próximo tier</div>
        </div>`;
}

function renderCommissionInfoBoxes(currentTier) {
    const el = document.getElementById('commissionInfoBoxes');
    if (!el) return;
    const tierName = currentTier?.name || 'Indicador';
    const duration = currentTier ? currentTier.durationMonths : 0;
    const durationText = duration > 0
        ? `gera comissão por <strong>${duration} ${duration === 1 ? 'mês' : 'meses'}</strong> a partir do cadastro de cada cliente. Após esse período, o cliente não gera mais comissão para você.`
        : `gera comissão por <strong>tempo indeterminado</strong> a partir do cadastro de cada cliente.`;

    el.innerHTML = `
        <div class="pt-info-box pt-info-blue">
            <div class="pt-info-title">&#128161; Quando você recebe comissão de setup</div>
            <div class="pt-info-text">Você recebe comissão de ativação <strong>somente quando define um acréscimo de setup</strong> no momento da criação do plano personalizado. Em todas as demais ativações, o comissionamento é <strong>apenas sobre a mensalidade</strong>, quando aplicável ao seu tier.</div>
        </div>
        <div class="pt-info-box pt-info-yellow">
            <div class="pt-info-title">&#9201;&#65039; Por quanto tempo você recebe comissão &mdash; Tier ${escapeHtml(tierName)}</div>
            <div class="pt-info-text">Seu tier atual ${durationText}</div>
            <div class="pt-info-warn">&#9888;&#65039; Clientes adquiridos enquanto você está neste tier não gerarão comissão após você fazer upgrade de tier. A regra de comissão é travada na época do cadastro de cada cliente &mdash; o upgrade não muda retroativamente as regras dos clientes já cadastrados.</div>
        </div>`;
}

function renderResourcePrices() {
    const tbody = document.getElementById('resourcePricesTable');
    tbody.innerHTML = resourcePrices.map(r => `
        <tr>
            <td>${escapeHtml(r.label || r.key)}</td>
            <td class="text-right pt-infra-price">${formatCurrency(r.price)}</td>
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
let proposalsData = [];

const API_RESOURCE_FIELD = {
    whatsappUnofficial: 'extraWhatsappUnofficial',
    whatsappOfficial: 'extraWhatsappOfficial',
    instagram: 'extraInstagram',
    user: 'extraUsers',
    queue: 'extraQueues',
};

async function loadProposals() {
    try {
        const [proposalsRes, plansRes, leadsRes, modulesRes, resourcesRes, tiersRes] = await Promise.all([
            apiRequest('/api/pdf/proposals'),
            apiRequest('/api/plans'),
            apiRequest('/api/funnel/leads'),
            apiRequest('/api/plans/modules/prices'),
            apiRequest('/api/resource-prices'),
            apiRequest('/api/commission-tiers')
        ]);

        if (tiersRes.success) {
            tiersData = tiersRes.data;
        }

        if (proposalsRes.success) {
            proposalsData = proposalsRes.data;
            renderProposalsTable(proposalsData);
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

        if (modulesRes.success) {
            modulePrices = modulesRes.data.filter(m => m.isVisible);
        }

        if (resourcesRes.success) {
            resourcePrices = resourcesRes.data;
            renderProposalResources();
        }

        renderProposalModulesGrid();
        updateProposalSummary();
    } catch (e) {
        showToast('Erro ao carregar propostas', 'error');
    }
}

function proposalLeadLabel(p) {
    return p.leadName ? escapeHtml(p.leadName) : '<span class="prop-empty">—</span>';
}

function renderProposalsTable(list) {
    const tbody = document.getElementById('proposalsTable');
    const countEl = document.getElementById('proposalsCount');
    if (countEl) countEl.textContent = `${proposalsData.length} no total`;

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="prop-empty-row">Nenhuma proposta gerada</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(p => `
        <tr>
            <td class="prop-code">${escapeHtml(p.proposalCode || p.id?.substring(0, 8))}</td>
            <td class="prop-plan-name">${escapeHtml(p.planName || '-')}</td>
            <td>${proposalLeadLabel(p)}</td>
            <td class="prop-date">${formatDate(p.createdAt)}</td>
            <td class="text-right">
                <a href="#" class="prop-download" onclick="downloadProposal('${p.id}'); return false;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Baixar
                </a>
            </td>
        </tr>
    `).join('');
}

function filterProposals() {
    const term = (document.getElementById('proposalSearch')?.value || '').trim().toLowerCase();
    if (!term) { renderProposalsTable(proposalsData); return; }
    const filtered = proposalsData.filter(p =>
        (p.proposalCode || '').toLowerCase().includes(term) ||
        (p.leadName || '').toLowerCase().includes(term) ||
        (p.planName || '').toLowerCase().includes(term)
    );
    renderProposalsTable(filtered);
}

function proposalConnections(p) {
    const wapp = p.resources?.connectionsWhatsappUnofficial || 0;
    const waba = p.resources?.connectionsWhatsappOfficial || 0;
    const insta = p.resources?.connectionsInstagram || 0;
    const items = [];
    if (wapp > 0) items.push(`${wapp}× WApp N.Oficial`);
    if (waba > 0) items.push(`${waba}× WApp Oficial`);
    if (insta > 0) items.push(`${insta}× Instagram`);
    if (items.length === 0) items.push('1× WApp N.Oficial');
    return items;
}

function renderProposalPlansGrid() {
    const container = document.getElementById('proposalPlansGrid');
    container.innerHTML = globalPlans.map(p => {
        const users = p.usersIncluded || p.resources?.users || 1;
        const queues = p.queuesIncluded || p.resources?.queues || 1;
        const mods = getPlanModulesPartner(p);
        const sel = selectedPlan?.id === p.id;
        const conns = proposalConnections(p);
        return `
        <div class="prop-plan-card ${sel ? 'selected' : ''}" onclick="selectPlanForProposal('${p.id}')">
            <div class="prop-plan-name">${escapeHtml(p.name)}</div>
            <div class="prop-plan-price">${formatCurrency(p.basePrice)}<span class="prop-plan-price-sub">/mês</span></div>
            <div class="prop-plan-setup">+ ${formatCurrency(p.setupFee || 0)} setup (1×)</div>
            <div class="prop-plan-base">
                <span class="prop-plan-base-item prop-base-half">${ptIconPerson()} ${users} usuário${users !== 1 ? 's' : ''}</span>
                <span class="prop-plan-base-item prop-base-half">${ptIconDoc()} ${queues} fila${queues !== 1 ? 's' : ''}</span>
                ${conns.map(c => `<span class="prop-plan-base-item prop-base-full">${ptIconConn()} ${c}</span>`).join('')}
            </div>
            ${mods.length > 0 ? `
            <div class="prop-plan-block-label">MÓDULOS INCLUÍDOS</div>
            <div class="prop-plan-modules">
                ${mods.map(m => { const v = moduleVisual(m.key); return `<span class="pt-module-tag" style="background-color:${v.bg};color:${v.text};">${v.emoji} ${escapeHtml(m.label)}</span>`; }).join('')}
            </div>` : ''}
            <div class="prop-plan-foot">${sel ? '<span class="prop-plan-selected">✓ Selecionado</span>' : '<span class="prop-plan-select">Selecionar</span>'}</div>
        </div>`;
    }).join('');
}

function selectPlanForProposal(planId) {
    selectedPlan = globalPlans.find(p => p.id === planId);
    renderProposalPlansGrid();
    updateProposalSummary();
}

function renderProposalModulesGrid() {
    const container = document.getElementById('proposalModulesGrid');
    if (!modulePrices || modulePrices.length === 0) {
        container.innerHTML = '<div class="prop-empty">Carregando módulos...</div>';
        return;
    }

    container.innerHTML = modulePrices.map(m => `
        <label class="prop-module-check">
            <span class="prop-module-info">
                <span class="prop-module-name">${escapeHtml(m.label)}</span>
                <span class="prop-module-price">+ ${formatCurrency(m.price)}/mês${m.setupFee > 0 ? ` &middot; setup ${formatCurrency(m.setupFee)}` : ''}</span>
            </span>
            <span class="prop-switch">
                <input type="checkbox" name="module_${m.moduleKey}" value="${m.price}" data-setup="${m.setupFee || 0}" onchange="onModuleToggle(this)">
                <span class="prop-slider"></span>
            </span>
        </label>
    `).join('');
}

function onModuleToggle(input) {
    const label = input.closest('.prop-module-check');
    if (label) label.classList.toggle('checked', input.checked);
    updateProposalSummary();
}

function renderProposalResources() {
    const container = document.getElementById('proposalResourcesGrid');
    if (!container) return;
    const known = Object.keys(API_RESOURCE_FIELD);
    const rows = resourcePrices.filter(r => known.includes(r.key));
    container.innerHTML = rows.map(r => `
        <div class="prop-resource-row">
            <div class="prop-resource-label">
                <span class="prop-resource-name">${escapeHtml(r.label || r.key)}</span>
                <span class="prop-resource-unit">${formatCurrency(r.price)} por unidade/mês</span>
            </div>
            <div class="prop-stepper">
                <button type="button" class="prop-step-btn" onclick="changeResource('${r.key}', -1)">−</button>
                <input type="number" class="prop-step-input" id="propRes_${r.key}" value="0" min="0" oninput="updateProposalSummary()">
                <button type="button" class="prop-step-btn" onclick="changeResource('${r.key}', 1)">+</button>
            </div>
            <span class="prop-resource-total" id="totRes_${r.key}">R$ 0,00</span>
        </div>
    `).join('');
}

function populateLeadSelect() {
    const select = document.getElementById('propLeadSelect');
    select.innerHTML = '<option value="">— Nenhum lead —</option>' +
        leads.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
}

function changeResource(key, delta) {
    const input = document.getElementById('propRes_' + key);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    updateProposalSummary();
}

function updateProposalSummary() {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const commission = Number(partnerData?.tierPercentage) || 15;
    setEl('summaryCommissionPercent', commission);

    // Tier duration warning box (DB-driven)
    const durBox = document.getElementById('propCommissionDuration');
    if (durBox) {
        const tier = resolveCurrentTier();
        const dur = tier ? tier.durationMonths : 0;
        const durText = dur > 0
            ? `Tier atual: comissão por <strong>${dur} ${dur === 1 ? 'mês' : 'meses'}</strong> a partir do cadastro de cada cliente.`
            : `Tier atual: comissão por <strong>tempo indeterminado</strong> a partir do cadastro de cada cliente.`;
        durBox.innerHTML = `
            <div class="prop-info-title">&#9201;&#65039; Por quanto tempo você recebe comissão</div>
            <div class="prop-info-text">${durText}</div>
            <div class="prop-info-text prop-info-warn-line">&#9888;&#65039; Clientes adquiridos neste tier não geram comissão após upgrade de tier. A regra é travada na época do cadastro.</div>`;
    }

    if (!selectedPlan) {
        setEl('summaryPlanLabel', 'Plano base — —');
        setEl('summaryPlanPrice', 'R$ 0,00/mês');
        setEl('summaryMonthlyTotal', 'R$ 0,00');
        setEl('summarySetupFee', 'R$ 0,00');
        setEl('summaryCommission', 'R$ 0,00/mês');
        setEl('summaryTotalSetup', 'R$ 0,00');
        const d = document.getElementById('propSetupExtraDesc');
        if (d) d.innerHTML = 'Adicione sua margem ao setup base do catálogo (R$ 0,00). 100% do acréscimo é sua comissão de ativação.';
        return;
    }

    let monthlyTotal = selectedPlan.basePrice || 0;
    let baseSetup = selectedPlan.setupFee || 0;

    document.querySelectorAll('.prop-module-check.checked input').forEach(cb => {
        monthlyTotal += parseFloat(cb.value) || 0;
        baseSetup += parseFloat(cb.dataset.setup) || 0;
    });

    (resourcePrices || []).forEach(r => {
        if (!API_RESOURCE_FIELD[r.key]) return;
        const qty = parseInt(document.getElementById('propRes_' + r.key)?.value) || 0;
        const total = qty * (r.price || 0);
        monthlyTotal += total;
        baseSetup += qty * (r.setupFee || 0);
        const totalEl = document.getElementById('totRes_' + r.key);
        if (totalEl) totalEl.textContent = formatCurrency(total);
    });

    const setupExtra = parseFloat(document.getElementById('propSetupExtra')?.value) || 0;
    const totalSetup = baseSetup + setupExtra;
    const monthlyCommission = monthlyTotal * commission / 100;

    setEl('summaryPlanLabel', `Plano base — ${selectedPlan.name}`);
    setEl('summaryPlanPrice', formatCurrency(selectedPlan.basePrice) + '/mês');
    setEl('summaryMonthlyTotal', formatCurrency(monthlyTotal));
    setEl('summarySetupFee', formatCurrency(baseSetup));
    setEl('summaryCommission', formatCurrency(monthlyCommission) + '/mês');
    setEl('summaryTotalSetup', formatCurrency(totalSetup));
    const desc = document.getElementById('propSetupExtraDesc');
    if (desc) desc.innerHTML = `Adicione sua margem ao setup base do catálogo (${formatCurrency(baseSetup)}). 100% do acréscimo é sua comissão de ativação.`;
}

// Agrega os números e itens da proposta a partir da seleção atual
function computeProposal() {
    if (!selectedPlan) return null;
    const commission = Number(partnerData?.tierPercentage) || 15;
    let monthly = selectedPlan.basePrice || 0;
    let baseSetup = selectedPlan.setupFee || 0;

    const mods = [];
    document.querySelectorAll('.prop-module-check.checked input').forEach(cb => {
        const key = cb.name.replace('module_', '');
        const price = parseFloat(cb.value) || 0;
        const setup = parseFloat(cb.dataset.setup) || 0;
        monthly += price;
        baseSetup += setup;
        const m = (modulePrices || []).find(x => x.moduleKey === key);
        mods.push({ key, label: m ? m.label : key, price, setup });
    });

    const res = [];
    (resourcePrices || []).forEach(r => {
        if (!API_RESOURCE_FIELD[r.key]) return;
        const qty = parseInt(document.getElementById('propRes_' + r.key)?.value) || 0;
        if (qty > 0) {
            const total = qty * (r.price || 0);
            monthly += total;
            baseSetup += qty * (r.setupFee || 0);
            res.push({ label: r.label || r.key, qty, price: r.price || 0, total });
        }
    });

    const setupExtra = parseFloat(document.getElementById('propSetupExtra')?.value) || 0;
    const totalSetup = baseSetup + setupExtra;
    const monthlyCommission = monthly * commission / 100;
    return { commission, monthly, baseSetup, setupExtra, totalSetup, monthlyCommission, mods, res };
}

function buildProposalHtml(planName, d, cfg) {
    cfg = cfg || {};
    const brand = escapeHtml(cfg.businessName || 'PacoTicket');
    const logo = cfg.logoPdf ? `<img src="${escapeHtml(cfg.logoPdf)}" alt="${brand}" style="max-height:48px">` : `<div style="font-size:22px;font-weight:700;color:#1e3a8a">${brand}</div>`;
    const padH = parseInt(cfg.pdfPaddingHorizontal, 10); const padV = parseInt(cfg.pdfPaddingVertical, 10);
    const pad = `${isNaN(padV) ? 24 : padV}px ${isNaN(padH) ? 24 : padH}px`;
    const row = (label, value, opts = {}) =>
        `<tr><td style="padding:8px 0;color:${opts.muted ? '#6b7280' : '#111827'};${opts.bold ? 'font-weight:700;' : ''}">${label}</td>
         <td style="padding:8px 0;text-align:right;color:${opts.color || '#111827'};${opts.bold ? 'font-weight:700;' : ''}">${value}</td></tr>`;

    const moduleRows = d.mods.map(m => row(escapeHtml(m.label), formatCurrency(m.price) + '/mês', { muted: true })).join('');
    const resourceRows = d.res.map(r => row(`${escapeHtml(r.label)} (${r.qty}×)`, formatCurrency(r.total) + '/mês', { muted: true })).join('');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: ${pad}; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #2563eb; padding-bottom:16px; margin-bottom:24px; }
  .title { font-size:20px; font-weight:700; }
  .sub { color:#6b7280; font-size:13px; margin-top:4px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  .section-title { font-size:12px; font-weight:700; letter-spacing:.05em; color:#6b7280; text-transform:uppercase; margin:24px 0 4px; }
  .total { border-top:2px solid #e5e7eb; }
  .box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 16px; margin-top:24px; }
</style></head><body>
  <div class="head">
    ${logo}
    <div style="text-align:right">
      <div class="title">Proposta Comercial</div>
      <div class="sub">${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
  </div>

  <div class="title">${escapeHtml(planName)}</div>
  <div class="sub">Plano base: ${escapeHtml(selectedPlan.name)}</div>

  <div class="section-title">Mensalidade</div>
  <table>
    ${row('Plano base — ' + escapeHtml(selectedPlan.name), formatCurrency(selectedPlan.basePrice) + '/mês', { muted: true })}
    ${moduleRows}
    ${resourceRows}
    <tr><td colspan="2" style="border-top:2px solid #e5e7eb;padding:0"></td></tr>
    ${row('Total mensal', formatCurrency(d.monthly) + '/mês', { bold: true, color: '#16a34a' })}
  </table>

  <div class="section-title">Taxa de setup (cobrada 1×)</div>
  <table>
    ${row('Setup base do catálogo', formatCurrency(d.baseSetup), { muted: true })}
    ${d.setupExtra > 0 ? row('Acréscimo de setup', '+ ' + formatCurrency(d.setupExtra), { muted: true, color: '#16a34a' }) : ''}
    ${row('Setup total cobrado do cliente', formatCurrency(d.totalSetup), { bold: true, color: '#b45309' })}
  </table>

  <div class="box">
    <div style="font-size:13px;color:#15803d">Comissão estimada (${d.commission}%)</div>
    <div style="font-size:18px;font-weight:700;color:#16a34a">${formatCurrency(d.monthlyCommission)}/mês</div>
  </div>
</body></html>`;
}

async function generateProposalPDF(savePlan = true) {
    if (!selectedPlan) {
        showToast('Selecione um plano primeiro', 'warning');
        return;
    }

    const customName = (document.getElementById('propCustomPlanName')?.value || '').trim();
    if (savePlan && !customName) {
        showToast('Informe o nome do plano personalizado', 'warning');
        return;
    }

    const d = computeProposal();
    const leadId = document.getElementById('propLeadSelect')?.value || null;
    const planName = customName || selectedPlan.name;

    // Configurações de PDF / marca (do banco)
    let cfg = {};
    try {
        const cfgRes = await apiRequest('/api/system-config');
        if (cfgRes.success) cfg = cfgRes.data || {};
    } catch (e) { /* usa defaults */ }

    // "Salvar + PDF": cria o plano personalizado antes de gerar o PDF
    if (savePlan) {
        try {
            const planRes = await apiRequest('/api/plans/partner', {
                method: 'POST',
                body: JSON.stringify({
                    basePlanId: selectedPlan.id,
                    name: customName,
                    priceAddition: (d.monthly || 0) - (selectedPlan.basePrice || 0),
                    setupAddition: d.setupExtra || 0
                })
            });
            if (!planRes.success) {
                showToast(planRes.message || 'Erro ao salvar o plano', 'error');
                return;
            }
        } catch (e) {
            showToast('Erro ao salvar o plano', 'error');
            return;
        }
    }

    const payload = {
        html: buildProposalHtml(planName, d, cfg),
        planName,
        leadId,
        setupFeeBase: d.baseSetup,
        setupFeeExtra: d.setupExtra,
        pdfMarginTop: cfg.pdfMarginTop,
        pdfMarginBottom: cfg.pdfMarginBottom,
        pdfMarginLeft: cfg.pdfMarginLeft,
        pdfMarginRight: cfg.pdfMarginRight
    };

    try {
        // O endpoint retorna o PDF binário (application/pdf), não JSON
        let resp = await fetch('/api/pdf/plan', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (resp.status === 401 && typeof refreshToken === 'function' && await refreshToken()) {
            resp = await fetch('/api/pdf/plan', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!resp.ok) {
            let msg = 'Erro ao gerar proposta';
            try { const j = await resp.json(); msg = j.message || msg; } catch (e) {}
            showToast(msg, 'error');
            return;
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        showToast('Proposta gerada!', 'success');
        loadProposals();
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
            document.getElementById('profileTier').textContent = partnerData?.tier || 'Indicador';
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
