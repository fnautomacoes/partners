# CLAUDE.md — PacoTicket: Sistema de Parceiros (Full Stack)

## Visao Geral do Projeto

Sistema full stack com **tres portais distintos** e um **backend proprio**:

1. **Portal SuperAdmin** — controle total: parceiros, planos, clientes, comissoes, funil CRM, propostas
2. **Portal Parceiro** — visao individual: dashboard, clientes, comissoes, funil, propostas, simulador de precos
3. **Backend Node.js + PostgreSQL (Prisma)** — fonte de verdade para tudo que a API PacoTicket nao gerencia

A API PacoTicket e usada **apenas** para:
- Criar/atualizar a empresa do cliente na plataforma deles
- Consultar faturas para sincronizacao

**Planos sao 100% internos** — criados, editados e deletados exclusivamente no banco de dados proprio.
O campo `pacoticketPlanId` existe apenas para identificar em qual plano PacoTicket o cliente esta enquadrado,
sem depender da API deles para gestao.

---

## Stack Tecnologica

### Frontend
- HTML5, Tailwind CSS (build local via CLI — `tailwind.min.css`, NAO CDN), JavaScript Vanilla ES6+
- Quatro entry points: `login.html`, `superadmin.html`, `partner.html`, `reset-password.html`
- Sem build step de JS — abre direto no navegador
- Tailwind: `tailwind.config.js` + `tailwind.input.css` compilados para `tailwind.min.css`
- Tema customizavel via `theme.css`

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **Banco de dados:** PostgreSQL 15+
- **ORM:** Prisma
- **Autenticacao:** JWT em httpOnly cookies (access token 8h + refresh token 7d com rotation e blacklist no DB)
- **Hash de senha:** bcrypt (salt rounds: 12)
- **Validacao:** Zod
- **Rate limiting:** express-rate-limit
- **PDF:** Gotenberg 8.x (container Docker) via HTTP
- **Email:** Nodemailer (SMTP configuravel via env)

### Infraestrutura
- **Orquestracao:** Docker Swarm
- **Reverse proxy:** Nginx + Traefik (TLS automatico)
- **PDF storage:** volume `/data/pdfs`

---

## Estrutura de Pastas

```
/
|-- backend/
|   |-- prisma/
|   |   |-- schema.prisma
|   |   `-- migrations/
|   |-- src/
|   |   |-- server.js
|   |   |-- middleware/
|   |   |   |-- auth.js
|   |   |   `-- role.js
|   |   |-- routes/
|   |   |   |-- auth.routes.js
|   |   |   |-- partners.routes.js
|   |   |   |-- plans.routes.js
|   |   |   |-- clients.routes.js
|   |   |   |-- commissions.routes.js
|   |   |   |-- invoices.routes.js
|   |   |   |-- activity.routes.js
|   |   |   |-- resource-prices.routes.js
|   |   |   |-- commission-tiers.routes.js
|   |   |   |-- system-config.routes.js
|   |   |   |-- pdf.routes.js
|   |   |   `-- funnel.routes.js
|   |   |-- controllers/
|   |   |-- services/
|   |   |   |-- commission.service.js
|   |   |   |-- tier.service.js
|   |   |   `-- pacoticket.service.js
|   |   `-- utils/
|   |       |-- jwt.js
|   |       `-- response.js
|   |-- .env
|   `-- package.json
|-- frontend/
|   |-- login.html
|   |-- superadmin.html
|   |-- superadmin.js
|   |-- superadmin-utils.js
|   |-- superadmin-planos.js
|   |-- superadmin-clientes.js
|   |-- superadmin-comissoes.js
|   |-- superadmin-faturas.js
|   |-- superadmin-propostas.js
|   |-- superadmin-parceiros.js
|   |-- superadmin-dashboard.js
|   |-- superadmin-config.js
|   |-- partner.html
|   |-- partner.js
|   |-- partner-pricing.js
|   |-- partner-simulator.js
|   |-- partner-funnel.js
|   |-- reset-password.html
|   |-- tailwind.config.js
|   |-- tailwind.input.css
|   |-- tailwind.min.css
|   `-- theme.css
|-- database/
|   |-- schema.sql
|   |-- seed.sql
|   `-- schema_update_master_v2.sql
`-- CLAUDE.md
```

