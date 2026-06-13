# Atualização de Documentação — CLAUDE.md e Arquivos SQL

## Problema anterior
Tentativas de reescrever arquivos grandes de uma vez causaram timeout. Este prompt divide o trabalho em etapas pequenas. **Execute uma etapa por vez. Confirme antes de avançar.**

---

## ETAPA 1 — Inventário do estado atual

Antes de qualquer escrita, mapeie o que existe:

```bash
# Ver tamanhos atuais
wc -l /home/user/parceiros/CLAUDE.md \
       /home/user/parceiros/database/schema.sql \
       /home/user/parceiros/database/seed.sql 2>/dev/null

# Listar tabelas reais no banco (fonte de verdade)
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name\`
  .then(r => r.forEach(t => console.log(t.table_name)))
  .finally(() => p.\$disconnect());
"

# Listar colunas de cada tabela relevante
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const tables = [
    'User','Partner','Plan','Client','Invoice','Commission',
    'CommissionTier','ClientCommissionRule','ModulePrice','ResourcePrice',
    'SystemConfig','FunnelStage','Lead','LeadActivity','ProposalPdf',
    'RefreshToken','PlanAddon','ClientAddon','ActivityLog'
  ];
  Promise.all(tables.map(t =>
    p.\$queryRaw\`SELECT column_name, data_type
      FROM information_schema.columns WHERE table_name=\${t}
      ORDER BY ordinal_position\`
    .then(cols => ({ t, cols }))
    .catch(() => ({ t, cols: [] }))
  )).then(results => {
    results.filter(r => r.cols.length > 0).forEach(r => {
      console.log('\\n=== ' + r.t + ' ===');
      r.cols.forEach(c => console.log('  ' + c.column_name + ' ' + c.data_type));
    });
  }).finally(() => p.\$disconnect());
"

# Ver rotas registradas
grep -n "app\.use\|require.*routes" /home/user/parceiros/backend/src/server.js

# Ver stack tecnológica atual
cat /home/user/parceiros/backend/package.json | python3 -c "
import sys, json
pkg = json.load(sys.stdin)
print('=== dependencies ===')
for k,v in pkg.get('dependencies',{}).items(): print(f'  {k}: {v}')
"

# Ver tiers de comissão no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.commissionTier.findMany({ orderBy: { order: 'asc' } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.log('VAZIO:', e.message))
  .finally(() => p.\$disconnect());
"

# Ver SystemConfig no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.systemConfig.findMany()
  .then(r => r.forEach(c => console.log(c.key + ': ' + c.value)))
  .catch(e => console.log('VAZIO'))
  .finally(() => p.\$disconnect());
"

# Ver ModulePrices no banco
docker exec $(docker ps -qf "name=pacoticket_backend") node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.modulePrice.findMany({ orderBy: { label: 'asc' } })
  .then(r => r.forEach(m => console.log(m.moduleKey + ' | ' + m.label + ' | ' + m.price)))
  .finally(() => p.\$disconnect());
"
```

**Anote os resultados. Confirme que tem o inventário antes de avançar.**

---

## ETAPA 2 — Atualizar `CLAUDE.md` (Seção 1: Visão Geral e Stack)

Leia o arquivo atual e atualize **apenas as seções de Visão Geral, Stack e Estrutura de Pastas**. Use `str_replace` para substituir cada seção individualmente — não reescreva o arquivo inteiro.

```bash
# Ler as primeiras 100 linhas do CLAUDE.md atual
head -100 /home/user/parceiros/CLAUDE.md
```

Substitua a seção de Stack com `str_replace` para refletir o estado atual:

```markdown
## Stack Tecnológica

### Frontend
- HTML5, Tailwind CSS (auto-hospedado — `tailwind.min.css` gerado via CLI v3)
- Fontes Inter auto-hospedadas (`frontend/fonts/`)
- JavaScript Vanilla ES6+ (sem build step)
- Entry points: `login.html`, `superadmin.html`, `partner.html`, `reset-password.html`
- Tema de cores configurável via CSS Custom Properties (`theme.css`)

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Banco de dados:** PostgreSQL 15+
- **ORM:** Prisma
- **Autenticação:** JWT em httpOnly cookies (access 8h + refresh 7d com blacklist no banco)
- **Hash de senha:** bcrypt (salt rounds: 12)
- **Geração de PDF:** Gotenberg 8.x (via container interno)
- **Validação:** Zod (middleware `validate.js`)
- **Rate limiting:** express-rate-limit
- **Email:** Nodemailer (reset de senha)

### Infraestrutura
- Docker Swarm (stack em `docker-stack.yml`)
- Nginx (frontend estático + proxy `/api/` para backend)
- Traefik (TLS Let's Encrypt)
- Backup PostgreSQL automatizado (container `backup`)
```

