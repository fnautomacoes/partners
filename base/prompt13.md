# Feature v3 — Planos por Parceiro, Largura de Logo, Duração de Comissão e Gestão de Planos do Parceiro

## Pré-requisitos

1. `schema_update_v3.sql` aplicado ao banco:
   ```bash
   psql -h HOST -U postgres -d pacoticket_parceiros -f schema_update_v3.sql
   ```
2. Leia: `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras absolutas

- **Um arquivo por vez** — nunca reescreva arquivos grandes de uma só vez; use `str_replace` cirúrgico
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura
- Backend é a fonte de verdade — frontend é UX

---

## FASE 1 — Diagnóstico antes de qualquer edição

```bash
# 1. Verificar novos campos no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns WHERE table_name='Plan' ORDER BY ordinal_position\`
    .then(r => r.forEach(c => console.log(c.column_name)))
    .finally(() => p.\$disconnect());
"

# 2. Verificar campos do CommissionTier
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns WHERE table_name='CommissionTier' ORDER BY ordinal_position\`
    .then(r => r.forEach(c => console.log(c.column_name)))
    .finally(() => p.\$disconnect());
"

# 3. Verificar SystemConfig
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findMany().then(r => console.log(JSON.stringify(r,null,2))).finally(() => p.\$disconnect());
"

# 4. Verificar schema Prisma atual
grep -n "ownerId\|basePlanId\|setupFee\|durationMonths\|ClientCommissionRule" \
  /home/user/parceiros/backend/prisma/schema.prisma

# 5. Ver estrutura atual da aba Planos no superadmin
grep -n "loadPlanos\|ownerId\|isGlobal\|parceiro\|partner" \
  /home/user/parceiros/frontend/superadmin-planos.js | head -30

# 6. Ver o que renderiza tiers no superadmin-config.js
grep -n "durationMonths\|commissionOnSetup\|acceptNew\|tierAccept\|tierDuration" \
  /home/user/parceiros/frontend/superadmin-config.js | head -20

# 7. Ver partner-pricing.js — editar/excluir planos do parceiro
grep -n "editarPlano\|excluirPlano\|DELETE.*plan\|PUT.*plan\|ownerId" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20
```

---

## FASE 2 — Atualizar Prisma Schema

Use `str_replace` para adicionar os novos campos nos models existentes. **Não reescreva o schema inteiro.**

### 2.1 — Model `Plan`

```prisma
// Adicionar após os campos existentes de Plan:
ownerId              String?  // NULL = global; partnerId = exclusivo do parceiro
owner                Partner? @relation("PartnerPlans", fields: [ownerId], references: [id], onDelete: Cascade)
basePlanId           String?  // plano global de origem (para planos de parceiro)
basePlan             Plan?    @relation("PlanDerivatives", fields: [basePlanId], references: [id])
derivatives          Plan[]   @relation("PlanDerivatives")
setupFee             Decimal  @db.Decimal(10, 2) @default(0)
setupFeeCommissioned Boolean  @default(false)
sortOrder            Int      @default(0)
```

### 2.2 — Model `Partner`

```prisma
// Adicionar relação inversa:
ownedPlans Plan[] @relation("PartnerPlans")
```

### 2.3 — Model `CommissionTier`

```prisma
// Adicionar se ainda não existirem:
durationMonths     Int     @default(0)
acceptNewClients   Boolean @default(true)
commissionOnSetup  Boolean @default(false)
setupCommissionPct Decimal @db.Decimal(5, 2) @default(0)
```

### 2.4 — Model `Commission`

```prisma
// Adicionar:
tierConfigId    String?
tierConfig      CommissionTier? @relation(fields: [tierConfigId], references: [id])
setupCommission Decimal         @db.Decimal(10, 2) @default(0)
isFrozen        Boolean         @default(false)
```

### 2.5 — Model `ClientCommissionRule` (criar se não existir)