---

## Schema do Banco de Dados (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// USUARIOS

model User {
  id                  String               @id @default(uuid())
  email               String               @unique
  passwordHash        String
  role                Role                 @default(PARTNER)
  partner             Partner?
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
}

// Hash do refresh token — permite revogar sessoes e detectar reutilizacao
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique  // SHA-256 do token, nunca o token em claro
  expiresAt DateTime
  createdAt DateTime @default(now())
}

// Token de recuperacao de senha — valido por 15 min, uso unico
model PasswordResetToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique  // SHA-256 do token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
}

enum Role {
  SUPERADMIN
  PARTNER
}

// CONFIGURACOES DO SISTEMA

model SystemConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String?
  updatedAt DateTime @updatedAt
}

// PARCEIROS

model Partner {
  id                    String                 @id @default(uuid())
  userId                String                 @unique
  user                  User                   @relation(fields: [userId], references: [id])
  name                  String
  phone                 String
  document              String?
  status                PartnerStatus          @default(ACTIVE)
  canSetRecurrence      Boolean                @default(false)
  canSetDueDate         Boolean                @default(false)
  clients               Client[]
  commissions           Commission[]
  activityLog           ActivityLog[]
  clientCommissionRules ClientCommissionRule[]
  ownedPlans            Plan[]                 @relation("PartnerOwnedPlans")
  funnelStages          FunnelStage[]          @relation("PartnerStages")
  leads                 Lead[]                 @relation("PartnerLeads")
  leadActivities        LeadActivity[]         @relation("PartnerActivities")
  proposals             ProposalPdf[]          @relation("PartnerProposals")
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt
}

enum PartnerStatus {
  ACTIVE
  INACTIVE
}

// PLANOS (100% INTERNOS)
// ownerId null = plano global; uuid = plano proprio do parceiro
// basePlanId null = criado do zero; uuid = herdado de plano global

model Plan {
  id                            String      @id @default(uuid())
  name                          String
  description                   String?
  basePrice                     Decimal     @db.Decimal(10, 2)
  totalPrice                    Decimal     @db.Decimal(10, 2)
  setupFee                      Decimal     @db.Decimal(10, 2) @default(0)
  sortOrder                     Int         @default(0)
  ownerId                       String?
  owner                         Partner?    @relation("PartnerOwnedPlans", fields: [ownerId], references: [id])
  basePlanId                    String?
  basePlan                      Plan?       @relation("PlanInheritance", fields: [basePlanId], references: [id])
  childPlans                    Plan[]      @relation("PlanInheritance")
  users                         Int         @default(1)
  connections                   Int         @default(1)
  queues                        Int         @default(1)
  connectionsWhatsappUnofficial Int         @default(0)
  connectionsWhatsappOfficial   Int         @default(0)
  connectionsInstagram          Int         @default(0)
  pacoticketPlanId              Int?
  useWhatsapp                   Boolean     @default(false)
  useFacebook                   Boolean     @default(false)
  useInstagram                  Boolean     @default(false)
  useCampaigns                  Boolean     @default(false)
  useSchedules                  Boolean     @default(false)
  useInternalChat               Boolean     @default(false)
  useExternalApi                Boolean     @default(false)
  useKanban                     Boolean     @default(false)
  usePixel                      Boolean     @default(false)
  usePerfex                     Boolean     @default(false)
  useRD                         Boolean     @default(false)
  useCV                         Boolean     @default(false)
  useIXC                        Boolean     @default(false)
  useAI                         Boolean     @default(false)
  useCHAMA                      Boolean     @default(false)
  useTYPE                       Boolean     @default(false)
  useZAIA                       Boolean     @default(false)
  useGPT                        Boolean     @default(false)
  useGPTA                       Boolean     @default(false)
  useHS                         Boolean     @default(false)
  useNNN                        Boolean     @default(false)
  useHUB                        Boolean     @default(false)
  useCRM                        Boolean     @default(false)
  useFLOW                       Boolean     @default(false)
  useBTN                        Boolean     @default(false)
  useCALL                       Boolean     @default(false)
  useVOIP                       Boolean     @default(false)
  useDIFY                       Boolean     @default(false)
  usePUSH                       Boolean     @default(false)
  useWABAOWN                    Boolean     @default(false)
  useWABAAINI                   Boolean     @default(false)
  useProducts                   Boolean     @default(false)
  useServices                   Boolean     @default(false)
  useWEBCHAT                    Boolean     @default(false)
  useInternal                   Boolean     @default(false)
  isActive                      Boolean     @default(true)
  clients                       Client[]
  planAddons                    PlanAddon[]
  leads                         Lead[]
  createdAt                     DateTime    @default(now())
  updatedAt                     DateTime    @updatedAt
}

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
  setupFee  Decimal  @db.Decimal(10, 2) @default(0)
  isVisible Boolean  @default(true)
  sortOrder Int      @default(0)
  updatedAt DateTime @updatedAt
}

