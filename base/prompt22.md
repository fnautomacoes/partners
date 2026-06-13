# Fix Cirúrgico — Separar Setup Base e Acréscimo (Propostas + Tabela de Preços)

## Contexto

A tabela `ProposalPdf` já tem as colunas `setupFeeBase` e `setupFeeExtra` (adicionadas no `schema_update_proposals_v1.sql`). O problema é que:

1. **Propostas:** ao salvar, os valores de `setupFeeBase` e `setupFeeExtra` não estão sendo calculados e persistidos corretamente — ou o campo `setupFeeExtra` do parceiro não está sendo capturado do DOM antes de chamar o backend
2. **Tabela de Preços:** os cards de plano mostram apenas `setupFee` como um valor único, sem separar o que é taxa base e o que é acréscimo do parceiro

---

## FASE 1 — Diagnóstico

```bash
# 1. Confirmar colunas no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'ProposalPdf' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name, ':', c.data_type)))
  .finally(() => p.\$disconnect());
"

# 2. Ver o Prisma schema — ProposalPdf
grep -n -A 15 "model ProposalPdf" /home/user/parceiros/backend/prisma/schema.prisma

# 3. Ver onde setupFeeBase/setupFeeExtra são passados ao backend
grep -n "setupFee\|setupExtra\|setupBase\|setup_fee" \
  /home/user/parceiros/frontend/partner-simulator.js | head -30

# 4. Ver o endpoint de save do PDF no backend
grep -n "setupFeeBase\|setupFeeExtra\|setupFee" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js | head -20

# 5. Ver como os cards de plano são renderizados na tabela de preços
grep -n "setupFee\|setup\|Setup" \
  /home/user/parceiros/frontend/partner-pricing.js | head -30

# 6. Ver estrutura atual do plano retornado pela API
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.plan.findFirst({ where: { isActive: true }, select: { id:1, name:1, setupFee:1, setupFeeCommissioned:1, basePlanId:1 } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .finally(() => p.\$disconnect());
"
```

Anote os resultados antes de editar qualquer arquivo.

---

## FASE 2 — Fix: Propostas — capturar e persistir setupFeeBase e setupFeeExtra

### 2.1 — Localizar onde `simSalvarPlano` monta os dados enviados ao backend

```bash
grep -n "simSalvarPlano\|simExportarProposta\|setupFee\|setupExtra\|setupBase" \
  /home/user/parceiros/frontend/partner-simulator.js | head -40
```

### 2.2 — Garantir que `setupExtra` é capturado do DOM antes de qualquer await

O campo de acréscimo de setup está em `#simSetupExtra`. Ele precisa ser lido **antes** de qualquer operação assíncrona, pois o DOM pode mudar após um `await`.

Localize o início de `simSalvarPlano` e use `str_replace` para garantir que `setupExtra` é capturado logo nas primeiras linhas:

```javascript
async function simSalvarPlano(exportPdf = false) {
  const nome = document.getElementById('simNomePlano')?.value?.trim();
  if (!nome) { showToast('Digite um nome para o plano.', 'warning'); return; }

  const leadId     = document.getElementById('simLeadSelect')?.value || null;
  // Capturar setupExtra DO DOM AGORA — antes de qualquer await
  const setupExtra = Math.max(0, parseFloat(document.getElementById('simSetupExtra')?.value) || 0);

  if (exportPdf && !leadId) {
    showToast('Selecione ou crie um Lead para gerar o PDF.', 'warning');
    return;
  }
  // ... resto do código
```

### 2.3 — Calcular `setupFeeBase` e `setupFeeExtra` corretamente

Após calcular `setupBase` (setup do catálogo = plano + módulos + recursos), adicionar as variáveis nomeadas corretamente:

```javascript
// Calcular breakdown de setup
const setupBase  = Number(plano.setupFee || 0)
  + [...document.querySelectorAll('.sim-module:checked')]
      .reduce((s, cb) => s + (parseFloat(cb.dataset.setup) || 0), 0)
  + [...document.querySelectorAll('.sim-resource')]
      .reduce((s, inp) => {
        const qty = parseInt(inp.value) || 0;
        return s + qty * (parseFloat(inp.dataset.setup) || 0);
      }, 0);

// Nomes explícitos para persistência
const setupFeeBase  = setupBase;          // taxa do catálogo (plano + módulos + recursos)
const setupFeeExtra = setupExtra;         // acréscimo definido pelo parceiro
const setupTotal    = setupFeeBase + setupFeeExtra;
```

### 2.4 — Passar `setupFeeBase` e `setupFeeExtra` para `simExportarProposta`

Localize a chamada de `simExportarProposta` e garanta que os dois campos são passados:

