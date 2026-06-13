# Auditoria Final — Revisão Completa do Sistema PacoTicket

## Missão

Leia **cada arquivo do sistema** (backend e frontend), execute verificações no banco e na API em execução, identifique todos os erros e inconsistências, e corrija tudo encontrado. Esta é a auditoria pré-produção.

**Não pule etapas. Leia os arquivos antes de qualquer edição.**

---

## FASE 1 — Leitura e inventário completo

```bash
# Estrutura completa do projeto
find /home/user/parceiros -name "*.js" -o -name "*.html" -o -name "*.css" \
  | grep -v "node_modules\|\.git\|fonts/" | sort

# Tamanho dos arquivos JS principais
wc -l /home/user/parceiros/frontend/*.js \
       /home/user/parceiros/backend/src/routes/*.js \
       /home/user/parceiros/backend/src/services/*.js \
       /home/user/parceiros/backend/src/middleware/*.js 2>/dev/null | sort -rn | head -30
```

### 1.1 — Ler cada arquivo de rota do backend

```bash
for f in /home/user/parceiros/backend/src/routes/*.js; do
  echo "===== $f ====="
  cat "$f"
  echo ""
done
```

### 1.2 — Ler os services

```bash
for f in /home/user/parceiros/backend/src/services/*.js; do
  echo "===== $f ====="
  cat "$f"
done
```

### 1.3 — Ler os middlewares

```bash
cat /home/user/parceiros/backend/src/middleware/auth.js
cat /home/user/parceiros/backend/src/middleware/role.js
```

### 1.4 — Ler server.js

```bash
cat /home/user/parceiros/backend/src/server.js
```

### 1.5 — Ler o schema Prisma completo

```bash
cat /home/user/parceiros/backend/prisma/schema.prisma
```

### 1.6 — Ler cada arquivo JS do frontend

```bash
for f in /home/user/parceiros/frontend/*.js; do
  echo "===== $f ====="
  cat "$f"
  echo ""
done
```

### 1.7 — Ler cada HTML

```bash
for f in /home/user/parceiros/frontend/*.html; do
  echo "===== $f ====="
  cat "$f"
  echo ""
done
```

---

## FASE 2 — Verificações no banco em execução

```bash
# Estado real de todas as tabelas
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  Promise.all([
    p.user.count(),
    p.partner.count(),
    p.plan.count(),
    p.client.count(),
    p.commission.count(),
    p.commissionTier.count(),
    p.clientCommissionRule.count().catch(() => -1),
    p.modulePrice.count(),
    p.resourcePrice.count().catch(() => -1),
    p.systemConfig.count().catch(() => -1),
    p.funnelStage.count().catch(() => -1),
    p.lead.count().catch(() => -1),
    p.proposalPdf.count().catch(() => -1),
    p.refreshToken.count().catch(() => -1),
  ]).then(([u,pa,pl,c,co,ct,ccr,mp,rp,sc,fs,le,pp,rt]) =>
    console.log({users:u,partners:pa,plans:pl,clients:c,commissions:co,
      commissionTiers:ct,clientCommissionRules:ccr,modulePrices:mp,
      resourcePrices:rp,systemConfigs:sc,funnelStages:fs,leads:le,
      proposalPdfs:pp,refreshTokens:rt})
  ).finally(() => p.\$disconnect());
"

# Colunas exatas de Commission no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name, data_type, column_default
    FROM information_schema.columns WHERE table_name='Commission' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name, c.data_type, c.column_default||'')))
  .finally(() => p.\$disconnect());
"

# Colunas de Plan
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns
    WHERE table_name='Plan' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name)))
  .finally(() => p.\$disconnect());
"

# Colunas de ClientCommissionRule
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT column_name FROM information_schema.columns
    WHERE table_name='ClientCommissionRule' ORDER BY ordinal_position\`
  .then(r => r.forEach(c => console.log(c.column_name)))
  .catch(e => console.log('TABELA NAO EXISTE:', e.message))
  .finally(() => p.\$disconnect());
"

# CommissionTiers existentes
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.commissionTier.findMany({ orderBy: { order:'asc' } })
  .then(r => console.log(JSON.stringify(r,null,2)))
  .catch(e => console.log('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"

# Planos com basePlanId
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.plan.findMany({
    select:{id:1,name:1,setupFee:1,setupFeeCommissioned:1,basePlanId:1,ownerId:1},
    orderBy:{createdAt:'asc'}
  }).then(r => console.log(JSON.stringify(r,null,2)))
  .finally(() => p.\$disconnect());
"

# ClientCommissionRules existentes
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.clientCommissionRule.findMany({
    select:{clientId:1,percentage:1,setupFeeAmount:1,setupCommissionAmount:1,
            commissionOnSetup:1,durationMonths:1,expiresAt:1,frozenAtUpgrade:1}
  }).then(r => console.log(JSON.stringify(r,null,2)))
  .catch(e => console.log('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"

# Comissões existentes com setupCommission
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.commission.findMany({
    take: 5,
    orderBy: {createdAt:'desc'},
    select:{id:1,commissionAmount:1,setupCommission:1,percentage:1,status:1,periodMonth:1,periodYear:1}
  }).then(r => console.log(JSON.stringify(r,null,2)))
  .catch(e => console.log('ERRO:', e.message))
  .finally(() => p.\$disconnect());
"
```

