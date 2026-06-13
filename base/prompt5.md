# Auditoria Completa — PacoTicket SuperAdmin

## Contexto

O sistema está em produção via Docker Swarm. O frontend exibe apenas o header com as abas e uma tela em branco — nenhuma aba carrega conteúdo. O botão Sair não funciona. Este prompt instrui uma auditoria completa: diagnóstico primeiro, correção depois.

**Leia antes de começar:** `CLAUDE.md` e `pacoticket-reseller-skill.md`.

---

## FASE 1 — Diagnóstico (não corrija nada ainda)

Execute cada verificação abaixo e anote o resultado.

### 1.1 — Arquivos JS no frontend

```bash
ls -la /home/user/parceiros/frontend/*.js
```

Verifique se existem: `superadmin.js`, `superadmin-utils.js`, `superadmin-dashboard.js`, `superadmin-parceiros.js`, `superadmin-planos.js`, `superadmin-clientes.js`, `superadmin-comissoes.js`, `superadmin-faturas.js`, `superadmin-config.js`

### 1.2 — Scripts carregados no HTML

```bash
grep -n "<script" /home/user/parceiros/frontend/superadmin.html
```

Verifique: quais scripts estão referenciados, se a ordem está correta (utils primeiro), se há scripts referenciados que não existem no disco (um 404 de JS silencioso quebra todos os scripts seguintes).

### 1.3 — Funções essenciais definidas

```bash
grep -rn "^function\|^async function\|^const " /home/user/parceiros/frontend/superadmin*.js 2>/dev/null | grep -E "apiRequest|showTab|logout|showToast|loadDashboard|loadParceiros|loadPlanos|loadClientes|loadComissoes|loadFaturas|loadConfig"
```

Se alguma função essencial não aparecer, está faltando ou mal definida.

### 1.4 — Estrutura HTML das abas

```bash
grep -n "tab-content\|tab-btn\|data-tab\|showTab\|id=\"tab-" /home/user/parceiros/frontend/superadmin.html
```

Verifique:
- Botões de aba têm `onclick="showTab('tab-X')"` ou `data-tab="tab-X"`
- Divs de conteúdo têm `id="tab-dashboard"`, `id="tab-parceiros"`, etc.
- Divs têm classe `tab-content` (necessária para o toggle)
- Aba inicial `tab-dashboard` está visível, as outras com `class="hidden"`

### 1.5 — Verificar scripts referenciados vs arquivos existentes

```bash
grep -o 'src="[^"]*\.js"' /home/user/parceiros/frontend/superadmin.html | \
  sed 's/src="//;s/"//' | \
  while read f; do
    [ -f "/home/user/parceiros/frontend/$f" ] && echo "OK $f" || echo "FALTANDO: $f"
  done
```

### 1.6 — Backend respondendo

```bash
curl -s http://localhost:3000/api/health
```

Se não responder:
```bash
docker stack services pacoticket
docker service logs pacoticket_backend --tail 50
```

### 1.7 — Login retorna tokens

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}'
```

Deve retornar `{ success: true, data: { accessToken, refreshToken, user } }`.

### 1.8 — Nginx proxy funcionando

```bash
curl -sk -X POST https://parceiros.pacoticket.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}'
```

### 1.9 — Duplicação de funções

```bash
grep -rn "function apiRequest\|function showTab\|function logout" /home/user/parceiros/frontend/superadmin*.js
```

Se a mesma função aparecer em mais de um arquivo, há conflito. A última declaração vence e pode ser a versão quebrada.

---

## FASE 2 — Mapa de divergências

Antes de corrigir qualquer coisa, liste o que encontrou:

| Item | Esperado | Encontrado | Corrigir? |
|------|----------|------------|-----------|
| Arquivos JS existem | 9 arquivos | ? | ? |
| Scripts no HTML sem 404 | todos OK | ? | ? |
| Funções essenciais definidas | 11 funções | ? | ? |
| Divs tab-content com id correto | 7 divs | ? | ? |
| Backend health check | status ok | ? | ? |
| Login retorna tokens | sim | ? | ? |
| Nginx proxy /api/ | funciona | ? | ? |
| Funções duplicadas | nenhuma | ? | ? |

---

## FASE 3 — Correções

**Regra:** corrija apenas o que o diagnóstico confirmou como problema. Uma correção por vez. Confirme que funcionou antes de avançar.

---

### FIX A — Criar/recriar `superadmin-utils.js`

Se não existir ou estiver incompleto, crie com exatamente este conteúdo:

```javascript
// superadmin-utils.js
const API_BASE = '/api';

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

