# Feature: Funil CRM, Propostas, Edição de Planos Corrigida, Cor do Botão Sair, PDF Persuasivo

## Pré-requisitos

1. Aplicar ao banco:
   ```bash
   psql -h HOST -U postgres -d pacoticket_parceiros -f schema_update_funnel.sql
   ```
2. Adicionar ao `.env`:
   ```
   PDF_STORAGE_PATH=/data/pdfs
   GOTENBERG_URL=http://gotenberg:3000
   ```
3. Adicionar ao `docker-stack.yml` — volume para os PDFs:
   ```yaml
   # No serviço backend, adicionar em volumes:
   volumes:
     - pdf_data:/data/pdfs
   # No final do arquivo, declarar o volume:
   volumes:
     pdf_data:
       driver: local
   ```
4. Leia: `CLAUDE.md`, `pacoticket-reseller-skill.md`

---

## Regras absolutas

- **Um arquivo por vez** — `str_replace` cirúrgico
- Terminologia: **parceiro** (nunca revendedor/reseller)
- Não altere `login.html` nem arquivos de infraestrutura sem instrução explícita
- Backend é fonte de verdade

---

## FASE 1 — Diagnóstico

```bash
# 1. Confirmar novas tabelas no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('FunnelStage','Lead','LeadActivity','ProposalPdf')
    AND table_schema='public'\`
  .then(r => r.forEach(x => console.log('OK:', x.table_name)))
  .catch(e => console.error(e.message))
  .finally(() => p.\$disconnect());
"

# 2. Ver SystemConfig novas chaves
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findMany({ where: { key: { in: ['colorBtnLogout','pdfStoragePath'] } } })
  .then(r => console.log(JSON.stringify(r)))
  .finally(() => p.\$disconnect());
"

# 3. Ver arquivos JS do parceiro existentes
ls /home/user/parceiros/frontend/partner*.js

# 4. Verificar onde o tab-simulator está registrado
grep -n "simulator\|Simular\|Propostas\|tab-simulator\|tab-proposals" \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/partner.js 2>/dev/null | head -20

# 5. Verificar função _tierAvisoHTML e durationMonths
grep -n "_simTierDuration\|durationMonths\|tier.*duration\|_tierAvisoHTML" \
  /home/user/parceiros/frontend/partner-pricing.js \
  /home/user/parceiros/frontend/partner-simulator.js 2>/dev/null | head -20

# 6. Verificar estrutura atual do botão Sair
grep -n "logout\|Sair\|btn.*logout\|logout.*btn\|colorBtnLogout" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/superadmin-utils.js 2>/dev/null | head -15

# 7. Verificar allowed no system-config
grep -n "colorBtnLogout\|allowed" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js | head -10
```

---

## FASE 2 — Backend: Prisma Schema

Atualize `backend/prisma/schema.prisma` com `str_replace`. Adicione após os models existentes:

```prisma
model FunnelStage {
  id         String   @id @default(uuid())
  partnerId  String
  partner    Partner  @relation("PartnerStages", fields: [partnerId], references: [id], onDelete: Cascade)
  name       String
  color      String   @default("#6B7280")
  order      Int      @default(0)
  isTerminal Boolean  @default(false)
  isDefault  Boolean  @default(false)
  leads      Lead[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Lead {
  id            String         @id @default(uuid())
  partnerId     String
  partner       Partner        @relation("PartnerLeads", fields: [partnerId], references: [id], onDelete: Cascade)
  stageId       String
  stage         FunnelStage    @relation(fields: [stageId], references: [id])
  clientId      String?
  client        Client?        @relation(fields: [clientId], references: [id])
  planId        String?
  plan          Plan?          @relation(fields: [planId], references: [id])
  companyName   String
  contactName   String?
  email         String?
  phone         String?
  notes         String?
  value         Decimal?       @db.Decimal(10, 2)
  probability   Int            @default(50)
  expectedClose DateTime?
  lostReason    String?
  order         Int            @default(0)
  activities    LeadActivity[]
  proposals     ProposalPdf[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model LeadActivity {
  id          String   @id @default(uuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  partnerId   String
  partner     Partner  @relation("PartnerActivities", fields: [partnerId], references: [id])
  type        String
  description String
  metadata    Json?
  createdAt   DateTime @default(now())
}

model ProposalPdf {
  id         String   @id @default(uuid())
  leadId     String
  lead       Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  partnerId  String
  partner    Partner  @relation("PartnerProposals", fields: [partnerId], references: [id])
  planId     String?
  plan       Plan?    @relation(fields: [planId], references: [id])
  fileName   String
  filePath   String
  planName   String
  totalPrice Decimal? @db.Decimal(10, 2)
  setupFee   Decimal? @db.Decimal(10, 2)
  createdAt  DateTime @default(now())
}
```

Adicionar relações inversas em `Partner`:
```prisma
// Dentro do model Partner, adicionar:
funnelStages FunnelStage[] @relation("PartnerStages")
leads        Lead[]        @relation("PartnerLeads")
leadActivities LeadActivity[] @relation("PartnerActivities")
proposals    ProposalPdf[] @relation("PartnerProposals")
```

```bash
cd /home/user/parceiros/backend && npx prisma generate
```

Confirme sem erros → avance.

---

## FASE 3 — Backend: Rotas do Funil

Crie `backend/src/routes/funnel.routes.js`:

