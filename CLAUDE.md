# CLAUDE.md — PacoTicket Parceiros

> Contexto operacional para desenvolvimento do zero.
> **Fonte da verdade:** `handoff.md` — consultar sempre que houver dúvida sobre
> schema, endpoints, regras de negócio, lógica de comissões ou comportamento esperado.

---

## 1. O que estamos construindo

Sistema web multi-portal para **gestão de parceiros** do PacoTicket.
Três portais distintos num único deploy:

| Portal | URL | Role |
|---|---|---|
| Login | `/login.html` | Público |
| SuperAdmin | `/superadmin.html` | `SUPERADMIN` |
| Parceiro | `/partner.html` | `PARTNER` |
| Reset de senha | `/reset-password.html` | Público (com token) |
| Docs Parceiro | `/docs.html` | `PARTNER` |
| Docs Admin | `/docsadmin.html` | `SUPERADMIN` |

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| **Backend** | PHP 8.2+ puro, PDO + PostgreSQL (`pdo_pgsql`) |
| **Autenticação** | JWT em httpOnly cookies — `firebase/php-jwt` |
| **Hash de senha** | `password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12])` |
| **Validação** | Manual — sem framework |
| **Rate limiting** | Redis + contadores por IP |
| **PDF** | Gotenberg 8.x — POST HTTP multipart |
| **Email** | PHPMailer |
| **Frontend** | HTML5 + Tailwind CSS (CDN ou compilado) + JavaScript Vanilla ES6+ |
| **Proxy / TLS** | Nginx (estáticos + proxy `/api/`) + Traefik (Let's Encrypt) |
| **Orquestração** | Docker Swarm |

---

## 3. Banco de dados — regras de ouro

> O banco está **em produção com dados reais**. As regras abaixo são invioláveis.

1. **Nunca alterar schema** — sem `ALTER TABLE`, sem `DROP`, sem renomear colunas.
2. **Nunca truncar tabelas** — nem em scripts de seed ou teste.
3. **Seed é idempotente** — usar `INSERT ... ON CONFLICT DO NOTHING` em todo seed.
4. **Nomes entre aspas duplas** — o schema usa camelCase (convenção Prisma):
   ```sql
   SELECT * FROM "Client" WHERE "partnerId" = $1
   ```
5. **UUIDs gerados pelo banco** — `DEFAULT gen_random_uuid()`. Não gerar no PHP.

O DDL completo de todas as 20 tabelas está nas seções 3.1–3.20 do `handoff.md`.

---

## 4. Estrutura de arquivos

```
/
├── backend/
│   ├── public/
│   │   └── index.php              # Entry point único
│   ├── src/
│   │   ├── Core/
│   │   │   ├── Database.php       # Singleton PDO
│   │   │   ├── Router.php         # Roteador método+path → controller
│   │   │   ├── Request.php        # Body JSON, cookies, query params
│   │   │   ├── Response.php       # json(), cookie(), status codes
│   │   │   └── Middleware.php     # Auth JWT + role check
│   │   ├── Controllers/
│   │   │   ├── AuthController.php
│   │   │   ├── PlanController.php
│   │   │   ├── PartnerController.php
│   │   │   ├── ClientController.php
│   │   │   ├── InvoiceController.php
│   │   │   ├── CommissionController.php
│   │   │   ├── FunnelController.php
│   │   │   ├── PdfController.php
│   │   │   ├── SystemConfigController.php
│   │   │   ├── ActivityLogController.php
│   │   │   └── ResourcePriceController.php
│   │   ├── Services/
│   │   │   ├── JwtService.php
│   │   │   ├── CommissionService.php
│   │   │   ├── PacoTicketApiService.php
│   │   │   ├── GotenbergService.php
│   │   │   ├── MailService.php
│   │   │   └── RateLimiter.php
│   │   └── Helpers/
│   │       ├── Crypto.php         # sha256(), randomHex()
│   │       └── Sanitize.php
│   ├── config/
│   │   └── env.php
│   ├── seed/
│   │   └── seed.php               # Idempotente — ON CONFLICT DO NOTHING
│   ├── composer.json
│   └── Dockerfile
│
├── frontend/
│   ├── login.html
│   ├── superadmin.html
│   ├── partner.html
│   ├── reset-password.html
│   ├── docs.html
│   ├── docsadmin.html
│   ├── js/
│   │   ├── superadmin.js
│   │   ├── superadmin-utils.js
│   │   ├── superadmin-dashboard.js
│   │   ├── superadmin-parceiros.js
│   │   ├── superadmin-planos.js
│   │   ├── superadmin-clientes.js
│   │   ├── superadmin-comissoes.js
│   │   ├── superadmin-faturas.js
│   │   ├── superadmin-propostas.js
│   │   ├── superadmin-config.js
│   │   ├── partner.js
│   │   ├── partner-pricing.js
│   │   ├── partner-simulator.js
│   │   └── partner-funnel.js
│   └── css/
│       ├── theme.css              # Variáveis CSS dinâmicas de cor
│       └── fonts.css              # Inter auto-hospedada
│
└── docker-compose.yml / stack.yml
```

---

## 5. Convenções de código

### 5.1 Entry point e roteamento

```php
// backend/public/index.php
require_once __DIR__ . '/../vendor/autoload.php';

$router = new \Core\Router();

// Auth
$router->post('/api/auth/login',           [\Controllers\AuthController::class, 'login']);
$router->post('/api/auth/refresh',         [\Controllers\AuthController::class, 'refresh']);
$router->get ('/api/auth/me',              [\Controllers\AuthController::class, 'me'],       ['auth']);
$router->post('/api/auth/logout',          [\Controllers\AuthController::class, 'logout'],   ['auth']);
// ... demais rotas

$router->dispatch();
```

O roteador extrai método HTTP + path, aplica middlewares em cadeia, e retorna
`404 JSON` para rotas não registradas.

### 5.2 Contrato de resposta — imutável

Todo endpoint retorna exatamente um destes formatos:

```php
// Sucesso
['success' => true,  'data'    => $payload]

// Erro
['success' => false, 'error'   => 'ERROR_CODE', 'message' => 'Mensagem legível']
```

Nunca desviar desse contrato — o frontend já foi escrito esperando ele.

### 5.3 PDO — padrão de uso

```php
$pdo  = Database::getInstance();
$stmt = $pdo->prepare('SELECT * FROM "Client" WHERE "partnerId" = :pid AND status = :s');
$stmt->execute([':pid' => $partnerId, ':s' => 'ACTIVE']);
$rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
```

### 5.4 Regra de segurança — `partnerId` do JWT, sempre

```php
// CORRETO — extrai do token
$partnerId = $request->user['partnerId'];

// PROIBIDO — nunca do body, nunca de query param
$partnerId = $request->body['partnerId'];   // ← vulnerabilidade crítica
```

---

## 6. Autenticação

### 6.1 Cookies JWT

| Cookie | TTL | Flags |
|---|---|---|
| `access_token` | 8 horas | httpOnly, secure*, sameSite=Strict |
| `refresh_token` | 7 dias | httpOnly, secure*, sameSite=Strict |

*`secure` apenas quando `APP_ENV=production`

### 6.2 Payload do JWT

```json
{ "userId": "uuid", "role": "PARTNER", "partnerId": "uuid|null" }
```

### 6.3 Setar cookie em PHP

```php
setcookie('access_token', $token, [
    'expires'  => time() + 8 * 3600,
    'path'     => '/',
    'httponly' => true,
    'secure'   => (getenv('APP_ENV') === 'production'),
    'samesite' => 'Strict',
]);
```

### 6.4 Rotation do refresh token

1. Lê `refresh_token` do cookie
2. Valida assinatura com `firebase/php-jwt`
3. Calcula `hash('sha256', $rawToken)` e busca na tabela `RefreshToken`
4. **Deleta** o registro antigo (não atualiza — deleta)
5. Gera novo par de tokens
6. Insere `hash('sha256', $newRefreshToken)` em `RefreshToken`
7. Seta novos cookies

**Detecção de reutilização:** hash não encontrado no banco = token comprometido → `401 UNAUTHORIZED`.

### 6.5 Recuperação de senha

- `POST /api/auth/forgot-password` **sempre retorna 200** (nunca revela se email existe)
- Token: `bin2hex(random_bytes(32))` — 64 chars hex
- Armazena: apenas `hash('sha256', $rawToken)` em `PasswordResetToken`
- Expiração: 15 minutos
- Uso único: marcar `usedAt` antes de processar, dentro de transação

---

## 7. Lógica de comissões

> Especificação completa nas seções 6.1–6.4 do `handoff.md`. Implementar exatamente.

### Determinação do tier (executa a cada operação que depende do tier)

```
1. COUNT clientes ACTIVE do parceiro
2. SELECT * FROM "CommissionTier" ORDER BY "order" ASC
3. Tier aplicável = o mais alto onde:
   activeCount >= minClients
   AND (maxClients IS NULL OR activeCount <= maxClients)
4. Fallback hardcoded se tabela vazia:
   Indicador (1–2 clientes, 15%)
   Parceiro  (3–9 clientes, 25%)
   Master    (10+ clientes, 35%)
```

### Regras imutáveis

- `ClientCommissionRule` é criada na ativação do cliente e **jamais alterada automaticamente**
- Comissão de setup: pagar **apenas uma vez** — verificar se já existe `Commission` anterior para o par `(partnerId, clientId)` em qualquer período anterior
- Cálculo de `setupFeeExtra = plan.setupFee - basePlan.setupFee` (só o acréscimo do parceiro é comissionável)
- Upsert de `Commission` é idempotente via constraint `UNIQUE("partnerId", "clientId", "periodMonth", "periodYear")`

---

## 8. Integração PacoTicket

> Payloads completos na seção 7 do `handoff.md`.

**Base:** variável `PACOTICKET_API_URL`
**Auth:** header `Authorization: Bearer {PACOTICKET_BEARER_TOKEN}`

### Tolerância a falha — regra crítica

```
Falha na API PacoTicket NÃO cancela a criação do cliente no banco.
Comportamento correto:
  - Criar o Client normalmente
  - Logar o erro em ActivityLog
  - Deixar Client.pacoticketId = NULL
  - Retornar sucesso ao frontend
```

### Mapeamento de recorrência

```php
const RECURRENCE_MAP = [
    'MONTHLY'    => 'monthly',
    'QUARTERLY'  => 'quarterly',
    'SEMIANNUAL' => 'semiannual',
    'ANNUAL'     => 'annual',
];
```

---

## 9. Geração de PDF (Gotenberg)

```php
// Margens chegam do frontend em mm — converter para cm antes de enviar
$toCmd = fn(float $mm): string => ($mm / 10) . 'cm';

// POST multipart para Gotenberg
POST http://gotenberg:3000/forms/chromium/convert/html

// Campos obrigatórios
index.html      → conteúdo HTML completo da proposta
marginTop       → $toCmd($marginTopMm)
marginBottom    → $toCmd($marginBottomMm)
marginLeft      → $toCmd($marginLeftMm)
marginRight     → $toCmd($marginRightMm)
paperWidth      → 21cm
preferCssPageSize → true
```

**Armazenamento:** `/data/pdfs/{partnerId}/{planName}_{timestamp}.pdf`

**Proteção path traversal obrigatória:**
```php
$resolved = realpath(dirname($targetPath));
if (!str_starts_with($resolved, PDF_STORAGE_PATH)) {
    throw new \RuntimeException('Path traversal detectado');
}
```

---

## 10. Email (PHPMailer)

Configuração lida do banco (`SystemConfig`), com fallback para variáveis de ambiente.

| smtpMode (banco) | PHPMailer |
|---|---|
| `starttls` (padrão) | `SMTPSecure = ''`, `SMTPAutoTLS = true` |
| `ssl` | `SMTPSecure = PHPMailer::ENCRYPTION_SMTPS` |
| `none` | `SMTPAutoTLS = false`, `SMTPSecure = ''` |

Sempre incluir: `SMTPOptions = ['ssl' => ['verify_peer' => false]]`

---

## 11. Frontend — contratos com o backend

O frontend é uma SPA em HTML/JS vanilla. Cada página autentica assim:

```javascript
// 1. Tenta sessionStorage
let user = JSON.parse(sessionStorage.getItem('user') || 'null');

// 2. Se não houver, chama GET /api/auth/me
if (!user) {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) {
        const d = await r.json();
        user = d.data;
        sessionStorage.setItem('user', JSON.stringify(user));
    }
}

// 3. Sem usuário → redireciona
if (!user) { window.location.href = '/login.html'; return; }

// 4. Role errada → redireciona
if (user.role !== 'SUPERADMIN') { window.location.href = '/partner.html'; }
```

**Interceptor de 401:** toda chamada à API usa `apiRequest()` que:
1. Tenta a request original
2. Se `401` → chama `POST /api/auth/refresh`
3. Se refresh ok → repete a original
4. Se refresh falhou → limpa sessionStorage e redireciona para `/login.html`

---

## 12. Variáveis de ambiente

```env
# Banco
DB_HOST=
DB_PORT=5432
DB_NAME=pacoticket_parceiros
DB_USER=
DB_PASS=

# JWT (gerar com: openssl rand -hex 64)
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=28800       # 8h em segundos
JWT_REFRESH_EXPIRES_IN=604800  # 7d em segundos

# API PacoTicket
PACOTICKET_API_URL=
PACOTICKET_BEARER_TOKEN=

# PDF
GOTENBERG_URL=http://gotenberg:3000
PDF_STORAGE_PATH=/data/pdfs

# Email (fallback — configurável também pelo banco)
SMTP_HOST=
SMTP_PORT=587
SMTP_MODE=starttls
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Servidor
APP_ENV=production
APP_URL=

# Redis
REDIS_URL=redis://redis:6379
```

---

## 13. Seed

O seed **não pode alterar dados existentes**. Executar apenas `INSERT ... ON CONFLICT DO NOTHING`.

Itens a setar:
1. Usuário SuperAdmin padrão (se não existir)
2. 3 `CommissionTier` padrão: Indicador (1–2, 15%), Parceiro (3–9, 25%), Master (10+, 35%)
3. 35 `ModulePrice` com preços iniciais
4. 5 `ResourcePrice`: `user`, `queue`, `whatsappUnofficial`, `whatsappOfficial`, `instagram`
5. Chaves de `SystemConfig` padrão (ver tabela na seção 3.20 do `handoff.md`)

---

## 14. Checklist de endpoints

> Especificação completa de cada endpoint (request, response, erros) na seção 4 do `handoff.md`.

### Auth `/api/auth`
- [ ] `POST /login` — rate limit 10/IP/15min
- [ ] `POST /refresh` — rotation completo
- [ ] `GET /me`
- [ ] `POST /logout`
- [ ] `POST /change-password` — revoga **todas** as sessões
- [ ] `POST /forgot-password` — sempre 200
- [ ] `POST /reset-password` — uso único, transação

### Planos `/api/plans`
- [ ] `GET /` — SUPERADMIN: todos; PARTNER: globais ativos + próprios ativos
- [ ] `GET /:id`
- [ ] `POST /` (SUPERADMIN)
- [ ] `PUT /:id` (SUPERADMIN)
- [ ] `DELETE /:id` (SUPERADMIN) — soft delete (`isActive = false`)
- [ ] `PUT /reorder` (SUPERADMIN)
- [ ] `GET /modules/prices`
- [ ] `PUT /modules/prices` (SUPERADMIN) — upsert em lote
- [ ] `DELETE /modules/prices/:moduleKey` (SUPERADMIN) — hide ou delete conforme uso
- [ ] `POST /partner` (PARTNER) — cria plano próprio + dispara webhook
- [ ] `PUT /partner/:id` (PARTNER) + webhook
- [ ] `DELETE /partner/:id` (PARTNER)

### Parceiros `/api/partners`
- [ ] `GET /` (SUPERADMIN) — com tier calculado + clientes ativos + comissão pendente
- [ ] `GET /:id` (SUPERADMIN)
- [ ] `POST /` (SUPERADMIN) — cria `User` + `Partner` vinculado
- [ ] `PUT /:id` (SUPERADMIN)
- [ ] `DELETE /:id` (SUPERADMIN) — soft delete
- [ ] `GET /me/dashboard` (PARTNER)

### Clientes `/api/clients`
- [ ] `GET /`
- [ ] `GET /:id`
- [ ] `POST /` — Client + CommissionRule + PacoTicket (tolerante a falha)
- [ ] `PUT /:id` — espelha na PacoTicket se `pacoticketId` existir
- [ ] `DELETE /:id` (SUPERADMIN) — soft delete
- [ ] `GET /:id/addons`
- [ ] `POST /:id/addons`
- [ ] `PUT /:id/addons/:addonId`
- [ ] `DELETE /:id/addons/:addonId`

### Faturas `/api/invoices`
- [ ] `GET /`
- [ ] `POST /sync` (SUPERADMIN) — upsert via `pacoticketRef`

### Comissões `/api/commissions`
- [ ] `GET /summary`
- [ ] `GET /`
- [ ] `POST /calculate` (SUPERADMIN)
- [ ] `PUT /:id/pay` (SUPERADMIN)

### Funil CRM `/api/funnel`
- [ ] `GET /stages` — cria 6 padrão automaticamente se não existirem
- [ ] `POST /stages`
- [ ] `PUT /stages/:id`
- [ ] `DELETE /stages/:id` — move leads para próximo estágio; erro se for o último
- [ ] `GET /leads`
- [ ] `POST /leads`
- [ ] `GET /leads/:id`
- [ ] `PUT /leads/:id` — mudança de stage registra `STAGE_CHANGE` automaticamente
- [ ] `DELETE /leads/:id`
- [ ] `GET /leads/:id/activities`
- [ ] `POST /leads/:id/activities`
- [ ] `POST /leads/:id/promote` — converte lead em cliente

### PDF `/api/pdf`
- [ ] `POST /plan` (PARTNER) — Gotenberg + disco + registro em `ProposalPdf`
- [ ] `GET /proposals` (PARTNER)
- [ ] `GET /proposals/all` (SUPERADMIN)
- [ ] `GET /proposals/:id/download`
- [ ] `DELETE /proposals/:id`

### Outros
- [ ] `GET/PUT /api/system-config`
- [ ] `GET /api/system-config/admin` (SUPERADMIN)
- [ ] `POST /api/system-config/smtp-test` (SUPERADMIN)
- [ ] `GET /api/activity-log`
- [ ] `GET/PUT /api/resource-prices`
- [ ] CRUD `/api/commission-tiers` (SUPERADMIN)
- [ ] `GET /api/health`

---

## 15. Regras de negócio críticas

> Em caso de dúvida, consultar as seções 6, 7 e 14 do `handoff.md`.

1. **`partnerId` do JWT, nunca do body** — isolamento absoluto entre parceiros
2. **`ownerId = NULL`** = plano global (todos os parceiros); `ownerId = uuid` = plano privado
3. **`ClientCommissionRule` é imutável** após criação — nunca alterar automaticamente
4. **Setup commission é única** — verificar histórico antes de incluir no cálculo
5. **PacoTicket: tolerante a falha** — erro na API externa não cancela operação local
6. **Rotation de refresh token** — reutilização detectada = 401 imediato
7. **`/forgot-password` sempre retorna 200** — anti-enumeração de emails
8. **Seed idempotente** — `ON CONFLICT DO NOTHING` em toda inserção inicial
9. **Estágios do funil** — criados automaticamente no primeiro `GET /funnel/stages` do parceiro
10. **Margens de PDF** — frontend envia mm → dividir por 10 → enviar cm ao Gotenberg

---

*Fonte da verdade: `handoff.md`. Este arquivo é contexto operacional — não substitui a especificação.*
