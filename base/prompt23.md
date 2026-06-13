# Auditoria Completa + Correção de Comissões e Setup

## Missão

Leia cada arquivo relevante do sistema, identifique e corrija todos os erros e inconsistências relacionados a:

1. Cálculo e persistência de comissões (mensalidade + setup adicional)
2. Exibição correta no menu Comissões do parceiro
3. Separação correta de setup base vs acréscimo em todo o sistema

Faça diagnóstico completo antes de qualquer edição. Use `str_replace` cirúrgico.

---

## FASE 1 — Leitura completa dos arquivos críticos

Execute tudo antes de tocar em qualquer arquivo.

```bash
# 1. Ler o commission.service.js completo
cat /home/user/parceiros/backend/src/services/commission.service.js

# 2. Ler o tier.service.js completo
cat /home/user/parceiros/backend/src/services/tier.service.js

# 3. Ler commissions.routes.js completo
cat /home/user/parceiros/backend/src/routes/commissions.routes.js

# 4. Ler clients.routes.js — bloco de criação de cliente e ClientCommissionRule
cat /home/user/parceiros/backend/src/routes/clients.routes.js

# 5. Ler o schema Prisma — models Commission, ClientCommissionRule, CommissionTier
grep -n -A 25 "model Commission\b\|model ClientCommissionRule\|model CommissionTier" \
  /home/user/parceiros/backend/prisma/schema.prisma

# 6. Ler partner-pricing.js — seção de comissões
grep -n -A 5 "comiss\|Comiss\|setupComm\|setupExtra\|tierPct\|commission" \
  /home/user/parceiros/frontend/partner-pricing.js | head -60

# 7. Ler o frontend de comissões do parceiro
cat /home/user/parceiros/frontend/partner.js | grep -A 30 "loadComissoes\|tab-commissions\|Comiss"

# 8. Verificar se existe arquivo separado para comissões do parceiro
ls /home/user/parceiros/frontend/partner-commissions* 2>/dev/null || \
  grep -n "loadComissoes\|commissions\|Comissões" /home/user/parceiros/frontend/partner.js | head -20

# 9. Verificar banco — estrutura atual de Commission
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'Commission' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name, ':', c.data_type)))
  .finally(() => p.\$disconnect());
"

# 10. Verificar banco — estrutura de ClientCommissionRule
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'ClientCommissionRule' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name, ':', c.data_type)))
  .catch(() => console.log('TABELA NAO EXISTE'))
  .finally(() => p.\$disconnect());
"

# 11. Verificar banco — existe alguma comissão cadastrada?
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.commission.findMany({ take: 3, orderBy: { createdAt: 'desc' } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .finally(() => p.\$disconnect());
"

# 12. Verificar banco — existe alguma ClientCommissionRule?
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.clientCommissionRule.findMany({ take: 3 })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.log('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"

# 13. Verificar CommissionTier no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.commissionTier.findMany({ orderBy: { order: 'asc' } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.log('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"

# 14. Verificar partner dashboard — o que retorna sobre tier
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "SUPERADMIN TOKEN: $TOKEN"

# 15. Listar parceiros
curl -s http://localhost:3000/api/partners \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
partners = d.get('data', [])
print(f'Total parceiros: {len(partners)}')
for p in partners[:3]:
    print(f'  {p.get(\"name\")} | id: {p.get(\"id\")} | activeClients: {p.get(\"activeClients\",\"?\")}')"

# 16. Listar clientes com planId e partnerId
curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
clients = d.get('data', [])
print(f'Total clientes: {len(clients)}')
for c in clients[:3]:
    print(f'  {c.get(\"companyName\")} | planId: {c.get(\"planId\")} | partnerId: {c.get(\"partnerId\")} | status: {c.get(\"status\")}')"

# 17. Tentar calcular comissões e ver o resultado
curl -s -X POST http://localhost:3000/api/commissions/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"month\": $(date +%m), \"year\": $(date +%Y)}" \
  | python3 -m json.tool

# 18. Listar comissões existentes
curl -s "http://localhost:3000/api/commissions" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | head -60
```

---

## FASE 2 — Mapa de inconsistências esperadas

Após ler os arquivos, responda cada item antes de avançar:

