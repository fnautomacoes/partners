# Feature v2 — Planos Avançados, White-Label, Permissões, Add-ons e Comissionamento Temporal

## Pré-requisitos

1. `schema_update.sql` (v1) já aplicado ao banco
2. `schema_update_v2.sql` aplicado ao banco:
   ```bash
   psql -h HOST -U postgres -d pacoticket_parceiros -f schema_update_v2.sql
   ```
3. Leia: `CLAUDE.md` e `pacoticket-reseller-skill.md`

---

## Regras absolutas (não negociáveis)

- Planos 100% internos — nunca consulte a API PacoTicket para planos
- `totalPrice` calculado no backend — frontend é UX apenas
- **Um arquivo por vez** — nunca reescreva arquivos grandes de uma só vez
- Terminologia: **parceiro** (nunca revendedor/reseller) na interface
- Não altere arquivos de infraestrutura (`docker-stack.yml`, `Dockerfile`s, `nginx.conf`)
- `baseUrl` da API PacoTicket vem de `SystemConfig.apiBaseUrl` — nunca hardcode

---

## Ordem de implementação

Execute **uma etapa por vez**, confirme que funcionou, depois avance.

---

## ETAPA 1 — Prisma Schema

Atualize `backend/prisma/schema.prisma` adicionando os novos models e campos. Não remova nada existente.

```prisma
// SystemConfig — configurações globais do sistema
model SystemConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String?
  updatedAt DateTime @updatedAt
}

// ResourcePrice — adicionar campos novos
model ResourcePrice {
  id        String   @id @default(uuid())
  key       String   @unique
  label     String
  price     Decimal  @db.Decimal(10, 2) @default(0)
  setupFee  Decimal  @db.Decimal(10, 2) @default(0)
  isVisible Boolean  @default(true)
  sortOrder Int      @default(0)
  updatedAt DateTime @updatedAt
}

// Plan — adicionar campos novos
// setupFee, sortOrder, ownerId (null = global, uuid = plano do parceiro)

// Partner — adicionar campos
// canSetRecurrence Boolean @default(false)
// canSetDueDate    Boolean @default(false)

// CommissionTier — adicionar
// durationMonths Int @default(0)  -- 0 = infinito

// ClientAddon
model ClientAddon {
  id          String   @id @default(uuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  addonType   String   // 'MODULE' | 'RESOURCE'
  key         String
  label       String
  quantity    Int      @default(1)
  unitPrice   Decimal  @db.Decimal(10, 2) @default(0)
  discountPct Decimal  @db.Decimal(5, 2)  @default(0)
  setupFee    Decimal  @db.Decimal(10, 2) @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// PlanAddon — desconto ou override de preço por item em um plano específico
model PlanAddon {
  id            String   @id @default(uuid())
  planId        String
  plan          Plan     @relation(fields: [planId], references: [id], onDelete: Cascade)
  addonType     String   // 'MODULE' | 'RESOURCE'
  key           String
  label         String
  discountPct   Decimal  @db.Decimal(5, 2)  @default(0)
  overridePrice Decimal? @db.Decimal(10, 2)
  createdAt     DateTime @default(now())
}

// ClientCommissionRule — regra travada no momento da adição do cliente
model ClientCommissionRule {
  id             String          @id @default(uuid())
  clientId       String          @unique
  client         Client          @relation(fields: [clientId], references: [id], onDelete: Cascade)
  partnerId      String
  partner        Partner         @relation(fields: [partnerId], references: [id])
  tierConfigId   String?
  tierConfig     CommissionTier? @relation(fields: [tierConfigId], references: [id])
  tierName       String
  percentage     Decimal         @db.Decimal(5, 2)
  durationMonths Int             @default(0)
  startedAt      DateTime        @default(now())
  expiresAt      DateTime?
  createdAt      DateTime        @default(now())
}
```

Após editar o schema:
```bash
cd backend && npx prisma generate
```

Confirme: `npx prisma generate` sem erros → avance.

---

## ETAPA 2 — SystemConfig: serviço e endpoints

### 2.1 — Criar `backend/src/services/system-config.service.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULTS = {
  businessName: 'PacoTicket',
  logoLogin:    null,
  logoInternal: null,
  favicon:      null,
  apiBaseUrl:   'https://api.pacoticket.com.br',
};

async function getAll() {
  const rows = await prisma.systemConfig.findMany();
  const config = { ...DEFAULTS };
  for (const row of rows) config[row.key] = row.value;
  return config;
}

