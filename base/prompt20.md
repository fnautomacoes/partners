# Plano de Auditoria de Segurança — PacoTicket Sistema de Parceiros

## Contexto do sistema auditado

Stack: Node.js (Express) + PostgreSQL (Prisma) + Nginx + Docker Swarm  
Portais: SuperAdmin e Parceiro (HTML/JS vanilla + Tailwind)  
Autenticação: JWT (access 8h + refresh 7d) em sessionStorage  
Integrações externas: API PacoTicket, Gotenberg (PDF)  
Armazenamento: PDFs em volume local `/data/pdfs`

## Por que auditar agora

O sistema foi construído inteiramente por IA (Claude Code) em sessões incrementais.
Código gerado por IA tem padrões específicos de vulnerabilidade documentados no ESAA-Security:
- Lógica de autorização inconsistente entre rotas
- Validação de input confiando no frontend
- Segredos em variáveis de ambiente mas sem sanitização de logs
- Endpoints criados sem verificação de ownership

---

## Estrutura do plano: 4 fases, 16 domínios, 95 checks

### FASE 1 — Reconhecimento (antes da auditoria)

| Tarefa | O que mapear |
|--------|-------------|
| Inventário da stack | Node 20, Express, Prisma, PostgreSQL 15, Nginx 1.27, Gotenberg 8.x |
| Mapa de arquitetura | Backend container → Postgres externo → Gotenberg interno → Frontend nginx |
| Superfície de ataque | Todas as rotas de API, uploads de logo/PDF, endpoints JWT, webhooks |
| Fluxos de dados sensíveis | Senhas (bcrypt), JWTs (sessionStorage), PDFs com dados de clientes, dados financeiros |

**Rotas críticas a inventariar:**
```
POST /api/auth/login           — credenciais em plain text no body
POST /api/auth/refresh         — troca de tokens
GET  /api/partners/me/dashboard — dados financeiros do parceiro
POST /api/clients              — cria cliente + chama API PacoTicket
POST /api/pdf/plan             — gera PDF + salva em disco
POST /api/funnel/leads         — dados de CRM
PUT  /api/system-config        — altera configurações globais incluindo URLs
GET  /api/plans                — planos (parcialmente público?)
DELETE /api/partners/:id       — soft delete
```

---

### FASE 2 — Auditoria por domínio

#### D01 — Secrets & Configuration (CRÍTICO) [SC-001 → SC-008]

