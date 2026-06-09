# Handoff Técnico — PacoTicket: Sistema de Parceiros

> Documento de entrega para reconstrução completa em PHP puro.
> Gerado em: 2026-06-09

---

## 1. Visão Geral do Sistema

Sistema web multi-portal para **gestão de parceiros/revendedores** de uma plataforma SaaS chamada PacoTicket. Permite que a empresa (SuperAdmin) cadastre parceiros, e que parceiros cadastrem seus clientes, acompanhem comissões, gerenciem um funil CRM e gerem propostas comerciais em PDF.

### 1.1 Os Três Portais

| Portal | URL | Usuário |
|---|---|---|
| Login | `/login.html` | Todos |
| SuperAdmin | `/superadmin.html` | Role = `SUPERADMIN` |
| Parceiro | `/partner.html` | Role = `PARTNER` |
| Redefinir senha | `/reset-password.html` | Público (com token) |
| Docs Parceiro | `/docs.html` | Role = `PARTNER` |
| Docs Admin | `/docsadmin.html` | Role = `SUPERADMIN` |

### 1.2 Regra de Negócio Central

- **Planos são 100% internos** — criados no nosso banco, não na API PacoTicket.
- A API PacoTicket é usada **apenas** para:
  1. Criar/atualizar a empresa do cliente na plataforma deles (`POST /api/companies/add`, `PUT /api/companies/:id`)
  2. Listar faturas para sincronização (`GET /api/invoices/listar`)
- **Comissões** são calculadas inteiramente no nosso backend.
- Parceiros **nunca** acessam dados de outros parceiros — o `partnerId` é sempre extraído do JWT, nunca do body da requisição.

---

## 2. Stack Tecnológica (atual — Node.js)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Express.js |
| Banco de Dados | PostgreSQL 15 |
| ORM | Prisma |
| Autenticação | JWT em httpOnly cookies (access 8h + refresh 7d com rotation) |
| Hash de senha | bcrypt (salt rounds: 12) |
| Validação | Zod |
| Rate limiting | express-rate-limit |
| PDF | Gotenberg 8.x via HTTP (container Docker) |
| Email | Nodemailer (SMTP configurável via banco ou .env) |
| Frontend | HTML5 + Tailwind CSS + JavaScript Vanilla ES6+ |
| Orquestração | Docker Swarm |
| Proxy reverso | Nginx + Traefik (TLS automático) |

### Stack Alvo (PHP)

| Camada | Equivalente sugerido |
|---|---|
| Backend | PHP 8.2+ com PDO + PostgreSQL |
| Autenticação | JWT em httpOnly cookies (biblioteca `firebase/php-jwt`) |
| Hash de senha | `password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12])` |
| Validação | Manual ou biblioteca simples |
| Rate limiting | Redis + contadores por IP, ou solução via Nginx |
| PDF | Gotenberg (mesmo serviço, POST HTTP com HTML) |
| Email | PHPMailer ou `mail()` nativo |
| Frontend | Sem mudança — HTML/JS/Tailwind estático |

---

## 3. Banco de Dados — Schema Completo

Banco: `pacoticket_parceiros` (PostgreSQL)

### 3.1 Tabela `User`

```sql
CREATE TABLE "User" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  role           VARCHAR(20) NOT NULL DEFAULT 'PARTNER',  -- 'SUPERADMIN' | 'PARTNER'
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Tabela `RefreshToken`

Armazena o **hash SHA-256** do refresh token (nunca o token em claro). Permite revogar sessões e detectar reutilização de token.

```sql
CREATE TABLE "RefreshToken" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "tokenHash"  VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 hex
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 Tabela `PasswordResetToken`

Token de recuperação de senha — válido por 15 minutos, uso único.

```sql
CREATE TABLE "PasswordResetToken" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "tokenHash"  VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 hex
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "usedAt"     TIMESTAMPTZ,                  -- NULL = não usado
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.4 Tabela `Partner`

```sql
CREATE TABLE "Partner" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"           UUID UNIQUE NOT NULL REFERENCES "User"(id),
  name               VARCHAR(255) NOT NULL,
  phone              VARCHAR(50) NOT NULL,
  document           VARCHAR(50),            -- CPF/CNPJ (opcional)
  status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE' | 'INACTIVE'
  "canSetRecurrence" BOOLEAN NOT NULL DEFAULT false,  -- permissão p/ definir recorrência
  "canSetDueDate"    BOOLEAN NOT NULL DEFAULT false,  -- permissão p/ definir vencimento
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 Tabela `Plan`

Planos são **100% internos**. `ownerId = NULL` = plano global (todos os parceiros); `ownerId = UUID` = plano privado de um parceiro específico.

```sql
CREATE TABLE "Plan" (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            VARCHAR(255) NOT NULL,
  description                     TEXT,
  "basePrice"                     NUMERIC(10,2) NOT NULL,
  "totalPrice"                    NUMERIC(10,2) NOT NULL,  -- preço final calculado
  "setupFee"                      NUMERIC(10,2) NOT NULL DEFAULT 0,
  "sortOrder"                     INT NOT NULL DEFAULT 0,
  "ownerId"                       UUID REFERENCES "Partner"(id),  -- NULL = global
  "basePlanId"                    UUID REFERENCES "Plan"(id),     -- herança de plano global
  users                           INT NOT NULL DEFAULT 1,
  connections                     INT NOT NULL DEFAULT 1,
  queues                          INT NOT NULL DEFAULT 1,
  "connectionsWhatsappUnofficial" INT NOT NULL DEFAULT 0,
  "connectionsWhatsappOfficial"   INT NOT NULL DEFAULT 0,
  "connectionsInstagram"          INT NOT NULL DEFAULT 0,
  "pacoticketPlanId"              INT,  -- referência na plataforma PacoTicket (opcional)
  -- Módulos (booleanos) — 35 no total:
  "useWhatsapp"      BOOLEAN NOT NULL DEFAULT false,
  "useFacebook"      BOOLEAN NOT NULL DEFAULT false,
  "useInstagram"     BOOLEAN NOT NULL DEFAULT false,
  "useCampaigns"     BOOLEAN NOT NULL DEFAULT false,
  "useSchedules"     BOOLEAN NOT NULL DEFAULT false,
  "useInternalChat"  BOOLEAN NOT NULL DEFAULT false,
  "useExternalApi"   BOOLEAN NOT NULL DEFAULT false,
  "useKanban"        BOOLEAN NOT NULL DEFAULT false,
  "usePixel"         BOOLEAN NOT NULL DEFAULT false,
  "usePerfex"        BOOLEAN NOT NULL DEFAULT false,
  "useRD"            BOOLEAN NOT NULL DEFAULT false,
  "useCV"            BOOLEAN NOT NULL DEFAULT false,
  "useIXC"           BOOLEAN NOT NULL DEFAULT false,
  "useAI"            BOOLEAN NOT NULL DEFAULT false,
  "useCHAMA"         BOOLEAN NOT NULL DEFAULT false,
  "useTYPE"          BOOLEAN NOT NULL DEFAULT false,
  "useZAIA"          BOOLEAN NOT NULL DEFAULT false,
  "useGPT"           BOOLEAN NOT NULL DEFAULT false,
  "useGPTA"          BOOLEAN NOT NULL DEFAULT false,
  "useHS"            BOOLEAN NOT NULL DEFAULT false,
  "useNNN"           BOOLEAN NOT NULL DEFAULT false,
  "useHUB"           BOOLEAN NOT NULL DEFAULT false,
  "useCRM"           BOOLEAN NOT NULL DEFAULT false,
  "useFLOW"          BOOLEAN NOT NULL DEFAULT false,
  "useBTN"           BOOLEAN NOT NULL DEFAULT false,
  "useCALL"          BOOLEAN NOT NULL DEFAULT false,
  "useVOIP"          BOOLEAN NOT NULL DEFAULT false,
  "useDIFY"          BOOLEAN NOT NULL DEFAULT false,
  "usePUSH"          BOOLEAN NOT NULL DEFAULT false,
  "useWABAOWN"       BOOLEAN NOT NULL DEFAULT false,
  "useWABAAINI"      BOOLEAN NOT NULL DEFAULT false,
  "useProducts"      BOOLEAN NOT NULL DEFAULT false,
  "useServices"      BOOLEAN NOT NULL DEFAULT false,
  "useWEBCHAT"       BOOLEAN NOT NULL DEFAULT false,
  "useInternal"      BOOLEAN NOT NULL DEFAULT false,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.6 Tabela `ModulePrice`

Preço unitário de cada módulo booleano. Inclui campo `description` para exibição no portal do parceiro.

```sql
CREATE TABLE "ModulePrice" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "moduleKey"  VARCHAR(50) UNIQUE NOT NULL,  -- ex: 'useWhatsapp'
  label        VARCHAR(100) NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  "setupFee"   NUMERIC(10,2) NOT NULL DEFAULT 0,
  "isVisible"  BOOLEAN NOT NULL DEFAULT true,
  description  TEXT,                          -- descrição exibida ao parceiro
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.7 Tabela `ResourcePrice`