const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

const recorrenciaLabel = {
  MONTHLY: 'Mensal', QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral', ANNUAL: 'Anual'
};

function tierInfo(n) {
  if (n >= 10) return { tier: 3, label: 'Master',    pct: 35, color: 'green'  };
  if (n >= 3)  return { tier: 2, label: 'Parceiro',  pct: 25, color: 'yellow' };
  return              { tier: 1, label: 'Indicador', pct: 15, color: 'blue'   };
}

function showToast(message, type = 'success') {
  const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500' };
  const el = document.createElement('div');
  el.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg text-white text-sm font-medium shadow-lg ${colors[type] || colors.success}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

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
  const map = {
    ACTIVE:    ['Ativo',    'green'],
    INACTIVE:  ['Inativo',  'red'],
    SUSPENDED: ['Suspenso', 'yellow']
  };
  const [label, color] = map[status] || ['—', 'gray'];
  return badge(label, color);
}

function faturaBadge(invoices) {
  const last = (invoices || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!last)                       return badge('Sem fatura', 'gray');
  if (last.status === 'PAID')      return badge('Pago',       'green');
  if (last.status === 'OVERDUE')   return badge('Vencido',    'red');
  return                                  badge('Pendente',   'yellow');
}

function tierBadge(n) {
  const { label, color } = tierInfo(n);
  return badge(label, color);
}

function spinnerHTML() {
  return `<div class="flex justify-center py-12">
    <div class="border-4 border-gray-200 border-t-blue-600 rounded-full w-10 h-10 animate-spin"></div>
  </div>`;
}

function emptyHTML(msg) {
  return `<div class="text-center py-12 text-gray-400">${msg || 'Nenhum registro encontrado.'}</div>`;
}

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('tab-active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.remove('hidden');
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('tab-active');
  const loaders = {
    'tab-dashboard': () => typeof loadDashboard === 'function' && loadDashboard(),
    'tab-parceiros': () => typeof loadParceiros === 'function' && loadParceiros(),
    'tab-planos':    () => typeof loadPlanos    === 'function' && loadPlanos(),
    'tab-clientes':  () => typeof loadClientes  === 'function' && loadClientes(),
    'tab-comissoes': () => typeof loadComissoes === 'function' && loadComissoes(),
    'tab-faturas':   () => typeof loadFaturas   === 'function' && loadFaturas(),
    'tab-config':    () => typeof loadConfig    === 'function' && loadConfig(),
  };
  loaders[tabId]?.();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!sessionStorage.getItem('access_token')) { redirectToLogin(); return; }
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const el = document.getElementById('adminName');
  if (el) el.textContent = user.email || 'Administrador';
  showTab('tab-dashboard');
});
```

---

### FIX B — Corrigir `superadmin.html`

O HTML deve ter exatamente esta estrutura. Edite apenas o que estiver errado, não reescreva o arquivo inteiro.

**Header:**
```html
<header class="gradient-bg text-white shadow-lg">
  <div class="container mx-auto px-6 py-4 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <h1 class="text-xl font-bold">PacoTicket SuperAdmin</h1>
    </div>
    <div class="flex items-center space-x-4">
      <span id="adminName" class="text-sm text-blue-100"></span>
      <button onclick="logout()" class="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition">
        Sair
      </button>
    </div>
  </div>
</header>
```

**Nav de abas:**
```html
<nav class="bg-white border-b shadow-sm">
  <div class="container mx-auto px-6">
    <div class="flex space-x-1">
      <button class="tab-btn tab-active px-4 py-4 text-sm font-medium" data-tab="tab-dashboard" onclick="showTab('tab-dashboard')">Dashboard</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-parceiros" onclick="showTab('tab-parceiros')">Parceiros</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-planos" onclick="showTab('tab-planos')">Planos</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-clientes" onclick="showTab('tab-clientes')">Clientes</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-comissoes" onclick="showTab('tab-comissoes')">Comissões</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-faturas" onclick="showTab('tab-faturas')">Faturas</button>
      <button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-config" onclick="showTab('tab-config')">Configurações</button>
    </div>
  </div>