**O que checar no PacoTicket:**
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` nunca aparecem em logs, responses ou erros
- [ ] `PACOTICKET_BEARER_TOKEN` não exposto em nenhum endpoint público
- [ ] `DATABASE_URL` não vaza em stack traces
- [ ] `PDF_STORAGE_PATH` não permite path traversal
- [ ] `GOTENBERG_URL` é URL interna (não pública) — verificar se não está hardcoded em frontend
- [ ] `.env` não está no repositório Git (`.gitignore`)
- [ ] Variáveis de ambiente no `docker-stack.yml` não têm segredos em plain text — usar Docker Secrets
- [ ] `systemConfig.apiBaseUrl` (configurável pelo superadmin) não permite SSRF

#### D02 — Autenticação (CRÍTICO) [AU-001 → AU-008]

**O que checar:**
- [ ] `bcrypt` com salt rounds >= 12 em todas as criações de senha
- [ ] JWT `HS256` — verificar se o secret tem entropia suficiente (>= 64 chars)
- [ ] Refresh token não é reutilizável após uso (falta de blacklist? — risco real)
- [ ] Rate limiting em `POST /api/auth/login` (proteção contra brute force)
- [ ] `sessionStorage` vs `httpOnly cookie` — JWTs em sessionStorage são acessíveis via XSS
- [ ] Verificar se `change-password` exige senha atual antes de trocar
- [ ] Tokens expirados rejeitados corretamente (testar com token expirado manualmente)
- [ ] Logout invalida refresh token no banco (ou é apenas client-side clear?)

#### D03 — Autorização (CRÍTICO) [AZ-001 → AZ-006]

**Padrão de risco específico deste sistema:**
O sistema tem dois roles (`SUPERADMIN`, `PARTNER`) e a regra crítica é:
> "Parceiro sempre filtrado pelo JWT — nunca pelo body"

- [ ] Verificar CADA rota de parceiro: o `partnerId` vem de `req.user.partnerId`, nunca de `req.body`
- [ ] Verificar acesso cruzado: parceiro A não acessa leads/clientes/planos do parceiro B
- [ ] Superadmin não pode ser criado via API pública
- [ ] `PUT /api/plans/:id` — parceiro só edita planos próprios (`plan.ownerId === req.user.partnerId`)
- [ ] `DELETE /api/funnel/leads/:id` — validar ownership antes de deletar
- [ ] `GET /api/funnel/leads` — filtro por `partnerId` sempre presente
- [ ] Rotas de superadmin retornam 403 (não 404) para parceiro autenticado
- [ ] `POST /api/plans/partner` — `ownerId` vem do JWT, não do body

#### D04 — Validação de Input (CRÍTICO) [IV-001 → IV-007]

- [ ] SQL Injection: Prisma usa parameterização — confirmar que não há `$queryRaw` com interpolação
- [ ] Verificar todos os `$queryRaw` e `$executeRaw` no código: cada um precisa de parâmetros posicionais
- [ ] XSS em templates dinâmicos: `innerHTML` com dados do banco/API sem escape
- [ ] Campos de URL (logoLogin, logoInternal, logoPdf, apiBaseUrl): validar que são URLs reais e não `javascript:` ou `data:`
- [ ] `colorBrandPrimary` e outros campos de cor: validar formato hex antes de persistir
- [ ] Campos numéricos (prices, percentages): validar que são números, não NaN ou Infinity
- [ ] `planName` no PDF: sanitizar antes de passar ao Gotenberg para evitar HTML injection no PDF
- [ ] Path traversal em `PDF_STORAGE_PATH`: o `partnerId` no path precisa ser validado como UUID

#### D05 — Segurança de Dados (CRÍTICO) [DA-001 → DA-005]

- [ ] Dados financeiros (comissões, preços) em logs? Verificar `console.log` em controllers
- [ ] PDFs salvos em `/data/pdfs` têm ACL restrita — somente o backend lê, nunca servidos diretamente pelo nginx
- [ ] `passwordHash` nunca retornado em nenhum endpoint (verificar SELECT nos controllers)
- [ ] Dados de `SystemConfig` (`apiBaseUrl`) nunca retornados ao frontend público sem autenticação
- [ ] PII de clientes (email, phone) protegidos em logs

#### D06 — Dependências & Supply Chain (ALTO) [DS-001 → DS-006]

```bash
cd backend && npm audit
cd backend && npx audit-ci --moderate
# Checar versões críticas:
# prisma, express, jsonwebtoken, bcryptjs, node-fetch
```

- [ ] `jsonwebtoken` >= 9.0.0 (correção de vulnerabilidade de algoritmo `none`)
- [ ] `express` >= 4.18.0
- [ ] Sem `eval()`, `Function()`, `vm.runInNewContext()` no código gerado

#### D07 — Segurança de API (ALTO) [AP-001 → AP-007]

- [ ] CORS configurado corretamente — não `origin: *` em produção
- [ ] Rate limiting global no Express (não apenas no login)
- [ ] Helmet.js ou headers de segurança equivalentes
- [ ] `Content-Type: application/json` obrigatório nas rotas POST/PUT
- [ ] Endpoints de saúde (`/api/health`) não expõem versões de dependências
- [ ] Paginação em endpoints de listagem (GET /api/clients, /api/commissions) — sem retornar 10k registros
- [ ] `PUT /api/system-config` exige autenticação SUPERADMIN — verificar que middleware é aplicado

#### D08 — Upload de Arquivos (ALTO) [FU-001 → FU-006]

O sistema não tem upload direto de arquivos (logos são URLs), mas tem geração de PDF:

- [ ] HTML enviado ao Gotenberg via `POST /api/pdf/plan` pode conter conteúdo malicioso — sanitizar antes de passar ao Gotenberg
- [ ] Verificar se o Gotenberg está acessível publicamente (deve ser apenas interno)
- [ ] Tamanho máximo do body da requisição configurado no Express (`express.json({ limit: '1mb' })`)
- [ ] O nome do arquivo PDF gerado (`fileName`) usa UUID/timestamp — nunca input do usuário direto

#### D09 — Segurança de Sessão (ALTO) [SS-001 → SS-006]

- [ ] JWTs em `sessionStorage` — vulnerável a XSS (risco documentado no CLAUDE.md)
- [ ] Considerar migração para `httpOnly` cookies com `SameSite=Strict`
- [ ] Refresh tokens: implementação atual faz apenas client-side clear — sem blacklist no banco
- [ ] Múltiplos tokens simultâneos por usuário são permitidos? (sem limite de sessões)
- [ ] Timeout de sessão inativo além do TTL do JWT (8h sem atividade = sessão ativa)

#### D10 — Criptografia (ALTO) [CR-001 → CR-005]

- [ ] TLS configurado pelo Traefik com Let's Encrypt — verificar `tls.certresolver`
- [ ] HTTPS forçado (redirect HTTP → HTTPS) via Traefik
- [ ] JWTs usam `HS256` — aceitável, mas confirmar que o secret tem >= 256 bits de entropia
- [ ] Senhas armazenadas com bcrypt rounds >= 12 (não MD5, SHA1)
- [ ] Conexão com Postgres usa SSL? (`sslmode=require` no `DATABASE_URL`)

#### D11 — Infraestrutura (ALTO) [IF-001 → IF-006]

- [ ] Containers rodando como usuário não-root (verificar `USER` no Dockerfile)
- [ ] Imagens Docker com versões fixas (não `:latest` em produção)
- [ ] Volume de PDFs não montado com permissão de execução
- [ ] Postgres não exposto na porta 5432 para a rede pública
- [ ] Gotenberg não exposto publicamente (só via rede interna do Swarm)
- [ ] `docker-stack.yml` não tem secrets em plain text

#### D12 — Segurança de IA/LLM (ALTO) [AI-001 → AI-005]

Específico para sistemas que usam LLM ou foram gerados por IA:

- [ ] Prompt injection via campos de texto (ex: `companyName` do lead podendo injetar conteúdo no PDF)
- [ ] O HTML gerado para o Gotenberg inclui dados do usuário — verificar se há escape adequado
- [ ] `businessName` configurado pelo superadmin aparece no PDF — validar que não permite HTML injection
- [ ] Tokens da API PacoTicket não logados
- [ ] Nenhum dado sensível passado para APIs externas além do necessário

#### D13 — Security Headers (MÉDIO) [SH-001 → SH-005]

```bash
curl -I https://parceiros.pacoticket.com.br/
# Checar presença de:
# Content-Security-Policy
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy
```

O Nginx serve arquivos estáticos — os headers precisam estar no `nginx.conf`.

#### D14 — Logging & Monitoramento (MÉDIO) [LM-001 → LM-005]

- [ ] `ActivityLog` registra ações sensíveis (CLIENT_CREATED, COMMISSION_PAID, etc.)
- [ ] Falhas de autenticação logadas (para detecção de brute force)
- [ ] Logs não contêm senhas, tokens ou dados de cartão
- [ ] Stack traces não retornados ao cliente em produção (`NODE_ENV=production`)
- [ ] Sem `console.log` com dados sensíveis em código de produção

#### D15 — DevSecOps (MÉDIO) [DO-001 → DO-006]

- [ ] `.gitignore` inclui `.env`, `*.pem`, `node_modules`
- [ ] Sem segredos no histórico do Git (`git log --all --full-diff -p | grep -i 'password\|secret\|token'`)
- [ ] Dockerfile usa multi-stage build ou pelo menos não instala ferramentas de dev em produção
- [ ] `npm ci` em vez de `npm install` no Dockerfile (build determinístico)
- [ ] Variáveis sensíveis como Docker Secrets, não como environment variables no stack

#### D16 — Segurança de Frontend (MÉDIO) [FE-001 → FE-004]

- [ ] Nenhum `innerHTML` com dados não escapados (XSS armazenado)
- [ ] Links externos com `rel="noopener noreferrer"`
- [ ] Sem `eval()` ou `new Function()` no JS vanilla
- [ ] Dados sensíveis não armazenados em `localStorage` (apenas `sessionStorage`)
- [ ] CSP configurado para bloquear scripts inline não autorizados

---

### FASE 3 — Classificação de risco

Após os 95 checks, classificar cada finding em:

| Severidade | Critério | Prazo de correção |
|------------|----------|-------------------|
| CRÍTICO | CVSS >= 9.0 / RCE / Auth bypass / SQLi | Imediato (< 24h) |
| ALTO | CVSS 7.0–8.9 / XSS armazenado / IDOR / dados expostos | < 7 dias |
| MÉDIO | CVSS 4.0–6.9 / headers faltando / rate limiting ausente | < 30 dias |
| BAIXO | CVSS < 4.0 / boas práticas / melhorias | Backlog |

---

### FASE 4 — Relatório final

Estrutura do relatório:
1. Executive Summary com security score (0–100)
2. Top 5 vulnerabilidades críticas com evidência e remediação
3. Inventário completo de findings por domínio
4. Roadmap de correções priorizado
5. Verificação de checklist de compliance (OWASP Top 10 2021)

---

## Pentest externo (pós-auditoria estática)

Após corrigir os findings da auditoria estática, executar testes dinâmicos:

```bash
# 1. OWASP ZAP scan automatizado
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://parceiros.pacoticket.com.br \
  -r zap-report.html