Preço por unidade de recursos de infraestrutura (usuário extra, fila extra, conexão extra).

```sql
CREATE TABLE "ResourcePrice" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          VARCHAR(50) UNIQUE NOT NULL,  -- 'user', 'queue', 'whatsappUnofficial', etc.
  label        VARCHAR(100) NOT NULL,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  "setupFee"   NUMERIC(10,2) NOT NULL DEFAULT 0,
  "isVisible"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"  INT NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Chaves padrão: `user`, `queue`, `whatsappUnofficial`, `whatsappOfficial`, `instagram`.

### 3.8 Tabela `PlanAddon`

Override ou desconto (%) de módulo/recurso específico dentro de um plano.

```sql
CREATE TABLE "PlanAddon" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "planId"        UUID NOT NULL REFERENCES "Plan"(id) ON DELETE CASCADE,
  "addonType"     VARCHAR(20) NOT NULL,  -- 'MODULE' | 'RESOURCE'
  key             VARCHAR(50) NOT NULL,
  label           VARCHAR(100) NOT NULL,
  "discountPct"   NUMERIC(5,2) NOT NULL DEFAULT 0,
  "overridePrice" NUMERIC(10,2),          -- NULL = usa o preço do módulo menos o desconto
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("planId", key)
);
```

### 3.9 Tabela `CommissionTier`

Faixas de comissionamento configuráveis. Substituem os valores hardcoded em código.

```sql
CREATE TABLE "CommissionTier" (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(100) NOT NULL,
  "minClients"          INT NOT NULL,
  "maxClients"          INT,              -- NULL = sem limite máximo
  percentage            NUMERIC(5,2) NOT NULL,
  "supportMode"         VARCHAR(50) NOT NULL DEFAULT 'PACOTICKET_DIRECT',
                        -- 'PACOTICKET_DIRECT' | 'PARTNER_INTERMEDIARY'
  notes                 TEXT,
  "durationMonths"      INT NOT NULL DEFAULT 0,  -- 0 = indefinido
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "order"               INT NOT NULL DEFAULT 0,
  "acceptNewClients"    BOOLEAN NOT NULL DEFAULT true,
  "commissionOnSetup"   BOOLEAN NOT NULL DEFAULT false,
  "setupCommissionPct"  NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 0 = usa o % do tier
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Valores padrão (seed):**

| Nome | minClients | maxClients | percentage |
|---|---|---|---|
| Indicador | 1 | 2 | 15% |
| Parceiro | 3 | 9 | 25% |
| Master | 10 | NULL | 35% |

### 3.10 Tabela `Client`

```sql
CREATE TABLE "Client" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"    UUID NOT NULL REFERENCES "Partner"(id),
  "planId"       UUID NOT NULL REFERENCES "Plan"(id),
  "companyName"  VARCHAR(255) NOT NULL,
  "contactName"  VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(50) NOT NULL,
  recurrence     VARCHAR(20) NOT NULL,   -- 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'
  "dueDate"      TIMESTAMPTZ NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  "pacoticketId" VARCHAR(100),           -- ID da empresa na plataforma PacoTicket
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.11 Tabela `ClientAddon`

Addon específico do cliente com quantidade e preço próprios.

```sql
CREATE TABLE "ClientAddon" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId"    UUID NOT NULL REFERENCES "Client"(id) ON DELETE CASCADE,
  "addonType"   VARCHAR(20) NOT NULL,   -- 'MODULE' | 'RESOURCE'
  key           VARCHAR(50) NOT NULL,
  label         VARCHAR(100) NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  "unitPrice"   NUMERIC(10,2) NOT NULL DEFAULT 0,
  "discountPct" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "setupFee"    NUMERIC(10,2) NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.12 Tabela `ClientCommissionRule`

Trava o tier + percentual + configuração de setup **no momento da criação do cliente**. Garante que mudanças de tier não afetem retroativamente clientes já cadastrados.

```sql
CREATE TABLE "ClientCommissionRule" (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId"              UUID UNIQUE NOT NULL REFERENCES "Client"(id) ON DELETE CASCADE,
  "partnerId"             UUID NOT NULL REFERENCES "Partner"(id),
  "tierConfigId"          UUID REFERENCES "CommissionTier"(id),
  "tierName"              VARCHAR(100) NOT NULL,
  percentage              NUMERIC(5,2) NOT NULL,
  "durationMonths"        INT NOT NULL DEFAULT 0,
  "startedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"             TIMESTAMPTZ,            -- NULL = sem expiração
  "commissionOnSetup"     BOOLEAN NOT NULL DEFAULT false,
  "setupCommissionPct"    NUMERIC(5,2) NOT NULL DEFAULT 0,
  "setupFeeAmount"        NUMERIC(10,2) NOT NULL DEFAULT 0,   -- acréscimo comissionável
  "setupCommissionAmount" NUMERIC(10,2) NOT NULL DEFAULT 0,   -- valor calculado
  "frozenAtUpgrade"       BOOLEAN NOT NULL DEFAULT false,     -- congelado ao subir de tier
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Lógica de criação:**
1. Conta clientes ACTIVE do parceiro após criar o novo cliente.
2. Busca o tier correspondente em `CommissionTier`.
3. Calcula `setupCommissionAmount = setupFeeExtra * setupCommissionPct / 100`.
4. `setupFeeExtra` = `plan.setupFee - basePlan.setupFee` (somente o acréscimo do parceiro é comissionável).
5. `expiresAt = now() + durationMonths meses` (ou NULL se 0).

### 3.13 Tabela `Invoice`

```sql
CREATE TABLE "Invoice" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId"      UUID NOT NULL REFERENCES "Client"(id),
  amount          NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  "dueDate"       TIMESTAMPTZ NOT NULL,
  "paidAt"        TIMESTAMPTZ,
  "pacoticketRef" VARCHAR(100) UNIQUE,   -- ID da fatura na API PacoTicket
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.14 Tabela `Commission`

Uma linha por (parceiro × cliente × mês × ano). A constraint unique garante idempotência.

```sql
CREATE TABLE "Commission" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"       UUID NOT NULL REFERENCES "Partner"(id),
  "clientId"        UUID NOT NULL REFERENCES "Client"(id),
  "invoiceId"       UUID,
  "tierConfigId"    UUID REFERENCES "CommissionTier"(id),
  "periodMonth"     INT NOT NULL,
  "periodYear"      INT NOT NULL,
  tier              INT NOT NULL,           -- número do tier (legado)
  percentage        NUMERIC(5,2) NOT NULL,
  "baseAmount"      NUMERIC(10,2) NOT NULL, -- valor da fatura
  "commissionAmount" NUMERIC(10,2) NOT NULL, -- baseAmount * percentage / 100
  "setupCommission" NUMERIC(10,2) NOT NULL DEFAULT 0,  -- comissão sobre setup (1ª vez apenas)
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- 'PENDING' | 'PAID' | 'CANCELLED'
  "paidAt"          TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("partnerId", "clientId", "periodMonth", "periodYear")
);
```

### 3.15 Tabela `ActivityLog`

Log de auditoria de ações no sistema.

```sql
CREATE TABLE "ActivityLog" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"  UUID REFERENCES "Partner"(id),  -- NULL para ações do SuperAdmin
  action       VARCHAR(100) NOT NULL,           -- ex: 'CLIENT_CREATED', 'COMMISSIONS_CALCULATED'
  description  TEXT NOT NULL,
  metadata     JSONB,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.16 Tabela `FunnelStage`

Estágios do funil CRM (personalizados por parceiro). A unique garante que não existam dois estágios com a mesma ordem para o mesmo parceiro.

```sql
CREATE TABLE "FunnelStage" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"  UUID NOT NULL REFERENCES "Partner"(id),
  name         VARCHAR(100) NOT NULL,
  color        VARCHAR(7) NOT NULL DEFAULT '#6366f1',  -- hex
  "order"      INT NOT NULL DEFAULT 0,
  "isDefault"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("partnerId", "order")
);
```

**Estágios criados automaticamente no primeiro acesso:**
`Novo Lead` → `Em Contato` → `Proposta Enviada` → `Negociação` → `Fechado` → `Perdido`

### 3.17 Tabela `Lead`

```sql
CREATE TABLE "Lead" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"  UUID NOT NULL REFERENCES "Partner"(id),
  "stageId"    UUID NOT NULL REFERENCES "FunnelStage"(id),
  "planId"     UUID REFERENCES "Plan"(id),
  name         VARCHAR(255) NOT NULL,
  company      VARCHAR(255),
  email        VARCHAR(255),
  phone        VARCHAR(50),
  notes        TEXT,
  value        NUMERIC(10,2),    -- valor estimado da negociação
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE' | 'WON' | 'LOST'
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.18 Tabela `LeadActivity`