```prisma
model ClientCommissionRule {
  id                    String          @id @default(uuid())
  clientId              String          @unique
  client                Client          @relation(fields: [clientId], references: [id], onDelete: Cascade)
  partnerId             String
  partner               Partner         @relation(fields: [partnerId], references: [id])
  tierConfigId          String?
  tierConfig            CommissionTier? @relation(fields: [tierConfigId], references: [id])
  tierName              String
  percentage            Decimal         @db.Decimal(5, 2)
  durationMonths        Int             @default(0)
  commissionOnSetup     Boolean         @default(false)
  setupCommissionPct    Decimal         @db.Decimal(5, 2) @default(0)
  setupFeeAmount        Decimal         @db.Decimal(10, 2) @default(0)
  setupCommissionAmount Decimal         @db.Decimal(10, 2) @default(0)
  startedAt             DateTime        @default(now())
  expiresAt             DateTime?
  frozenAtUpgrade       Boolean         @default(false)
  createdAt             DateTime        @default(now())
}
```

Após editar o schema:
```bash
cd /home/user/parceiros/backend && npx prisma generate
```

Confirme: `npx prisma generate` sem erros → avance.

---

## FASE 3 — Backend: Planos com suporte a `ownerId`

### 3.1 — Atualizar `GET /api/plans`

```bash
grep -n -A 30 "router.get.*'/'.*plans\|findMany.*plan\|plan.*findMany" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -50
```

A query deve incluir filtro por tipo e incluir dados do owner:

```javascript
// GET /api/plans?type=global|partner|all&partnerId=uuid
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type = 'global', partnerId } = req.query;
    const role = req.user.role;

    let where = { isActive: true };

    if (role === 'PARTNER') {
      // Parceiro vê: planos globais + seus próprios
      where = {
        isActive: true,
        OR: [
          { ownerId: null },
          { ownerId: req.user.partnerId }
        ]
      };
    } else if (type === 'global') {
      where = { isActive: true, ownerId: null };
    } else if (type === 'partner') {
      where = { isActive: true, ownerId: { not: null } };
      if (partnerId) where.ownerId = partnerId;
    }
    // type === 'all' → sem filtro adicional (apenas isActive)

    const plans = await prisma.plan.findMany({
      where,
      include: { owner: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ success: true, data: plans });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});
```

### 3.2 — Atualizar `POST /api/plans` — aceitar `ownerId` e `basePlanId`

```javascript
// No body:
const {
  name, description, basePrice, users, queues,
  connectionsWhatsappUnofficial, connectionsWhatsappOfficial, connectionsInstagram,
  setupFee, setupFeeCommissioned, sortOrder,
  ownerId, basePlanId,   // ← novos
  pacoticketPlanId,
  ...rest
} = req.body;

// Filtrar apenas campos use*
const moduleFields = Object.fromEntries(
  Object.entries(rest).filter(([k]) => k.startsWith('use'))
);

const plan = await prisma.plan.create({
  data: {
    name, description: description || null,
    basePrice:   Number(basePrice),
    totalPrice:  Number(basePrice), // totalPrice = basePrice sempre
    users:       parseInt(users)  || 1,
    queues:      parseInt(queues) || 1,
    connections: parseInt(connectionsWhatsappUnofficial) || 1,
    connectionsWhatsappUnofficial: parseInt(connectionsWhatsappUnofficial) || 0,
    connectionsWhatsappOfficial:   parseInt(connectionsWhatsappOfficial)   || 0,
    connectionsInstagram:          parseInt(connectionsInstagram)          || 0,
    setupFee:             Number(setupFee)    || 0,
    setupFeeCommissioned: Boolean(setupFeeCommissioned),
    sortOrder:            parseInt(sortOrder) || 0,
    ownerId:              ownerId    || null,
    basePlanId:           basePlanId || null,
    pacoticketPlanId:     pacoticketPlanId ? parseInt(pacoticketPlanId) : null,
    isActive:             true,
    ...moduleFields,
  },
});
```

### 3.3 — Atualizar `PUT /api/plans/:id`