```javascript
const router  = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');
const prisma  = new PrismaClient();

// ── Helpers ─────────────────────────────────────────────────

function partnerId(req) { return req.user.partnerId; }

// ── Estágios ─────────────────────────────────────────────────

// GET /api/funnel/stages
router.get('/stages', requireAuth, async (req, res) => {
  try {
    const stages = await prisma.funnelStage.findMany({
      where:   { partnerId: partnerId(req) },
      orderBy: { order: 'asc' },
      include: { _count: { select: { leads: true } } },
    });
    // Se parceiro não tem estágios, criar os padrão
    if (stages.length === 0) {
      const defaults = [
        { name: 'Lead',              color: '#818CF8', order: 0, isDefault: true  },
        { name: 'Contato Realizado', color: '#F59E0B', order: 1 },
        { name: 'Proposta Enviada',  color: '#1B3FC4', order: 2 },
        { name: 'Negociação',        color: '#F59E0B', order: 3 },
        { name: 'Cliente',           color: '#10B981', order: 4, isTerminal: true },
        { name: 'Cancelado',         color: '#EF4444', order: 5, isTerminal: true },
      ];
      const created = await prisma.funnelStage.createMany({
        data: defaults.map(d => ({ ...d, partnerId: partnerId(req) })),
      });
      const newStages = await prisma.funnelStage.findMany({
        where: { partnerId: partnerId(req) }, orderBy: { order: 'asc' },
        include: { _count: { select: { leads: true } } },
      });
      return res.json({ success: true, data: newStages });
    }
    res.json({ success: true, data: stages });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// POST /api/funnel/stages
router.post('/stages', requireAuth, async (req, res) => {
  try {
    const { name, color, order, isTerminal } = req.body;
    const stage = await prisma.funnelStage.create({
      data: { name, color: color||'#6B7280', order: order||0, isTerminal: isTerminal||false, partnerId: partnerId(req) },
    });
    res.json({ success: true, data: stage });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// PUT /api/funnel/stages/:id
router.put('/stages/:id', requireAuth, async (req, res) => {
  try {
    const stage = await prisma.funnelStage.findFirst({ where: { id: req.params.id, partnerId: partnerId(req) } });
    if (!stage) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const updated = await prisma.funnelStage.update({
      where: { id: req.params.id },
      data:  { name: req.body.name, color: req.body.color, order: req.body.order },
    });
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// DELETE /api/funnel/stages/:id
router.delete('/stages/:id', requireAuth, async (req, res) => {
  try {
    const count = await prisma.lead.count({ where: { stageId: req.params.id } });
    if (count > 0) return res.status(400).json({ success: false, error: 'HAS_LEADS', message: `Este estágio tem ${count} lead(s). Mova-os antes de excluir.` });
    await prisma.funnelStage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// ── Leads ────────────────────────────────────────────────────

// GET /api/funnel/leads
router.get('/leads', requireAuth, async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where:   { partnerId: partnerId(req) },
      include: { stage: true, plan: { select: { id:1, name:1, basePrice:1 } }, proposals: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ stageId: 'asc' }, { order: 'asc' }],
    });
    res.json({ success: true, data: leads });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// POST /api/funnel/leads
router.post('/leads', requireAuth, async (req, res) => {
  try {
    const { stageId, companyName, contactName, email, phone, notes, value, probability, expectedClose, planId } = req.body;
    if (!companyName) return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyName é obrigatório.' });
    // Validar que o estágio pertence ao parceiro
    const stage = await prisma.funnelStage.findFirst({ where: { id: stageId, partnerId: partnerId(req) } });
    if (!stage) return res.status(404).json({ success: false, error: 'STAGE_NOT_FOUND' });
    const lead = await prisma.lead.create({
      data: { partnerId: partnerId(req), stageId, companyName, contactName, email, phone, notes, value: value||null, probability: probability||50, expectedClose: expectedClose||null, planId: planId||null },
      include: { stage: true },
    });
    // Registrar atividade
    await prisma.leadActivity.create({ data: { leadId: lead.id, partnerId: partnerId(req), type: 'NOTE', description: `Lead criado: ${companyName}` } });
    res.json({ success: true, data: lead });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// PUT /api/funnel/leads/:id
router.put('/leads/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, partnerId: partnerId(req) } });
    if (!existing) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const { stageId, companyName, contactName, email, phone, notes, value, probability, expectedClose, planId, lostReason } = req.body;
    // Registrar mudança de estágio
    if (stageId && stageId !== existing.stageId) {
      const [from, to] = await Promise.all([
        prisma.funnelStage.findUnique({ where: { id: existing.stageId } }),
        prisma.funnelStage.findUnique({ where: { id: stageId } }),
      ]);
      await prisma.leadActivity.create({
        data: { leadId: req.params.id, partnerId: partnerId(req), type: 'STAGE_CHANGE',
                description: `Movido de "${from?.name}" para "${to?.name}"`,
                metadata: { fromStage: from?.name, toStage: to?.name } },
      });
    }
    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: { stageId, companyName, contactName, email, phone, notes, value: value||null, probability, expectedClose: expectedClose||null, planId: planId||null, lostReason: lostReason||null },
      include: { stage: true },
    });
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// DELETE /api/funnel/leads/:id
router.delete('/leads/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, partnerId: partnerId(req) } });
    if (!existing) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// GET /api/funnel/leads/:id/activities
router.get('/leads/:id/activities', requireAuth, async (req, res) => {
  try {
    const activities = await prisma.leadActivity.findMany({
      where: { leadId: req.params.id, partnerId: partnerId(req) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: activities });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

// POST /api/funnel/leads/:id/notes
router.post('/leads/:id/notes', requireAuth, async (req, res) => {
  try {
    const { note } = req.body;
    const activity = await prisma.leadActivity.create({
      data: { leadId: req.params.id, partnerId: partnerId(req), type: 'NOTE', description: note },
    });
    res.json({ success: true, data: activity });
  } catch (e) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message }); }
});

module.exports = router;
```

