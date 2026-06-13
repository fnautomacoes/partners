# Fix Cirúrgico — Preço dos Planos e Simulador do Parceiro

## Problema confirmado

1. **SuperAdmin — Planos:** `totalPrice` ainda está somando preços de módulos ao `basePrice`, mas a regra correta é `totalPrice = basePrice` (tudo embutido — sem cobrar a mais por módulo selecionado).
2. **Parceiro — Simulador:** o arquivo `partner-simulator.js` e a aba "Simular Plano" não foram criados.

---

## Regras absolutas

- **Um arquivo por vez** — nunca reescreva arquivos grandes de uma só vez
- Não altere `login.html`, arquivos de infraestrutura (`docker-stack.yml`, `Dockerfile`s, `nginx.conf`)
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- `totalPrice = basePrice` — o backend não soma preços de módulos. O breakdown é apenas informativo.

---

## ETAPA 1 — Diagnóstico: ler os arquivos antes de tocar em qualquer coisa

```bash
# Ver onde totalPrice é calculado no backend
grep -rn "totalPrice\|calculateTotal\|modulePrice\|priceMap" /home/user/parceiros/backend/src/ --include="*.js"

# Ver o controller/service de planos
cat /home/user/parceiros/backend/src/routes/plans.routes.js

# Ver se há um service separado de cálculo
find /home/user/parceiros/backend/src -name "*.js" | xargs grep -l "totalPrice" 2>/dev/null

# Ver o que existe no frontend do parceiro
ls -la /home/user/parceiros/frontend/partner*.js

# Ver se partner.html já tem a aba do simulador
grep -n "simulator\|Simular" /home/user/parceiros/frontend/partner.html
```

Anote os resultados antes de avançar.

---

## ETAPA 2 — Fix: `totalPrice = basePrice` no backend

### 2.1 — Localizar o cálculo atual

Leia o arquivo onde `totalPrice` é calculado (provavelmente `plans.routes.js` ou um service):

```bash
grep -n "totalPrice\|basePrice\|modulePrices\|priceMap" \
  $(find /home/user/parceiros/backend/src -name "*.js" | xargs grep -l "totalPrice" 2>/dev/null)
```

### 2.2 — Corrigir a lógica

Encontre a função que calcula `totalPrice` e substitua **apenas ela** pela versão correta.

**Versão ERRADA (remover):**
```javascript
// Qualquer código que some modulePrice ao totalPrice, como:
let total = Number(planData.basePrice);
for (const [key, value] of Object.entries(planData)) {
  if (key.startsWith('use') && value === true && priceMap[key] !== undefined) {
    total += priceMap[key];  // ← ISSO DEVE SER REMOVIDO
  }
}
return total;
```

**Versão CORRETA (substituir por):**
```javascript
// totalPrice = basePrice. Tudo já está embutido no preço base.
// Módulos e recursos documentam o que está incluso, não inflam o preço.
async function calculateTotalPrice(planData) {
  return Number(planData.basePrice);
}
```

Use `str_replace` para trocar apenas o bloco de cálculo — não reescreva o arquivo inteiro.

### 2.3 — Verificar se há outros pontos de cálculo

```bash
grep -rn "modulePrice\|priceMap\|use.*true.*price\|total.*module" \
  /home/user/parceiros/backend/src/ --include="*.js"
```

Se houver mais de um lugar somando módulos ao `totalPrice`, corrija todos com `str_replace` cirúrgico.

### 2.4 — Testar o backend localmente antes de continuar

```bash
# Criar um plano de teste e verificar se totalPrice = basePrice
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s -X POST http://localhost:3000/api/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Teste Fix",
    "basePrice": 200,
    "users": 5,
    "queues": 3,
    "connections": 2,
    "useWhatsapp": true,
    "useAI": true,
    "useInstagram": true
  }' | python3 -m json.tool
```

**Resultado esperado:** `totalPrice` deve ser `200.00` — igual ao `basePrice`, ignorando os módulos ativos.

Se `totalPrice` ainda for diferente de `basePrice`, releia o código e encontre o ponto restante de cálculo.