```javascript
await simExportarProposta({
  nomePlano,
  planBase:      plano,
  baseTotal,
  modulesTotal,
  resourcesTotal,
  setupTotal,
  setupFeeBase,    // ← campo explícito
  setupFeeExtra,   // ← campo explícito
  modulesInfo,
  resourcesInfo,
  leadId,
  planId:        res?.data?.id,
  proposalCode,
});
```

### 2.5 — Atualizar `simExportarProposta` para enviar os campos ao backend

Localize a chamada `fetch('/api/pdf/plan', ...)` dentro de `simExportarProposta` e adicione os dois campos no body:

```javascript
body: JSON.stringify({
  html,
  leadId,
  planName:     dados.nomePlano,
  totalPrice:   dados.baseTotal,
  setupFee:     dados.setupTotal,      // total (compatibilidade)
  setupFeeBase:  dados.setupFeeBase,   // ← novo
  setupFeeExtra: dados.setupFeeExtra,  // ← novo
  planId:       dados.planId,
  proposalCode: dados.proposalCode,
}),
```

### 2.6 — Atualizar o backend `pdf.routes.js` para persistir os dois campos

Localize o `prisma.proposalPdf.create(...)` e adicione os campos:

```bash
grep -n "proposalPdf.create\|setupFeeBase\|setupFeeExtra" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js
```

Use `str_replace` para incluir:

```javascript
await prisma.proposalPdf.create({
  data: {
    leadId,
    partnerId:     req.user.partnerId,
    planId:        planId || null,
    fileName:      savedFileName,
    filePath:      savedPath,
    planName:      planName || 'Proposta',
    proposalCode:  proposalCode || null,
    totalPrice:    totalPrice  ? Number(totalPrice)    : null,
    setupFee:      setupFee    ? Number(setupFee)       : null,
    setupFeeBase:  req.body.setupFeeBase  ? Number(req.body.setupFeeBase)  : null,  // ← novo
    setupFeeExtra: req.body.setupFeeExtra ? Number(req.body.setupFeeExtra) : null,  // ← novo
  },
});
```

### 2.7 — Atualizar o Prisma schema para incluir os novos campos (se ainda não existirem)

```bash
grep -n "setupFeeBase\|setupFeeExtra" /home/user/parceiros/backend/prisma/schema.prisma
```

Se não existirem, adicione com `str_replace` no model `ProposalPdf`:

```prisma
model ProposalPdf {
  // ...campos existentes...
  setupFee       Decimal? @db.Decimal(10, 2)
  setupFeeBase   Decimal? @db.Decimal(10, 2)   // ← taxa do catálogo
  setupFeeExtra  Decimal? @db.Decimal(10, 2)   // ← acréscimo do parceiro
  // ...
}
```

Após editar o schema:
```bash
cd /home/user/parceiros/backend && npx prisma generate
```

---

## FASE 3 — Fix: Tabela de Preços — exibir setup separado nos cards de plano

### 3.1 — Entender o que o backend retorna sobre setup do plano

O model `Plan` tem:
- `setupFee` — taxa total do plano (base + acréscimo do parceiro que criou)
- `setupFeeCommissioned` — flag se o acréscimo gera comissão
- `basePlanId` — se é plano derivado, referencia o plano original

Para separar os valores, precisamos do `setupFee` do plano original (base):

```bash
# Verificar se GET /api/plans inclui dados do plano base
grep -n "basePlan\|basePlanId\|include.*plan" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -20
```

### 3.2 — Atualizar `GET /api/plans` para incluir setupFee do plano base

Se o endpoint não inclui os dados do plano base, use `str_replace` para adicionar o include:

```javascript
// No findMany de planos, incluir o plano base:
const plans = await prisma.plan.findMany({
  where,
  include: {
    owner: { select: { id: true, name: true } },
    basePlan: { select: { id: true, name: true, setupFee: true } },  // ← incluir basePlan
    // ...outros includes existentes
  },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
});
```

### 3.3 — Atualizar os cards de plano na Tabela de Preços

Localize em `partner-pricing.js` onde os cards de plano são renderizados (função que gera o HTML de cada card) e use `str_replace` para substituir o bloco de setup:

**Antes (exibe apenas um valor):**
```javascript
${Number(plan.setupFee) > 0 ? `
  <div class="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
    <span class="text-xs text-gray-500">Taxa de setup (cobrada 1×)</span>
    <span class="text-xs font-semibold text-orange-600">${formatCurrency(plan.setupFee)}</span>
  </div>` : ''}
```

