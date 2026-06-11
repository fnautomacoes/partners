let currentUser = null;
let partners = [];
let plans = [];
let modulePrices = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth('SUPERADMIN');
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
}

// Dashboard
async function loadDashboard() {
    try {
        const [partnersRes, clientsRes, commRes] = await Promise.all([
            apiRequest('/api/partners'),
            apiRequest('/api/clients'),
            apiRequest('/api/commissions/summary')
        ]);

        if (partnersRes.success) {
            partners = partnersRes.data;
            document.getElementById('statPartners').textContent = partners.length;
            populatePartnerFilters();
            renderRecentPartners();
        }

        if (clientsRes.success) {
            const activeClients = clientsRes.data.filter(c => c.status === 'ACTIVE');
            document.getElementById('statClients').textContent = activeClients.length;

            const revenue = activeClients.reduce((sum, c) => sum + parseFloat(c.monthlyPrice || 0), 0);
            document.getElementById('statRevenue').textContent = formatCurrency(revenue);
        }

        if (commRes.success) {
            document.getElementById('statPendingCommissions').textContent = formatCurrency(commRes.data.pending || 0);
        }
    } catch (e) {
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function renderRecentPartners() {
    const tbody = document.getElementById('recentPartnersTable');
    const recent = partners.slice(0, 5);

    tbody.innerHTML = recent.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${p.activeClients || 0}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.tier || 'Sem tier')}</span></td>
            <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="text-center text-gray">Nenhum parceiro</td></tr>';
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
            <td>${p.activeClients || 0}</td>
            <td><span class="badge badge-primary">${escapeHtml(p.tier || '-')}</span></td>
            <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${p.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary mr-2" onclick="editPartner('${p.id}')">Editar</button>
                <button class="btn btn-sm ${p.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}" onclick="togglePartner('${p.id}', '${p.status}')">${p.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-gray">Nenhum parceiro</td></tr>';
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
            plans = plansRes.data.filter(p => !p.ownerId);
            renderPlans();
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

function renderPlans() {
    const tbody = document.getElementById('plansTable');
    tbody.innerHTML = plans.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${formatCurrency(p.basePrice)}</td>
            <td>${formatCurrency(p.setupFee)}</td>
            <td>${p.usersIncluded}</td>
            <td>${p.queuesIncluded}</td>
            <td>${p.whatsappIncluded}</td>
            <td><span class="badge ${p.isActive ? 'badge-success' : 'badge-danger'}">${p.isActive ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary mr-2" onclick="editPlan('${p.id}')">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deletePlan('${p.id}')">Excluir</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center text-gray">Nenhum plano</td></tr>';
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
    const plan = plans.find(p => p.id === id);
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
        usersIncluded: parseInt(form.usersIncluded.value) || 1,
        queuesIncluded: parseInt(form.queuesIncluded.value) || 1,
        whatsappIncluded: parseInt(form.whatsappIncluded.value) || 1
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
            <td>
                <div>${escapeHtml(c.companyName)}</div>
                <div class="text-xs text-gray">${escapeHtml(c.contactName || '')}</div>
            </td>
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>${escapeHtml(c.planName || '-')}</td>
            <td>${formatCurrency(c.monthlyPrice)}</td>
            <td>${c.activationDate ? formatDate(c.activationDate) : '-'}</td>
            <td><span class="badge ${getStatusBadge(c.status)}">${getStatusLabel(c.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewClient('${c.id}')">Ver</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-gray">Nenhum cliente</td></tr>';
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
            <td>${escapeHtml(c.partnerName || '-')}</td>
            <td>${escapeHtml(c.clientName || '-')}</td>
            <td>${c.periodMonth}/${c.periodYear}</td>
            <td>${formatCurrency(c.commissionAmount)}</td>
            <td>${formatCurrency(c.setupCommission)}</td>
            <td class="font-semibold">${formatCurrency(c.totalCommission)}</td>
            <td><span class="badge ${c.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${c.status === 'PAID' ? 'Pago' : 'Pendente'}</span></td>
            <td>
                ${c.status === 'PENDING' ? `<button class="btn btn-sm btn-success" onclick="payCommission('${c.id}')">Marcar Pago</button>` : '-'}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center text-gray">Nenhuma comissão</td></tr>';
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
    try {
        const res = await apiRequest('/api/invoices');
        if (res.success) renderInvoices(res.data);
    } catch (e) {
        showToast('Erro ao carregar faturas', 'error');
    }
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoicesTable');
    tbody.innerHTML = invoices.map(i => `
        <tr>
            <td class="font-mono">${escapeHtml(i.pacoticketRef || '-')}</td>
            <td>${escapeHtml(i.clientName || '-')}</td>
            <td>${formatCurrency(i.amount)}</td>
            <td>${i.dueDate ? formatDate(i.dueDate) : '-'}</td>
            <td>${i.paidAt ? formatDate(i.paidAt) : '-'}</td>
            <td><span class="badge ${getInvoiceStatusBadge(i.status)}">${getInvoiceStatusLabel(i.status)}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-gray">Nenhuma fatura</td></tr>';
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
async function loadTiers() {
    try {
        const res = await apiRequest('/api/commission-tiers');
        if (res.success) renderTiers(res.data);
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

function getInvoiceStatusBadge(status) {
    const map = { PAID: 'badge-success', PENDING: 'badge-warning', OVERDUE: 'badge-danger', CANCELLED: 'badge-secondary' };
    return map[status] || 'badge-secondary';
}

function getInvoiceStatusLabel(status) {
    const map = { PAID: 'Pago', PENDING: 'Pendente', OVERDUE: 'Vencido', CANCELLED: 'Cancelado' };
    return map[status] || status;
}