| # | Pergunta | Resposta (preencher) |
|---|----------|---------------------|
| 1 | `commission.service.js` usa `ClientCommissionRule` ou `CommissionTier` hardcoded? | ? |
| 2 | O campo `setupCommission` existe na tabela `Commission`? | ? |
| 3 | O cálculo de comissão inclui `setupFeeExtra` (acréscimo) do parceiro? | ? |
| 4 | `ClientCommissionRule` é criada ao cadastrar cliente? | ? |
| 5 | O menu Comissões do parceiro exibe `setupCommission` separado da mensalidade? | ? |
| 6 | `GET /api/commissions` retorna dados suficientes para o frontend exibir? | ? |
| 7 | A coluna `setupCommission` existe no banco (Commission)? | ? |
| 8 | `tier.service.js` busca tiers do banco ou são hardcoded? | ? |

---

## FASE 3 — Correções (executar em ordem, uma por vez)

### FIX 1 — Garantir que `Commission` tem o campo `setupCommission`

```bash
# Verificar
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns
    WHERE table_name='Commission' AND column_name IN ('setupCommission','isFrozen','tierConfigId')\`
  .then(r => r.forEach(c => console.log('OK:', c.column_name)))
  .finally(() => p.\$disconnect());
"
```

Se `setupCommission` não existir no banco, adicionar:

```sql
ALTER TABLE "Commission"
    ADD COLUMN IF NOT EXISTS "setupCommission" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "isFrozen"        BOOLEAN       NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "tierConfigId"    TEXT          REFERENCES "CommissionTier"("id") ON DELETE SET NULL;
```

Executar via:
```bash
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  Promise.all([
    p.\$executeRaw\`ALTER TABLE \"Commission\" ADD COLUMN IF NOT EXISTS \"setupCommission\" DECIMAL(10,2) NOT NULL DEFAULT 0\`,
    p.\$executeRaw\`ALTER TABLE \"Commission\" ADD COLUMN IF NOT EXISTS \"isFrozen\" BOOLEAN NOT NULL DEFAULT FALSE\`,
    p.\$executeRaw\`ALTER TABLE \"Commission\" ADD COLUMN IF NOT EXISTS \"tierConfigId\" TEXT\`,
  ]).then(() => console.log('OK'))
  .catch(e => console.error(e.message))
  .finally(() => p.\$disconnect());
"
```

E atualizar o Prisma schema — adicionar ao model `Commission`:
```prisma
setupCommission Decimal   @db.Decimal(10, 2) @default(0)
isFrozen        Boolean   @default(false)
tierConfigId    String?
tierConfig      CommissionTier? @relation(fields: [tierConfigId], references: [id], onDelete: SetNull)
```

```bash
cd /home/user/parceiros/backend && npx prisma generate
```

---

### FIX 2 — Corrigir `commission.service.js` — lógica completa

Leia o arquivo atual e substitua a lógica de cálculo por uma versão que:

1. Usa `ClientCommissionRule` se existir (regra travada no momento do cadastro)
2. Fallback para `CommissionTier` do banco se não existir regra travada
3. Calcula comissão de **mensalidade** = `invoice.amount × percentage / 100`
4. Calcula comissão de **setup** = `setupFeeExtra × setupCommissionPct / 100` (apenas se `commissionOnSetup = true` E primeiro mês)
5. Respeita `expiresAt` e `frozenAtUpgrade`
6. Persiste `setupCommission` separado de `commissionAmount`