Adicionar os mesmos campos ao update. Verificar se parceiro só pode editar planos próprios:

```javascript
// Verificação de permissão para parceiro:
if (req.user.role === 'PARTNER') {
  const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
  if (!plan || plan.ownerId !== req.user.partnerId) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Você só pode editar seus próprios planos.' });
  }
}
```

### 3.4 — `DELETE /api/plans/:id`

Mesmo controle: parceiro só pode excluir planos próprios. Verificar se há clientes vinculados:

```javascript
const clientCount = await prisma.client.count({ where: { planId: req.params.id, status: 'ACTIVE' } });
if (clientCount > 0) {
  return res.status(400).json({
    success: false, error: 'HAS_CLIENTS',
    message: `Este plano possui ${clientCount} cliente(s) ativo(s) e não pode ser excluído.`
  });
}
// Soft delete:
await prisma.plan.update({ where: { id: req.params.id }, data: { isActive: false } });
```

### 3.5 — Endpoint de herança: `POST /api/plans/inherit/:basePlanId`

Cria um plano de parceiro herdando todas as características do plano base:

```javascript
router.post('/inherit/:basePlanId', requireAuth, requireRole('PARTNER'), async (req, res) => {
  try {
    const base = await prisma.plan.findUnique({ where: { id: req.params.basePlanId } });
    if (!base || !base.isActive || base.ownerId !== null) {
      return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Plano base não encontrado.' });
    }

    const { name, setupFee } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'name é obrigatório.' });

    // Herdar TUDO do plano base; só nome e setupFee podem diferir
    const inheritedSetupFee = Number(setupFee) >= Number(base.setupFee)
      ? Number(setupFee)
      : Number(base.setupFee); // nunca abaixo do base

    // setupFeeCommissioned = TRUE apenas se o parceiro adicionou acréscimo
    const setupFeeCommissioned = inheritedSetupFee > Number(base.setupFee);

    // Copiar todos os campos use* do plano base
    const USE_FIELDS = [
      'useWhatsapp','useFacebook','useInstagram','useCampaigns','useSchedules',
      'useInternalChat','useExternalApi','useKanban','usePixel','usePerfex',
      'useRD','useCV','useIXC','useAI','useCHAMA','useTYPE','useZAIA',
      'useGPT','useGPTA','useHS','useNNN','useHUB','useCRM','useFLOW',
      'useBTN','useCALL','useVOIP','useDIFY','usePUSH','useWABAOWN',
      'useWABAAINI','useProducts','useServices','useWEBCHAT','useInternal'
    ];
    const moduleFields = Object.fromEntries(USE_FIELDS.map(k => [k, base[k]]));

    const plan = await prisma.plan.create({
      data: {
        name,
        description:  base.description,
        basePrice:    base.basePrice,
        totalPrice:   base.basePrice,
        users:        base.users,
        queues:       base.queues,
        connections:  base.connections,
        connectionsWhatsappUnofficial: base.connectionsWhatsappUnofficial || 0,
        connectionsWhatsappOfficial:   base.connectionsWhatsappOfficial   || 0,
        connectionsInstagram:          base.connectionsInstagram          || 0,
        setupFee:             inheritedSetupFee,
        setupFeeCommissioned,
        sortOrder:    base.sortOrder,
        ownerId:      req.user.partnerId,
        basePlanId:   base.id,
        isActive:     true,
        ...moduleFields,
      },
    });

    res.json({ success: true, data: plan });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});
```

> **Importante:** esta rota deve ser definida **antes** de `router.post('/', ...)`.

### 3.6 — Atualizar `CommissionTier` endpoints

No `PUT /api/commission-tiers/:id`, incluir os novos campos:

```javascript
data: {
  name, minClients, maxClients: maxClients ?? null,
  percentage, supportMode, notes: notes ?? null,
  order, isActive: isActive ?? true,
  durationMonths:    durationMonths    ?? 0,    // ← garantir que persiste
  acceptNewClients:  acceptNewClients  ?? true,
  commissionOnSetup: commissionOnSetup ?? false,
  setupCommissionPct: setupCommissionPct ?? 0,
}
```