Timeline de atividades e notas por lead.

```sql
CREATE TABLE "LeadActivity" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "leadId"     UUID NOT NULL REFERENCES "Lead"(id) ON DELETE CASCADE,
  "partnerId"  UUID NOT NULL REFERENCES "Partner"(id),
  type         VARCHAR(30) NOT NULL DEFAULT 'NOTE',
               -- 'NOTE' | 'STAGE_CHANGE' | 'PDF_SENT' | 'CALL' | 'EMAIL' | 'WHATSAPP'
  description  TEXT NOT NULL,
  metadata     JSONB,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.19 Tabela `ProposalPdf`

Registro de propostas PDF geradas.

```sql
CREATE TABLE "ProposalPdf" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partnerId"     UUID NOT NULL REFERENCES "Partner"(id),
  "leadId"        UUID REFERENCES "Lead"(id),
  "planName"      VARCHAR(255),
  "proposalCode"  VARCHAR(50),      -- código único, ex: 'KT3RQ_29032026'
  "setupFeeBase"  NUMERIC(10,2),
  "setupFeeExtra" NUMERIC(10,2),
  filename        VARCHAR(255) NOT NULL,
  "filePath"      TEXT NOT NULL,    -- caminho absoluto no servidor
  "htmlHash"      VARCHAR(64),      -- SHA-256 do HTML para deduplicação
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.20 Tabela `SystemConfig`

Configurações globais em chave-valor. Funciona como white-label.

```sql
CREATE TABLE "SystemConfig" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) UNIQUE NOT NULL,
  value       TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Chaves usadas pelo sistema:**

| Chave | Descrição | Padrão |
|---|---|---|
| `businessName` | Nome da empresa/plataforma | `PacoTicket` |
| `appUrl` | URL do sistema (para links de email) | `http://localhost` |
| `logoLogin` | URL da logo na tela de login | NULL |
| `logoInternal` | URL da logo nos painéis | NULL |
| `logoPdf` | URL da logo nas propostas PDF | NULL |
| `favicon` | URL do favicon | NULL |
| `logoLoginWidth` | Largura máx. da logo (px) | `250` |
| `apiBaseUrl` | URL da API PacoTicket | — |
| `colorBrandPrimary` | Cor principal (CSS) | `#1B3FC4` |
| `colorBrandHover` | Cor hover | `#2550E0` |
| `colorBrandMist` | Cor de fundo suave | `#EEF2FF` |
| `colorAccent` | Cor âmbar | `#F59E0B` |
| `colorPartner` | Cor esmeralda | `#10B981` |
| `colorDarkBase` | Fundo escuro base | `#080C18` |
| `webhookPlanSaved` | URL webhook ao salvar plano | NULL |
| `smtpHost` | Servidor SMTP | — |
| `smtpPort` | Porta SMTP | `587` |
| `smtpMode` | `starttls` \| `ssl` \| `none` | `starttls` |
| `smtpUser` | Usuário SMTP | — |
| `smtpPass` | Senha SMTP | — |
| `smtpFrom` | Remetente | — |
| `pdfMarginTop` | Margem superior PDF (mm) | `10` |
| `pdfMarginBottom` | Margem inferior PDF (mm) | `10` |
| `pdfMarginLeft` | Margem esquerda PDF (mm) | `10` |
| `pdfMarginRight` | Margem direita PDF (mm) | `10` |
| `pdfPaddingX` | Padding horizontal conteúdo PDF (px) | `24` |
| `pdfPaddingY` | Padding vertical conteúdo PDF (px) | `20` |