```javascript
// commission.service.js — versão corrigida

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function calculateCommissions(month, year) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 1);

  const partners = await prisma.partner.findMany({
    where: { status: 'ACTIVE' },
    include: {
      clients: {
        where: { status: 'ACTIVE' },
        include: {
          plan: true,
          invoices: {
            where: {
              status: 'PAID',
              paidAt: { gte: periodStart, lt: periodEnd }
            }
          },
          commissionRule: true, // ClientCommissionRule
        }
      }
    }
  });

  const summary = [];

  for (const partner of partners) {
    const activeCount = partner.clients.length;

    for (const client of partner.clients) {
      // 1. Determinar regra de comissão aplicável
      const rule = client.commissionRule;

      // 1a. Verificar se regra expirou ou foi congelada
      if (rule) {
        if (rule.frozenAtUpgrade) continue; // não gera comissão — upgrade após tier com prazo
        if (rule.expiresAt && periodStart > rule.expiresAt) continue; // expirou
      }

      // 1b. Buscar percentual — da regra travada ou do tier atual
      let percentage    = 0;
      let tierConfigId  = null;
      let commissionOnSetup = false;
      let setupCommissionPct = 0;

      if (rule) {
        percentage         = Number(rule.percentage);
        tierConfigId       = rule.tierConfigId;
        commissionOnSetup  = rule.commissionOnSetup;
        setupCommissionPct = Number(rule.setupCommissionPct || 0);
      } else {
        // Fallback: buscar tier atual do parceiro
        const tier = await getTierForActiveCount(activeCount);
        if (!tier) continue;
        percentage         = Number(tier.percentage);
        tierConfigId       = tier.id;
        commissionOnSetup  = tier.commissionOnSetup;
        setupCommissionPct = Number(tier.setupCommissionPct || 0);
      }

      if (percentage <= 0) continue;

      // 2. Calcular comissão de mensalidade para cada fatura paga no período
      for (const invoice of client.invoices) {
        const base            = Number(invoice.amount);
        const commissionAmount = parseFloat((base * percentage / 100).toFixed(2));

        // 3. Comissão de setup — apenas no primeiro período do cliente
        let setupCommission = 0;
        if (commissionOnSetup && rule?.setupFeeAmount > 0) {
          // Verificar se é o primeiro mês de comissionamento deste cliente
          const existingComms = await prisma.commission.count({
            where: {
              partnerId:   partner.id,
              clientId:    client.id,
              periodYear:  { lt: year },
            }
          });
          const isFirstPeriod = existingComms === 0 &&
            (month === periodStart.getMonth() + 1);

          if (isFirstPeriod) {
            const pct = setupCommissionPct > 0 ? setupCommissionPct : percentage;
            // Comissão de setup = apenas sobre o setupFeeExtra (acréscimo do parceiro)
            // setupFeeExtra está em rule.setupFeeAmount se foi salvo, ou no plano
            const setupExtra = Number(rule.setupFeeAmount || 0);
            setupCommission  = parseFloat((setupExtra * pct / 100).toFixed(2));
          }
        }

        // 4. Upsert da comissão
        await prisma.commission.upsert({
          where: {
            partnerId_clientId_periodMonth_periodYear: {
              partnerId:   partner.id,
              clientId:    client.id,
              periodMonth: month,
              periodYear:  year,
            }
          },
          update: {
            tier:             1, // legado
            percentage,
            baseAmount:       base,
            commissionAmount,
            setupCommission,
            tierConfigId,
          },
          create: {
            partnerId:        partner.id,
            clientId:         client.id,
            invoiceId:        invoice.id,
            periodMonth:      month,
            periodYear:       year,
            tier:             1, // legado
            percentage,
            baseAmount:       base,
            commissionAmount,
            setupCommission,
            tierConfigId,
            status:           'PENDING',
          }
        });

        summary.push({
          partnerId:        partner.id,
          partnerName:      partner.name,
          commissionAmount,
          setupCommission,
        });
      }
    }
  }

  return {
    processed:   summary.length,
    totalAmount: summary.reduce((s, r) => s + r.commissionAmount + r.setupCommission, 0),
    byPartner:   summary,
  };
}

async function getTierForActiveCount(count) {
  const tiers = await prisma.commissionTier.findMany({
    where:   { isActive: true },
    orderBy: { order: 'asc' }
  });
  // Encontrar o tier mais alto que o parceiro qualifica
  let matched = tiers[0];
  for (const tier of tiers) {
    const qualifies = count >= tier.minClients &&
      (tier.maxClients === null || count <= tier.maxClients);
    if (qualifies) matched = tier;
  }
  return matched || null;
}

module.exports = { calculateCommissions };
```

**Importante:** verifique se o model `Client` tem a relação `commissionRule` apontando para `ClientCommissionRule` no schema Prisma. Se não tiver, adicione:

```prisma
// Em model Client, adicionar:
commissionRule ClientCommissionRule?
```

---

### FIX 3 — `ClientCommissionRule` criada ao cadastrar cliente

Leia o `clients.routes.js` e verifique se, ao criar um cliente, uma `ClientCommissionRule` é criada com os dados do tier atual.

```bash
grep -n "ClientCommissionRule\|commissionRule\|clientCommission\|setupFeeExtra\|setupFeeAmount" \
  /home/user/parceiros/backend/src/routes/clients.routes.js | head -20
```