Confirme que `totalPrice = basePrice` antes de avançar.

---

## ETAPA 3 — Fix: frontend do superadmin (cálculo em tempo real)

O montador de planos no frontend (`superadmin-planos.js`) provavelmente também está somando preços de módulos ao total exibido em tempo real. Isso precisa ser corrigido para ser consistente com o backend.

### 3.1 — Ler o arquivo

```bash
grep -n "calcularTotal\|basePrice\|modulesTotal\|totalPrice\|summaryTotal" \
  /home/user/parceiros/frontend/superadmin-planos.js
```

### 3.2 — Corrigir a função de cálculo em tempo real

Encontre a função que atualiza o total exibido e substitua com `str_replace` apenas o bloco de cálculo:

**Versão CORRETA:**
```javascript
function calcularTotalPlano() {
  const base = parseFloat(document.getElementById('plBasePrice')?.value) || 0;

  // Total = basePrice. Os módulos são informativos, não somam ao preço.
  const total = base;

  // Atualizar resumo
  const summaryBase  = document.getElementById('plSummaryBase');
  const summaryTotal = document.getElementById('plSummaryTotal');
  const summaryModules = document.getElementById('plSummaryModules');

  if (summaryBase)    summaryBase.textContent  = formatCurrency(base);
  if (summaryTotal)   summaryTotal.textContent = formatCurrency(total);

  // Mostrar módulos selecionados como informativos (sem somar)
  if (summaryModules) {
    const count = document.querySelectorAll('.module-toggle:checked').length;
    summaryModules.textContent = `${count} módulo(s) incluso(s) no preço base`;
  }
}
```

### 3.3 — Atualizar o texto do resumo no modal de plano

O resumo deve deixar claro que os módulos estão embutidos no preço:

```
┌─────────────────────────────────────────────┐
│ RESUMO DO PLANO                             │
│ Preço Base (mensal):  R$ 200,00             │
│ Módulos incluídos:    3 (embutidos no preço)│
│ ─────────────────────────────────────────── │
│ TOTAL MENSAL:         R$ 200,00             │
└─────────────────────────────────────────────┘
```

Localize o HTML do resumo no modal (em `superadmin-planos.js` onde o modal é gerado dinamicamente) e ajuste os labels/textos com `str_replace`.

Confirme: ao digitar basePrice e marcar módulos, o total exibido não muda → avance.

---

## ETAPA 4 — Criar `partner-simulator.js`

Verifique se o arquivo existe:

```bash
ls -la /home/user/parceiros/frontend/partner-simulator.js 2>/dev/null || echo "NÃO EXISTE"
```

Se não existir, crie com o conteúdo abaixo. Se existir mas estiver vazio/incompleto, reescreva.

Crie `/home/user/parceiros/frontend/partner-simulator.js`:

```javascript
// ============================================================
// partner-simulator.js — Simulador de Planos do Parceiro
// ============================================================

let _simPlans     = [];
let _simModules   = [];
let _simResources = [];
let _simTierPct   = 15; // percentual de comissão do parceiro logado

async function loadSimulator() {
  const el = document.getElementById('tab-simulator');
  if (!el) return;
  el.innerHTML = spinnerHTML();

  try {
    const [rPlans, rModules, rResources, rDash] = await Promise.all([
      apiRequest('GET', '/plans'),
      apiRequest('GET', '/plans/modules/prices'),
      apiRequest('GET', '/resource-prices'),
      apiRequest('GET', '/partners/me/dashboard'),
    ]);

    // Apenas planos globais (ownerId null) como base
    _simPlans     = (rPlans?.data     || []).filter(p => !p.ownerId && p.isActive !== false);
    _simModules   = (rModules?.data   || []).filter(m => m.isVisible !== false);
    _simResources = (rResources?.data || []).filter(r => r.isVisible !== false);
    _simTierPct   = rDash?.data?.tier?.percentage || 15;

    renderSimulator(el);
  } catch (e) {
    showToast(e.message, 'error');
    el.innerHTML = emptyHTML('Erro ao carregar simulador.');
  }
}

function renderSimulator(el) {
  if (!_simPlans.length) {
    el.innerHTML = emptyHTML('Nenhum plano global disponível para simulação.');
    return;
  }

  el.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">

      <!-- Header -->
      <div class="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white">
        <h2 class="text-2xl font-bold mb-1">Simulador de Planos</h2>
        <p class="text-blue-100 text-sm">Monte propostas personalizadas com base nos planos disponíveis. Os preços são fixos conforme o catálogo.</p>
      </div>

      <!-- Passo 1: Escolher plano base -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
          Escolha um plano base
        </h3>
        <p class="text-sm text-gray-500 ml-9 mb-4">O plano base define o preço mensal e os recursos incluídos.</p>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-0" id="simPlanCards">
          ${_simPlans.map((p, i) => `
            <label class="cursor-pointer">
              <input type="radio" name="simPlan" value="${p.id}" class="sr-only" ${i === 0 ? 'checked' : ''} onchange="simRecalcular()">
              <div class="sim-plan-card border-2 rounded-xl p-4 transition-all ${i === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}">
                <p class="font-semibold text-gray-800">${p.name}</p>
                <p class="text-2xl font-bold text-blue-600 mt-1">${formatCurrency(p.basePrice)}<span class="text-sm font-normal text-gray-500">/mês</span></p>
                ${p.setupFee > 0 ? `<p class="text-xs text-orange-600 mt-1">+ ${formatCurrency(p.setupFee)} setup (1×)</p>` : ''}
                <div class="mt-2 text-xs text-gray-500 space-y-0.5">
                  ${p.users ? `<p>👤 ${p.users} usuário(s)</p>` : ''}
                  ${p.queues ? `<p>📋 ${p.queues} fila(s)</p>` : ''}
                  ${(p.connectionsWhatsappUnofficial || p.connections) ? `<p>💬 ${p.connectionsWhatsappUnofficial || p.connections} WhatsApp não oficial</p>` : ''}
                  ${p.connectionsWhatsappOfficial > 0 ? `<p>✅ ${p.connectionsWhatsappOfficial} WhatsApp oficial</p>` : ''}
                  ${p.connectionsInstagram > 0 ? `<p>📸 ${p.connectionsInstagram} Instagram</p>` : ''}
                </div>
                ${(p.activeModules || []).length > 0 ? `
                  <div class="mt-2 flex flex-wrap gap-1">
                    ${(p.activeModules || []).slice(0, 4).map(m => `<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">${m.label || m.key}</span>`).join('')}
                    ${(p.activeModules || []).length > 4 ? `<span class="text-xs text-gray-400">+${(p.activeModules || []).length - 4}</span>` : ''}
                  </div>` : ''}
              </div>
            </label>`).join('')}
        </div>
      </div>

      <!-- Passo 2: Módulos extras -->
      ${_simModules.length ? `
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
          Módulos adicionais
        </h3>
        <p class="text-sm text-gray-500 ml-9 mb-4">Adicione módulos extras ao plano base. Preços conforme catálogo.</p>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-0">
          ${_simModules.map(m => `
            <label class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" class="sim-module w-4 h-4 rounded text-blue-600" data-key="${m.moduleKey}" data-price="${m.price}" data-setup="${m.setupFee || 0}" onchange="simRecalcular()">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">${m.label}</p>
                <p class="text-xs text-blue-600">+ ${formatCurrency(m.price)}/mês${m.setupFee > 0 ? ` · setup ${formatCurrency(m.setupFee)}` : ''}</p>
              </div>
            </label>`).join('')}
        </div>
      </div>` : ''}

      <!-- Passo 3: Recursos extras -->
      ${_simResources.length ? `
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
          Recursos adicionais
        </h3>
        <p class="text-sm text-gray-500 ml-9 mb-4">Conexões e recursos extras além do plano base.</p>
        <div class="space-y-2 ml-0">
          ${_simResources.map(r => `
            <div class="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-800">${r.label}</p>
                <p class="text-xs text-gray-500">${formatCurrency(r.price)} por unidade/mês${r.setupFee > 0 ? ` · setup ${formatCurrency(r.setupFee)}/unid.` : ''}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="simAdjustQty('${r.key}', -1)" class="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none">−</button>
                <input type="number" id="simRes_${r.key}" value="0" min="0" data-price="${r.price}" data-setup="${r.setupFee || 0}"
                  class="sim-resource w-16 text-center border border-gray-300 rounded-lg py-1 text-sm font-semibold" onchange="simRecalcular()">
                <button onclick="simAdjustQty('${r.key}', 1)" class="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none">+</button>
              </div>
              <div class="text-right w-24">
                <p class="text-sm font-semibold text-gray-800" id="simResTotal_${r.key}">${formatCurrency(0)}</p>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Resumo + Salvar -->
      <div class="bg-gradient-to-br from-gray-900 to-blue-900 rounded-2xl p-6 text-white" id="simResumo">
        <!-- preenchido por simRecalcular() -->
      </div>

    </div>

    <!-- Estilo dos cards de plano selecionado -->
    <style>
      input[type=radio][name=simPlan]:checked + .sim-plan-card {
        border-color: #2563eb;
        background-color: #eff6ff;
      }
    </style>
  `;

  simRecalcular();
}

function simAdjustQty(key, delta) {
  const el = document.getElementById(`simRes_${key}`);
  if (!el) return;
  el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  simRecalcular();
}

function simGetPlanoSelecionado() {
  const radio = document.querySelector('input[name="simPlan"]:checked');
  if (!radio) return null;
  return _simPlans.find(p => p.id === radio.value) || null;
}

function simRecalcular() {
  const plano = simGetPlanoSelecionado();
  const resumoEl = document.getElementById('simResumo');
  if (!plano || !resumoEl) return;

  // Highlight card selecionado
  document.querySelectorAll('.sim-plan-card').forEach(c => {
    c.classList.remove('border-blue-500', 'bg-blue-50');
    c.classList.add('border-gray-200');
  });
  const checkedRadio = document.querySelector('input[name="simPlan"]:checked');
  if (checkedRadio) {
    const card = checkedRadio.nextElementSibling;
    if (card) {
      card.classList.remove('border-gray-200');
      card.classList.add('border-blue-500', 'bg-blue-50');
    }
  }

  // Módulos extras
  let modulesTotal = 0;
  let setupModules = 0;
  const modulesAtivos = [];
  document.querySelectorAll('.sim-module:checked').forEach(cb => {
    const price = parseFloat(cb.dataset.price) || 0;
    const setup = parseFloat(cb.dataset.setup) || 0;
    modulesTotal += price;
    setupModules += setup;
    const label = cb.closest('label')?.querySelector('p.text-sm')?.textContent || cb.dataset.key;
    modulesAtivos.push({ label, price, setup });
  });

  // Recursos extras
  let resourcesTotal = 0;
  let setupResources = 0;
  const recursosAtivos = [];
  document.querySelectorAll('.sim-resource').forEach(inp => {
    const qty   = parseInt(inp.value) || 0;
    const price = parseFloat(inp.dataset.price) || 0;
    const setup = parseFloat(inp.dataset.setup) || 0;
    if (qty > 0) {
      resourcesTotal += qty * price;
      setupResources += qty * setup;
      const label = inp.closest('div.flex')?.querySelector('p.text-sm')?.textContent || inp.id;
      recursosAtivos.push({ label, qty, price, total: qty * price });
    }
  });

  const baseMensal  = Number(plano.basePrice);
  const totalMensal = baseMensal + modulesTotal + resourcesTotal;
  const totalSetup  = Number(plano.setupFee || 0) + setupModules + setupResources;
  const comissao    = totalMensal * (_simTierPct / 100);

  // Atualizar totais de recursos
  _simResources.forEach(r => {
    const el = document.getElementById(`simResTotal_${r.key}`);
    if (el) {
      const inp = document.getElementById(`simRes_${r.key}`);
      const qty = parseInt(inp?.value) || 0;
      el.textContent = formatCurrency(qty * r.price);
    }
  });

  // Renderizar resumo
  resumoEl.innerHTML = `
    <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
      <span class="text-2xl">📊</span> Resumo da Proposta
    </h3>
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
    <div class="bg-blue-800/50 rounded-xl p-4 mb-5">
      <p class="text-blue-200 text-sm mb-1">Sua comissão estimada (${_simTierPct}%)</p>
      <p class="text-2xl font-bold text-yellow-400">${formatCurrency(comissao)}<span class="text-sm font-normal text-blue-300">/mês</span></p>
    </div>
    <div class="space-y-3">
      <div>
        <label class="text-sm text-blue-200 block mb-1">Nome do plano (para salvar)</label>
        <input type="text" id="simNomePlano" placeholder="Ex: Pro Plus Personalizado"
          class="w-full px-3 py-2 rounded-lg bg-white/10 border border-blue-600 text-white placeholder-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
      </div>
      <button onclick="simSalvarPlano()"
        class="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm">
        💾 Salvar como Meu Plano
      </button>
      <p class="text-xs text-blue-300 text-center">O plano salvo ficará disponível em "Meus Planos" na Tabela de Preços.</p>
    </div>
  `;
}

async function simSalvarPlano() {
  const plano = simGetPlanoSelecionado();
  if (!plano) { showToast('Selecione um plano base.', 'warning'); return; }

  const nome = document.getElementById('simNomePlano')?.value?.trim();
  if (!nome) { showToast('Digite um nome para o plano.', 'warning'); return; }

  // Calcular totais
  let modulesTotal = 0;
  const modulesData = {};
  document.querySelectorAll('.sim-module:checked').forEach(cb => {
    modulesTotal += parseFloat(cb.dataset.price) || 0;
    modulesData[cb.dataset.key] = true;
  });

  let resourcesTotal = 0;
  const resourcesData = {};
  document.querySelectorAll('.sim-resource').forEach(inp => {
    const qty = parseInt(inp.value) || 0;
    if (qty > 0) {
      const key = inp.id.replace('simRes_', '');
      resourcesTotal += qty * (parseFloat(inp.dataset.price) || 0);
      resourcesData[key] = qty;
    }
  });

  const baseTotal = Number(plano.basePrice) + modulesTotal + resourcesTotal;

  const body = {
    name:        nome,
    description: `Baseado em: ${plano.name}`,
    basePrice:   baseTotal,
    users:       plano.users       || 1,
    queues:      plano.queues      || 1,
    connectionsWhatsappUnofficial: (plano.connectionsWhatsappUnofficial || plano.connections || 0) + (resourcesData['whatsappUnofficial'] || 0),
    connectionsWhatsappOfficial:   (plano.connectionsWhatsappOfficial   || 0)                       + (resourcesData['whatsappOfficial']   || 0),
    connectionsInstagram:          (plano.connectionsInstagram          || 0)                       + (resourcesData['instagram']          || 0),
    // Módulos do plano base + extras selecionados
    ...Object.fromEntries((plano.activeModules || []).map(m => [m.key, true])),
    ...modulesData,
    // ownerId será definido pelo backend a partir do JWT do parceiro
  };

  try {
    const res = await apiRequest('POST', '/plans/partner', body);
    if (!res?.success) throw new Error(res?.message || 'Erro ao salvar plano.');
    showToast(`Plano "${nome}" salvo com sucesso!`, 'success');
    document.getElementById('simNomePlano').value = '';
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

Confirme: arquivo criado sem erros de sintaxe → avance.

---

## ETAPA 5 — Adicionar aba "Simular Plano" ao `partner.html`

### 5.1 — Verificar estrutura atual do nav

```bash
grep -n "tab-btn\|data-tab\|tab-content" /home/user/parceiros/frontend/partner.html | head -30
```

### 5.2 — Adicionar botão de aba no nav

Use `str_replace` para inserir o botão após o último botão de aba existente. Encontre o padrão exato no arquivo e insira:

```html
<button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-simulator" onclick="showTab('tab-simulator')">
  Simular Plano
</button>
```

### 5.3 — Adicionar div de conteúdo

Insira após o último `div.tab-content`:

```html
<div id="tab-simulator" class="tab-content hidden"></div>
```

### 5.4 — Adicionar script tag

Antes do `</body>`, adicionar **após** os outros scripts do parceiro:

```html
<script src="partner-simulator.js"></script>
```

### 5.5 — Registrar loader no showTab

No arquivo que controla a navegação do parceiro (provavelmente `partner.js` ou `partner-utils.js`), encontre o mapa de loaders e adicione:

```bash
grep -n "loadDashboard\|loadClientes\|showTab" /home/user/parceiros/frontend/partner*.js | head -20
```

Adicione com `str_replace` no objeto de loaders:

```javascript
'tab-simulator': () => typeof loadSimulator === 'function' && loadSimulator(),
```

Confirme: aba aparece no nav e clicando exibe o spinner → avance.

---

## ETAPA 6 — Endpoint backend para plano do parceiro

O simulador chama `POST /api/plans/partner`. Adicione este endpoint no backend.

### 6.1 — Localizar o arquivo de rotas de planos

```bash
cat /home/user/parceiros/backend/src/routes/plans.routes.js | head -50
```

### 6.2 — Adicionar rota (use str_replace para inserir antes do `module.exports`)

```javascript
// POST /api/plans/partner — PARTNER cria plano próprio baseado em plano global
router.post('/partner', requireAuth, requireRole('PARTNER'), async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    if (!partnerId) return res.status(400).json({ success: false, error: 'NO_PARTNER', message: 'Parceiro não encontrado.' });

    const {
      name, description, basePrice, users, queues,
      connectionsWhatsappUnofficial, connectionsWhatsappOfficial, connectionsInstagram,
      ...modules
    } = req.body;

    if (!name || !basePrice) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'name e basePrice são obrigatórios.' });
    }

    // Filtrar apenas campos use* booleanos
    const moduleFields = Object.fromEntries(
      Object.entries(modules).filter(([k, v]) => k.startsWith('use') && typeof v === 'boolean')
    );

    const plan = await prisma.plan.create({
      data: {
        name,
        description: description || null,
        basePrice:   Number(basePrice),
        totalPrice:  Number(basePrice), // totalPrice = basePrice
        users:       parseInt(users)    || 1,
        queues:      parseInt(queues)   || 1,
        connections: parseInt(connectionsWhatsappUnofficial) || 1,
        connectionsWhatsappUnofficial: parseInt(connectionsWhatsappUnofficial) || 0,
        connectionsWhatsappOfficial:   parseInt(connectionsWhatsappOfficial)   || 0,
        connectionsInstagram:          parseInt(connectionsInstagram)          || 0,
        ownerId:     partnerId,
        isActive:    true,
        ...moduleFields,
      },
    });

    res.json({ success: true, data: plan });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});