### 3.7 — Criar `ClientCommissionRule` ao cadastrar cliente

No `POST /api/clients`, após criar o cliente, criar a regra travada:

```javascript
// Buscar tier atual do parceiro
const activeClientCount = await prisma.client.count({
  where: { partnerId: partner.id, status: 'ACTIVE' }
});
const tierData = await getTierForPartner(activeClientCount, prisma);

// Calcular expiresAt
const startedAt = new Date();
let expiresAt = null;
if (tierData.durationMonths > 0) {
  expiresAt = new Date(startedAt);
  expiresAt.setMonth(expiresAt.getMonth() + tierData.durationMonths);
}

// Comissão de setup: apenas se tier tem commissionOnSetup E plano tem setupFeeCommissioned
const setupFeeAmount = Number(plan.setupFee || 0);
const setupPct = (tierData.commissionOnSetup && plan.setupFeeCommissioned)
  ? (Number(tierData.setupCommissionPct) > 0 ? Number(tierData.setupCommissionPct) : Number(tierData.percentage))
  : 0;
const setupCommissionAmount = parseFloat((setupFeeAmount * setupPct / 100).toFixed(2));

await prisma.clientCommissionRule.upsert({
  where: { clientId: client.id },
  create: {
    clientId:             client.id,
    partnerId:            partner.id,
    tierConfigId:         tierData.tierId,
    tierName:             tierData.name,
    percentage:           tierData.percentage,
    durationMonths:       tierData.durationMonths,
    commissionOnSetup:    tierData.commissionOnSetup && plan.setupFeeCommissioned,
    setupCommissionPct:   setupPct,
    setupFeeAmount,
    setupCommissionAmount,
    startedAt,
    expiresAt,
    frozenAtUpgrade:      false,
  },
  update: {} // não atualizar se já existir
});
```

### 3.8 — Atualizar `commission.service.js` — respeitar regras de congelamento

```javascript
// Para cada cliente ao calcular comissão:
const rule = await prisma.clientCommissionRule.findUnique({ where: { clientId: client.id } });

if (!rule) {
  // Fallback: usar tier atual (clientes antigos sem regra)
  // ... lógica atual ...
  continue;
}

// Verificar se a comissão expirou
const periodDate = new Date(year, month - 1, 1);
if (rule.expiresAt && periodDate > rule.expiresAt) {
  // Comissão expirada — não gerar para este cliente
  continue;
}

// Verificar se regra foi congelada por upgrade de tier
if (rule.frozenAtUpgrade) {
  // Parceiro subiu de tier enquanto este cliente estava em tier com duração limitada
  // → NÃO gerar comissão
  continue;
}

// Usar percentual da regra travada
const percentage     = Number(rule.percentage);
const base           = Number(invoice.amount);
const commission     = parseFloat((base * percentage / 100).toFixed(2));
const setupComm      = rule.commissionOnSetup ? Number(rule.setupCommissionAmount) : 0;
```

### 3.9 — Congelar regras ao detectar upgrade de tier

No `tier.service.js`, ao recalcular o tier de um parceiro, detectar upgrade:

```javascript
async function checkAndFreezeRules(partnerId, newTierId, prisma) {
  // Buscar clientes com regra de tier diferente do atual e com duração limitada
  const rulesToFreeze = await prisma.clientCommissionRule.findMany({
    where: {
      partnerId,
      frozenAtUpgrade: false,
      durationMonths:  { gt: 0 },           // tinha duração limitada
      tierConfigId:    { not: newTierId },   // tier diferente do atual
    }
  });

  if (rulesToFreeze.length > 0) {
    await prisma.clientCommissionRule.updateMany({
      where: { id: { in: rulesToFreeze.map(r => r.id) } },
      data:  { frozenAtUpgrade: true }
    });
  }
}
```