**Se não existir**, adicione após o `await prisma.client.create(...)` no POST de clientes:

```javascript
// Após criar o cliente, criar a regra de comissão travada
try {
  const activeCount = await prisma.client.count({
    where: { partnerId: partner.id, status: 'ACTIVE' }
  });
  const tier = await getTierForActiveCount(activeCount);

  if (tier) {
    const startedAt = new Date();
    const expiresAt = tier.durationMonths > 0
      ? new Date(startedAt.getFullYear(), startedAt.getMonth() + tier.durationMonths, 1)
      : null;

    // setupFeeExtra: acréscimo do parceiro no plano (plan.setupFee - basePlan.setupFee)
    const planData     = await prisma.plan.findUnique({
      where: { id: client.planId },
      include: { basePlan: { select: { setupFee: true } } }
    });
    const setupFeeBase  = Number(planData?.basePlan?.setupFee || 0);
    const setupFeeExtra = Math.max(0, Number(planData?.setupFee || 0) - setupFeeBase);
    const setupPct      = Number(tier.setupCommissionPct) > 0
      ? Number(tier.setupCommissionPct) : Number(tier.percentage);
    const setupCommissionAmount = (tier.commissionOnSetup && planData?.setupFeeCommissioned)
      ? parseFloat((setupFeeExtra * setupPct / 100).toFixed(2))
      : 0;

    await prisma.clientCommissionRule.upsert({
      where:  { clientId: client.id },
      update: {},
      create: {
        clientId:             client.id,
        partnerId:            partner.id,
        tierConfigId:         tier.id,
        tierName:             tier.name,
        percentage:           Number(tier.percentage),
        durationMonths:       tier.durationMonths || 0,
        commissionOnSetup:    tier.commissionOnSetup && (planData?.setupFeeCommissioned || false),
        setupCommissionPct:   setupPct,
        setupFeeAmount:       setupFeeExtra, // só o acréscimo é comissionável
        setupCommissionAmount,
        startedAt,
        expiresAt,
        frozenAtUpgrade:      false,
      }
    });
  }
} catch (ruleErr) {
  console.error('Erro ao criar ClientCommissionRule:', ruleErr.message);
  // Não falhar o cadastro do cliente por causa disso
}
```

Adicionar import do `getTierForActiveCount` no topo do arquivo:
```javascript
const { getTierForActiveCount } = require('../services/tier.service');
```

E exportar a função em `tier.service.js`:
```javascript
module.exports = { getTierForActiveCount, /* outros exports existentes */ };
```

---

### FIX 4 — `GET /api/commissions` retornar dados completos

```bash
grep -n -A 30 "router.get.*'/'.*commiss\|findMany.*commission" \
  /home/user/parceiros/backend/src/routes/commissions.routes.js | head -50
```

O endpoint deve retornar para cada comissão:
- `commissionAmount` (mensalidade)
- `setupCommission` (setup acréscimo)
- `totalCommission` = `commissionAmount + setupCommission`
- `client.companyName`
- `partner.name`
- `tier` ou `percentage`
- `status`
- `periodMonth`, `periodYear`

Se `setupCommission` não estiver no select/include, adicione. Exemplo de ajuste cirúrgico:

```javascript
// No findMany de comissões, garantir que setupCommission está incluído
const commissions = await prisma.commission.findMany({
  where,
  include: {
    client:  { select: { companyName: true, planId: true } },
    partner: { select: { name: true } },
    tierConfig: { select: { name: true, percentage: true } },
  },
  orderBy: { createdAt: 'desc' },
});

// Adicionar totalCommission no map de resposta:
const data = commissions.map(c => ({
  ...c,
  setupCommission:   Number(c.setupCommission  || 0),
  commissionAmount:  Number(c.commissionAmount || 0),
  totalCommission:   Number(c.commissionAmount || 0) + Number(c.setupCommission || 0),
}));
```

---

### FIX 5 — Frontend: menu Comissões do parceiro

Localize o arquivo que renderiza o menu de comissões do parceiro:

```bash
# Encontrar onde as comissões são renderizadas no painel do parceiro
grep -rn "loadComissoes\|tab-commissions\|commissions\|Comissões\|Comissao" \
  /home/user/parceiros/frontend/partner.js \
  /home/user/parceiros/frontend/partner-commissions.js 2>/dev/null | head -20

# Ver a função que renderiza a tabela de comissões
grep -n -A 50 "function.*loadComiss\|renderComiss" \
  /home/user/parceiros/frontend/partner.js 2>/dev/null | head -80
```