```

> **Atenção:** esta rota deve ser definida **antes** de `router.post('/', ...)` para não conflitar com a rota genérica.

Confirme: `POST /api/plans/partner` com token de parceiro cria plano com `ownerId` → avance.

---

## ETAPA 7 — Build e deploy

```bash
cd /opt/parceiros
git add -A
git commit -m "fix: totalPrice=basePrice, add partner simulator"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend

docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist de validação

**Fix do preço:**
- [ ] Criar plano com `basePrice=300` e 5 módulos ativos → `totalPrice` deve ser `300.00`
- [ ] Editar plano existente → `totalPrice` permanece igual ao `basePrice`
- [ ] No montador (superadmin), marcar/desmarcar módulos não altera o total exibido

**Simulador:**
- [ ] Aba "Simular Plano" aparece no menu do parceiro
- [ ] Planos globais carregam em cards selecionáveis
- [ ] Marcar módulo extras → total do resumo aumenta
- [ ] Aumentar quantidade de recurso → total atualiza em tempo real
- [ ] Comissão estimada aparece no resumo
- [ ] "Salvar como Meu Plano" → aparece em "Meus Planos" na Tabela de Preços

```bash
# Verificar arquivo no container
docker exec $(docker ps -qf "name=pacoticket_frontend") \
  ls -la /usr/share/nginx/html/partner-simulator.js

# Zero reseller/revendedor
grep -ri "revendedor\|reseller" /opt/parceiros/frontend/*.html /opt/parceiros/frontend/*.js
```