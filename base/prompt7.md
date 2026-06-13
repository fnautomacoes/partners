# Feature: Precificação Granular, Tiers Configuráveis e Tabela de Preços do Parceiro

## Contexto

O banco já foi atualizado com `schema_update.sql`. As novas estruturas disponíveis são:

- `ModulePrice` agora tem `setupFee` (taxa de setup, default 0) e `isVisible` (ocultar módulo, default true)
- `Plan` agora tem `connectionsWhatsappUnofficial`, `connectionsWhatsappOfficial`, `connectionsInstagram` (além de `users` e `queues` já existentes)
- Nova tabela `ResourcePrice` com preços por unidade de cada recurso (whatsappUnofficial, whatsappOfficial, instagram, user, queue)
- Nova tabela `CommissionTier` com tiers configuráveis (nome, min/max clientes, %, modo de suporte, notas)
- `Commission` agora tem `tierConfigId` referenciando `CommissionTier`

**Leia antes de começar:** `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras inegociáveis

- Planos 100% internos — nunca consulte a API PacoTicket para listar/criar planos
- Backend calcula `totalPrice` — frontend é UX apenas
- `pacoticketPlanId` sempre opcional
- Não altere `login.html`, `partner.html` sem instrução explícita
- Não altere arquivos de infraestrutura (`docker-stack.yml`, `Dockerfile`s, `nginx.conf`)
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- **Um arquivo por vez** para evitar timeout

---

## PARTE 1 — Prisma Schema

Antes de qualquer outra coisa, atualize o `backend/prisma/schema.prisma` para refletir o `schema_update.sql`:

```prisma
model ModulePrice {
  id        String   @id @default(uuid())
  moduleKey String   @unique
  label     String
  price     Decimal  @db.Decimal(10, 2)
  setupFee  Decimal  @db.Decimal(10, 2) @default(0)
  isVisible Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

model ResourcePrice {
  id        String   @id @default(uuid())
  key       String   @unique
  label     String
  price     Decimal  @db.Decimal(10, 2) @default(0)
  updatedAt DateTime @updatedAt
}

model CommissionTier {
  id          String       @id @default(uuid())
  name        String
  minClients  Int
  maxClients  Int?
  percentage  Decimal      @db.Decimal(5, 2)
  supportMode String       @default("PACOTICKET_DIRECT")
  notes       String?
  isActive    Boolean      @default(true)
  order       Int          @default(0)
  commissions Commission[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

// Em Commission, adicionar:
// tierConfigId String?
// tierConfig   CommissionTier? @relation(fields: [tierConfigId], references: [id])

// Em Plan, adicionar:
// connectionsWhatsappUnofficial Int @default(0)
// connectionsWhatsappOfficial   Int @default(0)
// connectionsInstagram          Int @default(0)
```

Rode:
```bash
cd backend && npx prisma generate
```
(Não rode migrate — o banco já foi atualizado pelo schema_update.sql)

---

## PARTE 2 — Backend: novos endpoints

Implemente **um arquivo por vez**, confirmando antes de avançar.

### 2.1 — Endpoints de `ResourcePrice`

Adicione em `backend/src/routes/plans.routes.js` (ou crie `resource-prices.routes.js`):

```
GET  /api/resource-prices         → lista todos os 5 recursos com preços
PUT  /api/resource-prices         → upsert em lote: body [{ key, price }]
```

Controller: busca todos de `ResourcePrice`, upsert pelo `key`.

### 2.2 — Atualizar endpoint de `ModulePrice`

O `GET /api/plans/modules/prices` e `PUT /api/plans/modules/prices` já existem. Atualize para incluir `setupFee` e `isVisible` nos responses e aceitar esses campos no body do PUT.

Contrato atualizado:
```javascript
// GET response — cada item agora inclui:
{ moduleKey, label, price, setupFee, isVisible }

// PUT body — aceita:
[{ moduleKey, price, setupFee, isVisible }]
```

### 2.3 — Endpoints de `CommissionTier`

Crie `backend/src/routes/commission-tiers.routes.js` com acesso SUPERADMIN:

```
GET    /api/commission-tiers          → lista todos ordenados por "order"
POST   /api/commission-tiers          → cria novo tier
PUT    /api/commission-tiers/:id      → edita tier existente
DELETE /api/commission-tiers/:id      → soft delete (isActive = false)
PUT    /api/commission-tiers/reorder  → reordena: body [{ id, order }]
```

Regras do controller:
- Ao criar/editar, validar que `minClients >= 1`
- Ao criar/editar, se `maxClients` informado, validar que `maxClients > minClients`
- `supportMode` aceita apenas: `'PACOTICKET_DIRECT'` ou `'PARTNER_INTERMEDIARY'`
- Não permitir DELETE se o tier tiver comissões vinculadas (`Commission.tierConfigId`)

### 2.4 — Atualizar `tier.service.js`

O serviço atualmente usa tiers hardcoded. Atualize para buscar da tabela `CommissionTier`:

```javascript
// tier.service.js — NOVO comportamento
async function getTierForPartner(activeClientCount, prisma) {
  const tiers = await prisma.commissionTier.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' }
  });

  // Encontra o tier mais alto que o parceiro qualifica
  let matched = tiers[0]; // fallback pro primeiro
  for (const tier of tiers) {
    const qualifies = activeClientCount >= tier.minClients &&
      (tier.maxClients === null || activeClientCount <= tier.maxClients);
    if (qualifies) matched = tier;
  }

  return {
    tier:       matched.order,
    tierId:     matched.id,
    name:       matched.name,
    percentage: Number(matched.percentage),
    supportMode: matched.supportMode,
    notes:      matched.notes,
  };
}
```

Todos os lugares que chamam `getTier()` devem ser atualizados para a versão assíncrona.

### 2.5 — Atualizar cálculo de `totalPrice` nos planos

O `totalPrice` agora inclui os recursos granulares:

```javascript
async function calculateTotalPrice(planData, prisma) {
  // Módulos booleanos (já existia)
  const modulePrices = await prisma.modulePrice.findMany();
  const priceMap = Object.fromEntries(modulePrices.map(m => [m.moduleKey, Number(m.price)]));

  // Recursos de infraestrutura (NOVO)
  const resourcePrices = await prisma.resourcePrice.findMany();
  const resMap = Object.fromEntries(resourcePrices.map(r => [r.key, Number(r.price)]));

  let total = Number(planData.basePrice);

  // Somar módulos booleanos ativos
  for (const [key, value] of Object.entries(planData)) {
    if (key.startsWith('use') && value === true && priceMap[key] !== undefined) {
      total += priceMap[key];
    }
  }

  // Somar recursos granulares (quantidade × preço unitário)
  total += (planData.connectionsWhatsappUnofficial || 0) * (resMap['whatsappUnofficial'] || 0);
  total += (planData.connectionsWhatsappOfficial   || 0) * (resMap['whatsappOfficial']   || 0);
  total += (planData.connectionsInstagram          || 0) * (resMap['instagram']          || 0);
  total += (planData.users                         || 0) * (resMap['user']               || 0);
  total += (planData.queues                        || 0) * (resMap['queue']              || 0);

  return total;
}
```

> **Atenção:** o `basePrice` já inclui a base — o preço dos recursos é *adicional por unidade*. Documente isso claramente nos tooltips do frontend.

### 2.6 — Registrar `CommissionTier` nos endpoints de parceiros

O `GET /api/partners` e `GET /api/partners/:id` devem incluir o tier resolvido:

```javascript
// Para cada parceiro retornado, incluir:
{
  // campos já existentes...
  tierConfig: {
    id, name, percentage, supportMode, notes
  }
}
```

---

## PARTE 3 — Frontend: Aba Configurações (superadmin)

Edite `frontend/superadmin-config.js`. Divida em 4 seções.

### Seção 1: Módulos (atualizada)

A tabela de módulos agora tem 4 colunas: **Visível**, **Módulo**, **Preço/mês**, **Taxa de Setup**.

```
┌──────┬────────────────────┬──────────────┬──────────────┐
│ 👁️   │ Módulo             │ Preço/mês    │ Taxa Setup   │
├──────┼────────────────────┼──────────────┼──────────────┤
│ [✓]  │ WhatsApp           │ R$ [50,00]   │ R$ [0,00]    │
│ [✓]  │ Instagram          │ R$ [30,00]   │ R$ [0,00]    │
│ [✗]  │ VoIP               │ R$ [70,00]   │ R$ [200,00]  │
└──────┴────────────────────┴──────────────┴──────────────┘
```

- Coluna "Visível": toggle/checkbox. Se desmarcado, o módulo não aparece no montador de planos
- Coluna "Preço/mês": input numérico, `step="0.01"`
- Coluna "Taxa Setup": input numérico, `step="0.01"`, placeholder "0,00" (opcional — 0 = sem taxa)
- Aviso fixo: *"⚠️ Alterar preços não recalcula planos já cadastrados."*
- Botão "Salvar Módulos" → `PUT /api/plans/modules/prices` com array `[{ moduleKey, price, setupFee, isVisible }]`

### Seção 2: Recursos de Infraestrutura (nova)

```
┌──────────────────────────────────┬─────────────────────┐
│ Recurso                          │ Preço unitário       │
├──────────────────────────────────┼─────────────────────┤
│ WhatsApp Não Oficial (conexão)   │ R$ [________]        │
│ WhatsApp Oficial / WABA (conexão)│ R$ [________]        │
│ Instagram (conexão)              │ R$ [________]        │
│ Usuário adicional                │ R$ [________]        │
│ Fila adicional                   │ R$ [________]        │
└──────────────────────────────────┴─────────────────────┘
```

- `GET /api/resource-prices` ao carregar
- Botão "Salvar Recursos" → `PUT /api/resource-prices`
- Texto informativo abaixo: *"Esses são os preços cobrados por unidade. O total do plano é calculado multiplicando a quantidade de cada recurso pelo preço unitário."*

### Seção 3: Tiers de Comissionamento (nova — feature principal)

Esta seção substitui a exibição estática de tiers. Agora é CRUD completo.

**Listagem:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Tiers de Comissionamento                    [+ Novo Tier]       │
├──────┬────────────┬────────────┬─────┬──────────────────────────┤
│ Ord  │ Nome       │ Clientes   │  %  │ Suporte         │ Ações  │
├──────┼────────────┼────────────┼─────┼─────────────────┼────────┤
│  1   │ Indicador  │  1 a 2     │ 15% │ PacoTicket Dir. │ ✏️ 🗑️  │
│  2   │ Parceiro   │  3 a 9     │ 25% │ PacoTicket Dir. │ ✏️ 🗑️  │
│  3   │ Master     │  10+       │ 35% │ Intermediário   │ ✏️ 🗑️  │
└──────┴────────────┴────────────┴─────┴─────────────────┴────────┘
```

**Modal Novo/Editar Tier** — campos:
- `name` (text, obrigatório) — ex: "Indicador", "Parceiro", "Master", ou qualquer nome customizado
- `minClients` (number, obrigatório, min 1) — clientes ativos mínimos
- `maxClients` (number, opcional) — deixar vazio = sem limite superior ("ilimitado")
- `percentage` (number, obrigatório, step 0.01) — percentual de comissão
- `supportMode` (select obrigatório):
  - `PACOTICKET_DIRECT` → label: "Suporte direto PacoTicket → Cliente"
  - `PARTNER_INTERMEDIARY` → label: "Suporte via Parceiro (intermediário)"
- `notes` (textarea, opcional) — observações visíveis apenas no superadmin
- `order` (number, obrigatório) — posição de exibição (1, 2, 3...)

**Validações no frontend:**
- `minClients` deve ser < `maxClients` se maxClients informado
- Não pode ter dois tiers com `order` igual (avisar, não bloquear)
- Ao excluir: `confirm()` + DELETE; exibir erro da API se tier tiver comissões vinculadas

**Funções JS:**
- `loadTiers()` — GET /api/commission-tiers → renderiza tabela
- `abrirModalTier(id)` — se id: preenche form; se não: form limpo
- `salvarTier(event)` — POST ou PUT; fecha modal; recarrega
- `excluirTier(id)` — confirm() + DELETE + reload

### Seção 4: Token PacoTicket (mantida igual)

---

## PARTE 4 — Frontend: Montador de Planos (atualizado)

Edite `frontend/superadmin-planos.js`. O modal de criação/edição de planos precisa ser expandido.

### Seção de Infraestrutura no modal

Substitua os campos simples `users`, `connections`, `queues` por campos granulares:

```
┌─────────────────────────────────────────────────────────┐
│ INFRAESTRUTURA                                          │
├──────────────────────────────────────┬──────────────────┤
│ Usuários                             │ [___] × R$ X,XX  │
│ Filas                                │ [___] × R$ X,XX  │
├──────────────────────────────────────┼──────────────────┤
│ CONEXÕES                             │                  │
│ WhatsApp Não Oficial                 │ [___] × R$ X,XX  │
│ WhatsApp Oficial / WABA              │ [___] × R$ X,XX  │
│ Instagram                            │ [___] × R$ X,XX  │
└──────────────────────────────────────┴──────────────────┘
```

- Ao lado de cada campo, exibir o preço unitário carregado de `GET /api/resource-prices`
- Cada input `onchange` chama `calcularTotalPlano()`
- IDs dos inputs: `#plUsers`, `#plQueues`, `#plWppUnofficial`, `#plWppOfficial`, `#plInstagram`

### Módulos — apenas os visíveis

Ao renderizar os toggles de módulos, filtrar apenas `isVisible === true`:

```javascript
const visibleModules = modules.filter(m => m.isVisible);
// renderizar só os visíveis
```

### Cálculo em tempo real atualizado

```javascript
function calcularTotalPlano() {
  const base = parseFloat(document.getElementById('plBasePrice').value) || 0;

  // Recursos granulares
  const users      = parseInt(document.getElementById('plUsers').value)        || 0;
  const queues     = parseInt(document.getElementById('plQueues').value)        || 0;
  const wppUn      = parseInt(document.getElementById('plWppUnofficial').value) || 0;
  const wppOf      = parseInt(document.getElementById('plWppOfficial').value)   || 0;
  const instagram  = parseInt(document.getElementById('plInstagram').value)     || 0;

  const resTotal = users     * (_resourcePrices['user']               || 0)
                 + queues    * (_resourcePrices['queue']               || 0)
                 + wppUn     * (_resourcePrices['whatsappUnofficial']  || 0)
                 + wppOf     * (_resourcePrices['whatsappOfficial']    || 0)
                 + instagram * (_resourcePrices['instagram']           || 0);

  // Módulos booleanos
  let modulesTotal = 0;
  let activeCount = 0;
  document.querySelectorAll('.module-toggle:checked').forEach(cb => {
    modulesTotal += _modulePrices[cb.dataset.key] || 0;
    activeCount++;
  });

  const total = base + resTotal + modulesTotal;

  document.getElementById('plSummaryBase').textContent    = formatCurrency(base);
  document.getElementById('plSummaryResources').textContent = formatCurrency(resTotal);
  document.getElementById('plSummaryModules').textContent = formatCurrency(modulesTotal) + ` (${activeCount} módulos)`;
  document.getElementById('plSummaryTotal').textContent   = formatCurrency(total);
}
```

Declare `_resourcePrices` e `_modulePrices` como variáveis de módulo (escopo do arquivo), carregadas via `Promise.all` no `abrirModalPlano()`.

### Resumo de preço expandido

```
┌─────────────────────────────────────────────────────┐
│ RESUMO DO PLANO                                     │
│ Base:        R$ 200,00                              │
│ Infraestrutura: R$ 120,00                           │
│   2x WhatsApp Não Oficial (R$ 30,00 cada)           │
│   1x WhatsApp Oficial (R$ 60,00)                    │
│ Módulos:     R$ 130,00  (3 ativos)                  │
│ ─────────────────────────────────────────────────   │
│ TOTAL MENSAL: R$ 450,00                             │
└─────────────────────────────────────────────────────┘
```

---

## PARTE 5 — Frontend: Aba "Tabela de Preços" no Portal do Parceiro

Adicione uma nova aba ao `frontend/partner.html` e implemente em `frontend/partner-pricing.js` (arquivo novo).

### Estrutura da aba

```html
<!-- Adicionar botão de aba no nav do partner.html -->
<button class="tab-btn" data-tab="tab-pricing" onclick="showTab('tab-pricing')">
  Tabela de Preços
</button>

<!-- Adicionar div de conteúdo -->
<div id="tab-pricing" class="tab-content hidden"></div>
```

### Conteúdo da aba — `loadPricing()` em `partner-pricing.js`

A aba deve ter visual atraente (cards, gradientes suaves, ícones). Carrega 3 endpoints em paralelo:

```javascript
const [rPlans, rModules, rResources, rTiers] = await Promise.all([
  apiRequest('GET', '/plans'),
  apiRequest('GET', '/plans/modules/prices'),
  apiRequest('GET', '/resource-prices'),
  apiRequest('GET', '/commission-tiers'),
]);
```

**Seção 1 — Tabela de Planos Disponíveis**

Visual: cards lado a lado (grid responsivo 1-2-3 colunas). Para cada plano:

```
┌─────────────────────────────────────────┐
│  ⭐ PRO PLUS                             │
│     R$ 450,00/mês                       │
├─────────────────────────────────────────┤
│  BASE                                   │
│  • 2x WhatsApp Não Oficial              │
│  • 1x WhatsApp Oficial                  │
│  • 0x Instagram                         │
│  • 5 Usuários                           │
│  • 3 Filas                              │
├─────────────────────────────────────────┤
│  MÓDULOS INCLUÍDOS                      │
│  💬 WhatsApp  📣 Campanhas  🤖 IA       │
│  📊 RD Station  📇 CRM                  │
├─────────────────────────────────────────┤
│  Sua comissão: 25% = R$ 112,50/mês     │
│  (baseado no seu tier atual)            │
└─────────────────────────────────────────┘
```

- Exibir apenas planos com `isActive: true`
- Comissão estimada = `totalPrice × (tierAtual.percentage / 100)` — buscar tier do parceiro logado via `GET /api/partners/me/dashboard`
- Badge "PacoTicket #N" se `pacoticketPlanId` preenchido

**Seção 2 — Tabela de Preços dos Módulos**

Visual: grid de cards de módulos com ícone, nome, preço/mês e taxa de setup (quando > 0). Apenas módulos com `isVisible: true`.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 💬           │  │ 📣           │  │ 🤖           │
│ WhatsApp    │  │ Campanhas   │  │ IA          │
│ R$ 50/mês   │  │ R$ 40/mês   │  │ R$ 80/mês   │
│ Setup: R$0  │  │ Setup: R$0  │  │ Setup:R$200 │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Seção 3 — Regras de Comissionamento**

Visual: linha do tempo / stepper horizontal mostrando os tiers em ordem.

```
  INDICADOR          PARCEIRO           MASTER
  1–2 clientes  →   3–9 clientes  →   10+ clientes
     15%               25%                35%
  [PacoTicket]    [PacoTicket]      [Via Parceiro]
  direto          direto            intermediário

  ──────●────────────────────────────────────────
        ↑ Você está aqui (3 clientes ativos)
```

- Marcar o tier atual do parceiro logado com destaque visual (anel azul, fundo mais escuro)
- Mostrar barra de progresso: "3 clientes ativos — faltam 7 para Master"
- Exibir `notes` do tier (se preenchido pelo superadmin)
- Para `supportMode`:
  - `PACOTICKET_DIRECT` → exibir: "Suporte: PacoTicket atende o cliente diretamente"
  - `PARTNER_INTERMEDIARY` → exibir: "Suporte: Você é o ponto de contato do cliente"

**Seção 4 — Seus Recursos de Infraestrutura**

Tabela simples: preço unitário de cada recurso. Contexto para o parceiro entender como o preço dos planos é composto.

```
┌──────────────────────────────────┬──────────────┐
│ Recurso                          │ Preço/unid.  │
├──────────────────────────────────┼──────────────┤
│ WhatsApp Não Oficial (conexão)   │ R$ 30,00     │
│ WhatsApp Oficial / WABA          │ R$ 60,00     │
│ Instagram (conexão)              │ R$ 25,00     │
│ Usuário adicional                │ R$ 15,00     │
│ Fila adicional                   │ R$ 10,00     │
└──────────────────────────────────┴──────────────┘
```

### Adicionar `partner-pricing.js` ao `partner.html`

```html
<script src="partner-pricing.js"></script>
```

E registrar o loader no `showTab` do `partner.js` (ou no utils do parceiro):

```javascript
'tab-pricing': () => typeof loadPricing === 'function' && loadPricing(),
```

---

## PARTE 6 — Ordem de implementação

Execute nesta ordem, confirmando cada etapa:

1. Atualizar `backend/prisma/schema.prisma` → `npx prisma generate`
2. Criar/atualizar `backend/src/routes/resource-prices.routes.js` + registrar no `server.js`
3. Criar `backend/src/routes/commission-tiers.routes.js` + registrar no `server.js`
4. Atualizar `backend/src/services/tier.service.js` para usar `CommissionTier` da tabela
5. Atualizar `backend/src/routes/plans.routes.js` — cálculo de `totalPrice` com recursos granulares
6. Atualizar `frontend/superadmin-config.js` — seções de módulos, recursos e tiers
7. Atualizar `frontend/superadmin-planos.js` — campos granulares + cálculo em tempo real
8. Criar `frontend/partner-pricing.js` — aba Tabela de Preços do parceiro
9. Atualizar `frontend/partner.html` — adicionar aba Tabela de Preços + script tag
10. Build e deploy

---

## PARTE 7 — Deploy

```bash
cd /opt/parceiros
git pull

# Backend mudou (novos endpoints + prisma generate)
docker build --no-cache -t pacoticket-backend:latest ./backend

# Frontend mudou (novos arquivos JS + partner.html)
docker build --no-cache -t pacoticket-frontend:latest ./frontend

docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

**Validação final:**

```bash
# Verificar novos endpoints
curl -s http://localhost:3000/api/resource-prices
curl -s http://localhost:3000/api/commission-tiers

# Verificar arquivos no frontend
docker exec $(docker ps -qf "name=pacoticket_frontend") ls /usr/share/nginx/html/partner-pricing.js

# Zero ocorrências de revendedor/reseller na interface
grep -ri "revendedor\|reseller" /opt/parceiros/frontend/*.html /opt/parceiros/frontend/*.js
```

---

## Notas de design (aba Tabela de Preços do parceiro)

- Paleta: azul `#1e3a8a` para headers, verde `#059669` para valores de comissão, cinza `#f8fafc` para fundo de cards
- Usar `box-shadow` suave nos cards de planos: `0 4px 6px -1px rgba(0,0,0,0.07)`
- Tier atual do parceiro: ring azul `ring-2 ring-blue-500` no card de tier correspondente
- Ícones dos módulos: usar o `MODULE_MAP` já definido no `pacoticket-reseller-skill.md` (seção 6)
- Mobile-first: grid de planos `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Animação suave na barra de progresso: `transition-all duration-500`