A tabela de comissões deve exibir **colunas separadas** para mensalidade e setup:

```
┌──────────┬────────┬────────────┬───────────────┬──────────────┬────────────┬──────────┬──────────┐
│ Período  │ Cliente│ Tier       │ Mensalidade   │ Setup (1×)   │ Total      │ Status   │ Pago em  │
├──────────┼────────┼────────────┼───────────────┼──────────────┼────────────┼──────────┼──────────┤
│ 03/2026  │ ACME   │ Parceiro   │ R$ 225,00     │ R$ 245,00    │ R$ 470,00  │ Pendente │ —        │
└──────────┴────────┴────────────┴───────────────┴──────────────┴────────────┴──────────┴──────────┘
```

Regras de exibição:
- **Mensalidade:** `commission.commissionAmount` sempre exibida
- **Setup (1×):** `commission.setupCommission` — exibir coluna apenas se > 0 (ou mostrar "—" se = 0)
- **Total:** `commissionAmount + setupCommission`
- Badge de setup: cor âmbar com tooltip "Comissão sobre acréscimo de setup — cobrada uma única vez"

Substitua a renderização da tabela de comissões com `str_replace`:

```javascript
// Na função que gera cada linha da tabela de comissões:
function renderCommissionRow(c) {
  const mensal  = Number(c.commissionAmount || 0);
  const setup   = Number(c.setupCommission  || 0);
  const total   = mensal + setup;
  const hasSetup = setup > 0;
  const tierLabel = c.tierConfig?.name || `${Number(c.percentage)}%`;

  return `
  <tr class="border-b hover:bg-gray-50">
    <td class="py-3 px-4 text-sm text-gray-700">${c.periodMonth}/${c.periodYear}</td>
    <td class="py-3 px-4 text-sm font-medium text-gray-800">${_esc ? _esc(c.client?.companyName || '—') : (c.client?.companyName || '—')}</td>
    <td class="py-3 px-4 text-sm">${badge(tierLabel, 'blue')}</td>
    <td class="py-3 px-4 text-sm text-right font-semibold text-gray-800">${formatCurrency(mensal)}</td>
    <td class="py-3 px-4 text-sm text-right">
      ${hasSetup
        ? `<span class="text-amber-600 font-semibold" title="Comissão sobre acréscimo de setup — cobrada uma única vez">
             ${formatCurrency(setup)}
             <span class="text-xs text-amber-400 ml-1">1×</span>
           </span>`
        : '<span class="text-gray-300">—</span>'}
    </td>
    <td class="py-3 px-4 text-sm text-right font-bold text-gray-900">${formatCurrency(total)}</td>
    <td class="py-3 px-4 text-sm">${statusBadge(c.status)}</td>
    <td class="py-3 px-4 text-sm text-gray-500">${c.paidAt ? formatDate(c.paidAt) : '—'}</td>
  </tr>`;
}
```

E o card de resumo deve mostrar totais separados:

```javascript
// Card de resumo de comissões — versão corrigida
function renderCommissionSummary(data) {
  const pendente    = data.filter(c => c.status === 'PENDING');
  const pago        = data.filter(c => c.status === 'PAID');

  const totalPendenteMensal  = pendente.reduce((s, c) => s + Number(c.commissionAmount || 0), 0);
  const totalPendenteSetup   = pendente.reduce((s, c) => s + Number(c.setupCommission  || 0), 0);
  const totalPago            = pago.reduce((s, c) => s + Number(c.commissionAmount || 0) + Number(c.setupCommission || 0), 0);
  const totalGeral           = data.reduce((s, c) => s + Number(c.commissionAmount || 0) + Number(c.setupCommission || 0), 0);

  return `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-400">
      <p class="text-xs text-gray-500 mb-1">Pendente — Mensalidade</p>
      <p class="text-xl font-bold text-amber-600">${formatCurrency(totalPendenteMensal)}</p>
    </div>
    ${totalPendenteSetup > 0 ? `
    <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-300">
      <p class="text-xs text-gray-500 mb-1">Pendente — Setup (1×)</p>
      <p class="text-xl font-bold text-amber-500">${formatCurrency(totalPendenteSetup)}</p>
    </div>` : ''}
    <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
      <p class="text-xs text-gray-500 mb-1">Pago</p>
      <p class="text-xl font-bold text-green-600">${formatCurrency(totalPago)}</p>
    </div>
    <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
      <p class="text-xs text-gray-500 mb-1">Total do Período</p>
      <p class="text-xl font-bold text-blue-600">${formatCurrency(totalGeral)}</p>
    </div>
  </div>`;
}
```