// PLAN ADDONS (descontos/overrides por item em um plano)

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

  @@unique([planId, key])
}

// TIERS DE COMISSIONAMENTO (configuraveis)

model CommissionTier {
  id                    String                 @id @default(uuid())
  name                  String
  minClients            Int
  maxClients            Int?
  percentage            Decimal                @db.Decimal(5, 2)
  supportMode           String                 @default("PACOTICKET_DIRECT")
  notes                 String?
  durationMonths        Int                    @default(0)
  isActive              Boolean                @default(true)
  order                 Int                    @default(0)
  acceptNewClients      Boolean                @default(true)
  commissionOnSetup     Boolean                @default(false)
  setupCommissionPct    Decimal                @db.Decimal(5, 2) @default(0)
  commissions           Commission[]
  clientCommissionRules ClientCommissionRule[]
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt
}

// CLIENTES

model Client {
  id               String                @id @default(uuid())
  partnerId        String
  partner          Partner               @relation(fields: [partnerId], references: [id])
  planId           String
  plan             Plan                  @relation(fields: [planId], references: [id])
  companyName      String
  contactName      String
  email            String
  phone            String
  recurrence       Recurrence
  dueDate          DateTime
  status           ClientStatus          @default(ACTIVE)
  pacoticketId     String?
  invoices         Invoice[]
  commissions      Commission[]
  addons           ClientAddon[]
  commissionRule   ClientCommissionRule?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt
}

// CLIENT ADDONS

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

// REGRA DE COMISSAO TRAVADA POR CLIENTE

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
  startedAt             DateTime        @default(now())
  expiresAt             DateTime?
  commissionOnSetup     Boolean         @default(false)
  setupCommissionPct    Decimal         @db.Decimal(5, 2) @default(0)
  setupFeeAmount        Decimal         @db.Decimal(10, 2) @default(0)
  setupCommissionAmount Decimal         @db.Decimal(10, 2) @default(0)
  frozenAtUpgrade       Boolean         @default(false)
  createdAt             DateTime        @default(now())
}

enum ClientStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum Recurrence {
  MONTHLY
  QUARTERLY
  SEMIANNUAL
  ANNUAL
}

// FATURAS

model Invoice {
  id            String        @id @default(uuid())
  clientId      String
  client        Client        @relation(fields: [clientId], references: [id])
  amount        Decimal       @db.Decimal(10, 2)
  status        InvoiceStatus @default(PENDING)
  dueDate       DateTime
  paidAt        DateTime?
  pacoticketRef String?       @unique
  createdAt     DateTime      @default(now())
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}

// COMISSOES

