let currentUser = null;
let plans = [];
let myPlans = [];
let clients = [];
let stages = [];
let leads = [];
let resourcePrices = [];
let modulePrices = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth('PARTNER');
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.email.split('@')[0];
    document.getElementById('userAvatar').textContent = currentUser.email[0].toUpperCase();

    setupNavigation();
    setupForms();
    loadDashboard();
});

function setupNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(item.dataset.section);
        });
    });
}

function showSection(section) {
    document.querySelectorAll('.nav-item[data-section]').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${section}`).classList.remove('hidden');

    const titles = {
        dashboard: 'Dashboard',
        clients: 'Meus Clientes',
        funnel: 'Funil de Vendas',
        plans: 'Meus Planos',
        commissions: 'Comissões',
        proposals: 'Propostas PDF',
        simulator: 'Simulador'
    };
    document.getElementById('pageTitle').textContent = titles[section] || section;

    const loaders = {
        dashboard: loadDashboard,
        clients: loadClients,
        funnel: loadFunnel,
        plans: loadPlans,
        commissions: loadCommissions,
        proposals: loadProposals,
        simulator: loadSimulator
    };
    if (loaders[section]) loaders[section]();
}

function setupForms() {
    document.getElementById('clientForm').addEventListener('submit', saveClient);
    document.getElementById('leadForm').addEventListener('submit', saveLead);
    document.getElementById('partnerPlanForm').addEventListener('submit', savePartnerPlan);
    document.getElementById('proposalForm').addEventListener('submit', generateProposal);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);
}

// Dashboard
async function loadDashboard() {
    try {
        const [dashRes, leadsRes] = await Promise.all([
            apiRequest('/api/partners/me/dashboard'),
            apiRequest('/api/funnel/leads')
        ]);

        if (dashRes.success) {
            const d = dashRes.data;
            document.getElementById('statClients').textContent = d.activeClients || 0;
            document.getElementById('statTier').textContent = d.tier || 'Sem tier';
            document.getElementById('statPending').textContent = formatCurrency(d.pendingCommission || 0);

            clients = d.recentClients || [];
            renderRecentClients();
        }

        if (leadsRes.success) {
            leads = leadsRes.data;
            document.getElementById('statLeads').textContent = leads.length;
            renderRecentLeads();
        }
    } catch (e) {
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderRecentClients() {
    const tbody = document.getElementById('recentClientsTable');
    const recent = clients.slice(0, 5);
    tbody.innerHTML = recent.map(c => `
        <tr>
            <td>${escapeHtml(c.companyName)}</td>
            <td>${escapeHtml(c.planName || '-')}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center text-gray">Nenhum cliente</td></tr>';
}