Confirme: seção de Stack atualizada → avance.

---

## ETAPA 3 — Atualizar `CLAUDE.md` (Seção 2: Portais)

```bash
# Ler a seção de portais atual
grep -n "Portal\|portal\|superadmin\|partner\|reseller" /home/user/parceiros/CLAUDE.md | head -30
```

Substitua a seção de portais com `str_replace`:

```markdown
## Portais do Sistema

### Portal SuperAdmin (`superadmin.html`)
1. **Dashboard** — KPIs globais, top parceiros, distribuição por tier, log de atividades
2. **Parceiros** — CRUD completo com permissões (`canSetRecurrence`, `canSetDueDate`)
3. **Planos** — CRUD com montador de módulos; `totalPrice = basePrice` (tudo embutido); drag-and-drop de ordem
4. **Clientes** — CRUD com add-ons, filtros por parceiro/status/plano
5. **Comissões** — calcular por período, marcar como pago, exportar CSV; colunas separadas para mensalidade e setup
6. **Faturas** — sincronização com API PacoTicket
7. **Propostas** — listar propostas de todos os parceiros, filtrar por parceiro, baixar PDF, excluir
8. **Configurações** — preços de módulos (com `isVisible`, `setupFee`, `label` editável), recursos de infraestrutura, tiers de comissionamento (`durationMonths`, `acceptNewClients`, `commissionOnSetup`), sistema (white-label, logos, favicon, `apiBaseUrl`, cores)

### Portal Parceiro (`partner.html`)
1. **Dashboard** — tier atual, barra de progresso, KPIs, aviso de tier congelado
2. **Meus Clientes** — CRUD com add-ons; permissões de recorrência/vencimento configuráveis pelo superadmin
3. **Comissões** — tabela com Mensalidade | Setup (1×) | Total; resumo separado por tipo
4. **Tabela de Preços** — planos globais e próprios; breakdown setup base/acréscimo; comissão estimada
5. **Funil** — CRM Kanban com arrastar e soltar; lead → cliente; histórico de atividades por lead
6. **Propostas** — gerador de propostas e criador de planos; exportação PDF via Gotenberg; histórico por lead
7. **Perfil** — editar telefone e email; trocar senha
```

Confirme → avance.

---

## ETAPA 4 — Atualizar `CLAUDE.md` (Seção 3: Rotas de API)

```bash
# Ver tabela de rotas atual no CLAUDE.md
grep -n "Endpoint\|endpoint\|/api\|GET\|POST\|PUT\|DELETE" /home/user/parceiros/CLAUDE.md | head -50
```

Adicione as rotas que faltam com `str_replace`. A tabela completa deve incluir:

```markdown
## Rotas de API (Base: `/api`)

### Autenticação
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/auth/login` | POST | público | Login → seta httpOnly cookies |
| `/auth/refresh` | POST | público | Renova access token (rotaciona refresh) |
| `/auth/me` | GET | autenticado | Dados do usuário logado |
| `/auth/logout` | POST | autenticado | Invalida refresh token no banco |
| `/auth/change-password` | POST | autenticado | Troca senha (exige senha atual) |
| `/auth/forgot-password` | POST | público | Envia email com token de reset |
| `/auth/reset-password` | POST | público | Redefine senha via token |

