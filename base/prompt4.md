# Prompt de Correção — SuperAdmin JS (Anti-Timeout)

## Problema atual

O arquivo `frontend/superadmin.js` está grande demais para ser reescrito em uma única operação. As tentativas anteriores causaram timeout repetido. **Não tente reescrever o arquivo inteiro de uma vez.**

## Estratégia obrigatória

Divida o trabalho em **arquivos separados**, depois una no final. Siga exatamente esta ordem e **pare após cada etapa para confirmar que funcionou antes de avançar**.

---

## ETAPA 1 — Criar o arquivo base limpo

Apague o conteúdo atual do `superadmin.js` e substitua apenas pelo esqueleto:

```bash
cat > frontend/superadmin.js << 'ENDOFFILE'
// ============================================================
// superadmin.js — PacoTicket SuperAdmin
// ============================================================
const API_BASE = '/api';

// Utilitários globais serão carregados de superadmin-utils.js
// Módulos de cada aba serão carregados de superadmin-*.js
ENDOFFILE
```

Atualize `superadmin.html` para carregar os scripts na seguinte ordem **antes do fechamento do `</body>`**:

```html
<script src="superadmin-utils.js"></script>
<script src="superadmin-dashboard.js"></script>
<script src="superadmin-parceiros.js"></script>
<script src="superadmin-planos.js"></script>
<script src="superadmin-clientes.js"></script>
<script src="superadmin-comissoes.js"></script>
<script src="superadmin-faturas.js"></script>
<script src="superadmin-config.js"></script>
<script src="superadmin.js"></script>
```

Confirme esta etapa antes de continuar.

---

## ETAPA 2 — Criar `superadmin-utils.js`

Crie `frontend/superadmin-utils.js` com **exatamente** este conteúdo:

```javascript
// ============================================================
// Utils: autenticação, requisição, formatação, toast, nav
// ============================================================

const API_BASE = '/api';

// --- Auth helpers ---

async function tryRefreshToken() {
  const rt = sessionStorage.getItem('refresh_token');
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt })
    });
    if (!res.ok) return false;
    const data = await res.json();
    sessionStorage.setItem('access_token', data.data.accessToken);
    return true;
  } catch { return false; }
}

function redirectToLogin() {
  sessionStorage.clear();
  window.location.href = 'login.html';
}

async function apiRequest(method, endpoint, body = null) {
  const token = sessionStorage.getItem('access_token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  let res = await fetch(`${API_BASE}${endpoint}`, opts);
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) { redirectToLogin(); return null; }
    return apiRequest(method, endpoint, body);
  }
  return res.json();
}

async function logout() {
  try { await apiRequest('POST', '/auth/logout'); } finally {
    sessionStorage.clear();
    window.location.href = 'login.html';
  }
}

// --- Formatação ---

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

const recorrenciaLabel = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };

function tierInfo(activeClients) {
  if (activeClients >= 10) return { tier: 3, label: 'Master',    pct: 35, color: 'green' };
  if (activeClients >= 3)  return { tier: 2, label: 'Parceiro',  pct: 25, color: 'yellow' };
  return                          { tier: 1, label: 'Indicador', pct: 15, color: 'blue' };
}

// --- Toast ---

function showToast(message, type = 'success') {
  const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500' };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-all ${colors[type] || colors.success}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// --- Badge helpers ---

function badge(text, color) {
  const map = {
    green:  'bg-green-100 text-green-800',
    red:    'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue:   'bg-blue-100 text-blue-800',
    gray:   'bg-gray-100 text-gray-700',
  };
  return `<span class="px-2 py-1 rounded-full text-xs font-semibold ${map[color] || map.gray}">${text}</span>`;
}

function statusBadge(status) {
  const map = { ACTIVE: ['Ativo','green'], INACTIVE: ['Inativo','red'], SUSPENDED: ['Suspenso','yellow'] };
  const [label, color] = map[status] || ['—','gray'];
  return badge(label, color);
}

function faturaBadge(invoices) {
  const last = invoices?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!last)                       return badge('Sem fatura', 'gray');
  if (last.status === 'PAID')      return badge('Pago',       'green');
  if (last.status === 'OVERDUE')   return badge('Vencido',    'red');
  return                                  badge('Pendente',   'yellow');
}

function tierBadge(activeClients) {
  const { label, color } = tierInfo(activeClients);
  return badge(label, color);
}

// --- Navegação de abas ---

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('tab-active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('tab-active');

  const loaders = {
    'tab-dashboard':  loadDashboard,
    'tab-parceiros':  loadParceiros,
    'tab-planos':     loadPlanos,
    'tab-clientes':   loadClientes,
    'tab-comissoes':  loadComissoes,
    'tab-faturas':    loadFaturas,
    'tab-config':     loadConfig,
  };
  loaders[tabId]?.();
}

// --- Spinner ---

function spinnerHTML() {
  return `<div class="flex justify-center py-12">
    <div class="border-4 border-gray-200 border-t-blue-600 rounded-full w-10 h-10 animate-spin"></div>
  </div>`;
}

function emptyHTML(msg = 'Nenhum registro encontrado.') {
  return `<div class="text-center py-12 text-gray-400">${msg}</div>`;
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  if (!sessionStorage.getItem('access_token')) { redirectToLogin(); return; }
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const nameEl = document.getElementById('adminName');
  if (nameEl) nameEl.textContent = user.email || 'Administrador';
  showTab('tab-dashboard');
});
```