</nav>
```

**Container de conteúdo:**
```html
<main class="container mx-auto px-6 py-6">
  <div id="tab-dashboard" class="tab-content"></div>
  <div id="tab-parceiros" class="tab-content hidden"></div>
  <div id="tab-planos"    class="tab-content hidden"></div>
  <div id="tab-clientes"  class="tab-content hidden"></div>
  <div id="tab-comissoes" class="tab-content hidden"></div>
  <div id="tab-faturas"   class="tab-content hidden"></div>
  <div id="tab-config"    class="tab-content hidden"></div>
</main>
```

**CSS obrigatório no `<head>`:**
```html
<style>
  * { font-family: 'Inter', sans-serif; }
  .gradient-bg { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%); }
  .tab-active { border-bottom: 3px solid #2563eb; color: #2563eb; font-weight: 600; }
</style>
```

**Scripts antes de `</body>` — exatamente nesta ordem:**
```html
<script src="superadmin-utils.js"></script>
<script src="superadmin-dashboard.js"></script>
<script src="superadmin-parceiros.js"></script>
<script src="superadmin-planos.js"></script>
<script src="superadmin-clientes.js"></script>
<script src="superadmin-comissoes.js"></script>
<script src="superadmin-faturas.js"></script>
<script src="superadmin-config.js"></script>
```

Se `superadmin.js` ainda existir no HTML e duplicar funções de utils, remova-o das tags script.

---

### FIX C — Remover scripts que referenciam arquivos inexistentes

Qualquer `<script src="arquivo-que-nao-existe.js">` causa falha silenciosa que impede todos os scripts seguintes de executar.

```bash
# Identificar e remover referencias quebradas
grep -o 'src="[^"]*\.js"' /home/user/parceiros/frontend/superadmin.html | \
  sed 's/src="//;s/"//' | \
  while read f; do
    [ ! -f "/home/user/parceiros/frontend/$f" ] && echo "REMOVER: $f"
  done
```

Para cada arquivo listado como faltando, remova a linha `<script>` correspondente do HTML.

---

### FIX D — Criar arquivos de aba faltantes

Para cada arquivo de aba que não existe, crie-o com uma implementação mínima que pelo menos renderize algo. Isso prova que a estrutura funciona antes de implementar o CRUD completo.

Exemplo de implementação mínima para aba que não existe ainda:

```javascript
// superadmin-dashboard.js — implementação mínima para teste
async function loadDashboard() {
  const el = document.getElementById('tab-dashboard');
  if (!el) return;
  el.innerHTML = spinnerHTML();
  try {
    const [rP, rC, rS] = await Promise.all([
      apiRequest('GET', '/partners'),
      apiRequest('GET', '/clients'),
      apiRequest('GET', '/commissions/summary'),
    ]);
    const parceiros = rP?.data || [];
    const clientes  = rC?.data || [];
    const summary   = rS?.data || {};
    const ativos = parceiros.filter(p => p.status === 'ACTIVE');
    const clientesAtivos = clientes.filter(c => c.status === 'ACTIVE');
    const receitaTotal = clientesAtivos.reduce((s, c) => s + Number(c.plan?.totalPrice || 0), 0);
    const t1 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 1).length;
    const t2 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 2).length;
    const t3 = ativos.filter(p => tierInfo(p.activeClientCount || 0).tier === 3).length;
    const top5 = [...ativos].sort((a,b)=>(b.activeClientCount||0)-(a.activeClientCount||0)).slice(0,5);
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl p-5 shadow-sm"><p class="text-sm text-gray-500">Parceiros Ativos</p><p class="text-3xl font-bold text-gray-800">${ativos.length}</p></div>
          <div class="bg-white rounded-xl p-5 shadow-sm"><p class="text-sm text-gray-500">Clientes Ativos</p><p class="text-3xl font-bold text-gray-800">${clientesAtivos.length}</p></div>
          <div class="bg-white rounded-xl p-5 shadow-sm"><p class="text-sm text-gray-500">Comissões Pendentes</p><p class="text-2xl font-bold text-yellow-600">${formatCurrency(summary.pending||0)}</p></div>
          <div class="bg-white rounded-xl p-5 shadow-sm"><p class="text-sm text-gray-500">Receita Mensal</p><p class="text-2xl font-bold text-green-600">${formatCurrency(receitaTotal)}</p></div>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold text-gray-800 mb-4">Distribuição por Tier</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200"><div><p class="font-semibold text-blue-800 text-sm">Indicador (15%)</p><p class="text-xs text-blue-600">1-2 clientes ativos</p></div><span class="text-2xl font-bold text-blue-700">${t1}</span></div>
              <div class="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200"><div><p class="font-semibold text-yellow-800 text-sm">Parceiro (25%)</p><p class="text-xs text-yellow-600">3-9 clientes ativos</p></div><span class="text-2xl font-bold text-yellow-700">${t2}</span></div>
              <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200"><div><p class="font-semibold text-green-800 text-sm">Master (35%)</p><p class="text-xs text-green-600">10+ clientes ativos</p></div><span class="text-2xl font-bold text-green-700">${t3}</span></div>
            </div>
          </div>
          <div class="bg-white rounded-xl p-6 shadow-sm">
            <h3 class="font-semibold text-gray-800 mb-4">Top Parceiros</h3>
            ${top5.length ? `<table class="w-full text-sm"><thead><tr class="text-gray-400 text-xs border-b"><th class="text-left pb-2">Nome</th><th class="text-center pb-2">Tier</th><th class="text-right pb-2">Clientes</th></tr></thead><tbody>${top5.map(p=>`<tr class="border-b last:border-0"><td class="py-2">${p.name}</td><td class="py-2 text-center">${tierBadge(p.activeClientCount||0)}</td><td class="py-2 text-right font-bold">${p.activeClientCount||0}</td></tr>`).join('')}</tbody></table>` : emptyHTML('Nenhum parceiro ativo.')}
          </div>
        </div>
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <h3 class="font-semibold text-gray-800 mb-4">Atividades Recentes</h3>
          <div id="activityLog">${spinnerHTML()}</div>
        </div>
      </div>`;
    // Carregar log de atividades
    try {
      const resLog = await apiRequest('GET', '/activity-log');
      const logs = resLog?.data || [];
      const logEl = document.getElementById('activityLog');
      if (!logEl) return;
      if (!logs.length) { logEl.innerHTML = emptyHTML('Nenhuma atividade recente.'); return; }
      logEl.innerHTML = `<div class="space-y-2">${logs.slice(0,10).map(l=>`
        <div class="flex items-start gap-3 py-2 border-b last:border-0">
          <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono">${l.action}</span>
          <span class="text-sm text-gray-700 flex-1">${l.description}</span>
          <span class="text-xs text-gray-400">${formatDate(l.createdAt)}</span>
        </div>`).join('')}</div>`;
    } catch { document.getElementById('activityLog').innerHTML = emptyHTML('Nenhuma atividade recente.'); }
  } catch(e) { showToast(e.message, 'error'); }
}
```

Para as abas ainda sem implementação, crie um stub mínimo para não quebrar:

```javascript
// superadmin-parceiros.js (stub — implementar depois)
async function loadParceiros() {
  document.getElementById('tab-parceiros').innerHTML =
    '<div class="bg-white rounded-xl p-6 shadow-sm"><p class="text-gray-500">Carregando parceiros...</p></div>';
  try {
    const res = await apiRequest('GET', '/partners');
    const lista = res?.data || [];
    document.getElementById('tab-parceiros').innerHTML =
      lista.length ? `<p>${lista.length} parceiros encontrados. Implementação completa em breve.</p>` : emptyHTML('Nenhum parceiro cadastrado.');
  } catch(e) { showToast(e.message, 'error'); }
}
```

Repita o padrão de stub para: `loadPlanos`, `loadClientes`, `loadComissoes`, `loadFaturas`, `loadConfig`.

Após os stubs confirmarem que as abas funcionam, implemente cada uma completamente — uma por vez.

---

### FIX E — Se o backend não estiver respondendo

```bash
docker stack services pacoticket
docker service update --force pacoticket_backend
docker service logs pacoticket_backend --tail 100
```

---

### FIX F — Se o nginx não estiver roteando /api/

Verifique o nginx.conf atual:

```bash
cat /home/user/parceiros/frontend/nginx.conf
```

Deve conter um bloco de proxy para `/api/`:

```nginx
location /api/ {
    resolver 127.0.0.11 valid=5s;
    set $backend_host backend;
    proxy_pass http://$backend_host:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Se estiver diferente ou faltando, corrija e faça rebuild do frontend.

---

## FASE 4 — Implementação completa das abas (após estrutura validada)

**Pré-requisito obrigatório:** abra o browser, acesse a URL, clique em cada aba e confirme que pelo menos o spinner ou o stub aparece. Só então implemente o CRUD completo.

Implemente uma aba por vez na ordem: Parceiros → Planos → Clientes → Comissões → Faturas → Configurações.

**Aba Parceiros — contrato completo:**
- `loadParceiros()` — GET /api/partners → tabela: Nome, Email, Telefone, Documento, Tier (badge), Clientes Ativos, Status (badge), Ações [Editar | Desativar]
- `abrirModalParceiro(id)` — se id, GET /api/partners/:id e preenche; se não, form limpo; senha obrigatória só na criação
- `salvarParceiro(event)` — event.preventDefault(); POST ou PUT; fecha modal; recarrega lista
- `desativarParceiro(id)` — confirm() + DELETE /api/partners/:id + loadParceiros()
- Modal id: `modalParceiro`, form id: `formParceiro`

**Aba Planos — contrato completo:**
- `loadPlanos()` — GET /api/plans → cards: Nome, Preço Base, Preço Total, Users/Conexões/Filas, módulos ativos (badges), clientes vinculados, badge "PacoTicket #N" se pacoticketPlanId
- `abrirModalPlano(id)` — GET /api/plans/modules/prices; renderiza toggles; se id preenche; listener no basePrice e nos toggles chama calcularTotalPlano()
- `calcularTotalPlano()` — lê valor de `#plBasePrice` + soma preços dos módulos com checkbox checado; atualiza `#plTotal`
- `salvarPlano(event)` — POST ou PUT; fecha; recarrega
- `desativarPlano(id)` — confirm() + DELETE; se erro da API exibe mensagem via showToast
- Campo pacoticketPlanId: number input com texto auxiliar "Opcional. Usado apenas para identificação com a plataforma PacoTicket."

**Aba Clientes — contrato completo:**
- `loadClientes(filtros)` — GET /api/clients?partnerId=&status=&planId= → tabela com faturaBadge
- Filtros no topo: selects de parceiro, status, plano; botão "Filtrar" chama loadClientes com os valores
- Vencimento vermelho se data < hoje e status != INACTIVE
- `abrirModalCliente(id)` — carrega parceiros e planos nos selects; ao selecionar plano mostra módulos ativos abaixo
- `salvarCliente(event)` — POST ou PUT
- `desativarCliente(id)` — confirm() + DELETE

**Aba Comissões — contrato completo:**
- `loadComissoes()` — GET /api/commissions (com filtros mês/ano/parceiro/status) + GET /api/commissions/summary
- Card resumo topo: Pendente | Pago | Total
- Tabela: Parceiro, Cliente, Período (mês/ano), Tier (badge), %, Base (R$), Comissão (R$), Status (badge), Pago em, Ação
- `calcularComissoes()` — POST /api/commissions/calculate com {month, year}; showToast com resultado
- `pagarComissao(id)` — PUT /api/commissions/:id/pay + loadComissoes()
- `exportarCSV()` — Blob com BOM UTF-8, separador `;`, download automático

**Aba Faturas — contrato completo:**
- `loadFaturas()` — GET /api/invoices com filtros; tabela
- Vencimento vermelho se vencido e status != PAID
- `sincronizarPacoTicket()` — POST /api/invoices/sync; showToast com resultado

**Aba Configurações — contrato completo:**
- `loadConfig()` — GET /api/plans/modules/prices; tabela com input de preço por linha
- `salvarPrecos()` — coleta inputs; PUT /api/plans/modules/prices; showToast
- Aviso: "Alterar preços não recalcula planos ja cadastrados."
- Seção Token PacoTicket: texto + badge verde "Configurado"
- Seção Regras: 3 cards somente leitura (Indicador 15%, Parceiro 25%, Master 35%)

---

## FASE 5 — Deploy e validação final

```bash
docker build -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 15
docker stack services pacoticket
```

**Checklist:**
- [ ] Login → redireciona para superadmin.html
- [ ] Dashboard carrega KPIs
- [ ] Botão Sair funciona (limpa sessão, vai para login.html)
- [ ] Todas as 7 abas carregam conteúdo
- [ ] Modais abrem e salvam via API
- [ ] Zero ocorrências de "revendedor/reseller" na interface:

```bash
grep -ri "revendedor\|reseller" /home/user/parceiros/frontend/*.html /home/user/parceiros/frontend/*.js
```

---

## Regras absolutas

1. Nao altere: `login.html`, `partner.html`, `partner.js`, nenhum arquivo em `backend/`, arquivos de infraestrutura
2. Nunca reescreva um arquivo JS grande de uma so vez — crie arquivos novos ou edite blocos pequenos
3. Diagnostique antes de corrigir — nao pule a Fase 1
4. Uma correcao por vez — confirme que funcionou antes de avancar
5. Terminologia: parceiro/partner — nunca revendedor/reseller na interface