---

## 4. API REST — Endpoints Completos

Base URL: `/api`

Formato de resposta padrão:
```json
{ "success": true, "data": {} }
{ "success": false, "error": "ERROR_CODE", "message": "Mensagem legível" }
```

### 4.1 Autenticação (`/api/auth`)

#### `POST /api/auth/login`
Público. Rate limit: 10 tentativas por IP por 15 minutos.

**Request:**
```json
{ "email": "user@example.com", "password": "senha123" }
```

**Response (200):** Seta cookies `access_token` e `refresh_token` (httpOnly, secure em produção).
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "role": "PARTNER", "partnerId": "uuid", "name": "Nome" }
  }
}
```

**Erros:** `401 INVALID_CREDENTIALS`, `429 TOO_MANY_REQUESTS`

---

#### `POST /api/auth/refresh`
Público. Usa o cookie `refresh_token`.

**Lógica de rotation:**
1. Lê `refresh_token` do cookie.
2. Valida assinatura JWT.
3. Verifica que o hash está na tabela `RefreshToken` (não revogado).
4. Deleta o registro antigo.
5. Cria novo par de tokens e novo registro em `RefreshToken`.
6. Seta novos cookies.

**Response (200):** `{ "success": true, "data": { "message": "Token renovado" } }`

---

#### `GET /api/auth/me`
Requer autenticação. Retorna dados do usuário logado.

**Response:** `{ "id", "email", "role", "partnerId", "name" }`

---

#### `POST /api/auth/logout`
Requer autenticação. Revoga o refresh token e limpa cookies.

---

#### `POST /api/auth/change-password`
Requer autenticação.

**Request:** `{ "currentPassword": "...", "newPassword": "..." }`

**Efeito:** Revoga TODAS as sessões ativas do usuário (força novo login em todos os dispositivos).

---

#### `POST /api/auth/forgot-password`
Público. **Sempre responde 200** (não revela se email existe).

**Request:** `{ "email": "..." }`

**Lógica:**
1. Busca usuário pelo email.
2. Invalida tokens anteriores do mesmo usuário.
3. Gera token aleatório de 32 bytes (`crypto.randomBytes(32).toString('hex')`).
4. Salva o hash SHA-256 em `PasswordResetToken` com expiração de 15 minutos.
5. Lê `appUrl` e `businessName` do `SystemConfig`.
6. Envia email com link: `{appUrl}/reset-password.html?token={rawToken}`

---

#### `POST /api/auth/reset-password`
Público.

**Request:** `{ "token": "...", "newPassword": "..." }`

**Lógica:**
1. Calcula SHA-256 do token recebido.
2. Busca em `PasswordResetToken` pelo hash.
3. Verifica que não foi usado (`usedAt = NULL`) e não expirou.
4. Em transação: marca como usado, atualiza `passwordHash`, revoga todas as sessões.

---

### 4.2 Planos (`/api/plans`)

#### `GET /api/plans`
Requer autenticação (SUPERADMIN ou PARTNER).

- SUPERADMIN: todos os planos (ativos e inativos).
- PARTNER: apenas planos globais ativos (`ownerId = NULL`) + seus próprios planos ativos.

**Response:** Array de planos com `activeModules` (módulos true), `allModules` (mapa booleano), `addons` e `clientCount`.

---

#### `GET /api/plans/:id`
Retorna detalhe completo de um plano incluindo addons.

---

#### `POST /api/plans` (SUPERADMIN)
Cria plano global.

**Request:** `{ name, description, basePrice, totalPrice, setupFee, sortOrder, pacoticketPlanId, users, queues, connectionsWhatsappUnofficial, connectionsWhatsappOfficial, connectionsInstagram, useWhatsapp, ..., addons: [{addonType, key, label, discountPct, overridePrice}] }`

---

#### `PUT /api/plans/:id` (SUPERADMIN)
Atualiza plano. Suporta atualização de addons no mesmo request.

---

#### `DELETE /api/plans/:id` (SUPERADMIN)
Soft delete: seta `isActive = false`.

---

#### `PUT /api/plans/reorder` (SUPERADMIN)
**Request:** `[{ id, sortOrder }]`

---

#### `GET /api/plans/modules/prices`
SUPERADMIN vê todos; PARTNER vê apenas `isVisible = true`.

**Response:** `[{ id, moduleKey, label, price, setupFee, isVisible, description }]`

---

#### `PUT /api/plans/modules/prices` (SUPERADMIN)
Upsert em lote. Aceita array:
```json
[{ "moduleKey": "useWhatsapp", "label": "WhatsApp", "price": 50, "setupFee": 0, "isVisible": true, "description": "..." }]
```

---

#### `DELETE /api/plans/modules/prices/:moduleKey` (SUPERADMIN)
- Se o módulo está em uso em algum plano (`Plan.useXxx = true`): seta `isVisible = false` (oculta).
- Caso contrário: deleta o registro.

**Response:** `{ "hidden": true }` ou `{ "deleted": true }`

---

#### `POST /api/plans/partner` (PARTNER)
Parceiro cria plano próprio baseado em composição de módulos.

**Request:** `{ name, description, basePrice, setupFee, basePlanId, users, queues, connectionsWhatsappUnofficial, connectionsWhatsappOfficial, connectionsInstagram, useWhatsapp, ..., addons }`

**Efeito:** Cria plano com `ownerId = partnerId`. Dispara webhook `webhookPlanSaved` (POST JSON) se configurado.

---

#### `PUT /api/plans/partner/:id` (PARTNER)
Edita plano próprio (verifica `ownerId = partnerId`). Dispara webhook.

---

#### `DELETE /api/plans/partner/:id` (PARTNER)
Soft delete do plano próprio.

---

### 4.3 Parceiros (`/api/partners`)

#### `GET /api/partners` (SUPERADMIN)
Lista todos os parceiros com tier calculado, contagem de clientes ativos e comissão pendente do mês atual.

---

#### `GET /api/partners/:id` (SUPERADMIN)
Detalhe do parceiro com clientes, comissões e tier.

---

#### `POST /api/partners` (SUPERADMIN)
Cria parceiro + usuário vinculado.

**Request:**
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "phone": "11999999999",
  "document": "123.456.789-00",
  "password": "senha123",
  "canSetRecurrence": false,
  "canSetDueDate": false
}
```

---

#### `PUT /api/partners/:id` (SUPERADMIN)
Atualiza dados do parceiro (nome, telefone, documento, status, permissões).

---

#### `DELETE /api/partners/:id` (SUPERADMIN)
Soft delete: seta `Partner.status = 'INACTIVE'` e `User` desativado.

---