Confirme antes de avançar.

---

## ETAPA 3 — Criar `superadmin-dashboard.js`

Crie `frontend/superadmin-dashboard.js`:

```javascript
// ============================================================
// Aba: Dashboard
// ============================================================

async function loadDashboard() {
  document.getElementById('tab-dashboard').innerHTML = spinnerHTML();
  try {
    const [rParceiros, rClientes, rSummary] = await Promise.all([
      apiRequest('GET', '/partners'),
      apiRequest('GET', '/clients'),
      apiRequest('GET', '/commissions/summary'),
    ]);

    const parceiros = rParceiros?.data || [];
    const clientes  = rClientes?.data  || [];
    const summary   = rSummary?.data   || {};

    const ativos = parceiros.filter(p => p.status === 'ACTIVE');
    const clientesAtivos = clientes.filter(c => c.status === 'ACTIVE');
    const receitaTotal = clientesAtivos.reduce((s, c) => s + Number(c.plan?.totalPrice || 0), 0);

    const tier1 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 1).length;
    const tier2 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 2).length;
    const tier3 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 3).length;

    const top5 = [...ativos]
      .sort((a, b) => (b.activeClientCount || 0) - (a.activeClientCount || 0))
      .slice(0, 5);

    document.getElementById('tab-dashboard').innerHTML = `
      <div class="space-y-6">
        <!-- KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${kpiCard('Parceiros Ativos', ativos.length, '👥', 'blue')}
          ${kpiCard('Clientes Ativos', clientesAtivos.length, '🏢', 'green')}
          ${kpiCard('Comissões Pendentes', formatCurrency(summary.pending || 0), '⏳', 'yellow')}
          ${kpiCard('Receita Mensal', formatCurrency(receitaTotal), '💰', 'purple')}
        </div>

        <!-- Tiers + Top Parceiros -->
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold text-gray-800 mb-4">Distribuição por Tier</h3>
            <div class="space-y-3">
              ${tierCard('Indicador (15%)', tier1, 'blue',  '1–2 clientes')}
              ${tierCard('Parceiro (25%)',  tier2, 'yellow','3–9 clientes')}
              ${tierCard('Master (35%)',    tier3, 'green', '10+ clientes')}
            </div>
          </div>
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold text-gray-800 mb-4">Top Parceiros</h3>
            ${top5.length ? `<table class="w-full text-sm">
              <thead><tr class="text-gray-500 text-xs border-b">
                <th class="text-left pb-2">Nome</th><th class="text-center pb-2">Tier</th><th class="text-right pb-2">Clientes</th>
              </tr></thead>
              <tbody>${top5.map(p => `<tr class="border-b last:border-0">
                <td class="py-2">${p.name}</td>
                <td class="py-2 text-center">${tierBadge(p.activeClientCount || 0)}</td>
                <td class="py-2 text-right font-semibold">${p.activeClientCount || 0}</td>
              </tr>`).join('')}</tbody>
            </table>` : emptyHTML('Nenhum parceiro ativo.')}
          </div>
        </div>

        <!-- Atividade recente -->
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <h3 class="font-semibold text-gray-800 mb-4">Atividades Recentes</h3>
          <div id="activityLog">${spinnerHTML()}</div>
        </div>
      </div>`;

    loadActivityLog();
  } catch (e) { showToast(e.message, 'error'); }
}

function kpiCard(label, value, icon, color) {
  const colors = { blue:'bg-blue-50 text-blue-700', green:'bg-green-50 text-green-700', yellow:'bg-yellow-50 text-yellow-700', purple:'bg-purple-50 text-purple-700' };
  return `<div class="bg-white rounded-xl p-5 shadow-sm">
    <div class="flex justify-between items-start">
      <div><p class="text-sm text-gray-500">${label}</p><p class="text-2xl font-bold text-gray-800 mt-1">${value}</p></div>
      <span class="text-2xl p-2 rounded-lg ${colors[color]}">${icon}</span>
    </div>
  </div>`;
}

function tierCard(label, count, color, sub) {
  const bg = { blue:'bg-blue-50 text-blue-700 border-blue-200', yellow:'bg-yellow-50 text-yellow-700 border-yellow-200', green:'bg-green-50 text-green-700 border-green-200' };
  return `<div class="flex items-center justify-between p-3 rounded-lg border ${bg[color]}">
    <div><p class="font-semibold text-sm">${label}</p><p class="text-xs opacity-70">${sub}</p></div>
    <span class="text-2xl font-bold">${count}</span>
  </div>`;
}

async function loadActivityLog() {
  try {
    const res = await apiRequest('GET', '/activity-log');
    const logs = res?.data || [];
    const el = document.getElementById('activityLog');
    if (!el) return;
    if (!logs.length) { el.innerHTML = emptyHTML('Nenhuma atividade recente.'); return; }
    el.innerHTML = `<div class="space-y-2">${logs.slice(0,10).map(l => `
      <div class="flex items-start gap-3 py-2 border-b last:border-0">
        <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono whitespace-nowrap">${l.action}</span>
        <span class="text-sm text-gray-700 flex-1">${l.description}</span>
        <span class="text-xs text-gray-400 whitespace-nowrap">${formatDate(l.createdAt)}</span>
      </div>`).join('')}</div>`;
  } catch { document.getElementById('activityLog').innerHTML = emptyHTML('Nenhuma atividade recente.'); }
}
```