### Planos
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/plans` | GET | ambos | Listar planos ativos (inclui `basePlanSetupFee`) |
| `/plans/:id` | GET | ambos | Detalhe completo |
| `/plans` | POST | SUPERADMIN | Criar plano global |
| `/plans/partner` | POST | PARTNER | Criar plano próprio (herda basePlanId) |
| `/plans/inherit/:basePlanId` | POST | PARTNER | Criar plano baseado em plano global |
| `/plans/:id` | PUT | ambos* | Editar (parceiro: só planos próprios) |
| `/plans/:id` | DELETE | ambos* | Soft delete |
| `/plans/reorder` | PUT | SUPERADMIN | Reordenar drag-and-drop |
| `/plans/modules/prices` | GET | ambos | Listar módulos com `price`, `setupFee`, `isVisible`, `label` |
| `/plans/modules/prices` | PUT | SUPERADMIN | Atualizar módulos (upsert por `moduleKey`) |

### Parceiros
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/partners` | GET | SUPERADMIN | Listar com tier calculado do banco |
| `/partners/:id` | GET | SUPERADMIN | Detalhe + clientes + comissões |
| `/partners` | POST | SUPERADMIN | Criar parceiro + usuário em transaction |
| `/partners/:id` | PUT | SUPERADMIN | Editar (inclui `canSetRecurrence`, `canSetDueDate`) |
| `/partners/:id` | DELETE | SUPERADMIN | Soft delete |
| `/partners/me/dashboard` | GET | PARTNER | Dashboard do parceiro logado |
| `/partners/me` | PUT | PARTNER | Editar próprio perfil (phone, email) |

### Clientes
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/clients` | GET | ambos* | Listar (SUPERADMIN: todos; PARTNER: seus) |
| `/clients/:id` | GET | ambos* | Detalhe |
| `/clients` | POST | ambos | Criar + cria `ClientCommissionRule` + chama API PacoTicket |
| `/clients/:id` | PUT | ambos* | Atualizar |
| `/clients/:id` | DELETE | SUPERADMIN | Soft delete |
| `/clients/:id/addons` | GET/POST/PUT/DELETE | ambos* | Add-ons do cliente |

### Comissões
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/commissions` | GET | ambos* | Listar (retorna `setupCommission`, `totalCommission`) |
| `/commissions/calculate` | POST | SUPERADMIN | Calcular período (`{ month, year }`) |
| `/commissions/:id/pay` | PUT | SUPERADMIN | Marcar como pago |
| `/commissions/summary` | GET | ambos* | Totais separados: `pendingMensal`, `pendingSetup`, `paid` |
| `/commission-tiers` | GET/POST/PUT/DELETE | SUPERADMIN | CRUD de tiers configuráveis |

### Funil CRM
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/funnel/stages` | GET/POST/PUT/DELETE | PARTNER | Estágios do funil (auto-criados no 1º acesso) |
| `/funnel/leads` | GET/POST | PARTNER | Leads do parceiro |
| `/funnel/leads/:id` | PUT/DELETE | PARTNER | Editar/excluir lead |
| `/funnel/leads/:id/activities` | GET | PARTNER | Histórico do lead |
| `/funnel/leads/:id/notes` | POST | PARTNER | Adicionar nota |

### PDF e Propostas
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/pdf/plan` | POST | PARTNER | Gerar PDF via Gotenberg; salvar em `/data/pdfs/{partnerId}/`; registrar em `ProposalPdf` |
| `/pdf/proposals` | GET | SUPERADMIN | Listar todas as propostas |
| `/pdf/proposals/:id` | DELETE | SUPERADMIN | Excluir proposta (banco + disco) |
| `/pdf/proposals/:id/download` | GET | SUPERADMIN | Download do PDF |

### Outros
| Endpoint | Método | Acesso | Descrição |
|---|---|---|---|
| `/invoices` | GET | ambos* | Listar faturas |
| `/invoices/sync` | POST | SUPERADMIN | Sincronizar da API PacoTicket |
| `/resource-prices` | GET/PUT | SUPERADMIN | Preços de infraestrutura |
| `/system-config` | GET | público | Configurações (white-label, cores) |
| `/system-config` | PUT | SUPERADMIN | Atualizar configurações |
| `/activity-log` | GET | SUPERADMIN | Log de atividades recentes |
| `/health` | GET | público | Health check |
```

Confirme → avance.

---

## ETAPA 5 — Atualizar `CLAUDE.md` (Seção 4: Regras de Negócio)

```bash
# Ver seção de regras de negócio atual
grep -n "Regras\|totalPrice\|Tier\|Comiss\|setup" /home/user/parceiros/CLAUDE.md | head -40
```

Substitua a seção de regras com `str_replace`:

```markdown
## Regras de Negócio Críticas