async function get(key) {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

async function set(key, value) {
  return prisma.systemConfig.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });
}

async function setMany(entries) {
  // entries = [{ key, value }]
  return Promise.all(entries.map(e => set(e.key, e.value)));
}

module.exports = { getAll, get, set, setMany };
```

### 2.2 — Criar `backend/src/routes/system-config.routes.js`

```javascript
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const configSvc = require('../services/system-config.service');

// GET /api/system-config — público (usado pelo frontend para carregar logo/nome)
router.get('/', async (req, res) => {
  try {
    const config = await configSvc.getAll();
    // Nunca expor apiBaseUrl ao frontend público
    const { apiBaseUrl, ...publicConfig } = config;
    res.json({ success: true, data: publicConfig });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

// PUT /api/system-config — SUPERADMIN apenas
router.put('/', requireAuth, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const allowed = ['businessName', 'logoLogin', 'logoInternal', 'favicon', 'apiBaseUrl'];
    const entries = Object.entries(req.body)
      .filter(([k]) => allowed.includes(k))
      .map(([key, value]) => ({ key, value: value || null }));
    await configSvc.setMany(entries);
    const updated = await configSvc.getAll();
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

module.exports = router;
```

### 2.3 — Registrar em `server.js`

```javascript
app.use('/api/system-config', require('./routes/system-config.routes'));
```

### 2.4 — Atualizar `pacoticket.service.js`

Substitua o `baseUrl` hardcoded pelo valor dinâmico:

```javascript
const configSvc = require('./system-config.service');

async function getBaseUrl() {
  return (await configSvc.get('apiBaseUrl')) || 'https://api.pacoticket.com.br';
}

// Em todas as chamadas fetch/axios, use:
// const base = await getBaseUrl();
// fetch(`${base}/endpoint`, ...)
```

Confirme: `GET /api/system-config` retorna objeto com `businessName`, `logoLogin`, etc. → avance.

---

## ETAPA 3 — Backend: Planos (campos novos)

### 3.1 — Atualizar `plans.routes.js` / controller de planos

**POST e PUT /api/plans** agora aceitam e persistem:
- `setupFee` (decimal, default 0)
- `sortOrder` (integer, default 0)
- `ownerId` (uuid | null) — null = plano global; uuid = plano exclusivo do parceiro

**Cálculo de `totalPrice` atualizado:**

O `totalPrice` agora é calculado com base na lógica "tudo incluso" — o preço base do plano já considera os itens selecionados. O backend **não** some preços de módulos ao `totalPrice` — o `basePrice` informado pelo superadmin já é o preço final mensal do plano. Os módulos e recursos no plano servem para documentar o que está incluso, não para inflar o preço.

```javascript
// NOVA lógica de totalPrice — simples:
// totalPrice = basePrice (tudo já embutido)
// A soma de módulos/recursos é apenas para exibição do breakdown
async function calculateTotalPrice(planData) {
  return Number(planData.basePrice);
}
```

> **Motivo:** o requisito diz "o preço base deve considerar tudo que está no plano. Não deve cobrar a mais por nenhum item selecionado."

**GET /api/plans** — incluir campos novos na resposta:
```javascript
{
  // ...campos existentes
  setupFee:    plan.setupFee,
  sortOrder:   plan.sortOrder,
  ownerId:     plan.ownerId,
  isGlobal:    plan.ownerId === null,
  planAddons:  plan.planAddons,  // include: { planAddons: true } no Prisma query
}
```

**GET /api/plans** — ordenação: `orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]`

### 3.2 — Endpoint de reordenação

```
PUT /api/plans/reorder
Body: [{ id, sortOrder }]
SUPERADMIN apenas
```

```javascript
router.put('/reorder', requireAuth, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const updates = req.body; // [{ id, sortOrder }]
    await Promise.all(updates.map(u =>
      prisma.plan.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })
    ));
    res.json({ success: true, data: { updated: updates.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});
```

### 3.3 — PlanAddon endpoints

```
GET  /api/plans/:id/addons          → lista addons do plano
POST /api/plans/:id/addons          → adiciona addon (desconto ou override)
DELETE /api/plans/:id/addons/:key   → remove addon
```

Confirme: `POST /api/plans` retorna `setupFee` e `sortOrder` → avance.

---

## ETAPA 4 — Backend: ClientAddon

### 4.1 — Endpoints

```
GET    /api/clients/:id/addons         → lista addons do cliente
POST   /api/clients/:id/addons         → adiciona addon
PUT    /api/clients/:id/addons/:addonId → edita addon (só SUPERADMIN pode alterar discountPct)
DELETE /api/clients/:id/addons/:addonId → remove addon
```

**POST body:**
```json
{
  "addonType": "MODULE",
  "key": "useAI",
  "label": "Inteligência Artificial",
  "quantity": 1,
  "unitPrice": 80.00,
  "discountPct": 0,
  "setupFee": 200.00
}
```

**Regra de acesso:**
- PARTNER pode adicionar addons aos próprios clientes, mas `discountPct` é sempre 0 para PARTNER
- SUPERADMIN pode definir qualquer `discountPct`

```javascript
if (req.user.role === 'PARTNER') {
  body.discountPct = 0; // parceiro nunca dá desconto
}
```

Confirme: `POST /api/clients/:id/addons` funciona → avance.

---

## ETAPA 5 — Backend: Permissões do Parceiro

### 5.1 — Atualizar PUT /api/partners/:id

Aceitar e persistir `canSetRecurrence` e `canSetDueDate`.

### 5.2 — Atualizar GET /api/partners/me/dashboard e GET /api/partners/:id

Incluir na resposta:
```json
{
  "canSetRecurrence": false,
  "canSetDueDate": false
}
```

Confirme: `GET /api/partners/me/dashboard` inclui as permissões → avance.

---

## ETAPA 6 — Backend: Comissionamento Temporal

### 6.1 — Atualizar CommissionTier endpoints

`POST` e `PUT /api/commission-tiers` agora aceitam `durationMonths` (integer, default 0).

### 6.2 — Criar `ClientCommissionRule` ao adicionar cliente

Em `POST /api/clients`, após salvar o cliente:

```javascript
// Buscar tier atual do parceiro
const tierInfo = await getTierForPartner(activeClientCount, prisma);

// Calcular expiresAt
const startedAt = new Date();
let expiresAt = null;
if (tierInfo.durationMonths > 0) {
  expiresAt = new Date(startedAt);
  expiresAt.setMonth(expiresAt.getMonth() + tierInfo.durationMonths);
}

// Criar regra travada
await prisma.clientCommissionRule.create({
  data: {
    clientId:       client.id,
    partnerId:      partner.id,
    tierConfigId:   tierInfo.tierId,
    tierName:       tierInfo.name,
    percentage:     tierInfo.percentage,
    durationMonths: tierInfo.durationMonths,
    startedAt,
    expiresAt,
  }
});
```

### 6.3 — Atualizar `commission.service.js`

Ao calcular comissão de um cliente, usar a regra travada (`ClientCommissionRule`) em vez do tier atual:

```javascript
async function getEffectiveCommissionRule(clientId, partnerId, periodMonth, periodYear, prisma) {
  const rule = await prisma.clientCommissionRule.findUnique({ where: { clientId } });

  if (!rule) {
    // Fallback: usar tier atual do parceiro (clientes antigos sem regra travada)
    const activeClients = await countActiveClients(partnerId, prisma);
    return getTierForPartner(activeClients, prisma);
  }

  // Verificar se o comissionamento expirou
  const periodDate = new Date(periodYear, periodMonth - 1, 1);
  if (rule.expiresAt && periodDate > rule.expiresAt) {
    return null; // comissão expirada — não gerar para este cliente
  }

  return {
    percentage:     Number(rule.percentage),
    name:           rule.tierName,
    durationMonths: rule.durationMonths,
  };
}
```

Confirme: criar cliente gera `ClientCommissionRule` no banco → avance.

---

## ETAPA 7 — Frontend SuperAdmin: Configurações

Edite `frontend/superadmin-config.js`. Uma seção por vez.

### Seção: White-Label e Configurações do Sistema

Adicionar no topo da aba configurações:

```
┌──────────────────────────────────────────────────────────────┐
│ CONFIGURAÇÕES DO SISTEMA                                     │
├─────────────────────────┬────────────────────────────────────┤
│ Nome do Negócio         │ [PacoTicket________________]       │
│                         │ Usado em e-mails, PDFs e textos.   │
│                         │ Não aparece no header/login se     │
│                         │ logo estiver configurada.          │
├─────────────────────────┼────────────────────────────────────┤
│ Logo (tela de login)    │ [URL da imagem___________]         │
│ Logo (interna)          │ [URL da imagem___________]         │
│ Favicon                 │ [URL do favicon__________]         │
├─────────────────────────┼────────────────────────────────────┤
│ URL da API PacoTicket   │ [https://api.pacoticket.com.br___] │
│                         │ Base URL usada em todos os         │
│                         │ endpoints de integração.           │
└─────────────────────────┴────────────────────────────────────┘
         [Salvar Configurações do Sistema]
```

- `GET /api/system-config` ao carregar (inclui `apiBaseUrl` na rota autenticada do admin)
- `PUT /api/system-config` ao salvar
- Após salvar, aplicar `businessName` dinamicamente:
  ```javascript
  document.title = `${data.businessName} — SuperAdmin`;
  ```

### Seção: Módulos (atualizada)

A tabela agora tem 5 colunas: **Visível** | **Nome** | **Chave** | **Preço/mês** | **Taxa Setup**

- Coluna "Nome": input text editável (persiste label no banco)
- Coluna "Chave": somente leitura, fonte cinza pequena
- Coluna "Visível": toggle
- Coluna "Preço/mês": input numérico
- Coluna "Taxa Setup": input numérico, placeholder "0,00"
- Botão "Salvar Módulos" → `PUT /api/plans/modules/prices` com `[{ moduleKey, label, price, setupFee, isVisible }]`
- Aviso: "⚠️ Alterar preços não recalcula planos já cadastrados."

### Seção: Recursos de Infraestrutura (atualizada)

Agora com botão "+ Adicionar Recurso":

```
┌──────────┬─────────────────────────────┬──────────┬──────────┬──────┬──────┐
│ Visível  │ Nome                        │ Chave    │ Preço    │Setup │Ordem │
├──────────┼─────────────────────────────┼──────────┼──────────┼──────┼──────┤
│ [✓]      │ [WhatsApp Não Oficial____]  │ wppUn    │ [30,00]  │[0,00]│ [1]  │
│ [✓]      │ [WhatsApp Oficial / WABA__] │ wppOf    │ [60,00]  │[0,00]│ [2]  │
│ [+] Novo │                             │          │          │      │      │
└──────────┴─────────────────────────────┴──────────┴──────────┴──────┴──────┘
```

Modal "+ Novo Recurso": campos Nome (obrigatório), Chave/key (obrigatório, snake_case), Preço, Taxa Setup, Visível.

- `POST /api/resource-prices` para criar
- `PUT /api/resource-prices` em lote para salvar alterações
- `DELETE /api/resource-prices/:key` para remover (com confirmação)

### Seção: Tiers de Comissionamento (atualizada)

Modal de tier agora inclui campo **Duração (meses)**:

- Input numérico, min 0, default 0
- Placeholder: "0"
- Texto auxiliar: *"0 = sem prazo. Se preenchido, o comissionamento deste cliente expira após N meses, mesmo que o parceiro suba de tier."*

Confirme: salvar configurações do sistema funciona e `GET /api/system-config` reflete → avance.

---

## ETAPA 8 — Frontend SuperAdmin: Montador de Planos

Edite `frontend/superadmin-planos.js`.

### Mudanças no modal de plano

**Campo Taxa de Setup do Plano** (novo, após o campo de preço base):
```html
<label>Taxa de Setup do Plano</label>
<input type="number" id="plSetupFee" step="0.01" min="0" placeholder="0,00">
<p class="text-xs text-gray-500">Cobrada uma vez na ativação. 0 = sem taxa.</p>
```

**Lógica de preço — sem somar módulos:**

```javascript
function calcularTotalPlano() {
  const base = parseFloat(document.getElementById('plBasePrice').value) || 0;
  // totalPrice = basePrice (tudo já embutido)
  // O breakdown é apenas informativo
  document.getElementById('plSummaryBase').textContent  = formatCurrency(base);
  document.getElementById('plSummaryTotal').textContent = formatCurrency(base);
  document.getElementById('plSummarySetup').textContent = formatCurrency(
    parseFloat(document.getElementById('plSetupFee').value) || 0
  );
}
```

**Breakdown informativo** (exibir mas não somar ao preço):

```
┌────────────────────────────────────────────────┐
│ COMPOSIÇÃO DO PLANO (informativo)              │
│ Preço Base (mensal): R$ 450,00                 │
│ Taxa de Setup:       R$ 100,00 (cobrada 1x)    │
│                                                │
│ Inclui:                                        │
│   2× WhatsApp Não Oficial                      │
│   1× WhatsApp Oficial                          │
│   5 usuários · 3 filas                         │
│   Módulos: WhatsApp, CRM, IA (3 ativos)        │
└────────────────────────────────────────────────┘
```

**Campo Ordem de Apresentação:**
```html
<label>Ordem de Apresentação</label>
<input type="number" id="plSortOrder" min="0" value="0">
```

**Descontos por item (PlanAddon):**

Abaixo da lista de módulos, adicionar seção expansível "Descontos e Overrides":

```
┌──────────────────────────────────────────────────────┐
│ DESCONTOS NESTE PLANO (opcional)                     │
│ Aplica desconto em item específico sem alterar o     │
│ preço global do módulo.                              │
│                                                      │
│ [+ Adicionar desconto]                               │
│                                                      │
│ Módulo        Desconto%   Preço Override             │
│ WhatsApp      [10]%       [_______] (vazio=global)   │
│ [x]                                                  │
└──────────────────────────────────────────────────────┘
```

**Drag-and-drop de ordem de planos na listagem:**

Na listagem de planos, exibir um ícone de drag `⠿` em cada linha/card. Ao reordenar, chamar `PUT /api/plans/reorder` com a nova ordem. Implemente com HTML5 drag-and-drop nativo (`draggable="true"`, eventos `dragstart`, `dragover`, `drop`).

Confirme: criar plano salva `setupFee` e `sortOrder` → avance.

---

## ETAPA 9 — Frontend SuperAdmin: Cadastro de Parceiros

Edite `frontend/superadmin-parceiros.js`.

No modal de criação/edição de parceiro, adicionar seção "Permissões de Cadastro de Clientes":

```
┌────────────────────────────────────────────────────┐
│ PERMISSÕES — CADASTRO DE CLIENTES                  │
├────────────────────────────────────────────────────┤
│ [✓] Pode definir Recorrência                       │
│     Se desmarcado, recorrência será sempre Mensal  │
│                                                    │
│ [✓] Pode definir Data de Vencimento                │
│     Se desmarcado, vencimento = cadastro + 2 dias  │
└────────────────────────────────────────────────────┘
```

IDs: `#pCanSetRecurrence`, `#pCanSetDueDate`.

Incluir no `salvarParceiro()`:
```javascript
body.canSetRecurrence = document.getElementById('pCanSetRecurrence').checked;
body.canSetDueDate    = document.getElementById('pCanSetDueDate').checked;
```

Confirme: editar parceiro salva as permissões → avance.

---

## ETAPA 10 — Frontend SuperAdmin: Add-ons no Cliente

Edite `frontend/superadmin-clientes.js`.

No modal de visualização/edição de cliente, adicionar aba ou seção "Add-ons":

```
PLANO BASE: Pro Plus — R$ 450,00/mês
──────────────────────────────────────
ADD-ONS ADICIONADOS:
┌──────────────┬──────┬──────────┬─────────┬──────────┬──────┐
│ Tipo/Módulo  │ Qtd  │ Preço Un │ Desc.%  │ Líquido  │      │
├──────────────┼──────┼──────────┼─────────┼──────────┼──────┤
│ 💬 WhatsApp  │  1   │ R$50,00  │  10%    │ R$45,00  │ [x]  │
│ 🔌 API Ext.  │  1   │ R$60,00  │   0%    │ R$60,00  │ [x]  │
└──────────────┴──────┴──────────┴─────────┴──────────┴──────┘
TOTAL ADD-ONS: R$ 105,00/mês
TOTAL CLIENTE: R$ 555,00/mês

[+ Adicionar Add-on]
```

**Modal "+ Adicionar Add-on":**
- Select tipo: "Módulo" ou "Recurso de Infraestrutura"
- Select item: carregado dinamicamente de `GET /api/plans/modules/prices` ou `GET /api/resource-prices`
- Campo Quantidade (para recursos)
- Preço unitário (pré-preenchido do catálogo, editável pelo superadmin)
- Desconto % (0–100, só superadmin)
- Taxa Setup

Confirme: add-on aparece no cliente e soma ao total exibido → avance.

---

## ETAPA 11 — Frontend SuperAdmin: White-Label no Header e Login

### 11.1 — Carregar configurações ao inicializar

Em `superadmin-utils.js`, adicione ao `DOMContentLoaded`:

```javascript
async function applyBranding() {
  try {
    const res = await fetch('/api/system-config');
    const cfg = (await res.json()).data || {};

    // businessName
    const bName = cfg.businessName || 'PacoTicket';
    document.title = `${bName} — SuperAdmin`;

    // Logo interna: se configurada, exibir img; se não, exibir businessName no header
    const logoEl = document.getElementById('headerLogo');
    const nameEl = document.getElementById('headerName');
    if (cfg.logoInternal && logoEl) {
      logoEl.src = cfg.logoInternal;
      logoEl.classList.remove('hidden');
      if (nameEl) nameEl.classList.add('hidden');
    } else if (nameEl) {
      nameEl.textContent = bName;
    }

    // Favicon
    if (cfg.favicon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = cfg.favicon;
    }
  } catch { /* branding opcional */ }
}
```

### 11.2 — Atualizar `superadmin.html` — header

```html
<header class="gradient-bg text-white shadow-lg">
  <div class="container mx-auto px-6 py-4 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <img id="headerLogo" src="" alt="Logo" class="h-8 hidden">
      <span id="headerName" class="text-xl font-bold">PacoTicket SuperAdmin</span>
    </div>
    ...
  </div>
</header>
```

### 11.3 — Atualizar `login.html`

Ao carregar `login.html`, buscar configurações e aplicar:

```javascript
fetch('/api/system-config').then(r => r.json()).then(res => {
  const cfg = res.data || {};
  const bName = cfg.businessName || 'PacoTicket';

  // Logo: se configurada, exibir; se não, exibir businessName
  const logoEl  = document.getElementById('loginLogo');
  const nameEl  = document.getElementById('loginTitle');
  if (cfg.logoLogin && logoEl) {
    logoEl.src = cfg.logoLogin;
    logoEl.classList.remove('hidden');
    if (nameEl) nameEl.classList.add('hidden');
  } else if (nameEl) {
    nameEl.textContent = bName;
  }

  // Favicon
  if (cfg.favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = cfg.favicon;
  }
}).catch(() => {});
```

**Elementos em `login.html`:**
```html
<img id="loginLogo" src="" alt="" class="hidden h-12 mx-auto mb-4">
<h1 id="loginTitle" class="text-2xl font-bold text-center">PacoTicket</h1>
```

Confirme: configurar `businessName` no superadmin reflete no título e no login → avance.

---

## ETAPA 12 — Frontend Parceiro: Modal Novo Cliente (permissões)

Edite `frontend/partner.js` (ou o arquivo que controla a aba Meus Clientes).

### Lógica de permissões no modal

Ao abrir o modal de novo cliente, verificar as permissões do parceiro logado:

```javascript
async function abrirModalNovoCliente() {
  const dashboard = await apiRequest('GET', '/partners/me/dashboard');
  const perms = dashboard?.data?.partner || {};

  const recorrenciaRow = document.getElementById('rowRecorrencia');
  const vencimentoRow  = document.getElementById('rowVencimento');
  const recorrenciaEl  = document.getElementById('clienteRecorrencia');
  const vencimentoEl   = document.getElementById('clienteVencimento');

  if (!perms.canSetRecurrence) {
    recorrenciaRow.classList.add('hidden');
    // Valor fixo enviado ao backend
    recorrenciaEl.value = 'MONTHLY';
  } else {
    recorrenciaRow.classList.remove('hidden');
  }

  if (!perms.canSetDueDate) {
    vencimentoRow.classList.add('hidden');
    // Calcular: hoje + 2 dias
    const d = new Date();
    d.setDate(d.getDate() + 2);
    vencimentoEl.value = d.toISOString().split('T')[0];
  } else {
    vencimentoRow.classList.remove('hidden');
  }
}
```

### Add-ons no modal do parceiro (somente visualização de preços, sem desconto)

Adicionar seção "Add-ons" no modal de novo/editar cliente do parceiro:

```
MÓDULOS ADICIONAIS (somados ao plano)
[+ Adicionar módulo ou recurso]

WhatsApp Extra   R$ 50,00/mês   [x]
API Externa      R$ 60,00/mês   [x]
──────────────────────────────────
Add-ons: R$ 110,00/mês
```

- Parceiro **não vê** campo de desconto nem pode alterar preços
- Módulos disponíveis: apenas os com `isVisible: true` de `GET /api/plans/modules/prices`
- Recursos disponíveis: apenas os com `isVisible: true` de `GET /api/resource-prices`
- `discountPct` sempre 0 para PARTNER

Confirme: modal respeita permissões do parceiro → avance.

---

## ETAPA 13 — Frontend Parceiro: Tabela de Preços (atualizada)

Edite `frontend/partner-pricing.js`.

### Filtro: Planos Globais vs Meus Planos

No topo da aba, adicionar toggle:

```html
<div class="flex gap-2 mb-6">
  <button id="btnGlobal" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium" onclick="filtrarPlanos('global')">
    Planos Globais
  </button>
  <button id="btnMeus" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium" onclick="filtrarPlanos('meus')">
    Meus Planos
  </button>
</div>
```

```javascript
function filtrarPlanos(tipo) {
  // tipo: 'global' | 'meus'
  const todos = _todosPlanos;
  const partnerId = JSON.parse(sessionStorage.getItem('user') || '{}').partnerId;
  const filtrados = tipo === 'meus'
    ? todos.filter(p => p.ownerId === partnerId)
    : todos.filter(p => p.ownerId === null);
  renderPlanos(filtrados);
}
```

### Detalhamento de taxa de setup nos cards de plano

```
┌─────────────────────────────────────────┐
│  ⭐ PRO PLUS                  [Global]  │
│                                         │
│  R$ 450,00/mês                          │
│  + R$ 100,00 de setup (1x)              │
├─────────────────────────────────────────┤
│  BASE INCLUSA                           │
│  ...
├─────────────────────────────────────────┤
│  MÓDULOS INCLUÍDOS                      │
│  💬 WhatsApp  R$ 50/mês  Setup: R$ 0   │
│  🤖 IA        R$ 80/mês  Setup: R$200  │
│  (só módulos com isVisible: true)       │
├─────────────────────────────────────────┤
│  Sua comissão: 25% = R$ 112,50/mês     │
└─────────────────────────────────────────┘
```

Exibir setup fee do módulo quando `setupFee > 0`.

### Corrigir: módulos ativos com preços aparecerem na tabela

Ao renderizar cards de plano, buscar os preços de módulo do catálogo e cruzar com os módulos ativos do plano:

```javascript
// Após carregar planos e módulos:
function getModuleDetails(plan, modulePrices) {
  const priceMap = Object.fromEntries(modulePrices.map(m => [m.moduleKey, m]));
  return (plan.activeModules || [])
    .filter(m => priceMap[m.key]?.isVisible !== false)
    .map(m => ({
      ...m,
      price:    priceMap[m.key]?.price    || 0,
      setupFee: priceMap[m.key]?.setupFee || 0,
      label:    priceMap[m.key]?.label    || m.label,
    }));
}
```

Confirme: cards de plano exibem preço e setup fee dos módulos → avance.

---

## ETAPA 14 — Frontend Parceiro: Menu "Simular Plano"

Adicione nova aba ao `partner.html`:

```html
<button class="tab-btn" data-tab="tab-simulator" onclick="showTab('tab-simulator')">
  Simular Plano
</button>
<div id="tab-simulator" class="tab-content hidden"></div>
```

Crie `frontend/partner-simulator.js`:

```javascript
async function loadSimulator() {
  const el = document.getElementById('tab-simulator');
  el.innerHTML = spinnerHTML();
  try {
    const [rPlans, rModules, rResources] = await Promise.all([
      apiRequest('GET', '/plans'),
      apiRequest('GET', '/plans/modules/prices'),
      apiRequest('GET', '/resource-prices'),
    ]);
    const globalPlans = (rPlans?.data || []).filter(p => !p.ownerId);
    const modules     = (rModules?.data || []).filter(m => m.isVisible);
    const resources   = (rResources?.data || []).filter(r => r.isVisible);
    renderSimulator(el, globalPlans, modules, resources);
  } catch(e) { showToast(e.message, 'error'); }
}
```

**Interface do simulador:**

```
┌─────────────────────────────────────────────────────────┐
│ SIMULADOR DE PLANOS                                     │
│ Crie propostas com base nos planos globais              │
├─────────────────────────────────────────────────────────┤
│ 1. Escolha um plano base:                               │
│    [○] Starter — R$ 200/mês                            │
│    [●] Pro Plus — R$ 450/mês  ← selecionado            │
│    [○] Enterprise — R$ 900/mês                         │
├─────────────────────────────────────────────────────────┤
│ 2. Adicione módulos extras (preços de catálogo):        │
│    [✓] 💬 WhatsApp Extra   + R$ 50,00/mês              │
│    [○] 🤖 IA               + R$ 80,00/mês              │
│    [○] 📣 Campanhas        + R$ 40,00/mês              │
├─────────────────────────────────────────────────────────┤
│ 3. Adicione recursos extras:                            │
│    WhatsApp Não Oficial: [2] × R$ 30,00 = R$ 60,00     │
│    WhatsApp Oficial:     [0] × R$ 60,00 = R$  0,00     │
├─────────────────────────────────────────────────────────┤
│ RESUMO                                                  │
│ Plano base:     R$ 450,00/mês                           │
│ Módulos extras: R$  50,00/mês                           │
│ Recursos extras:R$  60,00/mês                           │
│ ─────────────────────────────────────────────────────   │
│ TOTAL:          R$ 560,00/mês                           │
│                                                         │
│ Taxa setup (estimada): R$ 0,00                          │
│ Sua comissão (25%):    R$ 140,00/mês                    │
│                                                         │
│ [Salvar como Meu Plano]  (nome: [________________])    │
└─────────────────────────────────────────────────────────┘
```

**Regras do simulador:**
- Parceiro não vê nem edita preços — todos vêm do catálogo
- Parceiro não aplica descontos
- "Salvar como Meu Plano" chama `POST /api/plans` com `ownerId = partnerId` do JWT
- O plano salvo herda o `basePrice` do plano global + soma dos extras **como preço base** (pois parceiro não pode alterar)
- Planos do parceiro aparecem em "Meus Planos" na Tabela de Preços

Adicionar script ao `partner.html`:
```html
<script src="partner-simulator.js"></script>
```

E registrar no showTab.

Confirme: simulador carrega, calcula total em tempo real, salva plano → avance.

---

## ETAPA 15 — Frontend Parceiro: Meu Perfil (atualizado)

Edite a seção de perfil em `frontend/partner.js` (ou `partner-profile.js`).

**Campos editáveis:**
- Telefone
- Email
- Senha (formulário separado: senha atual + nova senha + confirmação)

**Campos somente leitura (exibir mas não editar):**
- Nome completo
- CPF/CNPJ

```javascript
async function salvarPerfil(event) {
  event.preventDefault();
  const body = {
    phone: document.getElementById('profilePhone').value,
    email: document.getElementById('profileEmail').value,
  };
  const res = await apiRequest('PUT', '/partners/me', body);
  if (res?.success) showToast('Perfil atualizado.', 'success');
  else showToast(res?.message || 'Erro ao salvar.', 'error');
}
```

Adicionar endpoint `PUT /api/partners/me` no backend:
- Aceita: `phone`, `email`
- Não aceita: `name`, `document` (ignorar silenciosamente se enviados)
- Atualiza `User.email` se email fornecido e diferente do atual

---

## ETAPA 16 — Deploy

```bash
cd /opt/parceiros
git pull

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend

docker stack deploy -c docker-stack.yml pacoticket
sleep 25
docker stack services pacoticket
```

**Checklist de validação:**

```bash
# Novos endpoints
curl -s http://localhost:3000/api/system-config
curl -s http://localhost:3000/api/commission-tiers
curl -s http://localhost:3000/api/resource-prices

# Novos arquivos no frontend
docker exec $(docker ps -qf "name=pacoticket_frontend") \
  ls /usr/share/nginx/html/partner-simulator.js

# Zero reseller/revendedor
grep -ri "revendedor\|reseller" /opt/parceiros/frontend/*.html /opt/parceiros/frontend/*.js
```

**Validação manual:**

- [ ] Configurar `businessName` no superadmin → reflete no título e no login
- [ ] Configurar logo → header exibe imagem, esconde texto
- [ ] Criar plano com setupFee e sortOrder → persiste
- [ ] Reordenar planos com drag-and-drop → ordem persiste após reload
- [ ] Editar parceiro com permissões → modal de novo cliente reflete
- [ ] Parceiro sem `canSetDueDate` → vencimento = hoje + 2 dias
- [ ] Adicionar add-on ao cliente no superadmin com desconto → aparece no total
- [ ] Parceiro adiciona add-on → sem campo de desconto
- [ ] Tier com `durationMonths = 3` → `ClientCommissionRule.expiresAt` calculado
- [ ] Comissão de cliente com regra expirada → não gerada no cálculo
- [ ] Simulador de planos do parceiro → calcula total, salva como plano próprio
- [ ] Tabela de preços do parceiro filtra global/meus e exibe setup fees