---

## FASE 3 — Verificações na API em execução

```bash
# Login e capturar tokens
LOGIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  -c /tmp/cookies.txt)
echo "$LOGIN" | python3 -m json.tool
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Health check
curl -s http://localhost:3000/api/health

# GET /api/plans — verificar campos retornados
curl -s http://localhost:3000/api/plans \
  -b /tmp/cookies.txt \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
plans=d.get('data',[])
print(f'Total planos: {len(plans)}')
for p in plans[:3]:
    keys=list(p.keys())
    print(f'  {p[\"name\"]} | keys: {keys}')
    print(f'    setupFee={p.get(\"setupFee\")} basePlanSetupFee={p.get(\"basePlanSetupFee\")} ownerId={p.get(\"ownerId\")}')
"

# GET /api/partners — verificar campos
curl -s http://localhost:3000/api/partners \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
partners=d.get('data',[])
print(f'Total parceiros: {len(partners)}')
for p in partners[:3]:
    print(f'  {p.get(\"name\")} | activeClients={p.get(\"activeClients\")} tier={p.get(\"tier\")}')
"

# GET /api/clients — verificar campos
curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
clients=d.get('data',[])
print(f'Total clientes: {len(clients)}')
for c in clients[:3]:
    print(f'  {c.get(\"companyName\")} | planId={c.get(\"planId\")} | status={c.get(\"status\")}')
"

# GET /api/commissions — verificar campos retornados
curl -s "http://localhost:3000/api/commissions" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
comms=d.get('data',[])
print(f'Total comissões: {len(comms)}')
if comms:
    print('Campos:', list(comms[0].keys()))
    for c in comms[:3]:
        print(f'  commissionAmount={c.get(\"commissionAmount\")} setupCommission={c.get(\"setupCommission\")} totalCommission={c.get(\"totalCommission\")}')
"

# GET /api/commissions/summary
curl -s "http://localhost:3000/api/commissions/summary" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# POST /api/commissions/calculate
MONTH=$(date +%m | sed 's/^0//')
YEAR=$(date +%Y)
curl -s -X POST http://localhost:3000/api/commissions/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"month\":$MONTH,\"year\":$YEAR}" \
  | python3 -m json.tool

# GET /api/system-config — verificar chaves
curl -s http://localhost:3000/api/system-config \
  | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data',{})
for k,v in sorted(d.items()):
    print(f'  {k}: {v}')
"

# GET /api/commission-tiers
curl -s http://localhost:3000/api/commission-tiers \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# GET /api/resource-prices
curl -s http://localhost:3000/api/resource-prices \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# GET /api/funnel/stages (com cookie de parceiro se disponível)
curl -s http://localhost:3000/api/funnel/stages \
  -b /tmp/cookies.txt \
  | python3 -m json.tool 2>/dev/null || echo "Funnel: requer auth de parceiro"
```

---

## FASE 4 — Checklist de inconsistências (preencher após leitura)

Para cada item, registre: **OK**, **FALHA** ou **AUSENTE**.

### Backend — Comissões