### Planos
- `totalPrice = basePrice` — o preço base já inclui tudo; módulos e recursos documentam o que está incluso, sem inflar o preço
- Planos são 100% internos — nunca consultados/criados via API PacoTicket
- `pacoticketPlanId` é apenas referência de identificação (não afeta preço nem comissão)
- Parceiro pode criar planos próprios (`ownerId = partnerId`) baseados em planos globais (`basePlanId`)
- Preço do plano do parceiro nunca pode ser menor que o plano base

### Comissões
- Calculadas sobre faturas **pagas** no período (não sobre valor do plano)
- `commissionAmount` = `invoice.amount × percentage / 100`
- `setupCommission` = calculada apenas no **primeiro período** do cliente, apenas quando `ClientCommissionRule.commissionOnSetup = true`
- Base do setupCommission = `setupFeeAmount` da `ClientCommissionRule` (= `setupFeeExtra` do plano, o acréscimo do parceiro — nunca o setup base do catálogo)
- Tiers configuráveis via `CommissionTier`; `getTierForPartner()` busca do banco
- `ClientCommissionRule` criada no cadastro do cliente — trava tier, percentual, duração e commissionOnSetup
- `frozenAtUpgrade = true` → cliente não gera comissão (parceiro subiu de tier enquanto cliente estava em regra com duração limitada)
- `expiresAt` → comissão não gerada após a data de expiração

### Sessão e Auth
- JWT em httpOnly cookies (`access_token` 8h, `refresh_token` 7d)
- Refresh token rotaciona a cada renovação (token antigo deletado do banco)
- Logout invalida refresh token no banco
- `sessionStorage` guarda apenas `{ role, name }` para uso da UI — nunca o token

### Autorização
- `partnerId` vem **sempre** de `req.user.partnerId` (do JWT) — nunca de `req.body`
- Parceiro só acessa seus próprios dados (clientes, leads, comissões, planos)
- SUPERADMIN não pode ser criado via API pública

### White-Label
- `SystemConfig` armazena: `businessName`, `logoLogin`, `logoInternal`, `logoPdf`, `favicon`, `apiBaseUrl`, `logoLoginWidth`, 15 chaves de cor
- Logo configurada → nome do negócio some do header/login (sem flash de texto)
- `apiBaseUrl` usada em todas as chamadas para a API PacoTicket (nunca hardcoded)
- Cores aplicadas como CSS Custom Properties no `:root` via `applyTheme()`
```

Confirme → avance.

---

## ETAPA 6 — Criar `schema_update_master_v2.sql`

Este arquivo é a migração consolidada de **tudo que foi adicionado após o schema original**. Crie em `database/schema_update_master_v2.sql`.

```bash
# Ver o schema original para não duplicar
grep -n "CREATE TABLE\|ALTER TABLE\|CREATE TYPE" /home/user/parceiros/database/schema.sql
```

Crie o arquivo (escreva em partes se necessário, usando `cat >>` para append):

```bash
cat > /home/user/parceiros/database/schema_update_master_v2.sql << 'ENDSQL'
-- ============================================================
-- schema_update_master_v2.sql
-- PacoTicket — Todas as migrações desde o schema original
-- Seguro para re-execução: IF NOT EXISTS / ON CONFLICT DO NOTHING
-- Aplique em banco existente (não em banco novo — use schema.sql para isso)
-- ============================================================

-- Garantir DEFAULT NOW() em SystemConfig (se existir)
ALTER TABLE IF EXISTS "SystemConfig" ALTER COLUMN "updatedAt" SET DEFAULT NOW();

-- ============================================================
-- 1. ModulePrice — campos adicionados
-- ============================================================
ALTER TABLE "ModulePrice" ADD COLUMN IF NOT EXISTS "setupFee"  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ModulePrice" ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN       NOT NULL DEFAULT TRUE;

-- ============================================================
-- 2. Plan — campos adicionados
-- ============================================================
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "setupFee"             DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "setupFeeCommissioned" BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "sortOrder"            INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "connectionsWhatsappUnofficial" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "connectionsWhatsappOfficial"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "connectionsInstagram"          INTEGER NOT NULL DEFAULT 0;