**Depois (exibe separado):**
```javascript
${Number(plan.setupFee) > 0 ? (() => {
  const setupBase  = Number(plan.basePlan?.setupFee || 0);
  const setupExtra = Math.max(0, Number(plan.setupFee) - setupBase);
  const somente_base = setupBase > 0 && setupExtra === 0;
  const tem_extra    = setupExtra > 0;

  return `
  <div class="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
    ${setupBase > 0 ? `
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-500">Taxa de ativação (1×)</span>
      <span class="text-xs font-semibold text-orange-600">${formatCurrency(setupBase)}</span>
    </div>` : ''}
    ${tem_extra ? `
    <div class="flex items-center justify-between">
      <span class="text-xs text-gray-500 flex items-center gap-1">
        Acréscimo de ativação
        ${plan.setupFeeCommissioned ? '<span class="bg-green-100 text-green-700 text-xs px-1 rounded">comissionado</span>' : ''}
      </span>
      <span class="text-xs font-semibold text-amber-600">+ ${formatCurrency(setupExtra)}</span>
    </div>` : ''}
    ${setupBase > 0 && tem_extra ? `
    <div class="flex items-center justify-between pt-1 border-t border-gray-50">
      <span class="text-xs font-medium text-gray-600">Total de ativação</span>
      <span class="text-xs font-bold text-orange-700">${formatCurrency(Number(plan.setupFee))}</span>
    </div>` : ''}
  </div>`;
})() : ''}
```

**Legenda visual:**
- Laranja = taxa base do catálogo
- Âmbar = acréscimo do parceiro (com badge "comissionado" se `setupFeeCommissioned = true`)
- Total em negrito laranja escuro quando ambos existem

### 3.4 — Atualizar também o modal de edição de plano

No modal `editarPlanoProprioModal`, a seção de setup já foi corrigida anteriormente para mostrar base e acréscimo separados. Confirmar que os valores carregam corretamente:

```bash
grep -n "editSetupExtra\|baseSetupFee\|_editExtras.setupExtra\|editarPlano" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20
```

Se o `baseSetupFee` ainda não estiver sendo carregado do `basePlan.setupFee` correto, use `str_replace`:

```javascript
// Deve ser:
const baseSetupFee = Number(basePlan?.setupFee || 0);

// E o acréscimo salvo:
const setupExtraAtual = Math.max(0, Number(plan.setupFee || 0) - baseSetupFee);
```

---

## FASE 4 — Schema SQL (apenas se `setupFeeBase`/`setupFeeExtra` não existirem no banco)

```bash
# Verificar se as colunas já existem
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ProposalPdf'
    AND column_name IN ('setupFeeBase','setupFeeExtra','proposalCode')\`
  .then(r => r.forEach(c => console.log('Existe:', c.column_name)))
  .finally(() => p.\$disconnect());
"
```

Se as colunas não existirem, executar:

```sql
-- schema_update_setup_split.sql
-- Adiciona colunas de breakdown de setup na ProposalPdf
-- Seguro para re-execução: IF NOT EXISTS

ALTER TABLE "ProposalPdf"
    ADD COLUMN IF NOT EXISTS "setupFeeBase"  DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "setupFeeExtra" DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "proposalCode"  VARCHAR(20);

-- Verificar
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ProposalPdf'
ORDER BY ordinal_position;
```

Salvar como `backend/prisma/schema_update_setup_split.sql` e executar:
```bash
psql -h HOST -U postgres -d pacoticket_parceiros -f backend/prisma/schema_update_setup_split.sql
```

---

## FASE 5 — Verificação

```bash
# 1. Gerar uma proposta com acréscimo de setup > 0
# 2. Verificar no banco que os dois campos foram gravados
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.proposalPdf.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { planName:1, setupFee:1, setupFeeBase:1, setupFeeExtra:1, proposalCode:1 }
  }).then(r => console.log(JSON.stringify(r, null, 2)))
  .finally(() => p.\$disconnect());
"

# 3. Verificar que GET /api/plans inclui basePlan.setupFee
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s "http://localhost:3000/api/plans" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
plans = json.load(sys.stdin).get('data', [])
for p in plans[:3]:
    print(p.get('name'), '| setupFee:', p.get('setupFee'), '| basePlan:', p.get('basePlan'))
"
```

---

## FASE 6 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "fix: setup fee split in proposals and pricing table"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist

**Propostas:**
- [ ] `setupExtra` capturado do DOM antes de qualquer `await` em `simSalvarPlano`
- [ ] `setupFeeBase` e `setupFeeExtra` passados como campos distintos para `simExportarProposta`
- [ ] Backend persiste ambos os campos em `ProposalPdf`
- [ ] Verificar no banco que a última proposta tem ambos os valores corretos

**Tabela de Preços:**
- [ ] `GET /api/plans` inclui `basePlan.setupFee` no response
- [ ] Cards de plano sem setup continuam sem nada (sem seção de setup)
- [ ] Cards com apenas taxa base: exibe "Taxa de ativação: R$ X"
- [ ] Cards com taxa base + acréscimo: exibe ambos separados + total
- [ ] Badge "comissionado" aparece quando `setupFeeCommissioned = true`
- [ ] Modal de edição de plano carrega `baseSetupFee` do `basePlan.setupFee` correto