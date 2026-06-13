# Prompt Inicial — Claude Code
# PacoTicket: Sistema Full Stack de Revendedores
---
## Leitura obrigatória antes de começar
1. `CLAUDE.md` — arquitetura, schema Prisma, APIs, regras de negócio
2. `pacoticket-reseller-skill.md` — algoritmos, contratos detalhados, anti-padrões
3. `superadmin-panel.html` e `superadmin-script.js` — protótipo de referência de UX
---
## Premissas fundamentais (não negociáveis)
**Planos são 100% internos.** Nunca consulte a API PacoTicket para listar, criar ou editar planos. Todo plano vem do banco de dados próprio.
O campo `pacoticketPlanId` no model `Plan` é um número inteiro opcional que o superadmin preenche quando quer registrar a correspondência entre um plano interno e um plano da plataforma PacoTicket. Ele não afeta preços, comissões nem nenhuma regra de negócio — serve apenas para identificação e cruzamento de dados ao sincronizar faturas.
**Dois portais separados, um backend.** SuperAdmin e Revendedor têm HTML/JS distintos. O backend Express serve ambos com controle de acesso por JWT + role.
---
## FASE 1 — Backend: Fundação
### 1.1 Inicializar projeto
```bash
mkdir backend && cd backend
npm init -y
npm install express prisma @prisma/client bcryptjs jsonwebtoken dotenv cors
npm install -D nodemon
npx prisma init
```
`package.json` scripts:
```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "db:migrate": "prisma migrate dev",
  "db:seed": "node prisma/seed.js"
}
```
### 1.2 Schema Prisma
Implementar o schema completo do `CLAUDE.md` (seção "Schema do Banco de Dados"). Nenhum model pode ser omitido. Atenção especial ao model `Plan`:
- Todos os campos `use*` como `Boolean @default(false)`
- `pacoticketPlanId Int?` — inteiro, opcional, sem relação (é só um número de referência)
- `totalPrice` calculado no backend, nunca confiado no frontend
### 1.3 Migrations e Seed
```bash
npx prisma migrate dev --name init
node prisma/seed.js
```
`prisma/seed.js` deve criar:
- 1 usuário SUPERADMIN (`admin@pacoticket.com.br` / `admin123` com bcrypt)
- Todos os 35 módulos na tabela `ModulePrice` com preços iniciais (ver CLAUDE.md seção "Seed Inicial")
### 1.4 Servidor Express
`src/server.js`:
- CORS para `http://localhost` e `http://127.0.0.1`
- `express.json()`
- Prefixo `/api` para todas as rotas
- Handler de erro global: `{ success: false, error: 'INTERNAL_ERROR', message: err.message }`
- Health check: `GET /api/health → { status: 'ok' }`
---
## FASE 2 — Backend: Autenticação
### 2.1 POST /api/auth/login
- Busca `User` por email, compara senha com `bcrypt.compare`
- Gera `accessToken` (8h) e `refreshToken` (7d)
- Payload JWT: `{ userId, role, resellerId }` — `resellerId` é `null` para SUPERADMIN
- Response: `{ success: true, data: { accessToken, refreshToken, user: { id, email, role, resellerId } } }`
### 2.2 POST /api/auth/refresh
Valida `refreshToken`, retorna novo `accessToken`.
### 2.3 GET /api/auth/me
Middleware `requireAuth` → retorna dados do usuário logado.
### 2.4 POST /api/auth/change-password
Body: `{ currentPassword, newPassword }`
Valida senha atual, faz hash da nova, atualiza no banco.
### 2.5 Middlewares
`src/middleware/auth.js` — extrai e valida Bearer token, injeta `req.user = { userId, role, resellerId }`. Retorna 401 se inválido.
`src/middleware/role.js` — `requireRole('SUPERADMIN')` retorna 403 se `req.user.role` não corresponde.
**Teste de conclusão:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}'
# Deve retornar tokens
```
---
## FASE 3 — Backend: Planos
### 3.1 GET /api/plans/modules/prices (SUPERADMIN)
Todos os registros de `ModulePrice`, ordenados por `label`.
### 3.2 PUT /api/plans/modules/prices (SUPERADMIN)
Body: `[{ moduleKey, price }]`
Upsert de cada item. Retornar lista atualizada.
**Não recalcular `totalPrice` de planos existentes** — apenas os novos planos criados após essa alteração usarão os novos preços.
### 3.3 POST /api/plans (SUPERADMIN)
- Receber body com dados do plano e módulos booleanos
- `pacoticketPlanId` é aceito mas **nunca obrigatório** — guardar como está (null se não enviado)
- Calcular `totalPrice = basePrice + SUM(modulePrice dos módulos = true)`
- Salvar e retornar plano com `totalPrice` calculado e `activeModules` listados
### 3.4 GET /api/plans (ambos)
Planos com `isActive = true`. Para cada plano incluir:
- `activeModules`: array de `{ key, label, price }` dos módulos com `true`
- `clientCount`: número de clientes ativos nesse plano
- `pacoticketPlanId`: retornar como está (null ou número)
### 3.5 GET /api/plans/:id (ambos)
Detalhe completo + `allModules` (objeto com todos os campos `use*`).
### 3.6 PUT /api/plans/:id (SUPERADMIN)
Atualizar e recalcular `totalPrice`.
### 3.7 DELETE /api/plans/:id (SUPERADMIN)
Soft delete: `isActive = false`. Retornar erro se o plano tiver clientes ativos vinculados.
---
## FASE 4 — Backend: Revendedores
### 4.1 POST /api/resellers (SUPERADMIN)
Criar `User` (role RESELLER) + `Reseller` em transaction:
```javascript
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 12), role: 'RESELLER' }
  });
  const reseller = await tx.reseller.create({
    data: { userId: user.id, name, phone, document }
  });
  return { user, reseller };
});
```
### 4.2 GET /api/resellers (SUPERADMIN)
Lista com para cada revendedor:
- Contagem de clientes ativos
- Tier calculado (`tier.service.js`)
- Comissão pendente do mês atual
- Progresso para próximo tier
### 4.3 GET /api/resellers/:id (SUPERADMIN)
Detalhe + lista de clientes (com plano e status de fatura) + histórico de comissões agrupado por período.
### 4.4 PUT /api/resellers/:id (SUPERADMIN)
Atualiza dados do `Reseller`. Atualiza `User.email` se fornecido.
### 4.5 DELETE /api/resellers/:id (SUPERADMIN)
Soft delete: `ResellerStatus = INACTIVE`. Não excluir clientes vinculados.
### 4.6 GET /api/resellers/me/dashboard (RESELLER)
Implementar contrato completo da skill (seção 2.5). Dados do revendedor logado via `req.user.resellerId`.
---
## FASE 5 — Backend: Clientes
### 5.1 POST /api/clients
- **SUPERADMIN:** usa `resellerId` do body
- **RESELLER:** usa `req.user.resellerId` — ignorar `resellerId` do body
- Valida que `planId` existe e está ativo no banco
- Salva `Client` no banco
- Busca o `Plan` — se `plan.pacoticketPlanId` existe, inclui no payload da API PacoTicket
- Chama `pacoticket.service.createCompany()` → salva retorno em `Client.pacoticketId`
- `ActivityLog: CLIENT_CREATED`
### 5.2 GET /api/clients
- SUPERADMIN: todos, filtros opcionais `?resellerId=&status=&planId=`
- RESELLER: `WHERE resellerId = req.user.resellerId`
- Incluir: `plan` (com `activeModules`), `reseller.name`, última `Invoice`
### 5.3 PUT /api/clients/:id
- RESELLER só pode atualizar clientes próprios — verificar no controller
- Se `planId` mudar: verificar existência do novo plano
- Se dados que afetam API PacoTicket mudarem: chamar `pacoticket.service.updateCompany()`
### 5.4 DELETE /api/clients/:id (SUPERADMIN)
Soft delete: `status = INACTIVE`.
---
## FASE 6 — Backend: Faturas e Comissões
### 6.1 GET /api/invoices
- SUPERADMIN: todas, filtros `?clientId=&status=&month=&year=`
- RESELLER: apenas de seus clientes
### 6.2 POST /api/invoices/sync (SUPERADMIN)
- Chama `GET /invoices/listar` na API PacoTicket
- Para cada fatura retornada, encontra `Client` pelo `pacoticketId`
- Upsert em `Invoice` pelo `pacoticketRef`
### 6.3 POST /api/commissions/calculate (SUPERADMIN)
Body: `{ month, year }`
Implementar algoritmo completo da skill (seção 3.2).
Retornar resumo: `{ processed, totalAmount, byReseller: [...] }`.
### 6.4 GET /api/commissions
- SUPERADMIN: todas, filtros `?resellerId=&month=&year=&status=`
- RESELLER: apenas as próprias
### 6.5 PUT /api/commissions/:id/pay (SUPERADMIN)
`status = PAID`, `paidAt = new Date()`. `ActivityLog: COMMISSION_PAID`.
### 6.6 GET /api/commissions/summary
Retornar totais de PENDING, PAID e geral para o período filtrado. Filtrado por role igual ao de `/api/commissions`.
---
## FASE 7 — Frontend: Portal SuperAdmin
Adaptar `superadmin-panel.html` e `superadmin-script.js`. Manter o design existente (cores azul, layout de abas), substituir toda lógica de `localStorage` por chamadas ao backend.
### 7.1 Login e Auth (`login.html`)
- Tela única de login para os dois tipos de usuário
- Ao receber response, checar `user.role`:
  - `SUPERADMIN` → redirecionar para `superadmin.html`
  - `RESELLER` → redirecionar para `reseller.html`
- Salvar `access_token`, `refresh_token` e `user` em `sessionStorage`
- Em `superadmin.html` e `reseller.html`, verificar token ao carregar — redirecionar para `login.html` se ausente ou expirado
### 7.2 Helper de requisição
```javascript
const API_BASE = 'http://localhost:3000/api';
async function apiRequest(method, endpoint, body = null) {
  const token = sessionStorage.getItem('access_token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  let res = await fetch(`${API_BASE}${endpoint}`, opts);
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) { redirectToLogin(); return null; }
    return apiRequest(method, endpoint, body);
  }
  return res.json();
}
async function tryRefreshToken() {
  const rt = sessionStorage.getItem('refresh_token');
  if (!rt) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt })
  });
  if (!res.ok) return false;
  const data = await res.json();
  sessionStorage.setItem('access_token', data.data.accessToken);
  return true;
}
```
### 7.3 Aba Planos — Montador de Módulos (feature principal)
- Carregar módulos via `GET /plans/modules/prices` ao abrir o formulário
- Renderizar cada módulo como toggle estilizado (pill com ícone + label + preço)
- Calcular `totalPrice` em tempo real (ver skill seção 4)
- Campo `pacoticketPlanId` como number input com label: **"ID do Plano na PacoTicket"** e texto auxiliar abaixo: *"Opcional. Preencha se este plano corresponde a um plano existente na plataforma PacoTicket. Usado apenas para identificação."*
- Na listagem de planos: exibir badge "PacoTicket #13" se `pacoticketPlanId` preenchido
### 7.4 Aba Revendedores
- CRUD via `/api/resellers`
- Card de detalhe com: tier + barra de progresso, lista de clientes, comissões do mês
### 7.5 Aba Clientes
- CRUD via `/api/clients`
- Dropdown de revendedores: `GET /api/resellers`
- Dropdown de planos: `GET /api/plans` — exibir nome + `totalPrice` + se tem `pacoticketPlanId`
- Ao selecionar plano, mostrar módulos ativos dele
### 7.6 Aba Comissões
- Filtros: mês, ano, revendedor, status
- Botão "Calcular" → `POST /api/commissions/calculate`
- Tabela: revendedor, tier, %, clientes ativos, base, comissão, status, ação
- Botão "Marcar como Pago" por linha
- Exportar CSV
### 7.7 Aba Faturas
- Botão "Sincronizar PacoTicket" → `POST /api/invoices/sync`
- Tabela: cliente, revendedor, plano, valor, vencimento, status, data pagamento
### 7.8 Aba Configurações
- **Preços dos Módulos:** tabela editável com todos os 35 módulos e seus preços
  - Botão "Salvar Preços" → `PUT /api/plans/modules/prices`
  - Aviso visível: *"Alterar preços não recalcula planos já cadastrados. Edite os planos manualmente se necessário."*
- **Token PacoTicket:** exibir que está configurado via variável de ambiente (não editável pelo frontend)
- **Regras de Comissionamento:** exibição somente leitura dos tiers
---
## FASE 8 — Frontend: Portal Revendedor
Criar `reseller.html` e `reseller.js` do zero. Design limpo, simples, mobile-first. O revendedor não precisa de um painel de admin — ele precisa de clareza sobre seus números.
### 8.1 Dashboard
Dados de `GET /api/resellers/me/dashboard`.
Componentes obrigatórios:
- **Card de Tier:** nome do tier atual, percentual de comissão, barra de progresso até o próximo tier, número de clientes atual e quantos faltam
- **4 KPI Cards:** Clientes Ativos | Comissão do Mês | Faturas Pagas | Próximo Vencimento
- Saudação personalizada: "Olá, [Nome]!"
### 8.2 Meus Clientes
Dados de `GET /api/clients`.
Tabela com colunas:
- **Empresa** — `client.companyName`
- **Plano** — `plan.name` + badge "PacoTicket #X" se `pacoticketPlanId` preenchido
- **Módulos** — ícones dos módulos ativos (tooltip com nome) — máximo 5 visíveis, "+N" se mais
- **Valor/mês** — `plan.totalPrice` em BRL
- **Recorrência** — label amigável (Mensal / Trimestral / Semestral / Anual)
- **Vencimento** — data formatada, vermelho se < hoje
- **Status** — badge ATIVO / INATIVO / SUSPENSO
- **Fatura** — badge Pago / Pendente / Vencido / Sem fatura (baseado na última Invoice)
Botão "+ Novo Cliente" → formulário de criação (sem campo de revendedor — vem do JWT).
### 8.3 Minhas Comissões
Dados de `GET /api/commissions?month=X&year=Y`.
Filtros: mês e ano (padrão = mês atual).
Card de resumo: Pendente | Pago | Total do período.
Tabela:
- **Período** — Mês/Ano
- **Cliente** — `client.companyName`
- **Tier** — badge colorido
- **%** — percentual aplicado
- **Base** — `baseAmount` em BRL
- **Comissão** — `commissionAmount` em BRL
- **Status** — badge Pendente / Pago
- **Pago em** — data se `status = PAID`
### 8.4 Meu Perfil
- Exibir: nome, email, telefone, CPF/CNPJ, tier atual
- Formulário de troca de senha: `POST /api/auth/change-password`
---
## Padrões obrigatórios em todo o código
### Backend
```javascript
// Response de sucesso
res.json({ success: true, data: resultado });
// Response de erro
res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Detalhe' });
// Revendedor: sempre filtrar pelo JWT, nunca pelo body
const resellerId = req.user.role === 'RESELLER'
  ? req.user.resellerId
  : req.body.resellerId;
// pacoticketPlanId: sempre opcional
const pacoticketPlanId = body.pacoticketPlanId ?? null;
```
### Frontend
```javascript
// Formatar moeda
const formatCurrency = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
// Formatar data para exibição
const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR');
// Badge de status de fatura
function faturaBadge(invoices) {
  const last = invoices?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!last)                       return badge('Sem fatura', 'gray');
  if (last.status === 'PAID')      return badge('Pago',      'green');
  if (last.status === 'OVERDUE')   return badge('Vencido',   'red');
  return                                  badge('Pendente',  'yellow');
}
```
---
## Estrutura final esperada
```
/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── server.js
│   │   ├── middleware/auth.js
│   │   ├── middleware/role.js
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/commission.service.js
│   │   ├── services/tier.service.js
│   │   ├── services/pacoticket.service.js
│   │   └── utils/
│   ├── .env
│   └── package.json
└── frontend/
    ├── login.html
    ├── superadmin.html
    ├── superadmin.js
    ├── reseller.html
    └── reseller.js
```
---
## Comece agora
Leia os arquivos de referência e inicie pela **Fase 1**. Ao concluir cada fase, liste o que foi implementado e pergunte antes de avançar.