#### `GET /api/partners/me/dashboard` (PARTNER)
Dashboard do parceiro logado.

**Response:**
```json
{
  "partner": { "name", "email", "phone", "document", "canSetRecurrence", "canSetDueDate" },
  "tier": { "current", "name", "percentage", "acceptNewClients", "commissionOnSetup", "setupCommissionPct", "durationMonths" },
  "progress": { "activeClients", "nextTierAt", "remaining" },
  "currentMonth": { "commissionTotal", "commissionStatus", "paidInvoices" },
  "nextDue": { "clientName", "dueDate", "amount" }
}
```

---

### 4.4 Clientes (`/api/clients`)

#### `GET /api/clients`
- PARTNER: lista apenas seus clientes (`partnerId = JWT.partnerId`).
- SUPERADMIN: lista todos; suporta filtros `?partnerId=&status=&planId=`.

---

#### `GET /api/clients/:id`
Retorna cliente com plano, addons, regra de comissão e faturas.

---

#### `POST /api/clients`
Cria cliente no banco **e** na API PacoTicket.

**Request:**
```json
{
  "companyName": "Empresa Ltda",
  "contactName": "Fulano",
  "email": "fulano@empresa.com",
  "phone": "11999999999",
  "planId": "uuid",
  "password": "senha-para-pacoticket",
  "recurrence": "MONTHLY",
  "dueDate": "2026-07-01",
  "partnerId": "uuid"  // apenas SUPERADMIN; PARTNER usa o JWT
}
```

**Lógica:**
1. Valida plano ativo.
2. Verifica que o tier do parceiro aceita novos clientes (`acceptNewClients`).
3. Cria `Client` no banco.
4. Cria `ClientCommissionRule` (trava tier + percentual + setup).
5. Chama `POST /api/companies/add` na API PacoTicket; salva `pacoticketId` retornado.
6. Registra em `ActivityLog`.

---

#### `PUT /api/clients/:id`
Atualiza cliente. Se `pacoticketId` existir, espelha alterações de nome/email/telefone/vencimento na API PacoTicket.

---

#### `DELETE /api/clients/:id` (SUPERADMIN)
Soft delete: `status = 'INACTIVE'`.

---

#### `GET /api/clients/:id/addons`
Lista addons do cliente.

#### `POST /api/clients/:id/addons`
Adiciona addon ao cliente.

#### `PUT /api/clients/:id/addons/:addonId`
Edita addon.

#### `DELETE /api/clients/:id/addons/:addonId`
Remove addon.

---

### 4.5 Faturas (`/api/invoices`)

#### `GET /api/invoices`
- PARTNER: apenas faturas de seus clientes.
- SUPERADMIN: todas; suporta `?clientId=&status=&month=&year=`.

---

#### `POST /api/invoices/sync` (SUPERADMIN)
Sincroniza faturas da API PacoTicket.

**Lógica:**
1. Chama `GET /api/invoices/listar` na API PacoTicket.
2. Para cada fatura: encontra o `Client` pelo `pacoticketId`.
3. Faz upsert em `Invoice` pelo `pacoticketRef` (ID da fatura na PacoTicket).

---

### 4.6 Comissões (`/api/commissions`)

#### `GET /api/commissions/summary`
Retorna totais pendente/pago/geral. Suporta `?month=&year=&partnerId=`.

#### `GET /api/commissions`
Lista comissões detalhadas. PARTNER vê apenas as suas.

#### `POST /api/commissions/calculate` (SUPERADMIN)
Calcula comissões para um período.

**Request:** `{ "month": 6, "year": 2026 }`

**Algoritmo:**
1. Busca todos os parceiros ACTIVE com seus clientes ACTIVE e faturas PAID no período.
2. Para cada cliente:
   - Lê `ClientCommissionRule` (regra travada).
   - Se `frozenAtUpgrade = true` ou expirada → pula.
   - Percentual da regra travada tem prioridade sobre o tier atual.
   - Comissão de setup: apenas no PRIMEIRO período e somente se `commissionOnSetup = true`.
3. Faz upsert em `Commission` (idempotente pela constraint unique).

---

#### `PUT /api/commissions/:id/pay` (SUPERADMIN)
Marca comissão como paga (`status = 'PAID'`, `paidAt = now()`).

---

### 4.7 Log de Atividades (`/api/activity-log`)

#### `GET /api/activity-log`
- SUPERADMIN: todas as atividades; `?partnerId=&action=&limit=`.
- PARTNER: apenas suas atividades.

---

### 4.8 Preços de Recursos (`/api/resource-prices`)

#### `GET /api/resource-prices`
Lista preços por unidade de recursos de infraestrutura.

#### `PUT /api/resource-prices` (SUPERADMIN)
Atualiza preços. **Request:** `[{ key, price, setupFee }]`

---

### 4.9 Tiers (`/api/commission-tiers`)

#### `GET /api/commission-tiers` (SUPERADMIN)
#### `POST /api/commission-tiers` (SUPERADMIN)
#### `PUT /api/commission-tiers/:id` (SUPERADMIN)
#### `DELETE /api/commission-tiers/:id` (SUPERADMIN)

CRUD completo dos tiers de comissionamento.

---

### 4.10 Configurações do Sistema (`/api/system-config`)

#### `GET /api/system-config`
**Público.** Retorna configurações de white-label (logo, cores, nome). Exclui chaves SMTP e `apiBaseUrl`.

#### `GET /api/system-config/admin` (SUPERADMIN)
Retorna **todas** as configurações incluindo SMTP.

#### `PUT /api/system-config` (SUPERADMIN)
Salva configurações. Apenas chaves da lista `ALLOWED_KEYS` são aceitas.

#### `POST /api/system-config/smtp-test` (SUPERADMIN)
Testa conexão SMTP. Chama `transporter.verify()` e retorna sucesso ou erro.

---

### 4.11 PDF (`/api/pdf`)

#### `POST /api/pdf/plan` (PARTNER autenticado)
Gera proposta em PDF via Gotenberg.

**Request JSON:**
```json
{
  "html": "<html completo da proposta>",
  "planName": "Plano Starter",
  "leadId": "uuid (opcional)",
  "proposalCode": "KT3RQ_09062026",
  "setupFeeBase": 100.00,
  "setupFeeExtra": 50.00,
  "pdfMarginTop": 10,
  "pdfMarginBottom": 10,
  "pdfMarginLeft": 10,
  "pdfMarginRight": 10
}
```

**Lógica:**
1. Valida parceiro.
2. Verifica lead (se fornecido).
3. Envia HTML para Gotenberg (`POST /forms/chromium/convert/html`) com margens em cm (mm ÷ 10).
4. Salva PDF em disco em `/data/pdfs/{partnerId}/{nome}_{timestamp}.pdf`.
5. Registra em `ProposalPdf` com hash SHA-256 do HTML.
6. Registra atividade no lead (se fornecido).
7. Retorna PDF como `application/pdf` com header `X-Proposal-Id`.

---