Registrar em `server.js`:
```javascript
app.use('/api/funnel', require('./routes/funnel.routes'));
```

---

## FASE 4 — Backend: PDF com armazenamento em disco

Atualize `backend/src/routes/pdf.routes.js`:

```javascript
const router  = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth }  = require('../middleware/auth');
const configSvc = require('../services/system-config.service');
const prisma    = new PrismaClient();
const fs        = require('fs');
const path      = require('path');

router.post('/plan', requireAuth, async (req, res) => {
  try {
    const cfg          = await configSvc.getAll();
    const gotenbergUrl = process.env.GOTENBERG_URL || 'http://gotenberg:3000';
    const storageBase  = process.env.PDF_STORAGE_PATH || cfg.pdfStoragePath || '/data/pdfs';
    const { html, leadId, planName, totalPrice, setupFee, planId } = req.body;

    if (!html) return res.status(400).json({ success: false, error: 'HTML_REQUIRED' });

    // Chamar Gotenberg
    const { FormData, Blob } = await import('node-fetch').catch(() => require('node-fetch'));
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.4'); form.append('marginBottom', '0.4');
    form.append('marginLeft', '0.4'); form.append('marginRight', '0.4');

    const gRes = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, { method: 'POST', body: form });
    if (!gRes.ok) throw new Error(`Gotenberg: ${await gRes.text()}`);

    const pdfBuffer = Buffer.from(await gRes.arrayBuffer());

    // Salvar em disco se leadId fornecido
    let savedPath = null;
    let savedFileName = null;
    if (leadId) {
      // Validar que o lead pertence ao parceiro
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, partnerId: req.user.partnerId }
      });
      if (!lead) return res.status(403).json({ success: false, error: 'FORBIDDEN' });

      // Criar pasta do parceiro
      const partnerDir = path.join(storageBase, req.user.partnerId);
      fs.mkdirSync(partnerDir, { recursive: true });

      // Nome do arquivo
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeName = (planName || 'proposta').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      savedFileName = `${safeName}_${ts}.pdf`;
      savedPath     = path.join(partnerDir, savedFileName);

      fs.writeFileSync(savedPath, pdfBuffer);

      // Registrar no banco
      await prisma.proposalPdf.create({
        data: {
          leadId,
          partnerId:  req.user.partnerId,
          planId:     planId || null,
          fileName:   savedFileName,
          filePath:   savedPath,
          planName:   planName || 'Proposta',
          totalPrice: totalPrice ? Number(totalPrice) : null,
          setupFee:   setupFee  ? Number(setupFee)    : null,
        },
      });

      // Registrar atividade no lead
      await prisma.leadActivity.create({
        data: {
          leadId,
          partnerId:   req.user.partnerId,
          type:        'PDF_GENERATED',
          description: `Proposta gerada: ${planName || 'Proposta'}`,
          metadata:    { fileName: savedFileName, totalPrice, setupFee },
        },
      });
    }

    // Retornar PDF para download
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${savedFileName || 'proposta.pdf'}"`);
    if (savedPath) res.set('X-Saved-Path', savedFileName);
    res.send(pdfBuffer);

  } catch (e) {
    console.error('PDF error:', e);
    res.status(500).json({ success: false, error: 'PDF_ERROR', message: e.message });
  }
});

module.exports = router;
```

---

## FASE 5 — Backend: `colorBtnLogout` e `logoPdf` no system-config

Use `str_replace` para adicionar ao array `allowed`:

```javascript
const allowed = [
  'businessName', 'logoLogin', 'logoInternal', 'logoPdf', 'favicon', 'apiBaseUrl', 'logoLoginWidth',
  'colorBtnLogout',  // ← novo
  // ...cores existentes...
];
```

---

## FASE 6 — Frontend SuperAdmin: Cor do botão Sair

### 6.1 — Adicionar campo em `superadmin-config.js`

Na seção de configurações do sistema, após o campo `logoLoginWidth`, adicionar:

```javascript
`<div>
  <label class="block text-sm font-medium text-gray-700 mb-1">Cor do Botão "Sair"</label>
  <div class="flex items-center gap-2">
    <input type="color" id="cfgBtnLogout"
      class="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
      oninput="document.getElementById('cfgBtnLogoutHex').value=this.value; previewBtnLogout(this.value)">
    <input type="text" id="cfgBtnLogoutHex" maxlength="7" placeholder="#FFFFFF"
      class="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
      oninput="if(/^#[0-9A-Fa-f]{6}$/.test(this.value)){document.getElementById('cfgBtnLogout').value=this.value;previewBtnLogout(this.value)}">
    <div id="btnLogoutPreview"
      class="px-3 py-1.5 rounded-lg text-white text-sm font-medium select-none"
      style="background:#FFFFFF29">Sair</div>
  </div>
</div>`
```

### 6.2 — Preencher ao carregar e salvar

```javascript
// Em loadConfig():
const btnLogoutEl    = document.getElementById('cfgBtnLogout');
const btnLogoutHexEl = document.getElementById('cfgBtnLogoutHex');
const val = config.colorBtnLogout || '#FFFFFF29';
if (btnLogoutEl)    btnLogoutEl.value    = val.length === 7 ? val : '#ffffff';
if (btnLogoutHexEl) btnLogoutHexEl.value = val;
previewBtnLogout(val);