Chamar esta função sempre que o tier do parceiro for recalculado (após adicionar cliente).

### 3.10 — `GET /api/system-config` — incluir `logoLoginWidth`

O endpoint já existente deve retornar `logoLoginWidth`. Verificar se está incluso no response; se não, garantir que o `getAll()` do service não filtra essa chave.

---

## FASE 4 — Frontend SuperAdmin: Aba Planos

Edite `superadmin-planos.js`. Use `str_replace` cirúrgico.

### 4.1 — Filtros de tipo no topo da aba

Adicione filtros antes da listagem:

```javascript
// No início da função loadPlanos(), renderizar filtros:
function renderFiltrosPlanos() {
  return `
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div class="flex rounded-lg border border-gray-200 overflow-hidden">
        <button onclick="loadPlanos('global')"
          id="btnFilterGlobal"
          class="px-4 py-2 text-sm font-medium bg-blue-600 text-white transition-colors">
          Globais
        </button>
        <button onclick="loadPlanos('partner')"
          id="btnFilterPartner"
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          De Parceiros
        </button>
        <button onclick="loadPlanos('all')"
          id="btnFilterAll"
          class="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Todos
        </button>
      </div>
      <select id="filterPartner"
        class="px-3 py-2 border border-gray-200 rounded-lg text-sm hidden"
        onchange="loadPlanos(_currentPlanFilter)">
        <option value="">Todos os parceiros</option>
      </select>
      <button onclick="abrirModalPlano()"
        class="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
        + Novo Plano Global
      </button>
    </div>`;
}
```

### 4.2 — Atualizar `loadPlanos(type)`

```javascript
let _currentPlanFilter = 'global';

async function loadPlanos(type = 'global') {
  _currentPlanFilter = type;
  const el = document.getElementById('tab-planos');
  if (!el) return;

  // Atualizar botões de filtro
  ['global','partner','all'].forEach(t => {
    const btn = document.getElementById(`btnFilter${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (btn) {
      btn.className = t === type
        ? 'px-4 py-2 text-sm font-medium bg-blue-600 text-white transition-colors'
        : 'px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors';
    }
  });

  // Mostrar/esconder select de parceiro
  const filterPartnerEl = document.getElementById('filterPartner');
  if (filterPartnerEl) filterPartnerEl.classList.toggle('hidden', type !== 'partner');

  const partnerId = filterPartnerEl?.value || '';
  const params = new URLSearchParams({ type });
  if (partnerId) params.append('partnerId', partnerId);

  el.querySelector('#planList')?.setAttribute('data-loading', 'true');

  const res = await apiRequest('GET', `/plans?${params}`);
  const plans = res?.data || [];
  renderPlanos(plans, el);
}
```

### 4.3 — Badge de tipo no card/linha de plano

Na função que renderiza cada plano:

```javascript
// No card do plano, após o nome:
${plan.ownerId
  ? `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
       Parceiro: ${plan.owner?.name || '—'}
     </span>`
  : `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
       Global
     </span>`
}
${plan.basePlanId
  ? `<span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
       Baseado em plano global
     </span>`
  : ''}
${Number(plan.setupFee) > 0
  ? `<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
       Setup ${formatCurrency(plan.setupFee)}
     </span>`
  : ''}