---

### FIX 6 — Tabela de Preços: exibição de comissão de setup no card de plano

Leia a função que calcula a comissão estimada no card do plano em `partner-pricing.js`:

```bash
grep -n "setupComm\|setupExtra\|setupFeeExtra\|comissao.*setup\|setup.*comissao" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20
```

A comissão de setup exibida no card deve ser baseada **apenas no `setupExtra`** (acréscimo), não no `setupFee` total:

```javascript
// No card de plano — cálculo correto da comissão de setup
const setupBase  = Number(plan.basePlanSetupFee || 0);
const setupExtra = Math.max(0, Number(plan.setupFee || 0) - setupBase);
const setupComm  = (setupExtra > 0 && _partnerTier?.commissionOnSetup)
  ? setupExtra * ((_partnerTier.setupCommissionPct || _partnerTier.percentage) / 100)
  : 0;

// Exibir apenas se setupComm > 0:
${setupComm > 0 ? `
<div class="flex items-center justify-between py-1">
  <span class="text-xs text-gray-500">
    Sua comissão de setup
    <span class="text-amber-500 text-xs">(1×)</span>
  </span>
  <span class="text-xs font-semibold text-amber-600">
    ${formatCurrency(setupComm)}
  </span>
</div>` : ''}
```

---

## FASE 4 — Testes end-to-end

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 1. Verificar que clientes existentes têm ClientCommissionRule
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.clientCommissionRule.count()
  .then(n => console.log('ClientCommissionRules:', n))
  .finally(() => p.\$disconnect());
"

# 2. Calcular comissões do mês atual
MONTH=$(date +%m | sed 's/^0//')
YEAR=$(date +%Y)
curl -s -X POST http://localhost:3000/api/commissions/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"month\": $MONTH, \"year\": $YEAR}" \
  | python3 -m json.tool

# 3. Listar comissões calculadas
curl -s "http://localhost:3000/api/commissions?month=$MONTH&year=$YEAR" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
comms = d.get('data', [])
print(f'Total comissões: {len(comms)}')
for c in comms[:5]:
    print(f'  {c.get(\"client\",{}).get(\"companyName\",\"?\")} | mensal: {c.get(\"commissionAmount\")} | setup: {c.get(\"setupCommission\",0)} | total: {float(c.get(\"commissionAmount\",0))+float(c.get(\"setupCommission\",0))}')
"

# 4. Verificar que 'totalCommission' está no response
curl -s "http://localhost:3000/api/commissions?month=$MONTH&year=$YEAR" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
comms = d.get('data', [])
if comms:
    print('Campos da primeira comissão:', list(comms[0].keys()))
"
```

---

## FASE 5 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "fix: commission calculation with setup split, partner commissions UI"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist final

**Backend:**
- [ ] `Commission.setupCommission` existe no banco e no schema Prisma
- [ ] `commission.service.js` usa `ClientCommissionRule` quando disponível
- [ ] `commission.service.js` calcula `setupCommission` apenas no primeiro período e apenas sobre `setupFeeExtra`
- [ ] `ClientCommissionRule` é criada ao cadastrar cliente (com `setupFeeAmount = setupFeeExtra`)
- [ ] `GET /api/commissions` retorna `setupCommission` e `totalCommission` em cada item
- [ ] `tier.service.js` exporta `getTierForActiveCount` (função assíncrona que busca do banco)

**Frontend:**
- [ ] Menu Comissões mostra coluna "Mensalidade" e coluna "Setup (1×)" separadas
- [ ] Coluna Setup mostra "—" quando `setupCommission = 0`
- [ ] Card de resumo mostra "Pendente — Mensalidade" e "Pendente — Setup" separados
- [ ] Total do período = mensalidade + setup
- [ ] Card de plano na Tabela de Preços usa `setupExtra` (não `setupFee` total) para calcular comissão estimada