// Em salvarConfig():
body.colorBtnLogout = document.getElementById('cfgBtnLogoutHex')?.value || '#FFFFFF29';

// Função de preview:
function previewBtnLogout(val) {
  const el = document.getElementById('btnLogoutPreview');
  if (el) el.style.background = val;
}
```

### 6.3 — Aplicar a cor do botão Sair no `applyBranding()`/`applyTheme()`

Em `superadmin-utils.js`, dentro da função `applyBranding` (após aplicar o tema):

```javascript
// Aplicar cor do botão Sair
const logoutBtns = document.querySelectorAll('[data-logout-btn], button[onclick*="logout"]');
const btnColor   = cfg.colorBtnLogout || '#FFFFFF29';
logoutBtns.forEach(btn => btn.style.background = btnColor);
```

Adicionar `data-logout-btn` ao botão Sair em `superadmin.html` e `partner.html`:
```html
<button data-logout-btn onclick="logout()" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white">
  Sair
</button>
```

---

## FASE 7 — Frontend Parceiro: Renomear "Simulador" → "Propostas"

### 7.1 — `partner.html`

```bash
grep -n "Simular\|simulator\|Simulador\|tab-simulator" /home/user/parceiros/frontend/partner.html
```

Use `str_replace` para cada ocorrência:
- Texto do botão de aba: `Simulador` → `Propostas`
- `data-tab="tab-simulator"` → `data-tab="tab-proposals"`
- `id="tab-simulator"` → `id="tab-proposals"`

### 7.2 — `partner.js` / utils do parceiro

```bash
grep -n "tab-simulator\|loadSimulator\|simulator" \
  /home/user/parceiros/frontend/partner.js \
  /home/user/parceiros/frontend/partner-utils.js 2>/dev/null | head -10
```

Atualizar todas as referências `tab-simulator` → `tab-proposals` e `loadSimulator` nos loaders do `showTab`.

### 7.3 — `partner-simulator.js` — título interno

```bash
grep -n "Simulador de Planos\|Gerador de Proposta" \
  /home/user/parceiros/frontend/partner-simulator.js | head -5
```

Usar `str_replace`:
```javascript
// ANTES:
'Simulador de Planos'

// DEPOIS:
'Gerador de Propostas e Criador de Planos'
```

---

## FASE 8 — Frontend Parceiro: Novo menu "Funil"

Crie `/home/user/parceiros/frontend/partner-funnel.js`.

### 8.1 — Adicionar aba no `partner.html`

Inserir botão de aba **antes** de "Tabela de Preços":
```html
<button class="tab-btn px-4 py-4 text-sm font-medium" data-tab="tab-funnel" onclick="showTab('tab-funnel')">
  Funil
</button>
<div id="tab-funnel" class="tab-content hidden"></div>
```

Adicionar script:
```html
<script src="partner-funnel.js"></script>
```

Registrar no loader do `showTab`:
```javascript
'tab-funnel': () => typeof loadFunnel === 'function' && loadFunnel(),
```

### 8.2 — Conteúdo de `partner-funnel.js`

```javascript
// ============================================================
// partner-funnel.js — Funil CRM (Kanban)
// ============================================================

let _funnelStages = [];
let _funnelLeads  = [];
let _funnelPlans  = [];
let _dragLeadId   = null;

async function loadFunnel() {
  const el = document.getElementById('tab-funnel');
  if (!el) return;
  el.innerHTML = spinnerHTML();
  try {
    const [rStages, rLeads, rPlans] = await Promise.all([
      apiRequest('GET', '/funnel/stages'),
      apiRequest('GET', '/funnel/leads'),
      apiRequest('GET', '/plans'),
    ]);
    _funnelStages = rStages?.data || [];
    _funnelLeads  = rLeads?.data  || [];
    _funnelPlans  = (rPlans?.data || []).filter(p => p.isActive !== false);
    renderKanban(el);
  } catch(e) { showToast(e.message, 'error'); }
}

function renderKanban(el) {
  el.innerHTML = `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-gray-800">Funil de Vendas</h2>
          <p class="text-sm text-gray-500 mt-0.5">${_funnelLeads.length} lead(s) em andamento</p>
        </div>
        <div class="flex gap-2">
          <button onclick="abrirModalLead()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
            + Novo Lead
          </button>
          <button onclick="abrirConfigEstagios()"
            class="px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm rounded-lg transition-colors">
            ⚙️ Estágios
          </button>
        </div>
      </div>

      <!-- Kanban board -->
      <div class="flex gap-4 overflow-x-auto pb-4" id="kanbanBoard" style="min-height:500px">
        ${_funnelStages.map(stage => renderKanbanColumn(stage)).join('')}
      </div>
    </div>`;

  // Inicializar drag-and-drop
  initDragDrop();
}

