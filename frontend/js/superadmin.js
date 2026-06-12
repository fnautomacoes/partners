let currentUser = null;
let partners = [];
let plans = [];
let allPlans = [];
let modulePrices = [];
let commissionsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth('SUPERADMIN');
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.email.split('@')[0];
    document.getElementById('userAvatar').textContent = currentUser.email[0].toUpperCase();

    setupNavigation();
    setupForms();
    populateYearFilter();
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
    document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${section}`).classList.remove('hidden');

    const titles = {
        dashboard: 'Dashboard',
        partners: 'Parceiros',
        plans: 'Planos',
        clients: 'Clientes',
        commissions: 'Comissões',
        invoices: 'Faturas',
        tiers: 'Tiers de Comissão',
        config: 'Configurações'
    };
    document.getElementById('pageTitle').textContent = titles[section] || section;

    const loaders = {
        dashboard: loadDashboard,
        partners: loadPartners,
        plans: loadPlans,
        clients: loadClients,
        commissions: loadCommissions,
        invoices: loadInvoices,
        tiers: loadTiers,
        config: loadConfig
    };
    if (loaders[section]) loaders[section]();
}

function setupForms() {
    document.getElementById('partnerForm').addEventListener('submit', savePartner);
    document.getElementById('planForm').addEventListener('submit', savePlan);
    document.getElementById('tierForm').addEventListener('submit', saveTier);
    document.getElementById('configForm').addEventListener('submit', saveConfig);
    document.getElementById('passwordForm').addEventListener('submit', changePassword);

    document.getElementById('clientPartnerFilter').addEventListener('change', loadClients);
    document.getElementById('clientStatusFilter').addEventListener('change', loadClients);
    document.getElementById('commPartnerFilter').addEventListener('change', loadCommissions);
    document.getElementById('commStatusFilter').addEventListener('change', loadCommissions);
    document.getElementById('planTypeFilter').addEventListener('change', filterPlans);
    document.getElementById('invoiceMonthFilter').addEventListener('change', loadInvoices);
    document.getElementById('invoiceYearFilter').addEventListener('change', loadInvoices);
    document.getElementById('invoiceStatusFilter').addEventListener('change', loadInvoices);
}

function populateYearFilter() {
    const yearSelect = document.getElementById('invoiceYearFilter');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 3; y--) {
        yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
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
            document.getElementById('statPartners').textContent = d.activePartners;
            document.getElementById('statClients').textContent = d.activeClients;
            document.getElementById('statPendingCommissions').textContent = formatCurrency(d.pendingCommissions);
            document.getElementById('statRevenue').textContent = formatCurrency(d.monthlyRevenue);

            renderTierDistribution(d.tierDistribution);
            renderTopPartners(d.topPartners);
            renderRecentActivities(d.recentActivities);
        }

        if (partnersRes.success) {
            partners = partnersRes.data;
            populatePartnerFilters();
        }
    } catch (e) {
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderTierDistribution(tiers) {
    const container = document.getElementById('tierDistributionChart');
    if (!tiers || tiers.length === 0) {
        container.innerHTML = '<div class="text-gray text-center py-4">Nenhum tier configurado</div>';
        return;
    }

    const total = tiers.reduce((sum, t) => sum + t.count, 0);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    container.innerHTML = `
        <div class="tier-bars">
            ${tiers.map((t, i) => `
                <div class="tier-bar-item mb-3">
                    <div class="flex justify-between mb-1">
                        <span class="text-sm font-medium">${escapeHtml(t.name)}</span>
                        <span class="text-sm text-gray">${t.count} parceiros</span>
                    </div>
                    <div class="tier-bar-bg" style="background: var(--card-bg); border-radius: 4px; height: 24px; overflow: hidden;">
                        <div class="tier-bar-fill" style="width: ${total > 0 ? (t.count / total * 100) : 0}%; background: ${colors[i % colors.length]}; height: 100%; border-radius: 4px; transition: width 0.5s;"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTopPartners(topPartners) {
    const tbody = document.getElementById('topPartnersTable');
    if (!topPartners || topPartners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray">Nenhum parceiro</td></tr>';
        return;
    }

    tbody.innerHTML = topPartners.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.tier)}</span></td>
            <td>${p.activeClients}</td>
            <td>${formatCurrency(p.totalCommissions)}</td>
        </tr>
    `).join('');
}

