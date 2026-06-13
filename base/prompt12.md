# Feature: Comissionamento de Setup, Arbitragem de Taxa no Simulador e Tabela de Preços Completa

## Contexto

Sistema já possui `CommissionTier` configurável, `ClientCommissionRule` para regras travadas e `SystemConfig` para white-label. Esta feature adiciona:

1. **SuperAdmin → Configurações → Tiers:** dois novos controles por tier — se o comissionamento se aplica a **futuras adições** de clientes, e se há comissionamento sobre **taxas de setup**
2. **Parceiro → Simulador:** possibilidade de arbitrar taxa de setup própria (acima do mínimo configurado), com cálculo em tempo real
3. **Parceiro → Tabela de Preços:** exibição completa de setup fees em planos e módulos, e breakdown claro da comissão sobre setup vs. mensal

**Melhorias adicionais propostas (detalhadas abaixo):**
- Comissão sobre setup paga uma única vez (não recorrente) — diferenciada visualmente
- Parceiro vê estimativa de comissão de setup separada da mensal na tabela de preços
- Simulador mostra "ganho total no primeiro mês" (mensal + setup one-time)
- Tier mostra badge "Aceita novos clientes" / "Congelado para novas adições"

**Leia antes de começar:** `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras absolutas

- Um arquivo por vez — nunca reescreva arquivos grandes de uma só vez
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura
- Backend calcula todos os valores — frontend é UX apenas

---

## FASE 1 — Diagnóstico

Execute tudo antes de tocar em qualquer arquivo.

### 1.1 — Verificar campos atuais do CommissionTier no banco

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.commissionTier.findMany()
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => console.error(e.message))
      .finally(() => p.\$disconnect());
  "
```

Anote: existem os campos `commissionOnSetup` e `acceptNewClients`? Se não, precisam ser adicionados.

### 1.2 — Verificar schema Prisma atual

```bash
grep -n -A 20 "model CommissionTier" /home/user/parceiros/backend/prisma/schema.prisma
```

### 1.3 — Verificar ClientCommissionRule

```bash
grep -n -A 15 "model ClientCommissionRule" /home/user/parceiros/backend/prisma/schema.prisma
```

### 1.4 — Verificar campos de setup no simulador

```bash
grep -n "setup\|Setup\|arbitr\|minSetup\|overrideSetup" \
  /home/user/parceiros/frontend/partner-simulator.js | head -30
```

### 1.5 — Verificar o que a tabela de preços exibe de setup

```bash
grep -n "setup\|Setup\|setupFee" \
  /home/user/parceiros/frontend/partner-pricing.js | head -30
```

### 1.6 — Verificar a seção de tiers no config do superadmin

```bash
grep -n "Tier\|tier\|loadTiers\|abrirModalTier\|salvarTier\|commissionOnSetup\|acceptNew" \
  /home/user/parceiros/frontend/superadmin-config.js | head -40
```

---

## FASE 2 — Migration do banco