model Commission {
  id               String           @id @default(uuid())
  partnerId        String
  partner          Partner          @relation(fields: [partnerId], references: [id])
  clientId         String
  client           Client           @relation(fields: [clientId], references: [id])
  invoiceId        String?
  tierConfigId     String?
  tierConfig       CommissionTier?  @relation(fields: [tierConfigId], references: [id])
  periodMonth      Int
  periodYear       Int
  tier             Int
  percentage       Decimal          @db.Decimal(5, 2)
  baseAmount       Decimal          @db.Decimal(10, 2)
  commissionAmount Decimal          @db.Decimal(10, 2)
  setupCommission  Decimal          @db.Decimal(10, 2) @default(0)
  status           CommissionStatus @default(PENDING)
  paidAt           DateTime?
  createdAt        DateTime         @default(now())

  @@unique([partnerId, clientId, periodMonth, periodYear])
}

enum CommissionStatus {
  PENDING
  PAID
  CANCELLED
}

// LOG DE ATIVIDADES

model ActivityLog {
  id          String   @id @default(uuid())
  partnerId   String?
  partner     Partner? @relation(fields: [partnerId], references: [id])
  action      String
  description String
  metadata    Json?
  createdAt   DateTime @default(now())
}

// FUNIL CRM

model FunnelStage {
  id        String   @id @default(uuid())
  partnerId String
  partner   Partner  @relation("PartnerStages", fields: [partnerId], references: [id])
  name      String
  color     String   @default("#6366f1")
  order     Int      @default(0)
  isDefault Boolean  @default(false)
  leads     Lead[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([partnerId, order])
}

model Lead {
  id          String        @id @default(uuid())
  partnerId   String
  partner     Partner       @relation("PartnerLeads", fields: [partnerId], references: [id])
  stageId     String
  stage       FunnelStage   @relation(fields: [stageId], references: [id])
  planId      String?
  plan        Plan?         @relation(fields: [planId], references: [id])
  name        String
  company     String?
  email       String?
  phone       String?
  notes       String?
  value       Decimal?      @db.Decimal(10, 2)
  status      LeadStatus    @default(ACTIVE)
  activities  LeadActivity[]
  proposals   ProposalPdf[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

enum LeadStatus {
  ACTIVE
  WON
  LOST
}

model LeadActivity {
  id          String   @id @default(uuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  partnerId   String
  partner     Partner  @relation("PartnerActivities", fields: [partnerId], references: [id])
  type        String   // NOTE | STAGE_CHANGE | PDF_SENT | CALL | EMAIL | WHATSAPP
  description String
  metadata    Json?
  createdAt   DateTime @default(now())
}

model ProposalPdf {
  id            String   @id @default(uuid())
  partnerId     String
  partner       Partner  @relation("PartnerProposals", fields: [partnerId], references: [id])
  leadId        String?
  lead          Lead?    @relation(fields: [leadId], references: [id])
  planName      String?
  proposalCode  String?   // ex: "KT3RQ_29032026"
  setupFeeBase  Decimal? @db.Decimal(10, 2)
  setupFeeExtra Decimal? @db.Decimal(10, 2)
  filename      String
  filePath      String
  htmlHash      String?
  createdAt     DateTime @default(now())
}
```

---

## Regras de Negocio

### Planos (100% Internos)

- Criados, editados e desativados exclusivamente pelo SuperAdmin (ou parceiro para planos proprios)
- `totalPrice = basePrice` — o campo armazena o preco final calculado pelo backend na criacao/edicao
- `setupFee` — taxa de implantacao cobrada uma unica vez na ativacao do cliente
- `ownerId` null = plano global visivel para todos; uuid = plano proprio de um parceiro especifico
- `basePlanId` — quando o parceiro cria um plano a partir de um global, registra o ID de origem (heranca)
- `sortOrder` — ordem de exibicao na listagem
- `connectionsWhatsappUnofficial`, `connectionsWhatsappOfficial`, `connectionsInstagram` — contadores de conexao por tipo
- `pacoticketPlanId` — campo inteiro opcional apenas para identificacao na plataforma PacoTicket; sem impacto nas regras de negocio

### Precos de Modulos e Recursos

- **ModulePrice** — preco unitario de cada modulo booleano (`useWhatsapp` etc.). Campos: `price`, `setupFee`, `isVisible`
- **ResourcePrice** — preco de infraestrutura por unidade adicional (user, queue, whatsappUnofficial, whatsappOfficial, instagram). Campos: `price`, `setupFee`, `isVisible`, `sortOrder`
- **PlanAddon** — override ou desconto (%) de modulo/recurso especifico dentro de um plano
- **ClientAddon** — addon especifico do cliente com `quantity`, `unitPrice`, `discountPct`, `setupFee`

### Comissoes e Tiers

**Tiers sao configuraveis via tabela `CommissionTier`** (nao hardcoded):

| Campo | Descricao |
|---|---|
| `minClients` / `maxClients` | Faixa de clientes ACTIVE |
| `percentage` | Percentual base de comissao |
| `durationMonths` | 0 = indefinido; N = expira apos N meses |
| `acceptNewClients` | false = tier congelado (nao aceita novas adicoes) |
| `commissionOnSetup` | Gera comissao sobre setupFee? |
| `setupCommissionPct` | 0 = usa mesmo % do tier |

O servico `tier.service.js` busca o tier correto do banco via `getTierForPartner()`.

**ClientCommissionRule** — trava o tier+percentual+setup no momento da criacao do cliente:
- `frozenAtUpgrade`: true quando o parceiro sobe de tier mas a regra anterior ainda esta dentro da duracao
- `expiresAt`: calculado como `startedAt + durationMonths`
- `setupFeeAmount` + `setupCommissionAmount`: valores congelados do setup na criacao

**Commission** — uma linha por (parceiro, cliente, mes, ano):
- `setupCommission`: valor de comissao sobre setup; preenchido apenas no primeiro periodo
- `tierConfigId`: referencia ao CommissionTier usado no calculo

### Autenticacao

- JWT armazenado em **httpOnly cookies** (nao sessionStorage/localStorage para o token)
- Refresh token com **rotation**: cada uso gera novo par access+refresh; token antigo e revogado
- **Blacklist de refresh tokens** no banco via tabela `RefreshToken` (hash SHA-256)
- **PasswordResetToken** — uso unico, expira em 15 minutos, hash SHA-256; envio por email via Nodemailer
- `sessionStorage` usado apenas para dados de UI nao sensiveis: `{ role, name }`

### Autorizacao

- `partnerId` extraido sempre do JWT no backend — nunca do body da requisicao
- Parceiro so acessa seus proprios clientes, comissoes, funil e propostas
- SuperAdmin acessa tudo

### White-label (SystemConfig)

- Tabela chave-valor com configuracoes globais: `businessName`, `logoLogin`, `logoInternal`, `logoPdf`,
  `favicon`, cores primarias/secundarias, `apiBaseUrl`, `pdfStoragePath`
- Lida via `/api/system-config`

---

## APIs do Backend

Base URL: `http://localhost:3000/api`

### Autenticacao
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/auth/login` | POST | publico | Login — seta httpOnly cookies |
| `/auth/refresh` | POST | publico | Renova access token (rotation) |
| `/auth/me` | GET | qualquer | Dados do usuario logado |
| `/auth/logout` | POST | qualquer | Revoga refresh token |
| `/auth/change-password` | POST | qualquer | Altera senha |
| `/auth/forgot-password` | POST | publico | Envia email de recuperacao |
| `/auth/reset-password` | POST | publico | Redefine senha com token |

### Planos
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/plans` | GET | ambos | Listar planos ativos |
| `/plans/:id` | GET | ambos | Detalhe do plano |
| `/plans` | POST | superadmin | Criar plano |
| `/plans/:id` | PUT | superadmin | Editar plano |
| `/plans/:id` | DELETE | superadmin | Soft delete |
| `/plans/modules/prices` | GET | superadmin | Ver precos dos modulos |
| `/plans/modules/prices` | PUT | superadmin | Atualizar precos dos modulos |

### Parceiros
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/partners` | GET | superadmin | Listar com tier calculado |
| `/partners/:id` | GET | superadmin | Detalhe + clientes + comissoes |
| `/partners` | POST | superadmin | Criar parceiro + user |
| `/partners/:id` | PUT | superadmin | Atualizar |
| `/partners/:id` | DELETE | superadmin | Soft delete |
| `/partners/me/dashboard` | GET | partner | Dashboard do parceiro logado |

### Clientes
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/clients` | GET | ambos* | Listar (superadmin=todos; partner=seus) |
| `/clients/:id` | GET | ambos* | Detalhe |
| `/clients` | POST | ambos | Criar (DB + API PacoTicket) |
| `/clients/:id` | PUT | ambos* | Atualizar |
| `/clients/:id` | DELETE | superadmin | Soft delete |

### Faturas e Comissoes
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/invoices` | GET | ambos* | Listar faturas |
| `/invoices/sync` | POST | superadmin | Sincronizar da API PacoTicket |
| `/commissions` | GET | ambos* | Listar comissoes |
| `/commissions/calculate` | POST | superadmin | Calcular comissoes do periodo |
| `/commissions/:id/pay` | PUT | superadmin | Marcar como paga |
| `/commissions/summary` | GET | ambos* | Resumo do periodo |

### Outros
| Endpoint | Metodo | Acesso | Descricao |
|---|---|---|---|
| `/activity-log` | GET | ambos* | Log de atividades |
| `/resource-prices` | GET | ambos | Precos de recursos |
| `/resource-prices` | PUT | superadmin | Atualizar precos de recursos |
| `/commission-tiers` | GET | superadmin | Listar tiers |
| `/commission-tiers` | POST | superadmin | Criar tier |
| `/commission-tiers/:id` | PUT | superadmin | Editar tier |
| `/commission-tiers/:id` | DELETE | superadmin | Deletar tier |
| `/system-config` | GET | ambos | Ler configs white-label |
| `/system-config` | PUT | superadmin | Atualizar configs |
| `/pdf` | POST | partner | Gerar proposta PDF via Gotenberg |
| `/pdf/:id` | GET | ambos* | Baixar/visualizar PDF |
| `/funnel/stages` | GET | partner | Listar estagios do funil |
| `/funnel/stages` | POST | partner | Criar estagio |
| `/funnel/stages/:id` | PUT | partner | Editar estagio |
| `/funnel/stages/:id` | DELETE | partner | Deletar estagio |
| `/funnel/leads` | GET | partner | Listar leads |
| `/funnel/leads` | POST | partner | Criar lead |
| `/funnel/leads/:id` | PUT | partner | Editar lead |
| `/funnel/leads/:id` | DELETE | partner | Deletar lead |
| `/funnel/leads/:id/activities` | GET | partner | Atividades do lead |
| `/funnel/leads/:id/activities` | POST | partner | Registrar atividade |
| `/health` | GET | publico | Health check |

*Parceiro filtrado pelo `partnerId` do JWT — nunca pelo body.

---

## Portais Frontend

### `superadmin.html` + `superadmin*.js`
1. **Dashboard** (`superadmin-dashboard.js`) — KPIs globais, tiers, top performers, log de atividades
2. **Parceiros** (`superadmin-parceiros.js`) — CRUD completo de parceiros
3. **Planos** (`superadmin-planos.js`) — CRUD com montador de modulos, precos em tempo real, setupFee
4. **Clientes** (`superadmin-clientes.js`) — CRUD (banco + proxy PacoTicket)
5. **Comissoes** (`superadmin-comissoes.js`) — calcular, visualizar, marcar pago, exportar CSV
6. **Faturas** (`superadmin-faturas.js`) — sincronizar PacoTicket, visao consolidada
7. **Propostas** (`superadmin-propostas.js`) — visao global de propostas geradas
8. **Configuracoes** (`superadmin-config.js`) — precos de modulos, precos de recursos, tiers, white-label, token PacoTicket

### `partner.html` + `partner*.js`
1. **Dashboard** (`partner.js`) — tier, progresso, comissao do mes, clientes ativos
2. **Meus Clientes** — tabela com plano, valor, vencimento, status
3. **Minhas Comissoes** — tabela por periodo com valores e status
4. **Funil CRM** (`partner-funnel.js`) — kanban de leads com estagios customizaveis
5. **Propostas** — gerar e listar propostas PDF para leads
6. **Simulador** (`partner-simulator.js`) — simular preco de plano para prospect
7. **Precos** (`partner-pricing.js`) — tabela de precos dos planos disponiveis

### `reset-password.html`
- Formulario publico para redefinicao de senha via token de email

---

## Variaveis de Ambiente (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/pacoticket_resellers"
JWT_SECRET="chave-secreta-longa"
JWT_EXPIRES_IN="8h"
JWT_REFRESH_SECRET="outra-chave-para-refresh"
JWT_REFRESH_EXPIRES_IN="7d"
PACOTICKET_API_URL="https://api.pacoticket.com.br/api"
PACOTICKET_BEARER_TOKEN="token-do-superadmin-pacoticket"
PORT=3000
NODE_ENV=development
GOTENBERG_URL="http://gotenberg:3000"
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="user@example.com"
SMTP_PASS="smtp-password"
SMTP_FROM="no-reply@pacoticket.com.br"
```

---

## Convencoes de Codigo

### Backend
- Controllers finos — logica de negocio nos services
- Response padrao: `{ success: true, data: {} }` ou `{ success: false, error: 'CODE', message: '' }`
- `partnerId` extraido sempre do JWT — nunca do body da requisicao
- Validacao de entrada com Zod nos controllers
- Rate limiting em todas as rotas publicas

### Frontend
- `API_BASE = 'http://localhost:3000/api'` no topo de cada `.js`
- JWT em **httpOnly cookies** (gerenciado pelo browser)
- `sessionStorage` apenas para dados de UI nao sensiveis: `{ role, name }`
- Funcoes em camelCase portugues: `loadClientes()`, `renderDashboard()`
- Datas exibidas em `dd/mm/yyyy`, enviadas ao backend em ISO 8601

---

## Seed Inicial (SQL)

```sql
-- 1. SuperAdmin
INSERT INTO "User" (id, email, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'admin@pacoticket.com.br',
  crypt('admin123', gen_salt('bf', 12)),
  'SUPERADMIN',
  now(), now()
) ON CONFLICT (email) DO NOTHING;

-- 2. CommissionTier
INSERT INTO "CommissionTier" (id, name, "minClients", "maxClients", percentage, "order", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'Indicador', 1, 2,  15.00, 1, true, now(), now()),
  (gen_random_uuid(), 'Parceiro',  3, 9,  25.00, 2, true, now(), now()),
  (gen_random_uuid(), 'Master',   10, NULL, 35.00, 3, true, now(), now())
ON CONFLICT DO NOTHING;

-- 3. ModulePrice (35 modulos)
INSERT INTO "ModulePrice" ("moduleKey", label, price, "setupFee", "isVisible", "updatedAt") VALUES
  ('useWhatsapp',     'WhatsApp',               50,  0, true, now()),
  ('useFacebook',     'Facebook',               30,  0, true, now()),
  ('useInstagram',    'Instagram',              30,  0, true, now()),
  ('useCampaigns',    'Campanhas',              40,  0, true, now()),
  ('useSchedules',    'Agendamentos',           25,  0, true, now()),
  ('useInternalChat', 'Chat Interno',           20,  0, true, now()),
  ('useExternalApi',  'API Externa',            60,  0, true, now()),
  ('useKanban',       'Kanban',                 25,  0, true, now()),
  ('usePixel',        'Pixel',                  20,  0, true, now()),
  ('usePerfex',       'Perfex',                 35,  0, true, now()),
  ('useRD',           'RD Station',             45,  0, true, now()),
  ('useCV',           'CV CRM',                 40,  0, true, now()),
  ('useIXC',          'IXC Soft',               40,  0, true, now()),
  ('useAI',           'Inteligencia Artificial', 80, 0, true, now()),
  ('useCHAMA',        'Chama',                  30,  0, true, now()),
  ('useTYPE',         'Typebot',                30,  0, true, now()),
  ('useZAIA',         'Zaia',                   35,  0, true, now()),
  ('useGPT',          'ChatGPT',                50,  0, true, now()),
  ('useGPTA',         'GPT Avancado',           70,  0, true, now()),
  ('useHS',           'HubSpot',                45,  0, true, now()),
  ('useNNN',          'NNN',                    30,  0, true, now()),
  ('useHUB',          'Hub de Integracoes',     50,  0, true, now()),
  ('useCRM',          'CRM',                    50,  0, true, now()),
  ('useFLOW',         'Flow Builder',           40,  0, true, now()),
  ('useBTN',          'Botoes Rapidos',         20,  0, true, now()),
  ('useCALL',         'Chamadas',               35,  0, true, now()),
  ('useVOIP',         'VoIP',                   70,  0, true, now()),
  ('useDIFY',         'Dify AI',                55,  0, true, now()),
  ('usePUSH',         'Push Notifications',     25,  0, true, now()),
  ('useWABAOWN',      'WABA Proprio',           60,  0, true, now()),
  ('useWABAAINI',     'WABA Ainini',            60,  0, true, now()),
  ('useProducts',     'Produtos',               25,  0, true, now()),
  ('useServices',     'Servicos',               25,  0, true, now()),
  ('useWEBCHAT',      'Web Chat',               30,  0, true, now()),
  ('useInternal',     'Uso Interno',            20,  0, true, now())
ON CONFLICT ("moduleKey") DO UPDATE SET
  price = EXCLUDED.price,
  "setupFee" = EXCLUDED."setupFee",
  "isVisible" = EXCLUDED."isVisible",
  "updatedAt" = now();

-- 4. ResourcePrice (5 recursos)
INSERT INTO "ResourcePrice" (id, key, label, price, "setupFee", "isVisible", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'user',                   'Usuario Adicional',          0, 0, true, 1, now()),
  (gen_random_uuid(), 'queue',                  'Fila Adicional',             0, 0, true, 2, now()),
  (gen_random_uuid(), 'whatsappUnofficial',     'WhatsApp Nao Oficial',       0, 0, true, 3, now()),
  (gen_random_uuid(), 'whatsappOfficial',       'WhatsApp Oficial (WABA)',    0, 0, true, 4, now()),
  (gen_random_uuid(), 'instagram',              'Conexao Instagram',          0, 0, true, 5, now())
ON CONFLICT (key) DO NOTHING;

-- 5. SystemConfig
INSERT INTO "SystemConfig" (id, key, value, "updatedAt") VALUES
  (gen_random_uuid(), 'businessName',    'PacoTicket',           now()),
  (gen_random_uuid(), 'logoLogin',       NULL,                   now()),
  (gen_random_uuid(), 'logoInternal',    NULL,                   now()),
  (gen_random_uuid(), 'logoPdf',         NULL,                   now()),
  (gen_random_uuid(), 'favicon',         NULL,                   now()),
  (gen_random_uuid(), 'colorPrimary',    '#6366f1',              now()),
  (gen_random_uuid(), 'colorSecondary',  '#4f46e5',              now()),
  (gen_random_uuid(), 'colorAccent',     '#818cf8',              now()),
  (gen_random_uuid(), 'apiBaseUrl',      'http://localhost:3000/api', now()),
  (gen_random_uuid(), 'pdfStoragePath',  '/data/pdfs',           now())
ON CONFLICT (key) DO NOTHING;
```

---

## Limitacoes Conhecidas

| Situacao | Decisao |
|---|---|
| PacoTicket nao tem entidade "parceiro" | Gerenciado 100% no nosso DB |
| Planos PacoTicket nao sao usados diretamente | Planos sao 100% internos; `pacoticketPlanId` e so referencia |
| PacoTicket nao calcula comissoes | Engine de calculo no nosso backend |
| Sem webhook de pagamento no PacoTicket | Sincronizacao manual via botao |
| Token PacoTicket nao e exposto ao frontend | Proxy via backend usando variavel de ambiente |
| PDF gerado por Gotenberg (container externo) | Gotenberg deve estar rodando; fallback: erro 503 |
| Reset de senha via email | Requer SMTP configurado; sem SMTP o link nao e enviado |