function renderRecentActivities(activities) {
    const tbody = document.getElementById('recentActivitiesTable');
    if (!activities || activities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray">Nenhuma atividade recente</td></tr>';
        return;
    }

    tbody.innerHTML = activities.map(a => `
        <tr>
            <td class="text-sm">${formatDateTime(a.createdAt)}</td>
            <td>${escapeHtml(a.partnerName || '-')}</td>
            <td><span class="badge badge-secondary">${escapeHtml(a.action)}</span></td>
            <td class="text-sm">${escapeHtml(a.description || '-')}</td>
        </tr>
    `).join('');
}

function populatePartnerFilters() {
    const options = partners.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    document.getElementById('clientPartnerFilter').innerHTML = '<option value="">Todos os parceiros</option>' + options;
    document.getElementById('commPartnerFilter').innerHTML = '<option value="">Todos os parceiros</option>' + options;
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
                <button class="btn btn-sm btn-secondary mr-2" onclick="editPartner('${p.id}')">Editar</button>
                <button class="btn btn-sm ${p.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}" onclick="togglePartner('${p.id}', '${p.status}')">${p.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}</button>
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
    }

    document.getElementById('partnerModal').classList.remove('hidden');
}

function editPartner(id) {
    const partner = partners.find(p => p.id === id);
    if (partner) showPartnerModal(partner);
}

async function savePartner(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('partnerFormId').value;

    const data = {
        name: form.name.value,
        email: form.email.value,
        phone: form.phone.value || null,
        document: form.document.value || null
    };

    if (!id) {
        data.password = form.password.value;
        if (!data.password || data.password.length < 8) {
            showToast('Senha deve ter no mínimo 8 caracteres', 'error');
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
            allPlans = plansRes.data;
            filterPlans();
        }

        if (modulesRes.success) {
            modulePrices = modulesRes.data;
            renderModulePrices();
            renderPlanModuleCheckboxes();
        }
    } catch (e) {
        showToast('Erro ao carregar planos', 'error');
    }
}

function filterPlans() {
    const filter = document.getElementById('planTypeFilter').value;
    let filtered = allPlans;

    if (filter === 'global') {
        filtered = allPlans.filter(p => !p.ownerId);
    } else if (filter === 'partner') {
        filtered = allPlans.filter(p => p.ownerId);
    }

    plans = filtered;
    renderPlansGrid();
}