### 2.1 — Adicionar colunas ao `CommissionTier`

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    Promise.all([
      p.\$executeRaw\`ALTER TABLE \"CommissionTier\" ADD COLUMN IF NOT EXISTS \"acceptNewClients\" BOOLEAN NOT NULL DEFAULT TRUE\`,
      p.\$executeRaw\`ALTER TABLE \"CommissionTier\" ADD COLUMN IF NOT EXISTS \"commissionOnSetup\" BOOLEAN NOT NULL DEFAULT FALSE\`,
      p.\$executeRaw\`ALTER TABLE \"CommissionTier\" ADD COLUMN IF NOT EXISTS \"setupCommissionPct\" DECIMAL(5,2) NOT NULL DEFAULT 0\`
    ])
    .then(() => console.log('OK — colunas adicionadas ao CommissionTier'))
    .catch(e => console.error(e.message))
    .finally(() => p.\$disconnect());
  "
```

Campos adicionados:
- `acceptNewClients` (boolean, default `true`) — se `false`, parceiros neste tier **não podem cadastrar novos clientes**
- `commissionOnSetup` (boolean, default `false`) — se `true`, o tier gera comissão sobre taxas de setup
- `setupCommissionPct` (decimal 5,2, default `0`) — percentual de comissão sobre setup (pode ser diferente do % mensal; `0` = usa o mesmo % do tier)

### 2.2 — Adicionar campos ao `ClientCommissionRule` (snapshot de setup)

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    Promise.all([
      p.\$executeRaw\`ALTER TABLE \"ClientCommissionRule\" ADD COLUMN IF NOT EXISTS \"commissionOnSetup\" BOOLEAN NOT NULL DEFAULT FALSE\`,
      p.\$executeRaw\`ALTER TABLE \"ClientCommissionRule\" ADD COLUMN IF NOT EXISTS \"setupCommissionPct\" DECIMAL(5,2) NOT NULL DEFAULT 0\`,
      p.\$executeRaw\`ALTER TABLE \"ClientCommissionRule\" ADD COLUMN IF NOT EXISTS \"setupFeeAmount\" DECIMAL(10,2) NOT NULL DEFAULT 0\`,
      p.\$executeRaw\`ALTER TABLE \"ClientCommissionRule\" ADD COLUMN IF NOT EXISTS \"setupCommissionAmount\" DECIMAL(10,2) NOT NULL DEFAULT 0\`
    ])
    .then(() => console.log('OK'))
    .catch(e => console.error(e.message))
    .finally(() => p.\$disconnect());
  "
```

### 2.3 — Atualizar Prisma schema

Use `str_replace` para adicionar os novos campos no model `CommissionTier`:

```prisma
model CommissionTier {
  id                 String   @id @default(uuid())
  name               String
  minClients         Int
  maxClients         Int?
  percentage         Decimal  @db.Decimal(5, 2)
  supportMode        String   @default("PACOTICKET_DIRECT")
  notes              String?
  isActive           Boolean  @default(true)
  order              Int      @default(0)
  durationMonths     Int      @default(0)
  // ── Novos campos ──
  acceptNewClients   Boolean  @default(true)   // false = tier congelado para novas adições
  commissionOnSetup  Boolean  @default(false)  // gera comissão sobre taxa de setup?
  setupCommissionPct Decimal  @db.Decimal(5, 2) @default(0) // 0 = usa mesmo % do tier
  // ──────────────────
  commissions        Commission[]
  clientRules        ClientCommissionRule[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

E no `ClientCommissionRule`:

```prisma
model ClientCommissionRule {
  // ...campos existentes...
  commissionOnSetup    Boolean  @default(false)
  setupCommissionPct   Decimal  @db.Decimal(5, 2) @default(0)
  setupFeeAmount       Decimal  @db.Decimal(10, 2) @default(0)   // setup total do cliente
  setupCommissionAmount Decimal @db.Decimal(10, 2) @default(0)   // comissão de setup já calculada
}
```

```bash
cd /home/user/parceiros/backend && npx prisma generate
```

Confirme sem erros → avance.

---

## FASE 3 — Backend: CommissionTier endpoints (atualização)

### 3.1 — Atualizar PUT /api/commission-tiers/:id

Localize o handler e garanta que aceita e persiste os novos campos:

```bash
grep -n -A 30 "commission-tiers\|commissionTier" \
  /home/user/parceiros/backend/src/routes/commission-tiers.routes.js 2>/dev/null \
  || grep -rn "commission-tiers\|commissionTier.update" \
     /home/user/parceiros/backend/src/routes/ --include="*.js" | head -20
```

O `update` do Prisma deve incluir:

```javascript
await prisma.commissionTier.update({
  where: { id: req.params.id },
  data: {
    name:               body.name,
    minClients:         body.minClients,
    maxClients:         body.maxClients ?? null,
    percentage:         body.percentage,
    supportMode:        body.supportMode,
    notes:              body.notes       ?? null,
    durationMonths:     body.durationMonths ?? 0,
    acceptNewClients:   body.acceptNewClients  ?? true,   // ← novo
    commissionOnSetup:  body.commissionOnSetup ?? false,  // ← novo
    setupCommissionPct: body.setupCommissionPct ?? 0,     // ← novo
    order:              body.order,
    isActive:           body.isActive ?? true,
  }
});
```

Use `str_replace` cirúrgico para adicionar apenas os campos faltantes.

### 3.2 — Atualizar `POST /api/clients` — snapshot de setup na `ClientCommissionRule`

Localize onde `ClientCommissionRule` é criada após o cadastro do cliente:

```bash
grep -n "clientCommissionRule\|ClientCommissionRule\|commissionRule" \
  /home/user/parceiros/backend/src/routes/clients.routes.js \
  /home/user/parceiros/backend/src/controllers/*.js 2>/dev/null | head -20
```

Adicione os campos de setup no `create`:

```javascript
// Calcular setup total do cliente (plano + addons)
const planSetup  = Number(plan.setupFee || 0);
const addonSetup = 0; // será somado quando addons forem criados
const totalSetup = planSetup + addonSetup;

// Percentual de setup: se setupCommissionPct > 0 usa ele, senão usa percentage
const setupPct = Number(tierInfo.setupCommissionPct) > 0
  ? Number(tierInfo.setupCommissionPct)
  : Number(tierInfo.percentage);

const setupCommissionAmount = tierInfo.commissionOnSetup
  ? parseFloat((totalSetup * setupPct / 100).toFixed(2))
  : 0;

await prisma.clientCommissionRule.create({
  data: {
    // ...campos existentes...
    commissionOnSetup:    tierInfo.commissionOnSetup  || false,
    setupCommissionPct:   setupPct,
    setupFeeAmount:       totalSetup,
    setupCommissionAmount,
  }
});
```

### 3.3 — Bloquear cadastro se tier não aceita novos clientes

No `POST /api/clients`, antes de criar o cliente, verificar:

```javascript
if (!tierInfo.acceptNewClients) {
  return res.status(403).json({
    success: false,
    error:   'TIER_LOCKED',
    message: `Seu tier atual (${tierInfo.name}) não permite adicionar novos clientes no momento. Entre em contato com o suporte.`
  });
}
```

### 3.4 — Incluir `acceptNewClients` no dashboard do parceiro

```bash
grep -n "dashboard\|tierInfo\|tier" \
  /home/user/parceiros/backend/src/routes/partners.routes.js | head -20
```

Garanta que o response do dashboard inclui:

```javascript
tier: {
  // ...campos existentes...
  acceptNewClients:  tierData.acceptNewClients,
  commissionOnSetup: tierData.commissionOnSetup,
  setupCommissionPct: Number(tierData.setupCommissionPct),
}
```

Confirme: `GET /api/partners/me/dashboard` inclui `acceptNewClients` → avance.

---

## FASE 4 — Frontend SuperAdmin: Configurações de Tier (atualização)

Edite `superadmin-config.js`. Use `str_replace` para modificar apenas o modal de tier.

### 4.1 — Adicionar campos no modal de tier

Localize onde o modal de tier é gerado dinamicamente (função `abrirModalTier` ou onde o HTML do modal é construído):

```bash
grep -n "abrirModalTier\|modalTier\|commissionOnSetup\|acceptNew\|durationMonths" \
  /home/user/parceiros/frontend/superadmin-config.js | head -20
```

Adicione os três novos campos ao formulário do modal de tier:

```javascript
// Dentro do HTML gerado para o modal, após o campo durationMonths:

`<!-- Aceitar novos clientes -->
<div class="p-4 rounded-xl border border-gray-200 bg-gray-50">
  <div class="flex items-start justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-gray-800">Aceitar novas adições</p>
      <p class="text-xs text-gray-500 mt-0.5">
        Se desativado, parceiros neste tier não poderão cadastrar novos clientes.
        Útil para congelar tiers em promoções encerradas.
      </p>
    </div>
    <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
      <input type="checkbox" id="tierAcceptNew" class="sr-only peer" checked>
      <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
    </label>
  </div>
</div>

<!-- Comissionamento sobre setup -->
<div class="p-4 rounded-xl border border-gray-200 bg-gray-50">
  <div class="flex items-start justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-gray-800">Comissão sobre taxa de setup</p>
      <p class="text-xs text-gray-500 mt-0.5">
        Se ativado, o parceiro receberá comissão sobre as taxas de setup cobradas na ativação do cliente.
        Paga uma única vez.
      </p>
    </div>
    <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
      <input type="checkbox" id="tierCommissionSetup" class="sr-only peer"
        onchange="toggleSetupPctField()">
      <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
    </label>
  </div>

  <!-- Percentual de setup — só aparece quando toggle ativado -->
  <div id="setupPctField" class="mt-3 hidden">
    <label class="block text-xs font-medium text-gray-700 mb-1">
      Percentual sobre setup (%)
    </label>
    <div class="flex items-center gap-2">
      <input type="number" id="tierSetupPct" step="0.01" min="0" max="100" value="0"
        class="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right">
      <span class="text-xs text-gray-500">0 = usa o mesmo % do tier (${percentage}%)</span>
    </div>
  </div>
</div>`
```

### 4.2 — Função toggle do campo de percentual

Adicione no final de `superadmin-config.js` com `str_replace`:

```javascript
function toggleSetupPctField() {
  const checked = document.getElementById('tierCommissionSetup')?.checked;
  const field   = document.getElementById('setupPctField');
  if (field) field.classList.toggle('hidden', !checked);
}
```

### 4.3 — Preencher campos no `abrirModalTier(id)`

Localize onde o modal é preenchido com dados existentes e adicione:

```javascript
// Após preencher os campos existentes:
document.getElementById('tierAcceptNew').checked     = tier.acceptNewClients  ?? true;
document.getElementById('tierCommissionSetup').checked = tier.commissionOnSetup ?? false;
document.getElementById('tierSetupPct').value        = tier.setupCommissionPct ?? 0;
toggleSetupPctField(); // atualizar visibilidade
```

### 4.4 — Incluir campos no `salvarTier()`

```javascript
body.acceptNewClients   = document.getElementById('tierAcceptNew')?.checked     ?? true;
body.commissionOnSetup  = document.getElementById('tierCommissionSetup')?.checked ?? false;
body.setupCommissionPct = parseFloat(document.getElementById('tierSetupPct')?.value) || 0;
```

### 4.5 — Badge "Congelado" na listagem de tiers

Na função que renderiza a tabela de tiers, adicione badge quando `acceptNewClients = false`:

```javascript
// Na célula de nome do tier:
`${tier.name}
${!tier.acceptNewClients ? '<span class="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Congelado</span>' : ''}
${tier.commissionOnSetup ? '<span class="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Setup ✓</span>' : ''}`
```

Confirme: salvar tier persiste `acceptNewClients`, `commissionOnSetup`, `setupCommissionPct` → avance.

---

## FASE 5 — Frontend Parceiro: Simulador (arbitragem de setup)

Edite `partner-simulator.js`. Use `str_replace` cirúrgico.

### 5.1 — Verificar se parceiro pode arbitrar setup

No `loadSimulator()`, após carregar o dashboard, verificar se o tier permite:

```javascript
// O tier do parceiro define se pode arbitrar
// Regra: parceiro SEMPRE pode adicionar taxa de setup própria ACIMA do mínimo
// (O mínimo é o setupFee configurado no plano/módulo)
const _canArbitrateSetup = true; // Sempre permitido — só restrito pelo valor mínimo
```

> **Nota de negócio:** qualquer parceiro pode adicionar markup de setup acima do valor base. O que não pode é cobrar abaixo. O controle é no `simRecalcular()`.

### 5.2 — Adicionar campo de arbitragem no resumo

Localize o bloco do resumo em `renderSimulator()` (onde está o botão "Salvar como Meu Plano") e adicione antes dos campos de nome/salvar:

```javascript
// Inserir no resumo (simResumo), antes do campo de nome do plano:
`<!-- Arbitragem de setup -->
<div class="bg-blue-800/40 rounded-xl p-4 mb-4">
  <div class="flex items-center justify-between mb-2">
    <div>
      <p class="text-sm font-semibold text-white">Taxa de Setup Adicional</p>
      <p class="text-xs text-blue-200">
        Adicione sua margem ao setup cobrado na ativação.
        Mínimo: ${formatCurrency(_simSetupBase)} (base do catálogo).
      </p>
    </div>
  </div>
  <div class="flex items-center gap-3">
    <span class="text-blue-200 text-sm">R$</span>
    <input type="number" id="simSetupExtra" step="0.01" min="0" value="0"
      class="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-blue-600 text-white text-sm
             placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
      placeholder="0,00 — acréscimo ao setup base"
      oninput="simRecalcular()">
    <span class="text-blue-200 text-sm whitespace-nowrap">acréscimo</span>
  </div>
  <div class="mt-2 flex justify-between text-sm">
    <span class="text-blue-200">Setup total cobrado do cliente:</span>
    <span class="text-white font-semibold" id="simSetupTotal">${formatCurrency(_simSetupBase)}</span>
  </div>
  <div class="mt-1 flex justify-between text-sm">
    <span class="text-blue-200">Sua comissão sobre setup:</span>
    <span class="text-yellow-300 font-semibold" id="simSetupComm">${formatCurrency(0)}</span>
  </div>
  <p class="text-xs text-blue-300 mt-2">
    ⚡ O valor do acréscimo é inteiramente sua comissão de setup — paga uma única vez na ativação.
  </p>
</div>`
```

### 5.3 — Atualizar `simRecalcular()` para incluir setup

Localize a função `simRecalcular()` e adicione o cálculo de setup (use `str_replace` para inserir após o cálculo do `totalMensal`):

```javascript
// Após calcular totalMensal e totalSetup existentes:

// Setup base do catálogo (plano + módulos selecionados + recursos selecionados)
const setupBase = Number(plano.setupFee || 0)
  + [...document.querySelectorAll('.sim-module:checked')]
      .reduce((s, cb) => s + (parseFloat(cb.dataset.setup) || 0), 0)
  + [...document.querySelectorAll('.sim-resource')]
      .reduce((s, inp) => {
        const qty = parseInt(inp.value) || 0;
        return s + qty * (parseFloat(inp.dataset.setup) || 0);
      }, 0);

// Acréscimo do parceiro (não pode ser negativo)
const setupExtra = Math.max(0, parseFloat(document.getElementById('simSetupExtra')?.value) || 0);
const setupTotal = setupBase + setupExtra;

// Comissão de setup = apenas sobre o ACRÉSCIMO do parceiro
// (O base já é receita da plataforma; o acréscimo é 100% do parceiro)
const setupComm = setupExtra; // 100% do acréscimo vai para o parceiro

// Atualizar elementos de setup no DOM
const setupTotalEl = document.getElementById('simSetupTotal');
const setupCommEl  = document.getElementById('simSetupComm');
const setupBaseEl  = document.getElementById('simSetupBaseDisplay'); // label do mínimo
if (setupTotalEl) setupTotalEl.textContent = formatCurrency(setupTotal);
if (setupCommEl)  setupCommEl.textContent  = formatCurrency(setupComm);

// Guardar para usar no salvarPlano
window._simSetupBase  = setupBase;
window._simSetupExtra = setupExtra;
window._simSetupTotal = setupTotal;
window._simSetupComm  = setupComm;
```

### 5.4 — Atualizar bloco do resumo de "Ganho no Primeiro Mês"

Adicione ao resumo (dentro de `simResumo`), após a comissão mensal:

```javascript
// No HTML do simResumo, após a linha de comissão mensal:
`<div class="mt-2 pt-2 border-t border-blue-700">
  <div class="flex justify-between text-sm">
    <span class="text-blue-200">Comissão mensal (${_simTierPct}%)</span>
    <span class="text-yellow-400 font-semibold">${formatCurrency(comissao)}/mês</span>
  </div>
  ${setupComm > 0 ? `
  <div class="flex justify-between text-sm mt-1">
    <span class="text-blue-200">Comissão de setup (1×)</span>
    <span class="text-green-400 font-semibold">+ ${formatCurrency(setupComm)}</span>
  </div>
  <div class="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-blue-600">
    <span class="text-white">Ganho total no 1º mês</span>
    <span class="text-green-300">${formatCurrency(comissao + setupComm)}</span>
  </div>` : ''}
</div>`
```

### 5.5 — Incluir setup no `simSalvarPlano()`

Localize `simSalvarPlano()` e adicione os campos de setup ao body:

```javascript
const body = {
  // ...campos existentes...
  setupFee:      window._simSetupTotal || 0,    // setup total que será cobrado do cliente
  setupExtra:    window._simSetupExtra || 0,    // acréscimo do parceiro (para referência)
};
```

Confirme: campo de acréscimo aparece no simulador, setup total atualiza em tempo real → avance.

---

## FASE 6 — Frontend Parceiro: Tabela de Preços (setup fees completo)

Edite `partner-pricing.js`. Use `str_replace` para modificar apenas as funções de renderização.

### 6.1 — Exibir setup fee nos cards de plano

Localize a função que renderiza cada card de plano e garanta que exibe:

```javascript
// No card do plano, após o preço mensal:
${Number(plan.setupFee) > 0 ? `
  <div class="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
    <span class="text-xs text-gray-500">Taxa de setup (cobrada 1×)</span>
    <span class="text-xs font-semibold text-orange-600">${formatCurrency(plan.setupFee)}</span>
  </div>` : ''}

// Comissão sobre setup (se tier do parceiro tiver commissionOnSetup)
${Number(plan.setupFee) > 0 && _partnerTier?.commissionOnSetup ? `
  <div class="flex items-center justify-between py-1">
    <span class="text-xs text-gray-500">Sua comissão de setup</span>
    <span class="text-xs font-semibold text-green-600">
      ${formatCurrency(Number(plan.setupFee) * ((_partnerTier.setupCommissionPct || _partnerTier.percentage) / 100))}
      <span class="text-gray-400 font-normal">(1× na ativação)</span>
    </span>
  </div>` : ''}
```

### 6.2 — Exibir setup fee nos módulos do card de plano

Na listagem de módulos incluídos dentro do card:

```javascript
// Para cada módulo ativo do plano:
${moduleDetails.map(m => `
  <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
    <span class="text-xs text-gray-700">${m.icon || ''} ${m.label}</span>
    <div class="text-right">
      <span class="text-xs text-blue-600">${formatCurrency(m.price)}/mês</span>
      ${Number(m.setupFee) > 0 ? `
        <span class="block text-xs text-orange-500">Setup: ${formatCurrency(m.setupFee)}</span>
      ` : ''}
    </div>
  </div>`).join('')}
```

### 6.3 — Seção de módulos do catálogo (cards individuais)

Localize onde os cards de módulos são renderizados (grid com `isVisible`) e adicione o setup:

```javascript
// No card de cada módulo:
`<div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
  <div class="flex items-start justify-between mb-3">
    <div>
      <p class="text-sm font-semibold text-gray-800">${m.label}</p>
    </div>
  </div>
  <div class="space-y-1.5">
    <div class="flex justify-between items-center">
      <span class="text-xs text-gray-500">Mensalidade</span>
      <span class="text-sm font-bold text-blue-600">${formatCurrency(m.price)}</span>
    </div>
    ${Number(m.setupFee) > 0 ? `
    <div class="flex justify-between items-center">
      <span class="text-xs text-gray-500">Setup (1×)</span>
      <span class="text-xs font-semibold text-orange-600">${formatCurrency(m.setupFee)}</span>
    </div>` : ''}
    ${_partnerTier?.commissionOnSetup && Number(m.setupFee) > 0 ? `
    <div class="flex justify-between items-center pt-1.5 border-t border-gray-100">
      <span class="text-xs text-gray-500">Comissão setup</span>
      <span class="text-xs font-semibold text-green-600">
        ${formatCurrency(Number(m.setupFee) * ((_partnerTier.setupCommissionPct || _partnerTier.percentage) / 100))}
      </span>
    </div>` : ''}
  </div>
</div>`
```

### 6.4 — Salvar `_partnerTier` como variável de módulo

No `loadPricing()`, após carregar o dashboard:

```javascript
let _partnerTier = null;

async function loadPricing() {
  // ...código existente...
  const rDash = await apiRequest('GET', '/partners/me/dashboard');
  _partnerTier = rDash?.data?.tier || null;
  // ...resto do código...
}
```

### 6.5 — Legenda no topo da aba

Adicione uma legenda visual antes dos cards de plano:

```javascript
`<div class="flex flex-wrap gap-3 mb-6">
  <div class="flex items-center gap-1.5 text-xs text-gray-600">
    <span class="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>
    Mensalidade recorrente
  </div>
  <div class="flex items-center gap-1.5 text-xs text-gray-600">
    <span class="w-3 h-3 rounded-full bg-orange-500 inline-block"></span>
    Taxa de setup (cobrada 1× na ativação)
  </div>
  ${_partnerTier?.commissionOnSetup ? `
  <div class="flex items-center gap-1.5 text-xs text-gray-600">
    <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
    Sua comissão de setup
  </div>` : ''}
</div>`
```

Confirme: cards de plano exibem setup fee com cor laranja e comissão de setup em verde → avance.

---

## FASE 7 — Melhorias adicionais propostas

### M1 — Badge "Novos clientes: Congelado" no dashboard do parceiro

Se `tier.acceptNewClients === false`, exibir aviso destacado no dashboard:

```javascript
// Em loadDashboard() do parceiro, após renderizar o card de tier:
if (!tierData.acceptNewClients) {
  document.getElementById('tab-dashboard').insertAdjacentHTML('afterbegin', `
    <div class="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3 mb-4">
      <span class="text-2xl">⚠️</span>
      <div>
        <p class="font-semibold text-amber-800 text-sm">Cadastro de novos clientes temporariamente suspenso</p>
        <p class="text-amber-700 text-xs mt-0.5">
          Seu tier atual (${tierData.name}) não está aceitando novas adições no momento.
          Entre em contato com o suporte para mais informações.
        </p>
      </div>
    </div>`);
}
```

### M2 — Botão "Novo Cliente" desabilitado quando tier congelado

No modal de novo cliente do parceiro, verificar antes de abrir:

```javascript
async function abrirModalNovoCliente() {
  const dash = await apiRequest('GET', '/partners/me/dashboard');
  const tier = dash?.data?.tier;

  if (tier && !tier.acceptNewClients) {
    showToast('Seu tier atual não permite adicionar novos clientes no momento.', 'warning');
    return;
  }
  // ...continuar abrindo o modal normalmente...
}
```

### M3 — Histórico de comissão de setup na aba Comissões do parceiro

Na tabela de comissões, adicionar coluna "Setup (1×)" quando `commissionOnSetup` estiver na regra:

```javascript
// Na tabela de comissões — coluna adicional:
`<td class="py-3 px-4 text-sm">
  ${Number(c.rule?.setupCommissionAmount) > 0
    ? `<span class="text-green-600 font-semibold">${formatCurrency(c.rule.setupCommissionAmount)}</span>
       <span class="text-xs text-gray-400 block">1× setup</span>`
    : '<span class="text-gray-300">—</span>'}
</td>`
```

### M4 — Tooltip de explicação no campo de acréscimo do simulador

```javascript
// Próximo ao label do campo de acréscimo:
`<span class="cursor-help text-blue-300" title="O valor que você adicionar ao setup vai inteiramente para você como comissão de ativação. O valor base do catálogo é receita da plataforma.">ⓘ</span>`
```

---

## FASE 8 — Verificação

```bash
# 1. Verificar novos campos no banco
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.commissionTier.findMany({
      select: { name:1, acceptNewClients:1, commissionOnSetup:1, setupCommissionPct:1 }
    }).then(r => console.log(JSON.stringify(r,null,2))).finally(() => p.\$disconnect());
  "

# 2. Verificar endpoint de tiers
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/commission-tiers \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Verificar dashboard inclui novos campos do tier
curl -s http://localhost:3000/api/partners/me/dashboard \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -A 8 '"tier"'
```

---

## FASE 9 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: setup commission rules, simulator markup, pricing setup display"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist final

**SuperAdmin:**
- [ ] Modal de tier tem toggle "Aceitar novas adições"
- [ ] Modal de tier tem toggle "Comissão sobre setup" + campo de percentual (aparece quando ativado)
- [ ] Tier com `acceptNewClients = false` exibe badge "Congelado" na tabela
- [ ] Salvar tier persiste os 3 novos campos no banco

**Parceiro — Simulador:**
- [ ] Campo de acréscimo de setup aparece no resumo
- [ ] Setup total = base do catálogo + acréscimo do parceiro
- [ ] Comissão de setup = 100% do acréscimo (exibida em verde)
- [ ] "Ganho total no 1º mês" = comissão mensal + comissão de setup
- [ ] Tentar inserir valor negativo é bloqueado (min=0)
- [ ] Salvar plano inclui `setupFee` correto

**Parceiro — Tabela de Preços:**
- [ ] Cards de plano exibem setup fee em laranja quando > 0
- [ ] Cards de plano exibem comissão de setup em verde (quando tier tem `commissionOnSetup`)
- [ ] Módulos exibem setup fee individual
- [ ] Legenda de cores no topo da aba
- [ ] Tier congelado exibe aviso no dashboard do parceiro

```bash
# Zero reseller/revendedor
grep -ri "revendedor\|reseller" \
  /home/user/parceiros/frontend/*.html \
  /home/user/parceiros/frontend/*.js 2>/dev/null
```