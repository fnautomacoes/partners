# Feature: Logo PDF, Edição de Planos do Parceiro, Cards Completos no Simulador e Exportação PDF

## Pré-requisito

Aplicar ao banco antes de começar:
```bash
psql -h HOST -U postgres -d pacoticket_parceiros -f schema_update_logopdf.sql
```

**Leia antes de começar:** `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras absolutas

- **Um arquivo por vez** — `str_replace` cirúrgico, nunca reescreva arquivos grandes
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura
- Backend é fonte de verdade — frontend é UX

---

## FASE 1 — Diagnóstico

```bash
# 1. Confirmar chave logoPdf no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findMany({ where: { key: { in: ['logoPdf','logoLogin','logoInternal'] } } })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .finally(() => p.\$disconnect());
"

# 2. Verificar sistema de config no backend
grep -n "allowed\|logoPdf\|logoLogin" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js

# 3. Verificar estrutura atual do partner-pricing.js
grep -n "editarPlano\|Meu.*Plano\|basePlanId\|setupFee\|modulos\|acrescimo" \
  /home/user/parceiros/frontend/partner-pricing.js | head -30

# 4. Verificar estrutura atual do partner-simulator.js
grep -n "simPlanCard\|activeModules\|renderSimulator\|simResumo\|Salvar como" \
  /home/user/parceiros/frontend/partner-simulator.js | head -30

# 5. Verificar se Gotenberg está disponível
curl -s http://gotenberg:3000/health 2>/dev/null || \
  curl -s https://pdf.pacoticket.com.br/health 2>/dev/null || \
  echo "Gotenberg: verificar URL no docker-stack.yml"

# 6. Verificar URL do Gotenberg no stack
grep -n "gotenberg\|GOTENBERG\|pdf\." /home/user/parceiros/docker-stack.yml 2>/dev/null || \
  grep -rn "gotenberg\|GOTENBERG" /home/user/parceiros/backend/src/ 2>/dev/null
```

---

## FASE 2 — Backend: `logoPdf` no system-config

### 2.1 — Adicionar `logoPdf` ao array `allowed`

```bash
grep -n "allowed" /home/user/parceiros/backend/src/routes/system-config.routes.js
```

Use `str_replace` para adicionar `'logoPdf'` no array `allowed`:

```javascript
// ANTES:
const allowed = [
  'businessName', 'logoLogin', 'logoInternal', 'favicon', 'apiBaseUrl', 'logoLoginWidth',
  // ...cores...
];

// DEPOIS — adicionar logoPdf:
const allowed = [
  'businessName', 'logoLogin', 'logoInternal', 'logoPdf', 'favicon', 'apiBaseUrl', 'logoLoginWidth',
  // ...cores...
];
```

### 2.2 — Criar endpoint de geração de PDF via Gotenberg

Crie `backend/src/routes/pdf.routes.js`:

```javascript
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const configSvc = require('../services/system-config.service');