function renderKanbanColumn(stage) {
  const leads = _funnelLeads.filter(l => l.stageId === stage.id);
  const borderTop = `border-t-4`;
  return `
    <div class="kanban-col flex-shrink-0 w-72 bg-gray-50 rounded-xl flex flex-col"
         style="border-top: 4px solid ${stage.color};"
         data-stage-id="${stage.id}">

      <!-- Column header -->
      <div class="px-3 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${stage.color}"></span>
          <span class="font-semibold text-sm text-gray-800">${stage.name}</span>
          <span class="bg-gray-200 text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded-full">${leads.length}</span>
        </div>
        <button onclick="abrirModalLead(null, '${stage.id}')"
          class="w-6 h-6 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded flex items-center justify-center text-lg leading-none transition-colors">+</button>
      </div>

      <!-- Cards -->
      <div class="kanban-cards flex-1 px-2 pb-2 space-y-2 min-h-32"
           data-stage-id="${stage.id}"
           ondragover="event.preventDefault()"
           ondrop="dropLead(event, '${stage.id}')">
        ${leads.map(lead => renderLeadCard(lead)).join('')}
      </div>
    </div>`;
}

function renderLeadCard(lead) {
  const hasProposal = lead.proposals && lead.proposals.length > 0;
  return `
    <div class="lead-card bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md
                cursor-grab active:cursor-grabbing transition-shadow"
         draggable="true"
         data-lead-id="${lead.id}"
         ondragstart="dragStart(event, '${lead.id}')"
         onclick="abrirDetalheLead('${lead.id}')">

      <!-- Empresa -->
      <p class="font-semibold text-sm text-gray-900 leading-tight">${lead.companyName}</p>
      ${lead.contactName ? `<p class="text-xs text-gray-500 mt-0.5">${lead.contactName}</p>` : ''}

      <!-- Plano -->
      ${lead.plan ? `
      <div class="mt-2 bg-blue-50 rounded-lg px-2 py-1">
        <p class="text-xs text-blue-700 font-medium truncate">${lead.plan.name}</p>
        <p class="text-xs text-blue-500">${formatCurrency(lead.plan.basePrice)}/mês</p>
      </div>` : ''}

      <!-- Footer do card -->
      <div class="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
        <div class="flex gap-1">
          ${lead.email ? `<span class="text-gray-300 text-xs">✉</span>` : ''}
          ${lead.phone ? `<span class="text-gray-300 text-xs">📞</span>` : ''}
          ${hasProposal ? `<span class="text-blue-400 text-xs" title="Proposta gerada">📄</span>` : ''}
        </div>
        ${lead.value ? `<span class="text-xs font-semibold text-green-600">${formatCurrency(lead.value)}</span>` : ''}
      </div>
    </div>`;
}

// ── Drag & Drop ──────────────────────────────────────────────

function initDragDrop() {
  // Já configurado via atributos inline
}

function dragStart(event, leadId) {
  _dragLeadId = leadId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
  event.target.addEventListener('dragend', () => { event.target.style.opacity = '1'; }, { once: true });
}

async function dropLead(event, newStageId) {
  event.preventDefault();
  if (!_dragLeadId) return;
  const lead = _funnelLeads.find(l => l.id === _dragLeadId);
  if (!lead || lead.stageId === newStageId) { _dragLeadId = null; return; }
  try {
    const res = await apiRequest('PUT', `/funnel/leads/${_dragLeadId}`, { stageId: newStageId });
    if (!res?.success) throw new Error(res?.message);
    _funnelLeads = _funnelLeads.map(l => l.id === _dragLeadId ? { ...l, stageId: newStageId, stage: _funnelStages.find(s => s.id === newStageId) } : l);
    renderKanban(document.getElementById('tab-funnel'));
  } catch(e) { showToast(e.message, 'error'); }
  _dragLeadId = null;
}

// ── Modal de Lead ────────────────────────────────────────────

function abrirModalLead(lead = null, defaultStageId = null) {
  let modal = document.getElementById('modalLead');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalLead';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 py-6';
    document.body.appendChild(modal);
  }

  const stageOpts = _funnelStages.map(s =>
    `<option value="${s.id}" ${(lead?.stageId||defaultStageId||_funnelStages[0]?.id) === s.id ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  const planOpts = `<option value="">Nenhum</option>` + _funnelPlans.map(p =>
    `<option value="${p.id}" ${lead?.planId === p.id ? 'selected' : ''}>${p.name} — ${formatCurrency(p.basePrice)}/mês</option>`
  ).join('');

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
      <div class="px-6 pt-5 pb-4 border-b flex justify-between items-center">
        <h3 class="text-lg font-bold text-gray-800">${lead ? 'Editar Lead' : 'Novo Lead'}</h3>
        <button onclick="document.getElementById('modalLead').classList.add('hidden')"
          class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-700 mb-1">Empresa *</label>
            <input type="text" id="leadCompany" value="${lead?.companyName||''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Contato</label>
            <input type="text" id="leadContact" value="${lead?.contactName||''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
            <input type="text" id="leadPhone" value="${lead?.phone||''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
            <input type="email" id="leadEmail" value="${lead?.email||''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Estágio</label>
            <select id="leadStage" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              ${stageOpts}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Plano de interesse</label>
            <select id="leadPlan" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              ${planOpts}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Valor estimado (R$)</label>
            <input type="number" id="leadValue" step="0.01" value="${lead?.value||''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Fechamento previsto</label>
            <input type="date" id="leadClose" value="${lead?.expectedClose ? lead.expectedClose.slice(0,10) : ''}"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-700 mb-1">Notas</label>
            <textarea id="leadNotes" rows="2"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none">${lead?.notes||''}</textarea>
          </div>
        </div>
      </div>
      <div class="px-6 pb-5 flex justify-between items-center">
        ${lead ? `<button onclick="excluirLead('${lead.id}')"
          class="text-xs text-red-500 hover:text-red-700">Excluir lead</button>` : '<div></div>'}
        <div class="flex gap-2">
          <button onclick="document.getElementById('modalLead').classList.add('hidden')"
            class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onclick="salvarLead('${lead?.id||''}')"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
            ${lead ? 'Salvar' : 'Criar Lead'}
          </button>
        </div>
      </div>
    </div>`;

  modal.classList.remove('hidden');
  document.getElementById('leadCompany').focus();
}