# 2. Nikto scan de headers e configuração
docker run --rm sullo/nikto -h https://parceiros.pacoticket.com.br

# 3. SSL/TLS quality
docker run --rm drwetter/testssl.sh https://parceiros.pacoticket.com.br

# 4. Teste manual de IDOR (Insecure Direct Object Reference)
# Criar dois parceiros A e B, tentar acessar recursos do B com token do A:
# GET /api/funnel/leads?partnerId=[ID_DO_B]  — deve retornar [] ou 403
# GET /api/clients com token do parceiro A tentando ver clientes do B

# 5. Teste de força bruta no login
# Verificar se após N tentativas há lockout ou rate limit
for i in {1..20}; do
  curl -s -X POST https://parceiros.pacoticket.com.br/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@pacoticket.com.br","password":"wrong'$i'"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))"
done
# Esperado: após 5-10 tentativas, receber 429 Too Many Requests

# 6. Teste de JWT manipulation
# Pegar token válido, decodificar, alterar role para SUPERADMIN, recodificar com secret errado
# Deve retornar 401, nunca 200
```

---

## Top 5 riscos específicos deste sistema (estimativa pré-auditoria)

| # | Risco | Domínio | Probabilidade | Impacto |
|---|-------|---------|--------------|---------|
| 1 | JWTs em sessionStorage → acessíveis via XSS em qualquer `innerHTML` não escapado | D09 + D16 | Alta | Crítico |
| 2 | Refresh tokens sem blacklist → token roubado válido por 7 dias após logout | D02 | Média | Alto |
| 3 | HTML do PDF não sanitizado → HTML injection via `companyName`/`planName` | D12 | Média | Alto |
| 4 | `apiBaseUrl` configurável pelo superadmin → SSRF para rede interna | D01 | Baixa | Crítico |
| 5 | Falta de rate limiting em endpoints além do login → enumeração de leads/clientes | D07 | Alta | Médio |