// POST /api/pdf/plan — gera PDF de um plano e retorna como buffer
router.post('/plan', requireAuth, async (req, res) => {
  try {
    const cfg = await configSvc.getAll();
    const gotenbergUrl = process.env.GOTENBERG_URL || 'http://gotenberg:3000';

    const { html } = req.body;
    if (!html) return res.status(400).json({ success: false, error: 'HTML_REQUIRED' });

    // Chamar Gotenberg para converter HTML → PDF
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop',    '0.5');
    form.append('marginBottom', '0.5');
    form.append('marginLeft',   '0.5');
    form.append('marginRight',  '0.5');

    const gRes = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
      method: 'POST',
      body:   form,
    });

    if (!gRes.ok) {
      const err = await gRes.text();
      return res.status(502).json({ success: false, error: 'GOTENBERG_ERROR', message: err });
    }

    const pdfBuffer = await gRes.arrayBuffer();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="proposta.pdf"');
    res.send(Buffer.from(pdfBuffer));

  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

module.exports = router;
```

Registrar em `server.js`:
```javascript
app.use('/api/pdf', require('./routes/pdf.routes'));
```

Adicionar `GOTENBERG_URL` ao `.env`:
```
GOTENBERG_URL=http://gotenberg:3000
```

> **Nota:** O Gotenberg já está no stack Docker (`pdf.pacoticket.com.br`). A URL interna entre containers é `http://gotenberg:3000` — sem passar pelo Traefik/domínio público.

Confirme: `POST /api/pdf/plan` com body `{ html: "<h1>teste</h1>" }` retorna PDF binário → avance.

---

## FASE 3 — Frontend SuperAdmin: Campo `logoPdf` em Configurações

Edite `superadmin-config.js`. Use `str_replace` para inserir após o campo `logoInternal`.

### 3.1 — Adicionar campo no HTML gerado pela seção de configurações do sistema

Localize o bloco onde `logoInternal` é renderizado:

```bash
grep -n "logoInternal\|Logo interna\|logo.*interna" \
  /home/user/parceiros/frontend/superadmin-config.js | head -10
```

Após o campo `logoInternal`, adicionar:

```javascript
// Inserir após o campo de logoInternal:
`<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">Logo para PDFs</label>
  <input type="url" id="cfgLogoPdf" placeholder="https://..."
    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
  <p class="text-xs text-gray-400 mt-1">
    URL da imagem usada no cabeçalho dos PDFs exportados (propostas, relatórios).
    Recomendado: PNG ou SVG com fundo transparente, largura mínima 300px.
  </p>
  <div id="logoPdfPreview" class="mt-2 hidden">
    <img src="" alt="Preview logo PDF" class="h-10 object-contain border border-gray-100 rounded p-1 bg-white">
  </div>
</div>`
```

### 3.2 — Preencher campo ao carregar config

```javascript
// Em loadConfig(), após preencher os outros campos:
const cfgLogoPdfEl = document.getElementById('cfgLogoPdf');
if (cfgLogoPdfEl) {
  cfgLogoPdfEl.value = config.logoPdf || '';
  // Mostrar preview se URL preenchida
  if (config.logoPdf) {
    const preview = document.getElementById('logoPdfPreview');
    const img = preview?.querySelector('img');
    if (preview && img) { img.src = config.logoPdf; preview.classList.remove('hidden'); }
  }
}
```

### 3.3 — Incluir no `salvarConfig()`

```javascript
body.logoPdf = document.getElementById('cfgLogoPdf')?.value?.trim() || null;
```

---

## FASE 4 — Frontend Parceiro: Edição de Planos Próprios (regras de preço)

Edite `partner-pricing.js`. Use `str_replace` cirúrgico.

### Regras de negócio da edição (implementar no frontend):

1. **Valores base do plano nunca mudam** — o `basePrice` herdado do plano global é fixo
2. **Acréscimo de setup** — único valor editável em termos de preço; só a diferença acima do setup base gera comissão
3. **Adicionar itens (módulos/recursos)** — incrementa o preço total (soma ao base)
4. **Remover itens da base** — não desconta do preço (o preço base já inclui tudo do plano original)
5. **Parceiro não vê nem edita preços individuais** — apenas vê o que cada item representa

### 4.1 — Substituir `editarPlanoProprioModal` por versão completa

Localize a função `editarPlanoProprioModal` e substitua com `str_replace`:

```javascript
async function editarPlanoProprioModal(planId) {
  // Carregar dados do plano e do plano base
  const [rPlan, rModules, rResources] = await Promise.all([
    apiRequest('GET', `/plans/${planId}`),
    apiRequest('GET', '/plans/modules/prices'),
    apiRequest('GET', '/resource-prices'),
  ]);

  const plan     = rPlan?.data;
  if (!plan) { showToast('Plano não encontrado.', 'error'); return; }

  const basePlan = plan.basePlanId
    ? (await apiRequest('GET', `/plans/${plan.basePlanId}`))?.data
    : null;

  const modules   = (rModules?.data   || []).filter(m => m.isVisible !== false);
  const resources = (rResources?.data || []).filter(r => r.isVisible !== false);

  // Preço base fixo (nunca editável)
  const basePrice    = Number(plan.basePrice);
  const baseSetupFee = Number(basePlan?.setupFee || 0);

  // Módulos que estavam no plano base original
  const baseModuleKeys = new Set(
    (basePlan?.activeModules || []).map(m => m.key)
  );

  // Estado dos extras adicionados pelo parceiro (acima do base)
  let _editExtras = {
    modules:    new Set(
      (plan.activeModules || [])
        .filter(m => !baseModuleKeys.has(m.key))
        .map(m => m.key)
    ),
    resources:  {},   // key → quantidade extra
    setupExtra: Math.max(0, Number(plan.setupFee) - baseSetupFee),
  };

  // Criar e exibir modal
  let modal = document.getElementById('modalEditarPlano');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalEditarPlano';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-6';
    document.body.appendChild(modal);
  }

  function calcularTotalExtra() {
    let extra = 0;
    for (const key of _editExtras.modules) {
      const m = modules.find(x => x.moduleKey === key);
      extra += Number(m?.price || 0);
    }
    for (const [key, qty] of Object.entries(_editExtras.resources)) {
      const r = resources.find(x => x.key === key);
      extra += (Number(r?.price || 0)) * Number(qty);
    }
    return extra;
  }

  function renderEditModal() {
    const extraTotal = calcularTotalExtra();
    const totalPrice = basePrice + extraTotal;
    const setupTotal = baseSetupFee + _editExtras.setupExtra;
    const setupComissionado = _editExtras.setupExtra > 0;

    modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4">

      <!-- Header -->
      <div class="px-6 pt-6 pb-4 border-b border-gray-100">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-gray-900">${plan.name}</h2>
            ${basePlan ? `<p class="text-xs text-gray-400 mt-0.5">Baseado em: ${basePlan.name}</p>` : ''}
          </div>
          <button onclick="document.getElementById('modalEditarPlano').classList.add('hidden')"
            class="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">&times;</button>
        </div>
      </div>

      <div class="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

        <!-- Nome -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nome do plano</label>
          <input type="text" id="editPlanNome" value="${plan.name.replace(/"/g,'&quot;')}"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
        </div>

        <!-- Composição do plano base (somente leitura, visual atraente) -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            📦 Composição do plano base (incluído no preço)
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            ${(basePlan || plan).users ? `
            <div class="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span class="text-blue-500">👤</span>
              <div><p class="text-xs font-semibold text-blue-800">${(basePlan || plan).users} Usuário(s)</p>
              <p class="text-xs text-blue-500">${formatCurrency(0)}/unid.</p></div>
            </div>` : ''}
            ${(basePlan || plan).queues ? `
            <div class="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span class="text-blue-500">📋</span>
              <div><p class="text-xs font-semibold text-blue-800">${(basePlan || plan).queues} Fila(s)</p>
              <p class="text-xs text-blue-500">incluso</p></div>
            </div>` : ''}
            ${((basePlan || plan).connectionsWhatsappUnofficial || (basePlan || plan).connections || 0) > 0 ? `
            <div class="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <span class="text-blue-500">💬</span>
              <div><p class="text-xs font-semibold text-blue-800">${(basePlan || plan).connectionsWhatsappUnofficial || (basePlan || plan).connections} WhatsApp</p>
              <p class="text-xs text-blue-500">não oficial · incluso</p></div>
            </div>` : ''}
            ${((basePlan || plan).activeModules || []).map(m => `
            <div class="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <span class="text-gray-400 text-xs">✓</span>
              <div><p class="text-xs font-semibold text-gray-700">${m.label || m.key}</p>
              <p class="text-xs text-gray-400">incluso no plano</p></div>
            </div>`).join('')}
          </div>
          <div class="mt-3 flex items-center justify-between bg-blue-600 text-white rounded-lg px-4 py-2">
            <span class="text-sm font-medium">Preço base (fixo)</span>
            <span class="text-lg font-bold">${formatCurrency(basePrice)}<span class="text-xs font-normal opacity-80">/mês</span></span>
          </div>
        </div>

        <!-- Módulos extras (adicionar ao plano) -->
        ${modules.filter(m => !baseModuleKeys.has(m.moduleKey)).length > 0 ? `
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            ➕ Módulos adicionais (somados ao preço)
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${modules.filter(m => !baseModuleKeys.has(m.moduleKey)).map(m => {
              const isActive = _editExtras.modules.has(m.moduleKey);
              return `
              <label class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200 bg-white'}">
                <input type="checkbox" class="edit-mod-extra w-4 h-4 rounded text-blue-600"
                  data-key="${m.moduleKey}" data-price="${m.price}"
                  ${isActive ? 'checked' : ''}
                  onchange="editToggleModule('${m.moduleKey}', this.checked)">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-800 truncate">${m.label}</p>
                  <p class="text-xs font-bold text-blue-600">+ ${formatCurrency(m.price)}<span class="text-gray-400 font-normal">/mês</span></p>
                  ${Number(m.setupFee) > 0 ? `<p class="text-xs text-orange-500">Setup: ${formatCurrency(m.setupFee)}</p>` : ''}
                </div>
              </label>`;
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Setup extra -->
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-amber-800">Acréscimo de Taxa de Setup</p>
              <p class="text-xs text-amber-700 mt-0.5">
                Setup base do plano: <strong>${formatCurrency(baseSetupFee)}</strong> (fixo, incluso).
                Adicione seu acréscimo abaixo — será a base da sua comissão de ativação.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-3">
            <span class="text-sm text-amber-700 font-medium">R$</span>
            <input type="number" id="editSetupExtra" step="0.01" min="0"
              value="${_editExtras.setupExtra.toFixed(2)}"
              class="w-32 px-3 py-1.5 border border-amber-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
              oninput="_editExtras.setupExtra = Math.max(0, parseFloat(this.value)||0); renderEditTotal()">
            <span class="text-xs text-amber-600">acréscimo</span>
          </div>
          <p class="text-xs text-amber-600 mt-2">
            ⚡ Total de setup cobrado do cliente: <strong id="editSetupTotal">${formatCurrency(setupTotal)}</strong>
            ${setupComissionado ? ' · <span class="text-green-600">✓ Gera comissão de ativação</span>' : ''}
          </p>
        </div>

        <!-- Resumo de preço -->
        <div class="bg-gray-900 rounded-xl p-4 text-white">
          <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Resumo do Plano</p>
          <div class="space-y-1.5">
            <div class="flex justify-between text-sm">
              <span class="text-gray-300">Base (fixo)</span>
              <span class="font-semibold">${formatCurrency(basePrice)}</span>
            </div>
            <div class="flex justify-between text-sm" id="editExtraRow">
              <span class="text-gray-300">Extras adicionados</span>
              <span class="font-semibold text-green-400" id="editExtraVal">+ ${formatCurrency(extraTotal)}</span>
            </div>
          </div>
          <div class="border-t border-gray-700 mt-3 pt-3 flex justify-between">
            <span class="font-semibold">Total Mensal</span>
            <span class="text-xl font-bold text-green-400" id="editTotalVal">${formatCurrency(totalPrice)}</span>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
        <button onclick="document.getElementById('modalEditarPlano').classList.add('hidden')"
          class="px-5 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button onclick="salvarEdicaoPlano('${planId}')"
          class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
          Salvar Plano
        </button>
      </div>
    </div>`;

    modal.classList.remove('hidden');
  }

  // Funções de interação do modal
  window.editToggleModule = function(key, checked) {
    if (checked) _editExtras.modules.add(key);
    else         _editExtras.modules.delete(key);
    // Atualizar totais sem rerender tudo
    const extraTotal = calcularTotalExtra();
    const totalPrice = basePrice + extraTotal;
    const el = document.getElementById('editExtraVal');
    const total = document.getElementById('editTotalVal');
    if (el)    el.textContent    = `+ ${formatCurrency(extraTotal)}`;
    if (total) total.textContent = formatCurrency(totalPrice);
  };

  window.renderEditTotal = function() {
    const extraTotal = calcularTotalExtra();
    const totalPrice = basePrice + extraTotal;
    const setupTotal = baseSetupFee + _editExtras.setupExtra;
    const el         = document.getElementById('editExtraVal');
    const total      = document.getElementById('editTotalVal');
    const setupEl    = document.getElementById('editSetupTotal');
    if (el)      el.textContent      = `+ ${formatCurrency(extraTotal)}`;
    if (total)   total.textContent   = formatCurrency(totalPrice);
    if (setupEl) setupEl.innerHTML   =
      `<strong>${formatCurrency(setupTotal)}</strong>` +
      (_editExtras.setupExtra > 0 ? ' · <span class="text-green-600">✓ Gera comissão de ativação</span>' : '');
  };

  renderEditModal();
}

async function salvarEdicaoPlano(planId) {
  const nome  = document.getElementById('editPlanNome')?.value?.trim();
  if (!nome)  { showToast('Informe o nome do plano.', 'warning'); return; }

  // Calcular novo preço: base + extras de módulos (não desconta remoções)
  const [rPlan, rModules, rResources] = await Promise.all([
    apiRequest('GET', `/plans/${planId}`),
    apiRequest('GET', '/plans/modules/prices'),
    apiRequest('GET', '/resource-prices'),
  ]);
  const plan      = rPlan?.data;
  const modules   = rModules?.data   || [];
  const resources = rResources?.data || [];

  const basePlan = plan?.basePlanId
    ? (await apiRequest('GET', `/plans/${plan.basePlanId}`))?.data
    : null;

  const baseSetupFee   = Number(basePlan?.setupFee || 0);
  const setupExtra     = Math.max(0, parseFloat(document.getElementById('editSetupExtra')?.value) || 0);
  const setupTotal     = baseSetupFee + setupExtra;
  const setupCommissioned = setupExtra > 0;

  // Módulos ativos: base + extras marcados
  const baseModuleKeys = new Set((basePlan?.activeModules || []).map(m => m.key));
  const extraModuleKeys = new Set();
  document.querySelectorAll('.edit-mod-extra:checked').forEach(cb => {
    extraModuleKeys.add(cb.dataset.key);
  });

  // Calcular extra total para somar ao basePrice
  let extraTotal = 0;
  for (const key of extraModuleKeys) {
    const m = modules.find(x => x.moduleKey === key);
    extraTotal += Number(m?.price || 0);
  }

  const newBasePrice = Number(plan.basePrice) + extraTotal;

  // Montar campos use* completos (base + extras, preservar base mesmo que desmarcado no UI)
  const moduleFields = {};
  for (const key of baseModuleKeys)  moduleFields[key] = true;
  for (const key of extraModuleKeys) moduleFields[key] = true;

  const body = {
    name:                 nome,
    basePrice:            newBasePrice,
    setupFee:             setupTotal,
    setupFeeCommissioned: setupCommissioned,
    ...moduleFields,
  };

  try {
    const res = await apiRequest('PUT', `/plans/${planId}`, body);
    if (!res?.success) throw new Error(res?.message || 'Erro ao salvar.');
    showToast('Plano atualizado com sucesso!', 'success');
    document.getElementById('modalEditarPlano').classList.add('hidden');
    loadPricing();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

---

## FASE 5 — Frontend Parceiro: Tabela de Preços — Regras de Comissionamento

Edite `partner-pricing.js`. Use `str_replace` para atualizar a função `_tierAvisoHTML` e adicionar o aviso de setup.

### 5.1 — Atualizar `_tierAvisoHTML()` com avisos completos

Localize a função e substitua com `str_replace`:

```javascript
function _tierAvisoHTML() {
  const tier = _partnerTier;
  if (!tier) return '';
  const temDuracao = tier.durationMonths > 0;

  return `
  <div class="space-y-3">

    <!-- Aviso 1: Comissão de setup -->
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-xl flex-shrink-0">💡</span>
        <div>
          <p class="text-sm font-semibold text-blue-800 mb-1">Como funciona a comissão de setup</p>
          <p class="text-xs text-blue-700 leading-relaxed">
            Somente taxas de setup definidas <strong>no momento da criação do seu plano personalizado</strong>
            geram comissão de ativação para você. Em ativações sem acréscimo de setup próprio,
            o comissionamento será <strong>apenas sobre a mensalidade</strong>, quando aplicável ao seu tier.
          </p>
        </div>
      </div>
    </div>

    <!-- Aviso 2: Duração do comissionamento -->
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-xl flex-shrink-0">⏱️</span>
        <div>
          <p class="text-sm font-semibold text-amber-800 mb-1">
            Duração da comissão — Tier ${tier.name}
          </p>
          <p class="text-xs text-amber-700 leading-relaxed">
            ${temDuracao
              ? `Seu tier atual gera comissão por <strong>${tier.durationMonths} meses</strong>
                 a partir do cadastro de cada cliente.`
              : `Seu tier atual gera comissão por <strong>tempo indeterminado</strong> — sem prazo de expiração.`
            }
          </p>
          ${temDuracao ? `
          <div class="mt-2 pt-2 border-t border-amber-200">
            <p class="text-xs text-amber-800 font-medium leading-relaxed">
              ⚠️ Clientes adquiridos enquanto você está neste tier
              <strong>não gerarão comissão</strong> após upgrade de tier.
              A regra de comissão fica travada na época do cadastro de cada cliente.
            </p>
          </div>` : ''}
        </div>
      </div>
    </div>

  </div>`;
}
```

---

## FASE 6 — Frontend Parceiro: Simulador — Cards de Plano Completos

Edite `partner-simulator.js`. Use `str_replace` para substituir o bloco de renderização dos cards de plano base.

### 6.1 — Localizar o template atual do card

```bash
grep -n "sim-plan-card\|simPlanCards\|activeModules\|connections\|users\|queues" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20
```

### 6.2 — Substituir o template do card com versão completa (altura flexível)

Localize o `.map((p, i) =>` que gera os cards de plano e substitua com `str_replace`:

```javascript
${_simPlans.map((p, i) => {
  const isFirst = i === 0;
  // Todos os módulos ativos do plano
  const modList = (p.activeModules || []);
  // Recursos de infraestrutura do plano
  const infraItems = [
    p.users                              ? { icon: '👤', label: `${p.users} usuário(s)` }                                               : null,
    p.queues                             ? { icon: '📋', label: `${p.queues} fila(s)` }                                                  : null,
    (p.connectionsWhatsappUnofficial||p.connections||0) > 0
      ? { icon: '💬', label: `${p.connectionsWhatsappUnofficial||p.connections} WhatsApp não oficial` } : null,
    (p.connectionsWhatsappOfficial||0)   > 0 ? { icon: '✅', label: `${p.connectionsWhatsappOfficial} WhatsApp oficial` }               : null,
    (p.connectionsInstagram||0)          > 0 ? { icon: '📸', label: `${p.connectionsInstagram} Instagram` }                             : null,
  ].filter(Boolean);

  return `
  <label class="cursor-pointer block">
    <input type="radio" name="simPlan" value="${p.id}" class="sr-only"
      ${isFirst ? 'checked' : ''} onchange="simRecalcular()">
    <div class="sim-plan-card border-2 rounded-2xl p-4 transition-all h-full flex flex-col
      ${isFirst ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}">

      <!-- Nome e preço -->
      <div class="mb-3">
        <p class="font-bold text-gray-900 text-base leading-tight">${p.name}</p>
        <div class="flex items-end gap-1 mt-1">
          <span class="text-2xl font-black text-blue-600">${formatCurrency(p.basePrice)}</span>
          <span class="text-xs text-gray-400 mb-1">/mês</span>
        </div>
        ${Number(p.setupFee) > 0 ? `
        <p class="text-xs text-orange-600 mt-0.5 font-medium">
          + ${formatCurrency(p.setupFee)} setup (1×)
        </p>` : ''}
      </div>

      <!-- Infraestrutura -->
      ${infraItems.length > 0 ? `
      <div class="mb-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Infraestrutura</p>
        <div class="space-y-1">
          ${infraItems.map(it => `
          <div class="flex items-center gap-1.5">
            <span class="text-sm">${it.icon}</span>
            <span class="text-xs text-gray-700">${it.label}</span>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Módulos -->
      ${modList.length > 0 ? `
      <div class="flex-1">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Módulos incluídos</p>
        <div class="flex flex-wrap gap-1">
          ${modList.map(m => `
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            ${m.label || m.key}
          </span>`).join('')}
        </div>
      </div>` : `
      <div class="flex-1">
        <p class="text-xs text-gray-400 italic">Sem módulos incluídos</p>
      </div>`}

      <!-- Indicador de seleção -->
      <div class="mt-3 pt-3 border-t border-current/10 flex items-center justify-center">
        <span class="text-xs font-semibold ${isFirst ? 'text-blue-600' : 'text-gray-400'}">
          ${isFirst ? '✓ Selecionado' : 'Clique para selecionar'}
        </span>
      </div>
    </div>
  </label>`;
}).join('')}
```

### 6.3 — Atualizar estilo de seleção via JS (indicador dinâmico)

No `simRecalcular()`, após o bloco de highlight do card, atualizar os indicadores:

```javascript
// Atualizar texto de indicação em todos os cards
document.querySelectorAll('.sim-plan-card').forEach(card => {
  const indicator = card.querySelector('span.text-xs.font-semibold');
  if (!indicator) return;
  const isSelected = card.classList.contains('border-blue-500');
  indicator.textContent = isSelected ? '✓ Selecionado' : 'Clique para selecionar';
  indicator.className = `text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-gray-400'}`;
});
```

---

## FASE 7 — Frontend Parceiro: Simulador — Resumo da Proposta com PDF e Avisos

Edite `partner-simulator.js`. Use `str_replace` para substituir o bloco do `simResumo`.

### 7.1 — Localizar o bloco atual do simResumo

```bash
grep -n "simResumo\|Salvar como Meu Plano\|simNomePlano\|simSalvarPlano" \
  /home/user/parceiros/frontend/partner-simulator.js | head -15
```

### 7.2 — Substituir o `innerHTML` do `simResumo` na função `simRecalcular()`

Localize onde `resumoEl.innerHTML = ` é atribuído e substitua com `str_replace`:

```javascript
// Calcular duração do tier
const temDuracaoTier = (_simTierDuration || 0) > 0;
const duracaoTexto = temDuracaoTier
  ? `${_simTierDuration} meses a partir do cadastro de cada cliente`
  : 'Tempo indeterminado — sem prazo de expiração';

resumoEl.innerHTML = `
<h3 class="text-lg font-bold mb-4 flex items-center gap-2">
  <span class="text-2xl">📊</span> Resumo da Proposta
</h3>

<!-- Itens do resumo -->
<div class="space-y-2 mb-4">
  <div class="flex justify-between text-blue-100">
    <span>Plano base — ${plano.name}</span>
    <span class="font-semibold text-white">${formatCurrency(baseMensal)}/mês</span>
  </div>
  ${modulesAtivos.map(m => `
  <div class="flex justify-between text-blue-100 text-sm pl-3">
    <span>+ ${m.label}</span>
    <span>${formatCurrency(m.price)}/mês</span>
  </div>`).join('')}
  ${recursosAtivos.map(r => `
  <div class="flex justify-between text-blue-100 text-sm pl-3">
    <span>+ ${r.qty}× ${r.label}</span>
    <span>${formatCurrency(r.total)}/mês</span>
  </div>`).join('')}
</div>

<!-- Total mensal -->
<div class="border-t border-blue-700 pt-3 mb-4">
  <div class="flex justify-between text-xl font-bold">
    <span>Total Mensal</span>
    <span class="text-green-400">${formatCurrency(totalMensal)}</span>
  </div>
  ${totalSetup > 0 ? `
  <div class="flex justify-between text-sm text-blue-200 mt-1">
    <span>Taxa de Setup (cobrada 1×)</span>
    <span>${formatCurrency(totalSetup)}</span>
  </div>` : ''}
</div>

<!-- Comissão -->
<div class="bg-blue-800/50 rounded-xl p-4 mb-4">
  <p class="text-blue-200 text-sm mb-1">Comissão mensal estimada (${_simTierPct}%)</p>
  <p class="text-2xl font-bold text-yellow-400">${formatCurrency(comissao)}<span class="text-sm font-normal text-blue-300">/mês</span></p>
  ${setupComm > 0 ? `
  <div class="mt-2 pt-2 border-t border-blue-700">
    <div class="flex justify-between text-sm">
      <span class="text-blue-200">Comissão de setup (1×)</span>
      <span class="text-green-400 font-semibold">+ ${formatCurrency(setupComm)}</span>
    </div>
    <div class="flex justify-between text-sm font-bold mt-1.5">
      <span class="text-white">Ganho total no 1º mês</span>
      <span class="text-green-300">${formatCurrency(comissao + setupComm)}</span>
    </div>
  </div>` : ''}
</div>

<!-- Aviso: duração do comissionamento -->
<div class="bg-amber-900/40 border border-amber-600/50 rounded-xl p-3 mb-4">
  <p class="text-xs text-amber-200 font-semibold mb-1">⏱️ Duração do comissionamento</p>
  <p class="text-xs text-amber-100 leading-relaxed">${duracaoTexto}</p>
  ${temDuracaoTier ? `
  <p class="text-xs text-amber-200 mt-1.5 font-medium">
    ⚠️ Clientes adquiridos neste tier não geram comissão após upgrade de tier.
  </p>` : ''}
</div>

<!-- Aviso: comissão de setup -->
<div class="bg-blue-900/40 border border-blue-600/50 rounded-xl p-3 mb-5">
  <p class="text-xs text-blue-200 font-semibold mb-1">💡 Comissão de setup</p>
  <p class="text-xs text-blue-100 leading-relaxed">
    Somente taxas de setup definidas na criação do plano são comissionadas.
    Demais ativações: comissão apenas sobre a mensalidade, quando couber.
  </p>
</div>

<!-- Nome e exportação PDF -->
<div class="space-y-3">
  <div>
    <label class="text-sm text-blue-200 block mb-1">Nome do plano (para salvar)</label>
    <input type="text" id="simNomePlano" placeholder="Ex: Pro Plus Personalizado"
      class="w-full px-3 py-2 rounded-lg bg-white/10 border border-blue-600 text-white
             placeholder-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
  </div>

  <!-- Seletor de exportação PDF -->
  <div class="flex items-center gap-3 bg-white/5 border border-blue-700 rounded-lg px-4 py-3">
    <input type="checkbox" id="simExportPdf" class="w-4 h-4 rounded text-blue-500">
    <div class="flex-1">
      <label for="simExportPdf" class="text-sm text-white font-medium cursor-pointer">
        Exportar proposta em PDF
      </label>
      <p class="text-xs text-blue-300 mt-0.5">
        Gera um PDF com detalhes do plano, módulos, comissão e dados do parceiro.
      </p>
    </div>
    <span class="text-lg">📄</span>
  </div>

  <button onclick="simSalvarPlano()"
    class="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm">
    💾 Salvar como Meu Plano
  </button>
  <p class="text-xs text-blue-300 text-center">
    O plano salvo ficará disponível em "Meus Planos" na Tabela de Preços.
  </p>
</div>`;
```

### 7.3 — Carregar `durationMonths` do tier no `loadSimulator()`

```bash
grep -n "_simTierPct\|_simTierDuration\|dashboard\|tier" \
  /home/user/parceiros/frontend/partner-simulator.js | head -15
```

Após obter o dashboard, adicionar a duração:

```javascript
// ANTES (existente):
_simTierPct = rDash?.data?.tier?.percentage || 15;

// DEPOIS — adicionar linha abaixo:
_simTierPct      = rDash?.data?.tier?.percentage    || 15;
_simTierDuration = rDash?.data?.tier?.durationMonths ?? 0;  // ← novo
```

Declarar a variável no escopo do módulo (junto com `_simPlans`, `_simModules`, etc.):

```javascript
let _simTierDuration = 0;
```

---

## FASE 8 — Frontend Parceiro: Simulador — Exportação PDF

### 8.1 — Atualizar `simSalvarPlano()` para exportar PDF quando checkbox marcado

Localize a função `simSalvarPlano()` e use `str_replace` para adicionar a lógica de PDF após salvar:

```javascript
async function simSalvarPlano() {
  const plano = simGetPlanoSelecionado();
  if (!plano) { showToast('Selecione um plano base.', 'warning'); return; }

  const nome = document.getElementById('simNomePlano')?.value?.trim();
  if (!nome) { showToast('Digite um nome para o plano.', 'warning'); return; }

  const exportarPdf = document.getElementById('simExportPdf')?.checked || false;

  // Calcular totais (reusar lógica do simRecalcular)
  let modulesTotal = 0;
  const modulesData = {};
  const modulesInfo = [];
  document.querySelectorAll('.sim-module:checked').forEach(cb => {
    const price = parseFloat(cb.dataset.price) || 0;
    modulesTotal += price;
    modulesData[cb.dataset.key] = true;
    const label = cb.closest('label')?.querySelector('p.text-sm')?.textContent || cb.dataset.key;
    modulesInfo.push({ label, price, setup: parseFloat(cb.dataset.setup) || 0 });
  });

  let resourcesTotal = 0;
  const resourcesData = {};
  const resourcesInfo = [];
  document.querySelectorAll('.sim-resource').forEach(inp => {
    const qty = parseInt(inp.value) || 0;
    if (qty > 0) {
      const price = parseFloat(inp.dataset.price) || 0;
      const key   = inp.id.replace('simRes_', '');
      resourcesTotal += qty * price;
      resourcesData[key] = qty;
      const label = inp.closest('div.flex')?.querySelector('p.text-sm')?.textContent || key;
      resourcesInfo.push({ label, qty, unitPrice: price, total: qty * price });
    }
  });

  const baseTotal  = Number(plano.basePrice) + modulesTotal + resourcesTotal;
  const setupBase  = Number(plano.setupFee || 0);
  const setupExtra = Math.max(0, parseFloat(document.getElementById('simSetupExtra')?.value) || 0);
  const setupTotal = setupBase + setupExtra;
  const comissao   = baseTotal * (_simTierPct / 100);
  const setupComm  = setupExtra; // 100% do acréscimo

  // Salvar plano
  const body = {
    name:        nome,
    description: `Baseado em: ${plano.name}`,
    basePrice:   baseTotal,
    users:        plano.users  || 1,
    queues:       plano.queues || 1,
    connectionsWhatsappUnofficial: (plano.connectionsWhatsappUnofficial || plano.connections || 0) + (resourcesData['whatsappUnofficial'] || 0),
    connectionsWhatsappOfficial:   (plano.connectionsWhatsappOfficial   || 0)                       + (resourcesData['whatsappOfficial']   || 0),
    connectionsInstagram:          (plano.connectionsInstagram          || 0)                       + (resourcesData['instagram']          || 0),
    setupFee:             setupTotal,
    setupFeeCommissioned: setupExtra > 0,
    ...Object.fromEntries((plano.activeModules || []).map(m => [m.key, true])),
    ...modulesData,
  };

  try {
    const res = await apiRequest('POST', '/plans/partner', body);
    if (!res?.success) throw new Error(res?.message || 'Erro ao salvar plano.');
    showToast(`Plano "${nome}" salvo!`, 'success');

    // Exportar PDF se checkbox marcado
    if (exportarPdf) {
      await simExportarProposta({
        nomePlano:    nome,
        planBase:     plano,
        baseTotal, modulesTotal, resourcesTotal,
        setupTotal, setupExtra, setupComm,
        comissao, modulesInfo, resourcesInfo,
        tierPct:      _simTierPct,
        tierDuration: _simTierDuration,
        temDuracao:   _simTierDuration > 0,
      });
    }

    document.getElementById('simNomePlano').value = '';
    if (document.getElementById('simExportPdf')) document.getElementById('simExportPdf').checked = false;
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function simExportarProposta(dados) {
  showToast('Gerando PDF...', 'success');
  try {
    // Buscar logo PDF das configurações
    const cfgRes = await fetch('/api/system-config');
    const cfg    = (await cfgRes.json())?.data || {};
    const logoPdf     = cfg.logoPdf      || cfg.logoInternal || '';
    const businessName = cfg.businessName || 'PacoTicket';
    const brandColor  = cfg.colorBrandPrimary || '#1B3FC4';
    const partnerColor = cfg.colorPartner     || '#10B981';

    // Gerar HTML da proposta
    const html = gerarHtmlProposta({ ...dados, logoPdf, businessName, brandColor, partnerColor });

    // Chamar backend para converter via Gotenberg
    const pdfRes = await fetch('/api/pdf/plan', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('access_token')}`,
      },
      body: JSON.stringify({ html }),
    });

    if (!pdfRes.ok) {
      const err = await pdfRes.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao gerar PDF.');
    }

    // Download automático
    const blob = await pdfRes.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `proposta_${dados.nomePlano.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF gerado com sucesso!', 'success');
  } catch (e) {
    showToast(`Erro no PDF: ${e.message}`, 'error');
  }
}

function gerarHtmlProposta(d) {
  const {
    nomePlano, planBase, baseTotal, modulesTotal, resourcesTotal,
    setupTotal, setupExtra, setupComm, comissao,
    modulesInfo, resourcesInfo, tierPct, tierDuration, temDuracao,
    logoPdf, businessName, brandColor, partnerColor,
  } = d;

  const setupComissionadoMsg = setupExtra > 0
    ? `Taxa de setup de <strong>${formatCurrency(setupExtra)}</strong> definida na criação — gera comissão de ativação.`
    : `Taxa de setup sem acréscimo — comissão apenas sobre mensalidade.`;

  const duracaoMsg = temDuracao
    ? `${tierDuration} meses a partir do cadastro de cada cliente.`
    : `Tempo indeterminado — sem prazo de expiração.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; }

  .header {
    background: linear-gradient(135deg, #080C18 0%, #0D1428 60%, ${brandColor} 100%);
    color: white; padding: 32px 40px; display: flex; align-items: center; justify-content: space-between;
  }
  .header img { height: 40px; object-fit: contain; filter: brightness(0) invert(1); }
  .header-title h1 { font-size: 22px; font-weight: 800; }
  .header-title p  { font-size: 12px; opacity: 0.7; margin-top: 2px; }

  .body { padding: 32px 40px; }

  .plan-hero {
    background: linear-gradient(135deg, ${brandColor}15, ${brandColor}05);
    border: 1.5px solid ${brandColor}30;
    border-radius: 16px; padding: 24px; margin-bottom: 24px;
  }
  .plan-hero h2  { font-size: 24px; font-weight: 800; color: ${brandColor}; }
  .plan-hero .base { font-size: 11px; color: #666; margin-top: 2px; }
  .price-row { display: flex; align-items: baseline; gap: 6px; margin-top: 12px; }
  .price-big { font-size: 36px; font-weight: 900; color: ${brandColor}; }
  .price-sub { font-size: 13px; color: #999; }
  .setup-line { font-size: 11px; color: #e27112; margin-top: 4px; font-weight: 600; }

  .section { margin-bottom: 20px; }
  .section-title {
    font-size: 10px; font-weight: 700; color: #999;
    text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;
    padding-bottom: 6px; border-bottom: 1px solid #eee;
  }

  .item-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .item-card {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 10px 12px;
  }
  .item-card .label { font-size: 11px; font-weight: 600; color: #374151; }
  .item-card .value { font-size: 10px; color: #6b7280; margin-top: 1px; }
  .item-card .price { font-size: 12px; font-weight: 700; color: ${brandColor}; margin-top: 4px; }

  .module-tag {
    display: inline-block; background: ${brandColor}15; color: ${brandColor};
    border: 1px solid ${brandColor}30; border-radius: 99px;
    padding: 3px 10px; font-size: 10px; font-weight: 600; margin: 2px;
  }

  .summary-box {
    background: #080C18; color: white; border-radius: 14px; padding: 20px 24px; margin-bottom: 20px;
  }
  .summary-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; color: #94a3b8; }
  .summary-row span:last-child { color: white; font-weight: 600; }
  .summary-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ffffff20; }
  .summary-total .amount { color: #4ade80; }

  .commission-box {
    background: ${partnerColor}10; border: 1.5px solid ${partnerColor}40;
    border-radius: 14px; padding: 16px 20px; margin-bottom: 16px;
  }
  .commission-box h4 { font-size: 11px; font-weight: 700; color: ${partnerColor}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .comm-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #374151; }
  .comm-row .comm-val { font-weight: 700; color: ${partnerColor}; }
  .comm-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; margin-top: 10px; padding-top: 10px; border-top: 1px solid ${partnerColor}30; color: #1a1a2e; }
  .comm-total .ct-val { color: ${partnerColor}; }

  .notice { border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; font-size: 11px; line-height: 1.5; }
  .notice-amber  { background: #fffbeb; border: 1px solid #fcd34d; color: #78350f; }
  .notice-blue   { background: #eff6ff; border: 1px solid #93c5fd; color: #1e3a8a; }

  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
</style>
</head>
<body>

<div class="header">
  ${logoPdf ? `<img src="${logoPdf}" alt="${businessName}">` : `<div class="header-title"><h1>${businessName}</h1></div>`}
  <div class="header-title" style="text-align:right">
    <h1 style="font-size:16px">Proposta Comercial</h1>
    <p>${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}</p>
  </div>
</div>

<div class="body">

  <!-- Hero do plano -->
  <div class="plan-hero">
    <h2>${nomePlano}</h2>
    ${planBase.name !== nomePlano ? `<p class="base">Baseado em: ${planBase.name}</p>` : ''}
    <div class="price-row">
      <span class="price-big">${formatCurrency(baseTotal)}</span>
      <span class="price-sub">/mês</span>
    </div>
    ${setupTotal > 0 ? `<p class="setup-line">+ ${formatCurrency(setupTotal)} de taxa de setup (cobrada 1× na ativação)</p>` : ''}
  </div>

  <!-- Infraestrutura -->
  <div class="section">
    <p class="section-title">Infraestrutura incluída</p>
    <div class="item-grid">
      ${planBase.users > 0 ? `<div class="item-card"><p class="label">Usuários</p><p class="value">acesso ao sistema</p><p class="price">${planBase.users} usuário(s)</p></div>` : ''}
      ${planBase.queues > 0 ? `<div class="item-card"><p class="label">Filas</p><p class="value">atendimento</p><p class="price">${planBase.queues} fila(s)</p></div>` : ''}
      ${(planBase.connectionsWhatsappUnofficial||planBase.connections||0) > 0 ? `<div class="item-card"><p class="label">WhatsApp Não Oficial</p><p class="value">conexões</p><p class="price">${planBase.connectionsWhatsappUnofficial||planBase.connections} conexão(ões)</p></div>` : ''}
      ${(planBase.connectionsWhatsappOfficial||0) > 0 ? `<div class="item-card"><p class="label">WhatsApp Oficial</p><p class="value">WABA</p><p class="price">${planBase.connectionsWhatsappOfficial} conexão(ões)</p></div>` : ''}
      ${(planBase.connectionsInstagram||0) > 0 ? `<div class="item-card"><p class="label">Instagram</p><p class="value">conexões</p><p class="price">${planBase.connectionsInstagram} conexão(ões)</p></div>` : ''}
      ${resourcesInfo.map(r => `<div class="item-card"><p class="label">${r.label}</p><p class="value">${r.qty} unid. extra</p><p class="price">${formatCurrency(r.total)}/mês</p></div>`).join('')}
    </div>
  </div>

  <!-- Módulos -->
  ${(planBase.activeModules||[]).length + modulesInfo.length > 0 ? `
  <div class="section">
    <p class="section-title">Módulos incluídos</p>
    <div>
      ${[...(planBase.activeModules||[]).map(m => m.label||m.key), ...modulesInfo.map(m => m.label)]
        .map(label => `<span class="module-tag">${label}</span>`).join('')}
    </div>
  </div>` : ''}

  <!-- Resumo financeiro -->
  <div class="summary-box">
    <div class="summary-row"><span>Plano base</span><span>${formatCurrency(Number(planBase.basePrice))}/mês</span></div>
    ${modulesTotal > 0 ? `<div class="summary-row"><span>Módulos extras</span><span>+ ${formatCurrency(modulesTotal)}/mês</span></div>` : ''}
    ${resourcesTotal > 0 ? `<div class="summary-row"><span>Recursos extras</span><span>+ ${formatCurrency(resourcesTotal)}/mês</span></div>` : ''}
    ${setupTotal > 0 ? `<div class="summary-row"><span>Taxa de setup (1×)</span><span>${formatCurrency(setupTotal)}</span></div>` : ''}
    <div class="summary-total"><span>Total Mensal</span><span class="amount">${formatCurrency(baseTotal)}</span></div>
  </div>

  <!-- Comissionamento -->
  <div class="commission-box">
    <h4>Seu comissionamento estimado</h4>
    <div class="comm-row"><span>Comissão mensal (${tierPct}%)</span><span class="comm-val">${formatCurrency(comissao)}/mês</span></div>
    ${setupComm > 0 ? `<div class="comm-row"><span>Comissão de setup (1×)</span><span class="comm-val">+ ${formatCurrency(setupComm)}</span></div>` : ''}
    <div class="comm-total"><span>Ganho no 1º mês</span><span class="ct-val">${formatCurrency(comissao + setupComm)}</span></div>
  </div>

  <!-- Avisos de comissionamento -->
  <div class="notice notice-amber">
    <strong>⏱️ Duração do comissionamento:</strong> ${duracaoMsg}
    ${temDuracao ? ' Clientes adquiridos neste tier não geram comissão após upgrade de tier.' : ''}
  </div>
  <div class="notice notice-blue">
    <strong>💡 Comissão de setup:</strong> ${setupComissionadoMsg}
    Demais ativações: comissão apenas sobre a mensalidade, quando couber.
  </div>

</div>

<div class="footer">
  Proposta gerada por ${businessName} · ${new Date().toLocaleDateString('pt-BR')}
</div>

</body>
</html>`;
}
```

---

## FASE 9 — Verificação

```bash
# 1. logoPdf no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findUnique({ where: { key: 'logoPdf' } })
    .then(r => console.log(r))
    .finally(() => p.\$disconnect());
"

# 2. Testar endpoint PDF
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s -X POST http://localhost:3000/api/pdf/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"html":"<h1 style=\"color:red\">Teste PDF</h1>"}' \
  -o /tmp/teste.pdf && echo "PDF gerado OK" || echo "ERRO no PDF"
ls -la /tmp/teste.pdf
```

---

## FASE 10 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: logoPdf config, plan editor rules, simulator full cards, PDF export"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist

- [ ] Campo "Logo para PDFs" salva e exibe preview na aba Configurações do superadmin
- [ ] `PUT /api/system-config` aceita `logoPdf`
- [ ] `POST /api/pdf/plan` retorna PDF binário via Gotenberg
- [ ] Modal de edição de plano do parceiro exibe composição do plano base com preços posicionados
- [ ] Adicionar módulo extra → preço sobe; remover item da base → preço não cai
- [ ] Campo de acréscimo de setup com badge "✓ Gera comissão de ativação"
- [ ] Cards de plano no simulador exibem todos os módulos e infraestrutura (altura flexível)
- [ ] Checkbox "Exportar para PDF" no resumo do simulador
- [ ] Salvar plano com checkbox marcado → download automático do PDF
- [ ] PDF gerado usa logo de PDFs configurada no superadmin
- [ ] PDF inclui breakdown de preços, comissão, avisos de duração e setup
- [ ] Avisos de duração e setup aparecem no resumo do simulador e na tabela de preços