async function salvarLead(id) {
  const company = document.getElementById('leadCompany')?.value?.trim();
  if (!company) { showToast('Informe o nome da empresa.', 'warning'); return; }
  const body = {
    companyName:   company,
    contactName:   document.getElementById('leadContact')?.value?.trim() || null,
    phone:         document.getElementById('leadPhone')?.value?.trim()   || null,
    email:         document.getElementById('leadEmail')?.value?.trim()   || null,
    stageId:       document.getElementById('leadStage')?.value,
    planId:        document.getElementById('leadPlan')?.value             || null,
    value:         parseFloat(document.getElementById('leadValue')?.value) || null,
    expectedClose: document.getElementById('leadClose')?.value            || null,
    notes:         document.getElementById('leadNotes')?.value?.trim()   || null,
  };
  try {
    const res = id
      ? await apiRequest('PUT',  `/funnel/leads/${id}`, body)
      : await apiRequest('POST', '/funnel/leads',       body);
    if (!res?.success) throw new Error(res?.message || 'Erro ao salvar.');
    showToast(id ? 'Lead atualizado.' : 'Lead criado!', 'success');
    document.getElementById('modalLead').classList.add('hidden');
    loadFunnel();
  } catch(e) { showToast(e.message, 'error'); }
}

async function excluirLead(id) {
  if (!confirm('Excluir este lead? O histórico será apagado.')) return;
  const res = await apiRequest('DELETE', `/funnel/leads/${id}`);
  if (res?.success) {
    showToast('Lead excluído.', 'success');
    document.getElementById('modalLead').classList.add('hidden');
    loadFunnel();
  } else showToast(res?.message, 'error');
}

async function abrirDetalheLead(id) {
  const lead = _funnelLeads.find(l => l.id === id);
  if (!lead) return;
  // Abrir modal de edição com histórico
  abrirModalLead(lead);
}