```

### 4.4 — Campo `sortOrder` no modal de plano

No HTML gerado pelo modal de plano, adicionar após os campos básicos:

```javascript
`<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">Ordem de Apresentação</label>
  <input type="number" id="plSortOrder" min="0" value="0"
    class="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
  <p class="text-xs text-gray-400 mt-1">Menor número = aparece primeiro.</p>
</div>`
```

Incluir no `salvarPlano()`:
```javascript
body.sortOrder = parseInt(document.getElementById('plSortOrder')?.value) || 0;
```

---

## FASE 5 — Frontend SuperAdmin: Configurações — Largura da Logo

Edite `superadmin-config.js`. Use `str_replace` cirúrgico.

### 5.1 — Campo de largura no painel de configurações do sistema

Localize o bloco onde `logoLogin` é exibido e adicione após ele:

```javascript
`<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">Largura da Logo (login)</label>
  <div class="flex items-center gap-2">
    <input type="number" id="cfgLogoWidth" min="60" max="600" step="10" value="200"
      class="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
    <span class="text-sm text-gray-500">px</span>
  </div>
  <p class="text-xs text-gray-400 mt-1">
    A altura se adapta automaticamente para manter proporção.
    Padrão: 200px.
  </p>
</div>`
```

### 5.2 — Preencher ao carregar config

```javascript
// Em loadConfig(), após obter as configurações:
const cfgLogoWidthEl = document.getElementById('cfgLogoWidth');
if (cfgLogoWidthEl) cfgLogoWidthEl.value = config.logoLoginWidth || 200;
```

### 5.3 — Incluir no `salvarConfig()`

```javascript
body.logoLoginWidth = document.getElementById('cfgLogoWidth')?.value || '200';
```

### 5.4 — Aplicar largura no `applyBranding()` do login

No script de branding do `login.html`, após definir `logoEl.src`:

```javascript
if (cfg.logoLoginWidth) {
  logoEl.style.width    = cfg.logoLoginWidth + 'px';
  logoEl.style.height   = 'auto';    // altura se adapta automaticamente
  logoEl.style.maxWidth = '100%';    // não ultrapassa o container em mobile
}
```

---

## FASE 6 — Frontend SuperAdmin: Configurações — Tiers com Duração

Edite `superadmin-config.js`. Use `str_replace` para modificar apenas o modal de tier.

### 6.1 — Campo `durationMonths` no modal de tier

Localize onde os campos do modal de tier são gerados e adicione:

```javascript
`<!-- Duração do comissionamento -->
<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">
    Duração do Comissionamento (meses)
  </label>
  <div class="flex items-center gap-2">
    <input type="number" id="tierDuration" min="0" step="1" value="0"
      class="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
    <span class="text-sm text-gray-500">meses</span>
  </div>
  <div class="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
    <p class="text-xs text-amber-800 leading-relaxed">
      ⚠️ <strong>0 = indeterminado</strong> (comissão sem prazo).<br>
      Clientes adquiridos enquanto o parceiro estiver em um tier com duração limitada
      <strong>não geram comissão após upgrade de tier</strong> — a regra fica travada na época do cadastro.
    </p>
  </div>
</div>`
```

### 6.2 — Preencher no `abrirModalTier(id)`

```javascript
document.getElementById('tierDuration').value = tier.durationMonths ?? 0;
```

### 6.3 — Incluir no `salvarTier()`

```javascript
body.durationMonths = parseInt(document.getElementById('tierDuration')?.value) || 0;
```

### 6.4 — Exibir duração na tabela de tiers

Na coluna de nome, adicionar badge de duração:

```javascript
${tier.durationMonths > 0
  ? `<span class="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
       ${tier.durationMonths} meses
     </span>`
  : `<span class="ml-1 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
       Indeterminado
     </span>`
}
```

---

## FASE 7 — Frontend Parceiro: Tabela de Preços — Gestão de Planos Próprios

Edite `partner-pricing.js`. Use `str_replace` cirúrgico.

### 7.1 — Botões Editar e Excluir nos planos do parceiro

Na função que renderiza cards de plano, adicionar botões para planos próprios (`plan.ownerId === partnerId`):

```javascript
const partnerId = JSON.parse(sessionStorage.getItem('user') || '{}').partnerId;

// No footer do card, quando é plano do parceiro:
${plan.ownerId === partnerId ? `
  <div class="flex gap-2 mt-3 pt-3 border-t border-gray-100">
    <button onclick="editarPlanoProprioModal('${plan.id}')"
      class="flex-1 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
      ✏️ Editar
    </button>
    <button onclick="excluirPlanoProprio('${plan.id}', '${plan.name.replace(/'/g, "\\'")}')"
      class="flex-1 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
      🗑️ Excluir
    </button>
  </div>` : ''}