-- ownerId e basePlanId como TEXT (Prisma usa TEXT para UUIDs)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plan' AND column_name='ownerId') THEN
        ALTER TABLE "Plan" ADD COLUMN "ownerId" TEXT REFERENCES "Partner"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plan' AND column_name='basePlanId') THEN
        ALTER TABLE "Plan" ADD COLUMN "basePlanId" TEXT REFERENCES "Plan"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_plan_owner ON "Plan"("ownerId");
CREATE INDEX IF NOT EXISTS idx_plan_base  ON "Plan"("basePlanId");
CREATE INDEX IF NOT EXISTS idx_plan_sort  ON "Plan"("sortOrder");

-- ============================================================
-- 3. Partner — campos adicionados
-- ============================================================
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "canSetRecurrence" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "canSetDueDate"    BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 4. Commission — campos adicionados
-- ============================================================
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "setupCommission" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "isFrozen"        BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE "Commission" ADD COLUMN IF NOT EXISTS "tierConfigId"    TEXT REFERENCES "CommissionTier"("id") ON DELETE SET NULL;

-- ============================================================
-- 5. SystemConfig
-- ============================================================
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "id"        TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "key"       VARCHAR(100) UNIQUE NOT NULL,
    "value"     TEXT,
    "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO "SystemConfig" ("id","key","value","updatedAt") VALUES
    (gen_random_uuid()::TEXT,'businessName','PacoTicket',NOW()),
    (gen_random_uuid()::TEXT,'logoLogin',NULL,NOW()),
    (gen_random_uuid()::TEXT,'logoInternal',NULL,NOW()),
    (gen_random_uuid()::TEXT,'logoPdf',NULL,NOW()),
    (gen_random_uuid()::TEXT,'favicon',NULL,NOW()),
    (gen_random_uuid()::TEXT,'apiBaseUrl','https://api.pacoticket.com.br',NOW()),
    (gen_random_uuid()::TEXT,'logoLoginWidth','200',NOW()),
    (gen_random_uuid()::TEXT,'colorBrandPrimary','#1B3FC4',NOW()),
    (gen_random_uuid()::TEXT,'colorBrandHover','#2550E0',NOW()),
    (gen_random_uuid()::TEXT,'colorBrandMist','#EEF2FF',NOW()),
    (gen_random_uuid()::TEXT,'colorAccent','#F59E0B',NOW()),
    (gen_random_uuid()::TEXT,'colorAccentHover','#FBB72A',NOW()),
    (gen_random_uuid()::TEXT,'colorPartner','#10B981',NOW()),
    (gen_random_uuid()::TEXT,'colorPartnerDark','#059669',NOW()),
    (gen_random_uuid()::TEXT,'colorPartnerMist','#ECFDF5',NOW()),
    (gen_random_uuid()::TEXT,'colorStatusPending','#F59E0B',NOW()),
    (gen_random_uuid()::TEXT,'colorStatusPaid','#10B981',NOW()),
    (gen_random_uuid()::TEXT,'colorStatusQueue','#818CF8',NOW()),
    (gen_random_uuid()::TEXT,'colorStatusOverdue','#EF4444',NOW()),
    (gen_random_uuid()::TEXT,'colorDarkBase','#080C18',NOW()),
    (gen_random_uuid()::TEXT,'colorDarkSurface','#0D1428',NOW()),
    (gen_random_uuid()::TEXT,'colorDarkElevated','#141C35',NOW()),
    (gen_random_uuid()::TEXT,'colorBtnLogout','#FFFFFF29',NOW()),
    (gen_random_uuid()::TEXT,'pdfStoragePath','/data/pdfs',NOW())
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- 6. ResourcePrice
-- ============================================================
CREATE TABLE IF NOT EXISTS "ResourcePrice" (
    "id"        TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "key"       VARCHAR(50)   UNIQUE NOT NULL,
    "label"     VARCHAR(100)  NOT NULL,
    "price"     DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE "ResourcePrice" ADD COLUMN IF NOT EXISTS "isVisible"  BOOLEAN       NOT NULL DEFAULT TRUE;
ALTER TABLE "ResourcePrice" ADD COLUMN IF NOT EXISTS "setupFee"   DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ResourcePrice" ADD COLUMN IF NOT EXISTS "sortOrder"  INTEGER       NOT NULL DEFAULT 0;

INSERT INTO "ResourcePrice" ("id","key","label","price","updatedAt") VALUES
    (gen_random_uuid()::TEXT,'whatsappUnofficial','WhatsApp Não Oficial (por conexão)',0,NOW()),
    (gen_random_uuid()::TEXT,'whatsappOfficial','WhatsApp Oficial / WABA (por conexão)',0,NOW()),
    (gen_random_uuid()::TEXT,'instagram','Instagram (por conexão)',0,NOW()),
    (gen_random_uuid()::TEXT,'user','Usuário adicional',0,NOW()),
    (gen_random_uuid()::TEXT,'queue','Fila adicional',0,NOW())
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- 7. CommissionTier
-- ============================================================
CREATE TABLE IF NOT EXISTS "CommissionTier" (
    "id"                 TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "name"               VARCHAR(100) NOT NULL,
    "minClients"         INTEGER      NOT NULL,
    "maxClients"         INTEGER,
    "percentage"         DECIMAL(5,2) NOT NULL,
    "supportMode"        VARCHAR(50)  NOT NULL DEFAULT 'PACOTICKET_DIRECT',
    "notes"              TEXT,
    "isActive"           BOOLEAN      NOT NULL DEFAULT TRUE,
    "order"              INTEGER      NOT NULL DEFAULT 0,
    "durationMonths"     INTEGER      NOT NULL DEFAULT 0,
    "acceptNewClients"   BOOLEAN      NOT NULL DEFAULT TRUE,
    "commissionOnSetup"  BOOLEAN      NOT NULL DEFAULT FALSE,
    "setupCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO "CommissionTier" ("id","name","minClients","maxClients","percentage","supportMode","notes","order","durationMonths") VALUES
    (gen_random_uuid()::TEXT,'Indicador',1,2,15.00,'PACOTICKET_DIRECT','Nível inicial.',1,0),
    (gen_random_uuid()::TEXT,'Parceiro',3,9,25.00,'PACOTICKET_DIRECT','Nível intermediário.',2,0),
    (gen_random_uuid()::TEXT,'Master',10,NULL,35.00,'PARTNER_INTERMEDIARY','Nível máximo.',3,0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. ClientCommissionRule
-- ============================================================
CREATE TABLE IF NOT EXISTS "ClientCommissionRule" (
    "id"                    TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "clientId"              TEXT          UNIQUE NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
    "partnerId"             TEXT          NOT NULL REFERENCES "Partner"("id") ON DELETE RESTRICT,
    "tierConfigId"          TEXT          REFERENCES "CommissionTier"("id") ON DELETE SET NULL,
    "tierName"              VARCHAR(100)  NOT NULL,
    "percentage"            DECIMAL(5,2)  NOT NULL,
    "durationMonths"        INTEGER       NOT NULL DEFAULT 0,
    "commissionOnSetup"     BOOLEAN       NOT NULL DEFAULT FALSE,
    "setupCommissionPct"    DECIMAL(5,2)  NOT NULL DEFAULT 0,
    "setupFeeAmount"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "setupCommissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "startedAt"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "expiresAt"             TIMESTAMPTZ,
    "frozenAtUpgrade"       BOOLEAN       NOT NULL DEFAULT FALSE,
    "createdAt"             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ccr_client  ON "ClientCommissionRule"("clientId");
CREATE INDEX IF NOT EXISTS idx_ccr_partner ON "ClientCommissionRule"("partnerId");

-- ============================================================
-- 9. FunnelStage, Lead, LeadActivity
-- ============================================================
CREATE TABLE IF NOT EXISTS "FunnelStage" (
    "id"         TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "partnerId"  TEXT         NOT NULL REFERENCES "Partner"("id") ON DELETE CASCADE,
    "name"       VARCHAR(100) NOT NULL,
    "color"      VARCHAR(20)  NOT NULL DEFAULT '#6B7280',
    "order"      INTEGER      NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN      NOT NULL DEFAULT FALSE,
    "isDefault"  BOOLEAN      NOT NULL DEFAULT FALSE,
    "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funnelstage_partner ON "FunnelStage"("partnerId");

CREATE TABLE IF NOT EXISTS "Lead" (
    "id"            TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "partnerId"     TEXT          NOT NULL REFERENCES "Partner"("id") ON DELETE CASCADE,
    "stageId"       TEXT          NOT NULL REFERENCES "FunnelStage"("id") ON DELETE RESTRICT,
    "clientId"      TEXT          REFERENCES "Client"("id") ON DELETE SET NULL,
    "planId"        TEXT          REFERENCES "Plan"("id") ON DELETE SET NULL,
    "companyName"   VARCHAR(255)  NOT NULL,
    "contactName"   VARCHAR(255),
    "email"         VARCHAR(255),
    "phone"         VARCHAR(50),
    "notes"         TEXT,
    "value"         DECIMAL(10,2),
    "probability"   INTEGER       DEFAULT 50,
    "expectedClose" TIMESTAMPTZ,
    "lostReason"    TEXT,
    "order"         INTEGER       NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_partner ON "Lead"("partnerId");
CREATE INDEX IF NOT EXISTS idx_lead_stage   ON "Lead"("stageId");

CREATE TABLE IF NOT EXISTS "LeadActivity" (
    "id"          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "leadId"      TEXT         NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
    "partnerId"   TEXT         NOT NULL REFERENCES "Partner"("id") ON DELETE CASCADE,
    "type"        VARCHAR(50)  NOT NULL,
    "description" TEXT         NOT NULL,
    "metadata"    JSONB,
    "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leadactivity_lead ON "LeadActivity"("leadId");

-- ============================================================
-- 10. ProposalPdf
-- ============================================================
CREATE TABLE IF NOT EXISTS "ProposalPdf" (
    "id"           TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "leadId"       TEXT          NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
    "partnerId"    TEXT          NOT NULL REFERENCES "Partner"("id") ON DELETE CASCADE,
    "planId"       TEXT          REFERENCES "Plan"("id") ON DELETE SET NULL,
    "fileName"     VARCHAR(255)  NOT NULL,
    "filePath"     TEXT          NOT NULL,
    "planName"     VARCHAR(255)  NOT NULL,
    "proposalCode" VARCHAR(20),
    "totalPrice"   DECIMAL(10,2),
    "setupFee"     DECIMAL(10,2),
    "setupFeeBase" DECIMAL(10,2),
    "setupFeeExtra" DECIMAL(10,2),
    "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposalpdf_lead    ON "ProposalPdf"("leadId");
CREATE INDEX IF NOT EXISTS idx_proposalpdf_partner ON "ProposalPdf"("partnerId");

-- ============================================================
-- 11. RefreshToken (autenticação com blacklist)
-- ============================================================
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"        TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId"    TEXT         NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "tokenHash" TEXT         NOT NULL,
    "expiresAt" TIMESTAMPTZ  NOT NULL,
    "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refreshtoken_user ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS idx_refreshtoken_hash ON "RefreshToken"("tokenHash");

-- ============================================================
-- 12. PasswordResetToken (recuperação de senha)
-- ============================================================
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id"        TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId"    TEXT         NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "tokenHash" TEXT         UNIQUE NOT NULL,
    "expiresAt" TIMESTAMPTZ  NOT NULL,
    "used"      BOOLEAN      NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Verificação final
-- ============================================================
DO $$
DECLARE cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE';
    RAISE NOTICE 'Total de tabelas: %', cnt;
END $$;
ENDSQL
```

Confirme: arquivo criado sem erro → avance.

---

## ETAPA 7 — Commit e push

```bash
cd /home/user/parceiros
git add CLAUDE.md database/schema_update_master_v2.sql
git status
git commit -m "docs: update CLAUDE.md and add schema_update_master_v2.sql"
git push
```

Confirme: pushed com sucesso.

---

## ETAPA 8 — Verificação final

```bash
# Confirmar que os arquivos estão no repositório
git -C /home/user/parceiros show HEAD --name-only | head -10

# Confirmar tamanho do CLAUDE.md atualizado
wc -l /home/user/parceiros/CLAUDE.md

# Confirmar que o SQL é executável (sintaxe)
docker exec $(docker ps -qf "name=pacoticket_backend") \
  psql -U postgres -d pacoticket_parceiros \
  --command "SELECT 'schema_update_master_v2.sql sintaxe ok'" 2>/dev/null || \
  echo "Verificar manualmente: psql -f database/schema_update_master_v2.sql"
```