function renderRecentLeads() {
    const tbody = document.getElementById('recentLeadsTable');
    const recent = leads.slice(0, 5);
    tbody.innerHTML = recent.map(l => `
        <tr>
            <td>${escapeHtml(l.name)}</td>
            <td><span class="badge badge-primary">${escapeHtml(l.stageName || '-')}</span></td>
            <td>${formatDate(l.createdAt)}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center text-gray">Nenhum lead</td></tr>';
}

// Clients
async function loadClients() {
    try {
        const [clientsRes, plansRes] = await Promise.all([
            apiRequest('/api/clients'),
            apiRequest('/api/plans')
        ]);

        if (clientsRes.success) {
            clients = clientsRes.data;
            renderClients();
        }

        if (plansRes.success) {
            plans = plansRes.data;
            populatePlanSelects();
        }
    } catch (e) {
        showToast('Erro ao carregar clientes', 'error');
    }
}

function renderClients() {
    const tbody = document.getElementById('clientsTable');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td>
                <div>${escapeHtml(c.companyName)}</div>
                <div class="text-xs text-gray">${escapeHtml(c.cnpj || '')}</div>
            </td>
            <td>
                <div>${escapeHtml(c.contactName || '-')}</div>
                <div class="text-xs text-gray">${escapeHtml(c.contactEmail || '')}</div>
            </td>
            <td>${escapeHtml(c.planName || '-')}</td>
            <td>${formatCurrency(c.monthlyPrice)}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editClient('${c.id}')">Editar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-gray">Nenhum cliente</td></tr>';
}

function populatePlanSelects() {
    const options = plans.map(p => `<option value="${p.id}">${escapeHtml(p.name)} - ${formatCurrency(p.basePrice)}</option>`).join('');
    document.getElementById('clientPlanSelect').innerHTML = '<option value="">Selecione</option>' + options;
    document.getElementById('simPlan').innerHTML = '<option value="">Selecione um plano</option>' + options;
    document.getElementById('proposalPlanSelect').innerHTML = '<option value="">Selecione</option>' + options;

    const globalPlans = plans.filter(p => !p.ownerId);
    document.getElementById('basePlanSelect').innerHTML = globalPlans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function showClientModal(client = null) {
    const form = document.getElementById('clientForm');
    form.reset();
    document.getElementById('clientFormId').value = client?.id || '';
    document.getElementById('clientModalTitle').textContent = client ? 'Editar Cliente' : 'Novo Cliente';

    if (client) {
        form.companyName.value = client.companyName;
        form.cnpj.value = client.cnpj || '';
        form.contactName.value = client.contactName || '';
        form.contactEmail.value = client.contactEmail || '';
        form.contactPhone.value = client.contactPhone || '';
        form.planId.value = client.planId || '';
        form.extraUsers.value = client.extraUsers || 0;
        form.extraQueues.value = client.extraQueues || 0;
        form.extraWhatsapp.value = client.extraWhatsapp || 0;
        form.extraInstagram.value = client.extraInstagram || 0;
    }

    document.getElementById('clientModal').classList.remove('hidden');
}

function editClient(id) {
    const client = clients.find(c => c.id === id);
    if (client) showClientModal(client);
}

async function saveClient(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('clientFormId').value;

    const data = {
        companyName: form.companyName.value,
        cnpj: form.cnpj.value || null,
        contactName: form.contactName.value,
        contactEmail: form.contactEmail.value,
        contactPhone: form.contactPhone.value || null,
        planId: form.planId.value,
        extraUsers: parseInt(form.extraUsers.value) || 0,
        extraQueues: parseInt(form.extraQueues.value) || 0,
        extraWhatsapp: parseInt(form.extraWhatsapp.value) || 0,
        extraInstagram: parseInt(form.extraInstagram.value) || 0
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

// Funnel
async function loadFunnel() {
    try {
        const [stagesRes, leadsRes] = await Promise.all([
            apiRequest('/api/funnel/stages'),
            apiRequest('/api/funnel/leads')
        ]);

        if (stagesRes.success) {
            stages = stagesRes.data;
            populateStageSelect();
        }

        if (leadsRes.success) {
            leads = leadsRes.data;
        }

        renderFunnel();
    } catch (e) {
        showToast('Erro ao carregar funil', 'error');
    }
}

function populateStageSelect() {
    const options = stages.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    document.getElementById('leadStageSelect').innerHTML = options;
}

function renderFunnel() {
    const board = document.getElementById('funnelBoard');
    board.innerHTML = stages.map(stage => {
        const stageLeads = leads.filter(l => l.stageId === stage.id);
        return `
            <div class="kanban-column" data-stage="${stage.id}">
                <div class="kanban-column-header">
                    <span class="kanban-column-title">${escapeHtml(stage.name)}</span>
                    <span class="kanban-column-count">${stageLeads.length}</span>
                </div>
                <div class="kanban-cards">
                    ${stageLeads.map(lead => `
                        <div class="kanban-card" onclick="showLeadModal(${JSON.stringify(lead).replace(/"/g, '&quot;')})">
                            <div class="kanban-card-title">${escapeHtml(lead.name)}</div>
                            <div class="kanban-card-meta">
                                ${lead.estimatedValue ? formatCurrency(lead.estimatedValue) : ''}
                                ${lead.phone ? `<br>${escapeHtml(lead.phone)}` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function showLeadModal(lead = null) {
    const form = document.getElementById('leadForm');
    form.reset();
    document.getElementById('leadFormId').value = lead?.id || '';
    document.getElementById('leadModalTitle').textContent = lead ? 'Editar Lead' : 'Novo Lead';

    if (lead) {
        form.name.value = lead.name;
        form.email.value = lead.email || '';
        form.phone.value = lead.phone || '';
        form.stageId.value = lead.stageId;
        form.estimatedValue.value = lead.estimatedValue || '';
        form.notes.value = lead.notes || '';
    }

    document.getElementById('leadModal').classList.remove('hidden');
}

async function saveLead(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('leadFormId').value;

    const data = {
        name: form.name.value,
        email: form.email.value || null,
        phone: form.phone.value || null,
        stageId: form.stageId.value,
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

// Plans
async function loadPlans() {
    try {
        const res = await apiRequest('/api/plans');
        if (res.success) {
            plans = res.data;
            const globalPlans = plans.filter(p => !p.ownerId);
            myPlans = plans.filter(p => p.ownerId);
            renderGlobalPlans(globalPlans);
            renderMyPlans(myPlans);
            populatePlanSelects();
        }
    } catch (e) {
        showToast('Erro ao carregar planos', 'error');
    }
}

function renderGlobalPlans(globalPlans) {
    const grid = document.getElementById('globalPlansGrid');
    grid.innerHTML = globalPlans.map(p => `
        <div class="card">
            <h3 class="font-semibold mb-2">${escapeHtml(p.name)}</h3>
            <div class="text-2xl font-bold text-primary mb-2">${formatCurrency(p.basePrice)}<span class="text-sm text-gray font-normal">/mês</span></div>
            <ul class="text-sm text-gray mb-4">
                <li>${p.usersIncluded} usuário(s)</li>
                <li>${p.queuesIncluded} fila(s)</li>
                <li>${p.whatsappIncluded} WhatsApp</li>
                ${p.setupFee > 0 ? `<li>Setup: ${formatCurrency(p.setupFee)}</li>` : ''}
            </ul>
        </div>
    `).join('') || '<p class="text-gray">Nenhum plano global disponível</p>';
}

function renderMyPlans(myPlans) {
    const grid = document.getElementById('myPlansGrid');
    grid.innerHTML = myPlans.map(p => `
        <div class="card">
            <h3 class="font-semibold mb-2">${escapeHtml(p.name)}</h3>
            <div class="text-2xl font-bold text-primary mb-2">${formatCurrency(p.basePrice)}<span class="text-sm text-gray font-normal">/mês</span></div>
            <p class="text-xs text-gray mb-2">Base: ${escapeHtml(p.basePlanName || '-')}</p>
            <button class="btn btn-sm btn-danger" onclick="deleteMyPlan('${p.id}')">Excluir</button>
        </div>
    `).join('') || '<p class="text-gray">Você ainda não criou planos personalizados</p>';
}

function showPartnerPlanModal() {
    document.getElementById('partnerPlanForm').reset();
    document.getElementById('partnerPlanModal').classList.remove('hidden');
}

async function savePartnerPlan(e) {
    e.preventDefault();
    const form = e.target;

    const data = {
        basePlanId: form.basePlanId.value,
        name: form.name.value,
        priceAddition: parseFloat(form.priceAddition.value) || 0,
        setupAddition: parseFloat(form.setupAddition.value) || 0
    };

    try {
        const res = await apiRequest('/api/plans/partner', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (res.success) {
            showToast('Plano criado!', 'success');
            closeModal('partnerPlanModal');
            loadPlans();
        } else {
            showToast(res.message || 'Erro ao criar', 'error');
        }
    } catch (e) {
        showToast('Erro ao criar plano', 'error');
    }
}

async function deleteMyPlan(id) {
    if (!confirm('Excluir este plano?')) return;

    try {
        const res = await apiRequest(`/api/plans/partner/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Plano excluído!', 'success');
            loadPlans();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir', 'error');
    }
}

// Commissions
async function loadCommissions() {
    try {
        const [listRes, summaryRes] = await Promise.all([
            apiRequest('/api/commissions'),
            apiRequest('/api/commissions/summary')
        ]);

        if (listRes.success) renderCommissions(listRes.data);

        if (summaryRes.success) {
            document.getElementById('commPending').textContent = formatCurrency(summaryRes.data.pending || 0);
            document.getElementById('commPaidMonth').textContent = formatCurrency(summaryRes.data.paid || 0);
            document.getElementById('commPaidTotal').textContent = formatCurrency(summaryRes.data.total || 0);
        }
    } catch (e) {
        showToast('Erro ao carregar comissões', 'error');
    }
}

function renderCommissions(commissions) {
    const tbody = document.getElementById('commissionsTable');
    tbody.innerHTML = commissions.map(c => `
        <tr>
            <td>${escapeHtml(c.clientName || '-')}</td>
            <td>${c.periodMonth}/${c.periodYear}</td>
            <td>${formatCurrency(c.commissionAmount)}</td>
            <td>${formatCurrency(c.setupCommission)}</td>
            <td class="font-semibold">${formatCurrency(c.totalCommission)}</td>
            <td><span class="badge ${c.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${c.status === 'PAID' ? 'Pago' : 'Pendente'}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-gray">Nenhuma comissão</td></tr>';
}

// Proposals
async function loadProposals() {
    try {
        const [proposalsRes, plansRes] = await Promise.all([
            apiRequest('/api/pdf/proposals'),
            apiRequest('/api/plans')
        ]);

        if (proposalsRes.success) renderProposals(proposalsRes.data);

        if (plansRes.success) {
            plans = plansRes.data;
            populatePlanSelects();
        }
    } catch (e) {
        showToast('Erro ao carregar propostas', 'error');
    }
}

function renderProposals(proposals) {
    const tbody = document.getElementById('proposalsTable');
    tbody.innerHTML = proposals.map(p => `
        <tr>
            <td>${escapeHtml(p.planName || '-')}</td>
            <td>${escapeHtml(p.clientName || '-')}</td>
            <td>${formatDate(p.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary mr-2" onclick="downloadProposal('${p.id}')">Download</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProposal('${p.id}')">Excluir</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="text-center text-gray">Nenhuma proposta</td></tr>';
}

function showProposalModal() {
    document.getElementById('proposalForm').reset();
    document.getElementById('proposalModal').classList.remove('hidden');
}

async function generateProposal(e) {
    e.preventDefault();
    const form = e.target;

    try {
        const res = await apiRequest('/api/pdf/plan', {
            method: 'POST',
            body: JSON.stringify({
                planId: form.planId.value,
                clientName: form.clientName.value || null
            })
        });

        if (res.success) {
            showToast('Proposta gerada!', 'success');
            closeModal('proposalModal');
            loadProposals();
        } else {
            showToast(res.message || 'Erro ao gerar', 'error');
        }
    } catch (e) {
        showToast('Erro ao gerar proposta', 'error');
    }
}

function downloadProposal(id) {
    window.open(`/api/pdf/proposals/${id}/download`, '_blank');
}

async function deleteProposal(id) {
    if (!confirm('Excluir esta proposta?')) return;

    try {
        const res = await apiRequest(`/api/pdf/proposals/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Proposta excluída!', 'success');
            loadProposals();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir', 'error');
    }
}

// Simulator
async function loadSimulator() {
    try {
        const [plansRes, resourcesRes, modulesRes] = await Promise.all([
            apiRequest('/api/plans'),
            apiRequest('/api/resource-prices'),
            apiRequest('/api/plans/modules/prices')
        ]);

        if (plansRes.success) {
            plans = plansRes.data;
            populatePlanSelects();
        }

        if (resourcesRes.success) {
            resourcePrices = resourcesRes.data;
        }

        if (modulesRes.success) {
            modulePrices = modulesRes.data;
            renderSimulatorModules();
        }
    } catch (e) {
        showToast('Erro ao carregar simulador', 'error');
    }
}

function renderSimulatorModules() {
    const container = document.getElementById('simModules');
    container.innerHTML = modulePrices.filter(m => m.price > 0).map(m => `
        <label class="form-checkbox">
            <input type="checkbox" id="sim_${m.moduleKey}" onchange="updateSimulator()">
            <span>${escapeHtml(m.label)} (+${formatCurrency(m.price)})</span>
        </label>
    `).join('');
}

function updateSimulator() {
    const planId = document.getElementById('simPlan').value;
    const plan = plans.find(p => p.id === planId);

    if (!plan) {
        document.getElementById('simulatorResult').innerHTML = '<p class="text-gray text-center">Selecione um plano para simular</p>';
        return;
    }

    const extraUsers = parseInt(document.getElementById('simUsers').value) || 0;
    const extraQueues = parseInt(document.getElementById('simQueues').value) || 0;
    const extraWhatsapp = parseInt(document.getElementById('simWhatsapp').value) || 0;
    const extraInstagram = parseInt(document.getElementById('simInstagram').value) || 0;

    const userPrice = resourcePrices.find(r => r.key === 'user')?.price || 0;
    const queuePrice = resourcePrices.find(r => r.key === 'queue')?.price || 0;
    const whatsappPrice = resourcePrices.find(r => r.key === 'whatsappUnofficial')?.price || 0;
    const instagramPrice = resourcePrices.find(r => r.key === 'instagram')?.price || 0;

    let basePrice = parseFloat(plan.basePrice);
    let extrasPrice = 0;
    extrasPrice += extraUsers * userPrice;
    extrasPrice += extraQueues * queuePrice;
    extrasPrice += extraWhatsapp * whatsappPrice;
    extrasPrice += extraInstagram * instagramPrice;

    let modulesPrice = 0;
    modulePrices.forEach(m => {
        const cb = document.getElementById(`sim_${m.moduleKey}`);
        if (cb?.checked && m.price > 0) {
            modulesPrice += parseFloat(m.price);
        }
    });

    const total = basePrice + extrasPrice + modulesPrice;

    document.getElementById('simulatorResult').innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between">
                <span>Plano Base (${escapeHtml(plan.name)})</span>
                <span>${formatCurrency(basePrice)}</span>
            </div>
            ${extrasPrice > 0 ? `
            <div class="flex justify-between">
                <span>Recursos Extras</span>
                <span>${formatCurrency(extrasPrice)}</span>
            </div>
            ` : ''}
            ${modulesPrice > 0 ? `
            <div class="flex justify-between">
                <span>Módulos Adicionais</span>
                <span>${formatCurrency(modulesPrice)}</span>
            </div>
            ` : ''}
            <hr class="my-2">
            <div class="flex justify-between font-bold text-lg">
                <span>Total Mensal</span>
                <span class="text-primary">${formatCurrency(total)}</span>
            </div>
            ${plan.setupFee > 0 ? `
            <div class="flex justify-between text-sm text-gray">
                <span>Taxa de Setup (única)</span>
                <span>${formatCurrency(plan.setupFee)}</span>
            </div>
            ` : ''}
        </div>
    `;
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
        showToast('Senhas não conferem', 'error');
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
            showToast('Senha alterada! Faça login novamente.', 'success');
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