```

### 7.2 — Botão "Criar baseado neste plano" para planos globais

```javascript
${!plan.ownerId ? `
  <div class="mt-3 pt-3 border-t border-gray-100">
    <button onclick="criarPlanoBaseadoEm('${plan.id}', '${plan.name.replace(/'/g, "\\'")}')"
      class="w-full py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
      + Criar meu plano baseado neste
    </button>
  </div>` : ''}
```

### 7.3 — Funções de gestão de planos do parceiro

Adicione no final de `partner-pricing.js`:

```javascript
// ── Gestão de planos do parceiro ────────────────────────────

async function criarPlanoBaseadoEm(basePlanId, baseName) {
  const nome = prompt(`Nome do seu plano (baseado em "${baseName}"):`);
  if (!nome?.trim()) return;

  const setupInput = prompt(
    `Taxa de setup do seu plano (R$):\n` +
    `O plano base já tem uma taxa de setup inclusa.\n` +
    `Informe apenas o ACRÉSCIMO (pode ser 0):`,
    '0'
  );
  const setupExtra = Math.max(0, parseFloat(setupInput) || 0);

  try {
    const res = await apiRequest('POST', `/plans/inherit/${basePlanId}`, {
      name:     nome.trim(),
      setupFee: setupExtra, // backend soma ao base
    });
    if (!res?.success) throw new Error(res?.message || 'Erro ao criar plano.');
    showToast(`Plano "${nome}" criado com sucesso!`, 'success');
    loadPricing(); // recarregar
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function editarPlanoProprioModal(planId) {
  const res = await apiRequest('GET', `/plans/${planId}`);
  const plan = res?.data;
  if (!plan) { showToast('Plano não encontrado.', 'error'); return; }

  const novoNome = prompt('Nome do plano:', plan.name);
  if (!novoNome?.trim()) return;

  const novoSetup = prompt(
    'Taxa de setup (R$):\n' +
    'Apenas o ACRÉSCIMO que você definiu (≥ 0 e ≥ setup do plano base).',
    Number(plan.setupFee).toFixed(2)
  );

  try {
    const r = await apiRequest('PUT', `/plans/${planId}`, {
      name:     novoNome.trim(),
      setupFee: Math.max(0, parseFloat(novoSetup) || 0),
    });
    if (!r?.success) throw new Error(r?.message || 'Erro ao salvar.');
    showToast('Plano atualizado.', 'success');
    loadPricing();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function excluirPlanoProprio(planId, planName) {
  if (!confirm(`Excluir o plano "${planName}"?\n\nClientes ativos vinculados a este plano impedirão a exclusão.`)) return;
  try {
    const r = await apiRequest('DELETE', `/plans/${planId}`);
    if (!r?.success) throw new Error(r?.message || 'Erro ao excluir.');
    showToast(`Plano "${planName}" excluído.`, 'success');
    loadPricing();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

### 7.4 — Avisos ao parceiro sobre comissão de setup

Adicionar painel de avisos **antes** dos cards de plano:

```javascript
// No topo da aba, após a legenda de cores, adicionar:
`<div class="space-y-3 mb-6">

  <!-- Aviso sobre comissão de setup -->
  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
    <div class="flex items-start gap-3">
      <span class="text-xl flex-shrink-0">💡</span>
      <div>
        <p class="text-sm font-semibold text-blue-800 mb-1">Como funciona a comissão de setup</p>
        <p class="text-xs text-blue-700 leading-relaxed">
          Somente taxas de setup definidas <strong>no momento da criação do seu plano</strong> geram comissão para você.
          Ativações de clientes sem acréscimo de setup próprio terão comissão apenas sobre a mensalidade,
          quando aplicável ao seu tier.
        </p>
      </div>
    </div>
  </div>

  <!-- Aviso sobre duração do comissionamento -->
  ${_tierAvisoHTML()}

</div>`
```

```javascript
function _tierAvisoHTML() {
  const tier = _partnerTier;
  if (!tier) return '';

  const temDuracao = tier.durationMonths > 0;

  return `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <span class="text-xl flex-shrink-0">⏱️</span>
        <div>
          <p class="text-sm font-semibold text-amber-800 mb-1">
            Duração da comissão — Tier ${tier.name}
          </p>
          <p class="text-xs text-amber-700 leading-relaxed">
            ${temDuracao
              ? `Seu tier atual gera comissão por <strong>${tier.durationMonths} meses</strong> a partir do cadastro de cada cliente.
                 Após esse período, o cliente não gera mais comissão para você.`
              : `Seu tier atual gera comissão por <strong>tempo indeterminado</strong> — sem prazo de expiração.`
            }
          </p>
          ${temDuracao ? `
          <p class="text-xs text-amber-700 leading-relaxed mt-2">
            ⚠️ <strong>Importante:</strong> Clientes adquiridos enquanto você está neste tier
            <strong>não gerarão comissão</strong> caso você faça upgrade de tier no futuro.
            A regra de comissão fica travada na época do cadastro de cada cliente.
          </p>` : ''}
        </div>
      </div>
    </div>`;
}
```

---

## FASE 8 — Verificações e testes

```bash
# 1. Verificar que ownerId e basePlanId existem no banco
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Criar plano global de teste
curl -s -X POST http://localhost:3000/api/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Plano Teste Global","basePrice":200,"users":5,"queues":3,"setupFee":100,"sortOrder":1}' \
  | python3 -m json.tool

# 2. GET com filtros
curl -s "http://localhost:3000/api/plans?type=global" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E '"name"|"ownerId"|"isGlobal"'

curl -s "http://localhost:3000/api/plans?type=partner" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

# 3. CommissionTier com durationMonths
curl -s http://localhost:3000/api/commission-tiers \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | grep -E '"name"|"durationMonths"|"acceptNew"'

# 4. SystemConfig com logoLoginWidth
curl -s http://localhost:3000/api/system-config | python3 -m json.tool | grep -E '"logoLogin'
```

---

## FASE 9 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: plan ownership, logo width, commission duration, partner plan mgmt"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 25
docker stack services pacoticket
```

---

## Checklist final

**SuperAdmin — Planos:**
- [ ] Filtros "Globais / De Parceiros / Todos" funcionam
- [ ] Select de parceiro aparece no filtro "De Parceiros"
- [ ] Cards/linhas mostram badge "Global" ou "Parceiro: [Nome]"
- [ ] Campo `sortOrder` no modal de criação/edição
- [ ] `GET /api/plans?type=partner` retorna apenas planos com `ownerId`

**SuperAdmin — Configurações:**
- [ ] Campo "Largura da Logo (login)" salva e reflete no login
- [ ] Logo do login respeita largura, altura proporcional
- [ ] Campo `durationMonths` no modal de tier
- [ ] Badge de duração na tabela de tiers ("Indeterminado" ou "N meses")
- [ ] Aviso sobre congelamento de comissão no campo de duração

**Parceiro — Tabela de Preços:**
- [ ] Botão "+ Criar meu plano baseado neste" em planos globais
- [ ] Botões Editar e Excluir em planos próprios do parceiro
- [ ] Aviso sobre comissão de setup (somente na criação)
- [ ] Aviso sobre duração do tier e congelamento após upgrade
- [ ] Criar plano via `POST /api/plans/inherit/:basePlanId` herda tudo do base

**Regras de negócio:**
- [ ] `ClientCommissionRule` criada ao cadastrar cliente com tier travado
- [ ] Clientes em tier com duração limitada não geram comissão após upgrade
- [ ] `frozenAtUpgrade = true` ao detectar mudança de tier

```bash
# Zero reseller/revendedor na interface
grep -ri "revendedor\|reseller" \
  /home/user/parceiros/frontend/*.html \
  /home/user/parceiros/frontend/*.js 2>/dev/null | grep -v "//\|#"
```