| # | Verificação | Status |
|---|-------------|--------|
| 1 | `commission.service.js` usa `ClientCommissionRule` como fonte primária | ? |
| 2 | Fallback para `getTierForPartner()` quando sem regra travada | ? |
| 3 | `setupCommission` calculado apenas no 1º período do cliente | ? |
| 4 | `setupCommission` usa `setupFeeAmount` da regra (não `plan.setupFee` total) | ? |
| 5 | `frozenAtUpgrade` e `expiresAt` respeitados | ? |
| 6 | `commissions.routes.js` retorna `setupCommission` e `totalCommission` | ? |
| 7 | `commissions/summary` retorna `pendingMensal` e `pendingSetup` separados | ? |
| 8 | `clients.routes.js` cria `ClientCommissionRule` ao cadastrar cliente | ? |
| 9 | `ClientCommissionRule.setupFeeAmount` usa `setupFeeExtra` (não `plan.setupFee` total) | ? |
| 10 | `commission.service.js` importa e usa `getTierForPartner` corretamente | ? |

### Backend — Planos

| # | Verificação | Status |
|---|-------------|--------|
| 11 | `GET /api/plans` inclui `basePlan: { setupFee }` no include | ? |
| 12 | `formatPlan` expõe `basePlanSetupFee` no response | ? |
| 13 | `POST /api/plans/partner` aceita e persiste `basePlanId` | ? |
| 14 | `totalPrice = basePrice` (sem somar módulos) | ? |

### Backend — Auth e Sessão

| # | Verificação | Status |
|---|-------------|--------|
| 15 | `auth.routes.js` usa httpOnly cookies no login | ? |
| 16 | Refresh token rotaciona no banco | ? |
| 17 | Logout deleta refresh token do banco | ? |
| 18 | Rate limiting em `/api/auth/login` | ? |
| 19 | `change-password` exige senha atual | ? |

### Backend — Segurança geral

| # | Verificação | Status |
|---|-------------|--------|
| 20 | `partnerId` vem sempre de `req.user.partnerId` (nunca de `req.body`) | ? |
| 21 | CORS configurado (não `origin: *`) | ? |
| 22 | Body size limit em `express.json()` | ? |
| 23 | `passwordHash` nunca retornado em nenhum endpoint | ? |
| 24 | Stack traces suprimidos em produção | ? |

### Frontend — Comissões

| # | Verificação | Status |
|---|-------------|--------|
| 25 | Tabela tem colunas separadas: Mensalidade \| Setup (1×) \| Total | ? |
| 26 | Setup mostra "—" quando zero | ? |
| 27 | Resumo mostra totais separados por tipo | ? |

### Frontend — Tabela de Preços / Cards de Plano

| # | Verificação | Status |
|---|-------------|--------|
| 28 | Cards de plano do parceiro mostram breakdown setup base / acréscimo | ? |
| 29 | Comissão estimada usa `setupExtra` (não `setupFee` total) | ? |
| 30 | Infra inputs (`Usuários`, `Filas`, `WApp`) disparam `_pEditorRecalcular()` | ? |
| 31 | Módulos adicionais têm ícones no editor de plano do parceiro | ? |

### Frontend — Propostas / Simulador

| # | Verificação | Status |
|---|-------------|--------|
| 32 | `setupExtra` capturado do DOM antes de qualquer `await` | ? |
| 33 | `setupFeeBase` e `setupFeeExtra` passados ao backend ao salvar | ? |
| 34 | `proposalCode` gerado e persistido | ? |
| 35 | PDF não contém dados de comissão (visão do cliente) | ? |

### Frontend — Auth

| # | Verificação | Status |
|---|-------------|--------|
| 36 | `init()` / `checkAuth()` async — fallback para `/auth/me` antes de redirecionar | ? |
| 37 | Sem loop entre login e dashboard | ? |
| 38 | Logo não pisca texto antes de carregar | ? |

---

## FASE 5 — Correções (executar em ordem)

Para cada item marcado como **FALHA** ou **AUSENTE** na fase 4, execute a correção correspondente abaixo.

**Regra:** use `str_replace` cirúrgico. Nunca reescreva um arquivo inteiro.

---

### C01 — Se `commission.service.js` não usa `ClientCommissionRule`

```bash
cat /home/user/parceiros/backend/src/services/commission.service.js
```

Verificar se o service faz `prisma.client.findMany` com `include: { commissionRule: true }`. Se não, substituir o `include` existente adicionando o campo e atualizar o loop para priorizar `client.commissionRule`.

A lógica correta para o loop interno:

```javascript
for (const client of partner.clients) {
  const rule = client.commissionRule;

  // Verificar congelamento e expiração
  if (rule?.frozenAtUpgrade) continue;
  if (rule?.expiresAt && periodStart > new Date(rule.expiresAt)) continue;

  // Determinar percentual
  const percentage = rule
    ? Number(rule.percentage)
    : Number(tier?.percentage || 0);

  if (percentage <= 0) continue;

  for (const invoice of client.invoices) {
    const base             = Number(invoice.amount);
    const commissionAmount = parseFloat((base * percentage / 100).toFixed(2));

    // setupCommission — apenas 1º período, apenas se commissionOnSetup
    let setupCommission = 0;
    if (rule?.commissionOnSetup && Number(rule.setupFeeAmount || 0) > 0) {
      const prevCount = await prisma.commission.count({
        where: { partnerId: partner.id, clientId: client.id }
      });
      if (prevCount === 0) {
        const pct = Number(rule.setupCommissionPct || 0) > 0
          ? Number(rule.setupCommissionPct)
          : percentage;
        setupCommission = parseFloat(
          (Number(rule.setupFeeAmount) * pct / 100).toFixed(2)
        );
      }
    }

    await prisma.commission.upsert({
      where: {
        partnerId_clientId_periodMonth_periodYear: {
          partnerId: partner.id, clientId: client.id,
          periodMonth: month, periodYear: year,
        }
      },
      update:  { percentage, baseAmount: base, commissionAmount, setupCommission },
      create:  {
        partnerId: partner.id, clientId: client.id,
        invoiceId: invoice.id, periodMonth: month, periodYear: year,
        tier: rule ? 0 : (tier?.order || 1),
        percentage, baseAmount: base, commissionAmount, setupCommission,
        status: 'PENDING',
      }
    });

    summary.push({ partnerId: partner.id, commissionAmount, setupCommission });
  }
}
```

---

### C02 — Se `ClientCommissionRule` não está sendo criada ao cadastrar cliente

```bash
grep -n "ClientCommissionRule\|commissionRule\|clientCommission" \
  /home/user/parceiros/backend/src/routes/clients.routes.js | head -20
```

Se o bloco de criação da regra não existir ou estiver incompleto, verificar:

1. `setupFeeAmount` deve ser `setupFeeExtra = plan.setupFee - basePlan.setupFee` (não o total)
2. O bloco deve estar em `try/catch` separado para não bloquear o cadastro do cliente
3. O include do plan deve ter `basePlan: { select: { setupFee: true } }`

---

### C03 — Se `commissions.routes.js` não retorna `setupCommission`

```bash
grep -n "setupCommission\|totalCommission\|commissionAmount" \
  /home/user/parceiros/backend/src/routes/commissions.routes.js | head -20
```

O map de resposta deve incluir:

```javascript
return {
  ...c,
  commissionAmount:  Number(c.commissionAmount  || 0),
  setupCommission:   Number(c.setupCommission   || 0),
  totalCommission:   Number(c.commissionAmount  || 0) + Number(c.setupCommission || 0),
};
```

---

### C04 — Se `GET /api/plans` não retorna `basePlanSetupFee`

```bash
grep -n "basePlan\|basePlanSetupFee\|formatPlan" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -20
```

O include deve ter:
```javascript
basePlan: { select: { id: true, name: true, setupFee: true } }
```

E o `formatPlan` deve incluir:
```javascript
basePlanSetupFee: Number(plan.basePlan?.setupFee ?? 0),
```

---

### C05 — Se infra inputs não disparam recálculo no editor de plano do parceiro

```bash
grep -n "pPlanUsers\|pPlanQueues\|pPlanWppUn\|pPlanWppOf\|_pEditorRecalcular\|oninput" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20
```

Os quatro inputs devem ter `oninput="_pEditorRecalcular()"`. Se não tiverem, localizar onde são renderizados e adicionar com `str_replace`.

---

### C06 — Se `_pEditorRecalcular` não inclui custo de recursos

```bash
grep -n -A 40 "function _pEditorRecalcular" \
  /home/user/parceiros/frontend/partner-pricing.js | head -50
```

O recálculo deve incluir:

```javascript
// Custo extra de infraestrutura
let resourcesExtra = 0;
const baseUsers  = Number(_editPlanoBase?.users  || 0);
const baseQueues = Number(_editPlanoBase?.queues  || 0);
const baseWppUn  = Number(_editPlanoBase?.connectionsWhatsappUnofficial || _editPlanoBase?.connections || 0);
const baseWppOf  = Number(_editPlanoBase?.connectionsWhatsappOfficial || 0);

const curUsers  = parseInt(document.getElementById('pPlanUsers')?.value)  || 0;
const curQueues = parseInt(document.getElementById('pPlanQueues')?.value) || 0;
const curWppUn  = parseInt(document.getElementById('pPlanWppUn')?.value)  || 0;
const curWppOf  = parseInt(document.getElementById('pPlanWppOf')?.value)  || 0;

const rp = _pricingResources || {};
resourcesExtra += Math.max(0, curUsers  - baseUsers)  * Number(rp.user                || 0);
resourcesExtra += Math.max(0, curQueues - baseQueues) * Number(rp.queue               || 0);
resourcesExtra += Math.max(0, curWppUn  - baseWppUn)  * Number(rp.whatsappUnofficial  || 0);
resourcesExtra += Math.max(0, curWppOf  - baseWppOf)  * Number(rp.whatsappOfficial    || 0);

const totalMensal = baseMensal + modulesExtra + resourcesExtra;
```

---

### C07 — Se loop de redirect (login ↔ dashboard) ainda ocorre

```bash
grep -n "checkAuth\|async.*init\|auth/me\|sessionStorage.*user\|redirectToLogin" \
  /home/user/parceiros/frontend/superadmin-utils.js \
  /home/user/parceiros/frontend/partner.js | head -30
```

A função `init()` ou `checkAuth()` deve ser async e chamar `/auth/me` quando `sessionStorage` estiver vazio:

```javascript
async function checkAuth() {
  let user = null;
  try { user = JSON.parse(sessionStorage.getItem('user') || 'null'); } catch {}

  if (!user) {
    // Cookie pode ser válido — tentar /auth/me antes de redirecionar
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        user = data.data?.user || data.data;
        if (user) sessionStorage.setItem('user', JSON.stringify(user));
      }
    } catch {}
  }

  if (!user) { window.location.replace('login.html'); return null; }
  return user;
}
```

---

### C08 — Se logo pisca texto antes de aparecer

```bash
grep -n "headerLogo\|headerName\|visibility\|hidden.*logo\|logo.*hidden" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html | head -20
```

Os elementos de logo e texto devem iniciar com `style="visibility:hidden"` e serem revelados apenas após `applyBranding()` completar. Se não estiverem assim, usar `str_replace` para adicionar o atributo.

---

### C09 — Se `setupCommission` não existe no banco

Verificar na Fase 2. Se a coluna não existir:

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$executeRaw\`ALTER TABLE \"Commission\"
    ADD COLUMN IF NOT EXISTS \"setupCommission\" DECIMAL(10,2) NOT NULL DEFAULT 0\`
  .then(() => console.log('OK'))
  .catch(e => console.error(e.message))
  .finally(() => p.\$disconnect());
"
cd /home/user/parceiros/backend && npx prisma generate
```

---

### C10 — Se módulos do editor do parceiro não têm ícones

```bash
grep -n "MODULE_MAP\|icon\|pmod-cb\|_preencherModulosModal" \
  /home/user/parceiros/frontend/partner-pricing.js | head -20
```

Verificar se `MODULE_MAP` está definido em `partner-pricing.js` ou importado de outro arquivo. Se não estiver, adicionar no escopo do arquivo:

```javascript
const MODULE_MAP = {
  useWhatsapp:     { label: 'WhatsApp',               icon: '💬' },
  useFacebook:     { label: 'Facebook',               icon: '📘' },
  useInstagram:    { label: 'Instagram',              icon: '📸' },
  useCampaigns:    { label: 'Campanhas',              icon: '📣' },
  useSchedules:    { label: 'Agendamentos',           icon: '📅' },
  useInternalChat: { label: 'Chat Interno',           icon: '🗨️'  },
  useExternalApi:  { label: 'API Externa',            icon: '🔌' },
  useKanban:       { label: 'Kanban',                 icon: '📋' },
  usePixel:        { label: 'Pixel',                  icon: '🎯' },
  usePerfex:       { label: 'Perfex',                 icon: '⚙️'  },
  useRD:           { label: 'RD Station',             icon: '📊' },
  useCV:           { label: 'CV CRM',                 icon: '👥' },
  useIXC:          { label: 'IXC Soft',               icon: '🖥️'  },
  useAI:           { label: 'Inteligência Artificial', icon: '🤖' },
  useCHAMA:        { label: 'Chama',                  icon: '🔥' },
  useTYPE:         { label: 'Typebot',                icon: '🤖' },
  useZAIA:         { label: 'Zaia',                   icon: '⚡' },
  useGPT:          { label: 'ChatGPT',                icon: '🧠' },
  useGPTA:         { label: 'GPT Avançado',           icon: '🧠' },
  useHS:           { label: 'HubSpot',                icon: '🔶' },
  useNNN:          { label: 'NNN',                    icon: '🔷' },
  useHUB:          { label: 'Hub de Integrações',     icon: '🔗' },
  useCRM:          { label: 'CRM',                    icon: '📇' },
  useFLOW:         { label: 'Flow Builder',           icon: '🌊' },
  useBTN:          { label: 'Botões Rápidos',         icon: '🔘' },
  useCALL:         { label: 'Chamadas',               icon: '📞' },
  useVOIP:         { label: 'VoIP',                   icon: '☎️'  },
  useDIFY:         { label: 'Dify AI',                icon: '🤖' },
  usePUSH:         { label: 'Push Notifications',     icon: '🔔' },
  useWABAOWN:      { label: 'WABA Próprio',           icon: '✅' },
  useWABAAINI:     { label: 'WABA Ainini',            icon: '✅' },
  useProducts:     { label: 'Produtos',               icon: '📦' },
  useServices:     { label: 'Serviços',               icon: '🛠️'  },
  useWEBCHAT:      { label: 'Web Chat',               icon: '💻' },
  useInternal:     { label: 'Uso Interno',            icon: '🏢' },
};
```

---

### C11 — Verificar rotas não registradas em `server.js`

```bash
grep -n "require.*routes\|app\.use" /home/user/parceiros/backend/src/server.js
```

Confirmar que todas as rotas estão registradas:

```
/api/auth           → auth.routes.js
/api/partners       → partners.routes.js
/api/plans          → plans.routes.js
/api/clients        → clients.routes.js
/api/commissions    → commissions.routes.js
/api/invoices       → invoices.routes.js
/api/commission-tiers → commission-tiers.routes.js
/api/system-config  → system-config.routes.js
/api/resource-prices → resource-prices.routes.js
/api/funnel         → funnel.routes.js
/api/pdf            → pdf.routes.js
/api/activity-log   → (verificar se existe)
```

Para cada rota que não estiver registrada, adicionar com `str_replace` no `server.js`.

---

### C12 — Verificar consistência entre Prisma schema e banco real

```bash
# Campos no schema que podem não existir no banco ainda
grep -n "setupCommission\|setupFeeBase\|setupFeeExtra\|proposalCode\|basePlanId\|frozenAtUpgrade\|isFrozen\|tierConfigId" \
  /home/user/parceiros/backend/prisma/schema.prisma

# Comparar com o banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const tables = ['Commission','Plan','ProposalPdf','ClientCommissionRule'];
  Promise.all(tables.map(t =>
    p.\$queryRaw\`SELECT column_name FROM information_schema.columns
      WHERE table_name=\${t} ORDER BY ordinal_position\`
    .then(cols => ({ table: t, cols: cols.map(c=>c.column_name) }))
    .catch(() => ({ table: t, cols: ['TABELA NAO EXISTE'] }))
  )).then(results => results.forEach(r =>
    console.log(r.table + ':', r.cols.join(', '))
  )).finally(() => p.\$disconnect());
"
```

Para cada campo que existir no schema mas não no banco, aplicar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## FASE 6 — Relatório final de auditoria

Após executar todas as correções, produzir um relatório com:

```
## Itens corrigidos
[listar cada item com: arquivo, linha, natureza do problema, correção aplicada]

## Itens OK (não necessitaram correção)
[listar]

## Itens pendentes (requerem ação externa/ops)
[Docker Secrets, backup, CI/CD, etc.]

## Score de prontidão para produção
[0-100]
```

---

## FASE 7 — Deploy final

```bash
cd /opt/parceiros
git add -A && git commit -m "audit: final pre-production fixes"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 25
docker stack services pacoticket

# Verificação pós-deploy
curl -s https://parceiros.pacoticket.com.br/api/health
curl -s -X POST https://parceiros.pacoticket.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Login:', d.get('success'), '| role:', d.get('data',{}).get('user',{}).get('role'))"
```