Confirme antes de avançar.

---

## ETAPA 4 — Criar `superadmin-parceiros.js`

Crie `frontend/superadmin-parceiros.js`. Implemente:
- `loadParceiros()` — GET /api/partners, renderizar tabela com colunas: Nome, Email, Telefone, CPF/CNPJ, Tier (badge), Clientes Ativos, Status (badge), Ações (Editar | Desativar)
- `openModalParceiro(id = null)` — abre modal; se `id` fornecido, faz GET /api/partners/:id e preenche os campos
- `saveModalParceiro()` — POST ou PUT dependendo se tem ID; ao salvar, fecha modal e chama `loadParceiros()`
- `desativarParceiro(id)` — confirm() + DELETE /api/partners/:id + reload
- O modal HTML deve ser criado dinamicamente no `<body>` se não existir (id: `modalParceiro`)
- Campos do modal: Nome*, Email*, Senha (obrigatório só criação), Telefone*, CPF/CNPJ, Status (select — só edição)

Confirme antes de avançar.

---

## ETAPA 5 — Criar `superadmin-planos.js`

Crie `frontend/superadmin-planos.js`. Implemente:
- `loadPlanos()` — GET /api/plans, renderizar cards/tabela
- `openModalPlano(id = null)` — carrega módulos via GET /api/plans/modules/prices, renderiza toggles, preenche se edição
- `calcularTotalPlano()` — lê basePrice + soma módulos ativos, atualiza elemento `#planTotal` em tempo real
- `saveModalPlano()` — POST ou PUT, fecha e recarrega
- `desativarPlano(id)` — confirm() + DELETE, exibe erro da API se tiver clientes ativos
- Badge "PacoTicket #N" quando `pacoticketPlanId` preenchido
- Campo `pacoticketPlanId` com texto auxiliar: *"Opcional. Preencha se este plano corresponde a um plano existente na plataforma PacoTicket. Usado apenas para identificação."*

Confirme antes de avançar.

---

## ETAPA 6 — Criar `superadmin-clientes.js`