function abrirConfigEstagios() {
  showToast('Configuração de estágios: em breve.', 'warning');
}
```

---

## FASE 9 — Frontend Parceiro: Modal "Gerar PDF e Salvar" com seleção de Lead

No `partner-simulator.js`, substitua o bloco do seletor de PDF e botão de salvar.

### 9.1 — Remover checkbox e substituir por botão duplo

Localize o bloco do botão de salvar no `simResumo` e substitua com `str_replace`:

```javascript
// Substituir o bloco de checkbox + botão por:
`<!-- Seleção de Lead -->
<div class="mb-3">
  <label class="text-sm text-blue-200 block mb-1">Associar ao Lead (obrigatório para PDF)</label>
  <select id="simLeadSelect"
    class="w-full px-3 py-2 rounded-lg bg-white/10 border border-blue-600 text-white text-sm
           focus:outline-none focus:ring-2 focus:ring-blue-400">
    <option value="">Nenhum — salvar plano sem PDF</option>
  </select>
  <p class="text-xs text-blue-300 mt-1">Ou crie um novo:</p>
  <button onclick="simCriarLeadRapido()"
    class="w-full mt-1 py-1.5 border border-blue-600 text-blue-200 text-xs font-medium rounded-lg hover:bg-blue-800/50 transition-colors">
    + Criar Lead Rapidamente
  </button>
</div>

<!-- Botões -->
<div class="flex flex-col gap-2">
  <button onclick="simSalvarPlano(false)"
    class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm">
    💾 Salvar Plano
  </button>
  <button onclick="simSalvarPlano(true)"
    class="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
    <span>📄</span>
    <span>Gerar PDF da Proposta e Salvar</span>
  </button>
</div>
<p class="text-xs text-blue-300 text-center mt-1">
  O PDF fica salvo no servidor e disponível no histórico do lead.
</p>`
```

### 9.2 — Carregar leads no select ao abrir o simulador

Em `loadSimulator()`, após carregar os dados do dashboard:

```javascript
// Carregar leads para o select do simulador
async function loadSimLeads() {
  try {
    const res = await apiRequest('GET', '/funnel/leads');
    const leads = (res?.data || [])
      .filter(l => !l.stage?.isTerminal)
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
    const sel = document.getElementById('simLeadSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = `<option value="">Nenhum — salvar plano sem PDF</option>` +
      leads.map(l => `<option value="${l.id}" ${l.id === current ? 'selected' : ''}>${l.companyName}${l.contactName ? ` — ${l.contactName}` : ''}</option>`).join('');
  } catch { /* silencioso */ }
}
```

Chamar após `renderSimulator(el)`:
```javascript
renderSimulator(el);
setTimeout(loadSimLeads, 100); // após render do DOM
```

### 9.3 — Função de criar Lead rapidamente

```javascript
async function simCriarLeadRapido() {
  const company = prompt('Nome da empresa do lead:');
  if (!company?.trim()) return;
  // Buscar estágio padrão (Lead)
  const rStages = await apiRequest('GET', '/funnel/stages');
  const defaultStage = (rStages?.data || []).find(s => s.isDefault) || rStages?.data?.[0];
  if (!defaultStage) { showToast('Configure os estágios do funil primeiro.', 'warning'); return; }
  const res = await apiRequest('POST', '/funnel/leads', {
    companyName: company.trim(),
    stageId:     defaultStage.id,
  });
  if (!res?.success) { showToast(res?.message || 'Erro ao criar lead.', 'error'); return; }
  showToast(`Lead "${company}" criado.`, 'success');
  await loadSimLeads();
  // Selecionar o lead recém-criado
  const sel = document.getElementById('simLeadSelect');
  if (sel) sel.value = res.data.id;
}
```

### 9.4 — Atualizar `simSalvarPlano(exportPdf)` para exigir lead quando PDF

Localize a função `simSalvarPlano` e use `str_replace` para:

1. Receber o parâmetro `exportPdf`
2. Validar que lead está selecionado quando `exportPdf = true`
3. Passar `leadId` ao salvar

```javascript
async function simSalvarPlano(exportPdf = false) {
  const nome   = document.getElementById('simNomePlano')?.value?.trim();
  if (!nome) { showToast('Digite um nome para o plano.', 'warning'); return; }

  const leadId = document.getElementById('simLeadSelect')?.value || null;
  if (exportPdf && !leadId) {
    showToast('Selecione ou crie um Lead para gerar o PDF.', 'warning');
    return;
  }

  // ... resto do código existente para calcular totais e salvar o plano ...
  // Após salvar o plano com sucesso:

  if (exportPdf && leadId) {
    await simExportarProposta({
      nomePlano, planBase: plano, baseTotal, modulesTotal, resourcesTotal,
      setupTotal, modulesInfo, resourcesInfo,
      leadId,          // ← passar leadId para salvar o PDF no servidor
      planId:          res?.data?.id,
      logoPdf, businessName, brandColor,
    });
  }
}
```

---

## FASE 10 — Fix: `_tierAvisoHTML` — duração correta do tier

O problema atual é que `_partnerTier.durationMonths` pode não estar chegando do backend.

### 10.1 — Verificar o que o dashboard retorna

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/partners/me/dashboard \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(json.dumps(d.get('tier',{}), indent=2))"
```

### 10.2 — Se `durationMonths` não estiver no response do dashboard

Localize o controller/route do dashboard do parceiro e adicione o campo:

```bash
grep -n "dashboard\|tierData\|tier.*percentage\|durationMonths" \
  /home/user/parceiros/backend/src/routes/partners.routes.js | head -20
```

Use `str_replace` para garantir que `durationMonths` é incluído:

```javascript
// No objeto tier do response do dashboard:
tier: {
  tier:             tierData.tier || tierData.order || 1,
  name:             tierData.name,
  percentage:       Number(tierData.percentage),
  supportMode:      tierData.supportMode,
  durationMonths:   tierData.durationMonths ?? 0,   // ← garantir este campo
  commissionOnSetup: tierData.commissionOnSetup || false,
  setupCommissionPct: Number(tierData.setupCommissionPct || 0),
  acceptNewClients:  tierData.acceptNewClients ?? true,
},
```

### 10.3 — Corrigir `_tierAvisoHTML` para usar o valor real

Já corrigido na Fase 3 do prompt anterior. Confirmar que está usando `tier.durationMonths` (não um valor hardcoded).

### 10.4 — Mesmo fix para `_simTierDuration` no simulador

Confirmar que está sendo atribuído corretamente:
```javascript
_simTierDuration = rDash?.data?.tier?.durationMonths ?? 0;
```

---

## FASE 11 — Fix: Edição de plano — preço mensal não editável

No `partner-pricing.js`, no modal `editarPlanoProprioModal`:

### 11.1 — Tornar preço mensal não editável visualmente

O campo de "Total Mensal" no resumo deve ser `readonly` com visual de campo desabilitado:

```javascript
// No resumo do modal, substituir o total por um elemento somente leitura:
`<div class="border-t border-gray-700 mt-3 pt-3 flex justify-between items-baseline">
  <span class="font-semibold text-sm text-gray-300">Total Mensal</span>
  <div class="text-right">
    <span class="text-xl font-bold text-green-400" id="editTotalVal">${formatCurrency(totalPrice)}</span>
    <p class="text-xs text-gray-500 mt-0.5">calculado automaticamente</p>
  </div>
</div>`
```

### 11.2 — Itens da base não podem ser removidos (módulos/infra)

Na renderização dos módulos extras, verificar que módulos que fazem parte da base não aparecem como desmarcáveis:

```javascript
// Módulos que pertencem à base NÃO aparecem na seção de extras para desmarcar.
// A seção de extras mostra apenas módulos que NÃO estão na base.
const modulosNaoNaBase = modules.filter(m =>
  !baseModuleKeys.has(m.moduleKey) &&
  m.isVisible !== false
);

// Se não há módulos extras disponíveis:
if (modulosNaoNaBase.length === 0) {
  return `<p class="text-xs text-gray-400 italic">Todos os módulos disponíveis já estão incluídos no plano base.</p>`;
}
```

### 11.3 — Setup base sempre mostrado como não editável com campo de acréscimo separado

```javascript
// Na seção de setup do modal:
`<div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
  <p class="text-sm font-semibold text-amber-800 mb-3">Taxa de Setup</p>

  <!-- Setup base: somente leitura -->
  <div class="flex justify-between items-center mb-3">
    <span class="text-xs text-amber-700">Setup do plano base (fixo, não editável)</span>
    <span class="text-sm font-bold text-amber-800">${formatCurrency(baseSetupFee)}</span>
  </div>

  <!-- Acréscimo de setup: editável -->
  <div>
    <label class="text-xs text-amber-700 font-medium block mb-1">
      Seu acréscimo de setup (base da sua comissão de ativação)
    </label>
    <div class="flex items-center gap-2">
      <span class="text-sm text-amber-700">R$</span>
      <input type="number" id="editSetupExtra" step="0.01" min="0"
        value="${_editExtras.setupExtra.toFixed(2)}"
        class="w-32 px-3 py-1.5 border border-amber-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
        oninput="_editExtras.setupExtra = Math.max(0, parseFloat(this.value)||0); renderEditTotal()">
      <span class="text-xs text-amber-600">acréscimo</span>
    </div>
  </div>

  <!-- Total de setup -->
  <div class="mt-2 pt-2 border-t border-amber-200 flex justify-between items-center">
    <span class="text-xs text-amber-700">Total de setup cobrado do cliente</span>
    <span class="text-sm font-bold text-amber-800" id="editSetupTotal">
      ${formatCurrency(baseSetupFee + _editExtras.setupExtra)}
    </span>
  </div>
  <p class="text-xs text-amber-600 mt-1" id="editSetupCommNote">
    ${_editExtras.setupExtra > 0
      ? '✓ Seu acréscimo gera comissão de ativação para você.'
      : 'Adicione um acréscimo para receber comissão de ativação.'}
  </p>
</div>`
```

---

## FASE 12 — PDF Persuasivo (`gerarHtmlProposta`)

Use `str_replace` para substituir a função `gerarHtmlProposta` pela versão persuasiva. O arquivo `proposta-texto-persuasivo.md` contém todos os textos — incorpore-os na função.

Pontos críticos da nova versão:
1. **Seção "O problema"** — texto emocional antes de qualquer feature
2. **Descrição de impacto por recurso** — não só o nome, mas uma linha de benefício
3. **Âncora de valor** — texto antes do preço comparando com custo de equipe
4. **"Por que agir agora"** — urgência sem pressão
5. **Setup como "Taxa de Ativação"** — nunca mencionar "acréscimo" ou dados internos
6. **Cores da marca** via `brandColor` do SystemConfig

A estrutura completa do HTML persuasivo está no arquivo `proposta-texto-persuasivo.md` entregue junto a este prompt.

---

## FASE 13 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: funnel CRM, proposals rename, plan editor fix, persuasive PDF, logout color"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 25

# Criar pasta de PDFs no volume
docker exec $(docker ps -qf "name=pacoticket_backend") mkdir -p /data/pdfs
docker stack services pacoticket
```

---

## Checklist final

**SuperAdmin:**
- [ ] Campo cor do botão Sair em Configurações
- [ ] Botão Sair aplica a cor em tempo real (preview)
- [ ] `PUT /api/system-config` aceita `colorBtnLogout`

**Parceiro — Funil:**
- [ ] Menu "Funil" aparece no nav
- [ ] Kanban renderiza colunas com cores dos estágios
- [ ] Drag-and-drop entre colunas move o lead e registra atividade
- [ ] Modal de criação/edição de lead completo
- [ ] Estágios padrão criados automaticamente no primeiro acesso

**Parceiro — Propostas:**
- [ ] Aba renomeada de "Simulador" → "Propostas"
- [ ] Título interno: "Gerador de Propostas e Criador de Planos"
- [ ] Botão "Gerar PDF da Proposta e Salvar" (não mais checkbox)
- [ ] Seletor de lead obrigatório ao gerar PDF
- [ ] Botão "+ Criar Lead Rapidamente" funcional
- [ ] PDF salvo em `/data/pdfs/{partnerId}/` no servidor
- [ ] PDF registrado em `ProposalPdf` e atividade em `LeadActivity`

**Parceiro — Tabela de Preços:**
- [ ] Modal de edição: setup base não editável + campo de acréscimo separado
- [ ] Preço mensal calculado automaticamente (não editável)
- [ ] Módulos da base não aparecem na seção de extras
- [ ] `_tierAvisoHTML` mostra duração real do tier (do banco, não hardcoded)

**PDF gerado:**
- [ ] Seção "O problema" com texto persuasivo
- [ ] Descrição de impacto por recurso/módulo
- [ ] Âncora de valor antes do preço
- [ ] "Por que agir agora" como CTA
- [ ] Zero menções a comissão, tier, acréscimo ou dados internos