function renderPlansGrid() {
    const container = document.getElementById('plansGrid');

    if (plans.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray">Nenhum plano encontrado</div>';
        return;
    }

    container.innerHTML = plans.map(p => {
        const isGlobal = !p.ownerId;
        const basePlanName = p.basePlan?.name || null;

        return `
            <div class="plan-card">
                <div class="plan-card-header">
                    <h3 class="plan-card-title">${escapeHtml(p.name)}</h3>
                    <span class="badge ${isGlobal ? 'badge-primary' : 'badge-secondary'}">${isGlobal ? 'Global' : 'Parceiro'}</span>
                </div>
                ${!isGlobal && p.ownerName ? `<div class="text-xs text-gray mb-2">Parceiro: ${escapeHtml(p.ownerName)}</div>` : ''}
                ${basePlanName ? `<div class="text-xs text-gray mb-2">Baseado em: ${escapeHtml(basePlanName)}</div>` : ''}
                <div class="plan-card-price">
                    <span class="plan-price-value">${formatCurrency(p.basePrice)}</span>
                    <span class="plan-price-period">/mês</span>
                </div>
                <div class="plan-card-details">
                    <div class="plan-detail-row">
                        <span>Conexões/Filas</span>
                        <span>${p.whatsappIncluded || 0} / ${p.queuesIncluded || 0}</span>
                    </div>
                    <div class="plan-detail-row">
                        <span>Setup Base</span>
                        <span>${formatCurrency(p.basePlan?.setupFee || p.setupFee || 0)}</span>
                    </div>
                    ${!isGlobal ? `
                    <div class="plan-detail-row">
                        <span>Acréscimo Setup</span>
                        <span>${formatCurrency((p.setupFee || 0) - (p.basePlan?.setupFee || 0))}</span>
                    </div>
                    ` : ''}
                    <div class="plan-detail-row">
                        <span>Setup Total</span>
                        <span class="font-semibold">${formatCurrency(p.setupFee || 0)}</span>
                    </div>
                    <div class="plan-detail-row">
                        <span>Clientes</span>
                        <span>${p.clientCount || 0}</span>
                    </div>
                </div>
                ${isGlobal ? `
                <div class="plan-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editPlan('${p.id}')">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deletePlan('${p.id}')">Excluir</button>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderModulePrices() {
    const tbody = document.getElementById('modulePricesTable');
    tbody.innerHTML = modulePrices.map(m => `
        <tr>
            <td>${escapeHtml(m.label)}</td>
            <td>${formatCurrency(m.price)}</td>
            <td><span class="badge ${m.isVisible ? 'badge-success' : 'badge-secondary'}">${m.isVisible ? 'Sim' : 'Não'}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editModulePrice('${m.moduleKey}', ${m.price})">Editar</button>
            </td>
        </tr>
    `).join('');
}

function renderPlanModuleCheckboxes() {
    const container = document.getElementById('planModulesCheckboxes');
    container.innerHTML = modulePrices.map(m => `
        <label class="form-checkbox">
            <input type="checkbox" name="${m.moduleKey}">
            <span>${escapeHtml(m.label)}</span>
        </label>
    `).join('');
}

function showPlanModal(plan = null) {
    const form = document.getElementById('planForm');
    form.reset();
    document.getElementById('planFormId').value = plan?.id || '';
    document.getElementById('planModalTitle').textContent = plan ? 'Editar Plano' : 'Novo Plano';

    if (plan) {
        form.name.value = plan.name;
        form.recurrence.value = plan.recurrence;
        form.basePrice.value = plan.basePrice;
        form.setupFee.value = plan.setupFee;
        form.usersIncluded.value = plan.usersIncluded;
        form.queuesIncluded.value = plan.queuesIncluded;
        form.whatsappIncluded.value = plan.whatsappIncluded;

        modulePrices.forEach(m => {
            const cb = form.querySelector(`[name="${m.moduleKey}"]`);
            if (cb) cb.checked = plan[m.moduleKey] || false;
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
        recurrence: form.recurrence.value,
        basePrice: parseFloat(form.basePrice.value),
        setupFee: parseFloat(form.setupFee.value) || 0,
        users: parseInt(form.usersIncluded.value) || 1,
        queues: parseInt(form.queuesIncluded.value) || 1,
        connections: parseInt(form.whatsappIncluded.value) || 1
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
    if (!confirm('Excluir este plano?')) return;

    try {
        const res = await apiRequest(`/api/plans/${id}`, { method: 'DELETE' });
        if (res.success) {
            showToast('Plano excluído!', 'success');
            loadPlans();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir plano', 'error');
    }
}

async function editModulePrice(moduleKey, currentPrice) {
    const newPrice = prompt('Novo preço:', currentPrice);
    if (newPrice === null) return;

    try {
        const res = await apiRequest('/api/plans/modules/prices', {
            method: 'PUT',
            body: JSON.stringify({ modules: [{ moduleKey, price: parseFloat(newPrice) }] })
        });

        if (res.success) {
            showToast('Preço atualizado!', 'success');
            loadPlans();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao atualizar preço', 'error');
    }
}

// Clients
async function loadClients() {
    const partnerId = document.getElementById('clientPartnerFilter').value;
    const status = document.getElementById('clientStatusFilter').value;

    let url = '/api/clients?';
    if (partnerId) url += `partnerId=${partnerId}&`;
    if (status) url += `status=${status}&`;

    try {
        const res = await apiRequest(url);
        if (res.success) {
            renderClients(res.data);
        }
    } catch (e) {
        showToast('Erro ao carregar clientes', 'error');
    }
}

function renderClients(clients) {
    const tbody = document.getElementById('clientsTable');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td>${escapeHtml(c.companyName)}</td>
            <td>
                <div>${escapeHtml(c.contactName || '-')}</div>
                <div class="text-xs text-gray">${escapeHtml(c.contactEmail || c.email || '-')}</div>
            </td>
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>${escapeHtml(c.planName || '-')}</td>
            <td>${getRecurrenceLabel(c.recurrence)}</td>
            <td>${c.dueDay ? `Dia ${c.dueDay}` : '-'}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
            <td>${c.lastInvoiceStatus ? `<span class="badge ${getInvoiceStatusBadge(c.lastInvoiceStatus)}">${getInvoiceStatusLabel(c.lastInvoiceStatus)}</span>` : '-'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewClient('${c.id}')">Ver</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-gray">Nenhum cliente</td></tr>';
}

function viewClient(id) {
    showToast('Visualização de cliente em desenvolvimento', 'warning');
}

// Commissions
async function loadCommissions() {
    const partnerId = document.getElementById('commPartnerFilter').value;
    const status = document.getElementById('commStatusFilter').value;

    let url = '/api/commissions?';
    if (partnerId) url += `partnerId=${partnerId}&`;
    if (status) url += `status=${status}&`;

    try {
        const [listRes, summaryRes] = await Promise.all([
            apiRequest(url),
            apiRequest('/api/commissions/summary')
        ]);

        if (listRes.success) {
            commissionsData = listRes.data;
            renderCommissions(commissionsData);
        }

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
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>${escapeHtml(c.clientName || '-')}</td>
            <td>${c.periodMonth}/${c.periodYear}</td>
            <td><span class="badge badge-secondary">${escapeHtml(c.tierName || '-')}</span></td>
            <td>${c.percentage}%</td>
            <td>${formatCurrency(c.baseAmount)}</td>
            <td class="font-semibold">${formatCurrency(c.totalCommission)}</td>
            <td><span class="badge ${c.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${c.status === 'PAID' ? 'Pago' : 'Pendente'}</span></td>
            <td>
                ${c.status === 'PAID' ? formatDate(c.paidAt) : `<button class="btn btn-sm btn-success" onclick="payCommission('${c.id}')">Pagar</button>`}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-gray">Nenhuma comissão</td></tr>';
}

function exportCommissionsCSV() {
    if (!commissionsData || commissionsData.length === 0) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }

    const headers = ['Parceiro', 'Cliente', 'Período', 'Tier', '%', 'Base', 'Comissão', 'Status', 'Pago em'];
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
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    if (!confirm(`Calcular comissões para ${month}/${year}?`)) return;

    try {
        const res = await apiRequest('/api/commissions/calculate', {
            method: 'POST',
            body: JSON.stringify({ month, year })
        });

        if (res.success) {
            showToast(`${res.data.created || 0} comissões calculadas!`, 'success');
            loadCommissions();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao calcular comissões', 'error');
    }
}

async function payCommission(id) {
    if (!confirm('Marcar esta comissão como paga?')) return;

    try {
        const res = await apiRequest(`/api/commissions/${id}/pay`, { method: 'PUT' });
        if (res.success) {
            showToast('Comissão marcada como paga!', 'success');
            loadCommissions();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao pagar comissão', 'error');
    }
}

// Invoices
async function loadInvoices() {
    const month = document.getElementById('invoiceMonthFilter').value;
    const year = document.getElementById('invoiceYearFilter').value;
    const status = document.getElementById('invoiceStatusFilter').value;

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
    `).join('') || '<tr><td colspan="7" class="text-center text-gray">Nenhuma fatura</td></tr>';
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

// Tiers
let tiersData = [];

async function loadTiers() {
    try {
        const res = await apiRequest('/api/commission-tiers');
        if (res.success) {
            tiersData = res.data;
            renderTiers(tiersData);
        }
    } catch (e) {
        showToast('Erro ao carregar tiers', 'error');
    }
}

function renderTiers(tiers) {
    const tbody = document.getElementById('tiersTable');
    tbody.innerHTML = tiers.map(t => `
        <tr>
            <td>${t.order}</td>
            <td>${escapeHtml(t.name)}</td>
            <td>${t.minClients}</td>
            <td>${t.maxClients || 'Ilimitado'}</td>
            <td>${t.percentage}%</td>
            <td><span class="badge ${t.isActive ? 'badge-success' : 'badge-danger'}">${t.isActive ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary mr-2" onclick="editTier('${t.id}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTier('${t.id}')">Excluir</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-gray">Nenhum tier</td></tr>';
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
        order: parseInt(form.order.value)
    };

    try {
        const url = id ? `/api/commission-tiers/${id}` : '/api/commission-tiers';
        const method = id ? 'PUT' : 'POST';
        const res = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (res.success) {
            showToast(id ? 'Tier atualizado!' : 'Tier criado!', 'success');
            closeModal('tierModal');
            loadTiers();
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
            showToast('Tier excluído!', 'success');
            loadTiers();
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao excluir tier', 'error');
    }
}

// Config
async function loadConfig() {
    try {
        const res = await apiRequest('/api/system-config/admin');
        if (res.success) {
            const form = document.getElementById('configForm');
            Object.entries(res.data).forEach(([key, value]) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) input.value = value || '';
            });
        }
    } catch (e) {
        showToast('Erro ao carregar configurações', 'error');
    }
}

async function saveConfig(e) {
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
            showToast('Configurações salvas!', 'success');
        } else {
            showToast(res.message || 'Erro', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar configurações', 'error');
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

function formatDateTime(date) {
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