Crie `frontend/superadmin-clientes.js`. Implemente:
- `loadClientes(filtros = {})` — GET /api/clients com query params opcionais ?partnerId=&status=&planId=
- Filtros no topo: select de parceiros, select de status, select de planos
- Tabela: Empresa, Contato, Parceiro, Plano, Recorrência, Vencimento (vermelho se < hoje), Status, Fatura (faturaBadge), Ações
- `openModalCliente(id = null)` — preenche selects de parceiro e plano; ao selecionar plano exibe seus módulos ativos abaixo
- `saveModalCliente()` — POST ou PUT
- `desativarCliente(id)` — confirm() + DELETE

Confirme antes de avançar.

---

## ETAPA 7 — Criar `superadmin-comissoes.js`

Crie `frontend/superadmin-comissoes.js`. Implemente:
- `loadComissoes()` — GET /api/commissions com filtros de mês, ano, parceiro, status; GET /api/commissions/summary para card de resumo
- `calcularComissoes()` — POST /api/commissions/calculate com { month, year } do filtro; exibe resultado em toast
- `pagarComissao(id)` — PUT /api/commissions/:id/pay + reload
- `exportarCSVComissoes()` — gera CSV dos dados exibidos usando Blob + URL.createObjectURL
- Filtros: mês (1–12), ano (últimos 3 anos), parceiro (select), status
- Botão "Calcular Comissões" e botão "Exportar CSV"
- Tabela: Parceiro, Cliente, Período, Tier (badge), %, Base, Comissão, Status, Pago em, Ação (botão "Pagar" só se PENDING)

Confirme antes de avançar.

---

## ETAPA 8 — Criar `superadmin-faturas.js`

Crie `frontend/superadmin-faturas.js`. Implemente:
- `loadFaturas()` — GET /api/invoices com filtros de mês, ano, status, clientId
- `sincronizarPacoTicket()` — POST /api/invoices/sync; exibe resultado em toast
- Filtros: mês, ano, status, cliente (select)
- Tabela: Cliente, Parceiro, Plano, Valor, Vencimento (vermelho se vencido e não pago), Status (badge), Pago em
- Botão "Sincronizar PacoTicket" no topo da aba

Confirme antes de avançar.

---

## ETAPA 9 — Criar `superadmin-config.js`

Crie `frontend/superadmin-config.js`. Implemente:
- `loadConfig()` — GET /api/plans/modules/prices; renderiza tabela editável
- `salvarPrecos()` — coleta todos os inputs de preço, PUT /api/plans/modules/prices com array [{moduleKey, price}]
- Aviso fixo: *"⚠️ Alterar preços não recalcula planos já cadastrados. Edite os planos manualmente se necessário."*
- Seção Token PacoTicket (somente texto + badge "Configurado")
- Seção Regras de Comissionamento (3 cards somente leitura):
  - Tier 1 — Indicador (15%): 1 a 2 clientes ativos
  - Tier 2 — Parceiro (25%): 3 a 9 clientes ativos
  - Tier 3 — Master (35%): 10 ou mais clientes ativos

Confirme antes de avançar.

---

## ETAPA 10 — Limpeza final

1. Verifique se `superadmin.html` tem exatamente uma ocorrência de cada `<script src="superadmin-*.js">` na ordem correta antes do `</body>`
2. Certifique-se de que o botão Sair no header chama `logout()` (definida em utils)
3. Todos os botões de aba chamam `showTab('tab-X')` (definida em utils)
4. Delete qualquer versão antiga de `superadmin.js` se ela ainda duplicar funções já em utils
5. Rode um grep para confirmar zero ocorrências de "revendedor" ou "reseller" nos arquivos frontend:
   ```bash
   grep -ri "revendedor\|reseller" frontend/
   ```
6. Faça build e deploy:
   ```bash
   docker build -t pacoticket-frontend:latest ./frontend
   docker stack deploy -c docker-stack.yml pacoticket
   ```

---

## Regras de execução

- **Uma etapa por vez.** Crie o arquivo, confirme que não há erros de sintaxe, depois avance.
- **Nunca edite o arquivo inteiro de uma vez.** Sempre crie arquivos novos ou edite blocos pequenos.
- **Nunca altere** `login.html`, `partner.html`, `partner.js`, nada em `backend/`, nem arquivos de infraestrutura.
- Se uma etapa travar, escreva o arquivo em duas metades com `cat >> arquivo.js`.