#### `GET /api/pdf/proposals` (PARTNER)
Lista PDFs do parceiro.

#### `GET /api/pdf/proposals/all` (SUPERADMIN)
Lista todos os PDFs com `?partnerId=`.

#### `GET /api/pdf/proposals/:id/download`
Download do PDF salvo em disco.

#### `DELETE /api/pdf/proposals/:id`
Remove PDF do banco e do disco.

---

### 4.12 Funil CRM (`/api/funnel`)

Todas as rotas exigem autenticação. O `partnerId` é sempre extraído do JWT.

#### `GET /api/funnel/stages`
Lista estágios. Se nenhum existir, **cria automaticamente** os 6 estágios padrão.

#### `POST /api/funnel/stages`
Cria estágio. Cor validada como hex (#RGB ou #RRGGBB).

#### `PUT /api/funnel/stages/:id`
Edita estágio (nome, cor, ordem).

#### `DELETE /api/funnel/stages/:id`
Remove estágio. Se tiver leads, move para o próximo estágio disponível. Se for o último, retorna erro `LAST_STAGE`.

---

#### `GET /api/funnel/leads`
Lista leads do parceiro. Suporta `?stageId=&status=`.

#### `POST /api/funnel/leads`
Cria lead. Se `stageId` não informado, usa o estágio padrão (`isDefault = true`) ou o primeiro.

#### `GET /api/funnel/leads/:id`
Detalhe com estágio, plano, atividades e propostas.

#### `PUT /api/funnel/leads/:id`
Edita lead. Mudança de `stageId` registra atividade `STAGE_CHANGE` automaticamente.

#### `DELETE /api/funnel/leads/:id`
Remove lead e todas as atividades (CASCADE).

---

#### `GET /api/funnel/leads/:id/activities`
#### `POST /api/funnel/leads/:id/activities`
Tipos: `NOTE`, `STAGE_CHANGE`, `PDF_SENT`, `CALL`, `EMAIL`, `WHATSAPP`.

---

#### `POST /api/funnel/leads/:id/promote` (PARTNER)
Converte lead em cliente.

**Request:** `{ "password": "...", "recurrence": "MONTHLY", "dueDate": "2026-07-01" }`

**Lógica:**
1. Valida que o lead tem email, telefone e plano associado.
2. Verifica tier do parceiro (aceita novos clientes).
3. Cria `Client`, `ClientCommissionRule`.
4. Cria empresa na API PacoTicket.
5. Marca lead como `WON`.
6. Registra atividade e `ActivityLog`.

---

### 4.13 Health Check

#### `GET /api/health`
Público. Retorna `{ "status": "ok" }`.

---

## 5. Autenticação — Fluxo Detalhado

### 5.1 Cookies JWT

| Cookie | Conteúdo | Max-Age | Flags |
|---|---|---|---|
| `access_token` | JWT assinado com `JWT_SECRET` | 8 horas | httpOnly, secure*, sameSite=Strict |
| `refresh_token` | JWT assinado com `JWT_REFRESH_SECRET` | 7 dias | httpOnly, secure*, sameSite=Strict |

*`secure` apenas em `NODE_ENV=production`.

### 5.2 Payload do JWT

```json
{ "userId": "uuid", "role": "PARTNER", "partnerId": "uuid ou null" }
```

### 5.3 Middleware de Autenticação

```
1. Lê cookie access_token (ou header Authorization: Bearer ... para dev)
2. Verifica assinatura e expiração com jsonwebtoken
3. Popula req.user = { userId, role, partnerId }
4. next() ou 401 UNAUTHORIZED
```

### 5.4 Rotation do Refresh Token

A cada uso do refresh token:
1. Token antigo é **deletado** do banco.
2. Novo par (access + refresh) é gerado.
3. Hash do novo refresh token é inserido.
4. **Detecção de reutilização:** se token já foi deletado, ele não existe no banco → 401.

### 5.5 Frontend

O frontend **não lê** os tokens (httpOnly). Apenas:
- `sessionStorage` para dados não sensíveis: `{ role, name }` (lidos após login).
- Chama `POST /api/auth/refresh` automaticamente quando recebe 401 (interceptor).

---

## 6. Lógica de Comissões

### 6.1 Determinação do Tier

```
1. Conta clientes ACTIVE do parceiro
2. Busca CommissionTier no banco (ORDER BY order ASC)
3. Encontra o tier mais alto onde: activeCount >= minClients AND (maxClients IS NULL OR activeCount <= maxClients)
4. Fallback hardcoded se banco vazio: Indicador(1-2, 15%), Parceiro(3-9, 25%), Master(10+, 35%)
```

### 6.2 Regra Travada (ClientCommissionRule)

Criada na ativação do cliente. **Nunca muda** para clientes existentes, a menos que:
- `frozenAtUpgrade = true` → stop de comissão (parceiro subiu de tier, regra antiga congelada).
- `expiresAt` venceu → stop.

### 6.3 Cálculo de Comissão (por período)

```
Para cada parceiro ACTIVE:
  Para cada cliente ACTIVE com fatura PAID no período:
    1. Lê ClientCommissionRule (regra travada tem prioridade)
    2. Se frozenAtUpgrade OU expiresAt < periodStart → pula
    3. commissionAmount = invoiceAmount * percentage / 100
    4. setupCommission:
       - Apenas se commissionOnSetup = true
       - Apenas se nenhuma Commission já existe para esse par (parceiro×cliente) em períodos anteriores
       - Valor: ClientCommissionRule.setupCommissionAmount (calculado na ativação)
    5. Upsert em Commission (idempotente)
```

### 6.4 Comissão sobre Setup

A comissão de setup é calculada **na ativação do cliente**:
```
setupFeeExtra = plan.setupFee - basePlan.setupFee  (apenas o acréscimo do parceiro)
setupPct = tierInfo.setupCommissionPct > 0 ? tierInfo.setupCommissionPct : tierInfo.percentage
setupCommissionAmount = setupFeeExtra * setupPct / 100
```

---

## 7. Integração com a API PacoTicket

### 7.1 Autenticação

Header `Authorization: Bearer {PACOTICKET_BEARER_TOKEN}` (variável de ambiente).

### 7.2 Endpoints Usados

| Operação | Método | URL |
|---|---|---|
| Criar empresa | POST | `/api/companies/add` |
| Atualizar empresa | PUT | `/api/companies/:pacoticketId` |
| Listar faturas | GET | `/api/invoices/listar` |

### 7.3 Payload de Criação de Empresa

```json
{
  "name": "Empresa Ltda",
  "namecomplete": "Nome do Contato",
  "email": "email@empresa.com",
  "phone": "11999999999",
  "pais": "BR",
  "indicator": "partnerId",
  "status": true,
  "dueDate": "2026/07/01",
  "recurrence": "monthly",
  "password": "senha-inicial",
  "planId": 123
}
```

**Retorno:** ID da empresa criada → salvo em `Client.pacoticketId`.

**Importante:** Falha na API PacoTicket não cancela a criação do cliente no banco. O erro é logado e `pacoticketId` fica NULL.

### 7.4 Mapeamento de Recorrência

| Banco | PacoTicket |
|---|---|
| MONTHLY | monthly |
| QUARTERLY | quarterly |
| SEMIANNUAL | semiannual |
| ANNUAL | annual |

---

## 8. Geração de PDF

### 8.1 Serviço Externo — Gotenberg

O PDF é gerado enviando HTML completo para o Gotenberg via `multipart/form-data`:

```
POST http://gotenberg:3000/forms/chromium/convert/html
Content-Type: multipart/form-data

files: index.html (o HTML completo)
marginTop: {pdfMarginTop / 10}cm
marginBottom: {pdfMarginBottom / 10}cm
marginLeft: {pdfMarginLeft / 10}cm
marginRight: {pdfMarginRight / 10}cm
paperWidth: 21cm
preferCssPageSize: true
```

As margens vêm do banco (`SystemConfig`). O frontend envia em mm; o backend converte para cm (divide por 10).

### 8.2 Estrutura do HTML da Proposta

O HTML é gerado inteiramente no frontend (`partner-simulator.js → gerarHtmlProposta()`). Estrutura:

1. **Header**: Logo + "Proposta Comercial" + código + nome do lead
2. **Problema**: Bloco amarelo com bullets de dor
3. **Benefícios**: Grid 2×2 com cards verdes
4. **Âncora de valor**: Banner azul
5. **Infraestrutura incluída**: Cards com ícones (usuários, filas, conexões)
6. **Módulos ativados**: Grid 2 colunas com card por módulo (ícone + nome em destaque + descrição em cinza)
7. **Resumo de preço**: Bloco escuro com valor mensal + setup
8. **CTA**: Call-to-action azul com validade
9. **Footer**: Nome da empresa + data

**CSS relevante:**
- `break-inside: avoid` nos cards para evitar quebra de página no meio do card
- Padding configurável via `pdfPaddingX/Y` (vem do SystemConfig)

### 8.3 Armazenamento

- PDFs salvos em: `/data/pdfs/{partnerId}/{planName}_{timestamp}.pdf`
- Volume Docker: `pdf_data:/data/pdfs`
- Proteção contra path traversal: `path.resolve()` comparado com o diretório base

---

## 9. Email (SMTP)

### 9.1 Configuração

Lida do banco (`SystemConfig`) com fallback para variáveis de ambiente.

### 9.2 Modos de Segurança

| smtpMode | nodemailer config |
|---|---|
| `starttls` (padrão) | `{ secure: false, requireTLS: true }` |
| `ssl` | `{ secure: true }` |
| `none` | `{ ignoreTLS: true }` |

Sempre: `tls: { rejectUnauthorized: false }` (aceita certificados self-signed).

### 9.3 Email de Recuperação de Senha

Enviado pelo `mailer.js`. Contém link válido por 15 minutos apontando para:
`{appUrl}/reset-password.html?token={rawToken}`

O `rawToken` é um hex de 32 bytes aleatórios. Nunca armazenado — apenas o hash SHA-256.

---

## 10. Segurança

| Medida | Implementação |
|---|---|
| Senhas | bcrypt, cost 12 |
| JWT | httpOnly cookies, sameSite=Strict, secure em produção |
| Refresh tokens | Apenas hash SHA-256 no banco, rotation a cada uso |
| Password reset | Token de uso único, expira em 15 min, hash SHA-256 |
| CSRF | sameSite=Strict nos cookies |
| Rate limiting | 10 tentativas/IP/15min no login; 300 req/min global |
| Headers de segurança | X-Content-Type-Options, X-Frame-Options, HSTS |
| Path traversal | `path.resolve()` para validar caminhos de PDF |
| Autorização por parceiro | `partnerId` **sempre** do JWT, nunca do body |
| Enumeração de emails | `/forgot-password` sempre retorna 200 |
| Escaping | HTML escapado nos PDFs para evitar XSS |
| CORS | Restrito a localhost em dev |
| Body limit | 2 MB (cobre HTML de PDF) |

---

## 11. Variáveis de Ambiente

```env
# Banco de Dados
DATABASE_URL="postgresql://user:password@host:5432/pacoticket_parceiros"

# JWT — gere com: openssl rand -hex 64
JWT_SECRET="chave-longa-aleatoria-64-chars"
JWT_EXPIRES_IN="8h"
JWT_REFRESH_SECRET="outra-chave-longa-64-chars"
JWT_REFRESH_EXPIRES_IN="7d"

# API PacoTicket
PACOTICKET_API_URL="https://api.pacoticket.com.br/api"
PACOTICKET_BEARER_TOKEN="token-do-superadmin-pacoticket"

# PDF
GOTENBERG_URL="http://gotenberg:3000"
PDF_STORAGE_PATH="/data/pdfs"

# Servidor
PORT=3000
NODE_ENV=production

# SMTP (fallback — configurável também pelo banco)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_MODE="starttls"
SMTP_USER="email@empresa.com"
SMTP_PASS="senha-app"
SMTP_FROM="PacoTicket <no-reply@empresa.com>"

# URL do sistema (para links de email)
APP_URL="https://parceiros.suaempresa.com.br"
```

---

## 12. Frontend — Estrutura de Arquivos

### 12.1 Páginas HTML

| Arquivo | Descrição |
|---|---|
| `login.html` | Tela de login. Carrega white-label (logo, nome, cores) via GET /api/system-config. |
| `superadmin.html` | SPA do SuperAdmin. Abas: Dashboard, Parceiros, Planos, Clientes, Comissões, Faturas, Propostas, Configurações. |
| `partner.html` | SPA do Parceiro. Abas: Dashboard, Clientes, Comissões, Funil, Propostas, Simulador, Preços. |
| `reset-password.html` | Formulário de redefinição de senha (lê token da URL). |
| `docs.html` | Documentação para parceiros. |
| `docsadmin.html` | Documentação completa para SUPERADMIN. |

### 12.2 JavaScript do SuperAdmin

| Arquivo | Responsabilidade |
|---|---|
| `superadmin.js` | Bootstrap: autenticação, navegação entre abas, white-label. |
| `superadmin-utils.js` | Funções utilitárias compartilhadas (apiRequest, spinnerHTML, showToast, etc.). |
| `superadmin-dashboard.js` | KPIs globais, top performers, log de atividades. |
| `superadmin-parceiros.js` | CRUD de parceiros. |
| `superadmin-planos.js` | CRUD de planos com montador de módulos e cálculo de preço em tempo real. |
| `superadmin-clientes.js` | CRUD de clientes (banco + proxy PacoTicket). |
| `superadmin-comissoes.js` | Calcular, visualizar, marcar pago, exportar CSV. |
| `superadmin-faturas.js` | Sincronizar PacoTicket, visão consolidada. |
| `superadmin-propostas.js` | Visão global de todas as propostas geradas. |
| `superadmin-config.js` | Preços de módulos, preços de recursos, tiers, PDF config, SMTP, white-label, cores. |

### 12.3 JavaScript do Parceiro

| Arquivo | Responsabilidade |
|---|---|
| `partner.js` | Bootstrap + dashboard do parceiro (tier, progresso, comissão do mês). |
| `partner-pricing.js` | Tabela de preços dos planos; modal de criação de plano próprio. |
| `partner-simulator.js` | Simulador de preço; geração de proposta PDF (`gerarHtmlProposta`, `simExportarProposta`). |
| `partner-funnel.js` | Funil CRM kanban: estágios, leads, atividades, conversão para cliente. |

### 12.4 Estilo

| Arquivo | Descrição |
|---|---|
| `tailwind.min.css` | Tailwind CSS compilado (não via CDN). |
| `theme.css` | Variáveis CSS de cor dinâmicas (`:root { --color-brand: ... }`). Sobrescrevem o Tailwind. |
| `fonts.css` | Inter (300/400/500/600/700) auto-hospedada. |

### 12.5 Padrão de Autenticação no Frontend

```javascript
// 1. Tenta sessionStorage (já autenticado)
let raw = sessionStorage.getItem('user');
// 2. Se não houver, chama GET /api/auth/me
if (!raw) {
  const r = await fetch('/api/auth/me', { credentials: 'include' });
  if (r.ok) { const d = await r.json(); sessionStorage.setItem('user', JSON.stringify(d.data)); }
}
// 3. Se não houver usuário: redireciona para login
if (!raw) { window.location.href = 'login.html'; return; }
// 4. Verifica role para páginas restritas
const u = JSON.parse(raw);
if (u.role !== 'SUPERADMIN') { window.location.href = 'partner.html'; }
```

### 12.6 Interceptor de 401

Todas as chamadas de API usam a função `apiRequest()`:
1. Tenta a request original.
2. Se receber 401, chama `POST /api/auth/refresh`.
3. Se refresh ok: repete a request original.
4. Se refresh falhar: limpa `sessionStorage` e redireciona para `login.html`.

---

## 13. Infraestrutura e Deploy

### 13.1 Containers (Docker Swarm)

| Serviço | Imagem | Função |
|---|---|---|
| `backend` | `pacoticket-backend:latest` | API Node.js + Express |
| `frontend` | `pacoticket-frontend:latest` | Nginx (estático + proxy /api) |
| `gotenberg` | `gotenberg/gotenberg:8` | Conversor HTML→PDF via Chromium |
| `backup` | `postgres:15-alpine` | pg_dump diário, retenção 7 dias |

### 13.2 Nginx (Frontend)

O nginx serve arquivos estáticos e faz proxy de `/api/` para o backend:

```nginx
location /api/ {
  proxy_pass http://backend:3000/api/;
}
```

### 13.3 Traefik (HTTPS)

O Traefik gerencia TLS automático via Let's Encrypt. Labels no serviço `frontend`:
- `traefik.http.routers.pacoticket.rule=Host(...)` 
- `traefik.http.routers.pacoticket.tls.certresolver=letsencryptresolver`

### 13.4 Volumes

| Volume | Conteúdo |
|---|---|
| `pdf_data:/data/pdfs` | Propostas PDF geradas |
| `backup_data:/backups` | Backups diários do PostgreSQL |

### 13.5 Seed Inicial

Executado com `node prisma/seed.js`:
1. Cria usuário SuperAdmin (`admin@pacoticket.com.br` / `admin123`)
2. Cria 3 `CommissionTier` padrão (Indicador, Parceiro, Master)
3. Insere 35 `ModulePrice` (skipDuplicates — nunca sobrescreve valores existentes)
4. Insere 5 `ResourcePrice` (skipDuplicates)
5. Insere chaves de `SystemConfig` padrão (upsert com `update: {}` — nunca sobrescreve)
6. Insere chaves de PDF config (`pdfMarginTop/Bottom/Left/Right`, `pdfPaddingX/Y`)

---

## 14. Regras de Negócio Críticas para Reimplementação

1. **`partnerId` do JWT, nunca do body** — toda query que filtra por parceiro deve usar o ID extraído do token, não um parâmetro fornecido pelo cliente.

2. **Planos globais vs. próprios** — `ownerId = NULL` → visível para todos; `ownerId = partnerId` → apenas aquele parceiro.

3. **Comissão travada no momento da ativação** — a `ClientCommissionRule` criada ao ativar o cliente nunca deve ser alterada automaticamente. Apenas `frozenAtUpgrade` pode ser marcado pelo sistema.

4. **Comissão de setup é única** — verificar `Commission.count` em períodos anteriores antes de incluir `setupCommission`.

5. **Sincronização PacoTicket é assíncrona** — falha na API PacoTicket não deve cancelar a criação do cliente no banco. Tratar silenciosamente e logar.

6. **Rotation de refresh token** — cada uso do refresh token deve invalidar o anterior. Um token usado duas vezes indica comprometimento.

7. **Enumeração de email** — `POST /forgot-password` sempre retorna 200, mesmo para emails inexistentes.

8. **Seed idempotente** — o seed nunca deve sobrescrever preços ou configurações existentes. Usar `INSERT ... ON CONFLICT DO NOTHING` ou equivalente.

9. **Estágios do funil** — criados automaticamente no primeiro acesso do parceiro se não existirem.

10. **Margens do PDF** — frontend envia em mm; backend converte para cm (÷ 10) ao chamar Gotenberg.

---

## 15. Checklist de Reimplementação em PHP

### Backend (PHP)
- [ ] Conexão PDO com PostgreSQL
- [ ] Router simples (mapeamento de método+path para controller)
- [ ] Middleware de autenticação JWT (lê cookie `access_token`)
- [ ] Middleware de role (SUPERADMIN / PARTNER)
- [ ] Módulo de JWT (geração e verificação com `firebase/php-jwt`)
- [ ] Hash SHA-256 dos refresh tokens (`hash('sha256', $token)`)
- [ ] bcrypt para senhas (`password_hash`, `password_verify`)
- [ ] Rotation de refresh tokens
- [ ] CORS com `Access-Control-Allow-Credentials: true`
- [ ] httpOnly cookies com `setcookie(..., httponly: true, samesite: 'Strict')`
- [ ] Rate limiting (Redis ou banco)
- [ ] Headers de segurança
- [ ] Todos os endpoints listados na seção 4
- [ ] Serviço de comissões (seção 6)
- [ ] Integração PacoTicket (seção 7)
- [ ] Geração de PDF via Gotenberg (seção 8, POST multipart)
- [ ] Email via PHPMailer (seção 9)
- [ ] Seed com `ON CONFLICT DO NOTHING`

### Frontend
- [ ] Manter HTML/JS/Tailwind existente sem alteração
- [ ] Apenas ajustar `API_BASE` se necessário
- [ ] Nginx continua servindo os arquivos estáticos
- [ ] Proxy `/api/` continua apontando para o novo backend PHP

### Infraestrutura
- [ ] Gotenberg continua como container separado
- [ ] Volume `/data/pdfs` continua montado
- [ ] PostgreSQL inalterado
