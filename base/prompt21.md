# Auditoria de Segurança — ESAA-Security Framework (95 checks, 16 domínios)

## Missão

Execute uma auditoria de segurança completa do sistema PacoTicket Sistema de Parceiros usando o framework ESAA-Security do repositório https://github.com/elzobrito/esaa-security.

O sistema foi inteiramente construído por IA (Claude Code) em sessões incrementais — código gerado por IA tem padrões específicos de vulnerabilidade que este framework foi projetado para detectar.

---

## ETAPA 0 — Preparação

### 0.1 — Clonar o framework de auditoria

```bash
cd /tmp
git clone https://github.com/elzobrito/esaa-security esaa-security
ls esaa-security/
```

### 0.2 — Mapear o repositório auditado

```bash
# Confirmar estrutura do projeto
ls /home/user/parceiros/
ls /home/user/parceiros/backend/src/routes/
ls /home/user/parceiros/frontend/*.js
ls /home/user/parceiros/frontend/*.html

# Contar linhas de código total
find /home/user/parceiros -name "*.js" -not -path "*/node_modules/*" | xargs wc -l | tail -1
find /home/user/parceiros -name "*.html" | xargs wc -l | tail -1
```

### 0.3 — Ler o playbook de auditoria

```bash
cat /tmp/esaa-security/playbooks/playbooks.security.json | python3 -m json.tool | head -100
```

---

## ETAPA 1 — Reconhecimento

Antes de qualquer check, mapeie o terreno. Produza um relatório em `/tmp/audit/phase1/`.

```bash
mkdir -p /tmp/audit/phase1 /tmp/audit/phase2 /tmp/audit/phase3 /tmp/audit/phase4
```

### 1.1 — Inventário da stack

```bash
# Versões de dependências
cat /home/user/parceiros/backend/package.json | python3 -c "
import sys, json
pkg = json.load(sys.stdin)
print('=== DEPENDENCIES ===')
for k, v in pkg.get('dependencies', {}).items(): print(f'  {k}: {v}')
print('=== DEV DEPENDENCIES ===')
for k, v in pkg.get('devDependencies', {}).items(): print(f'  {k}: {v}')
"

# Versão do Node no Dockerfile
grep -n "FROM\|node\|NODE" /home/user/parceiros/backend/Dockerfile

# Prisma schema — tabelas e relações
grep -n "^model\|^enum" /home/user/parceiros/backend/prisma/schema.prisma
```

### 1.2 — Mapa de todas as rotas de API

```bash
# Listar todos os endpoints registrados
grep -rn "router\.\(get\|post\|put\|delete\|patch\)" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" \
  | sed 's|.*routes/||' | sort
```

### 1.3 — Mapa de middlewares de autenticação e autorização

```bash
# Verificar onde requireAuth e requireRole são aplicados
grep -rn "requireAuth\|requireRole\|SUPERADMIN\|PARTNER" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" \
  | head -60

# Verificar rotas SEM middleware de auth (potencialmente públicas)
grep -n "router\." /home/user/parceiros/backend/src/routes/system-config.routes.js
grep -n "router\." /home/user/parceiros/backend/src/routes/plans.routes.js
grep -n "router\." /home/user/parceiros/backend/src/routes/auth.routes.js
```

### 1.4 — Superfície de ataque

```bash
# Endpoints que recebem dados do usuário (POST/PUT)
grep -rn "req\.body\|req\.params\|req\.query" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | wc -l

# Endpoints que escrevem em disco
grep -rn "fs\.\|writeFile\|mkdir\|path\.join" \
  /home/user/parceiros/backend/src/ \
  --include="*.js"

# Chamadas a APIs externas
grep -rn "fetch\|axios\|http\.get\|https\.get" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | grep -v "node_modules"
```

Salve o inventário:
```bash
# Escrever relatório de reconhecimento
cat > /tmp/audit/phase1/reconnaissance.md << 'EOF'
# Reconhecimento — [preencher com os resultados acima]
EOF
```

---

## ETAPA 2 — Auditoria por domínio (95 checks)

Para cada domínio, execute os checks, registre evidências e classifique o resultado.

**Formato de cada finding:**
```json
{
  "check_id": "SC-001",
  "status": "PASS|FAIL|WARN|SKIP",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
  "evidence": "trecho de código ou output de comando",
  "file": "caminho/do/arquivo.js",
  "line": 42,
  "remediation": "como corrigir"
}
```

---

### D01 — Secrets & Configuration [SC-001 → SC-008]

```bash
echo "=== SC-001: Secrets no código fonte ==="
grep -rn "secret\|password\|token\|api_key\|apikey\|bearer" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" \
  | grep -iv "process\.env\|req\.\|res\.\|bcrypt\|//\|hash\|Header\|Authorization" \
  | head -20

echo "=== SC-002: .env no git ==="
cat /home/user/parceiros/.gitignore | grep -E "\.env|secret"
git -C /home/user/parceiros log --all --oneline -- "*.env" 2>/dev/null | head -5

echo "=== SC-003: Secrets no docker-stack.yml ==="
grep -n "JWT_SECRET\|PACOTICKET\|DATABASE_URL\|password" \
  /home/user/parceiros/docker-stack.yml

echo "=== SC-004: apiBaseUrl — risco de SSRF ==="
grep -rn "apiBaseUrl\|PACOTICKET_API_URL\|fetch.*config\|fetch.*cfg" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -15

echo "=== SC-005: Path traversal em PDF_STORAGE_PATH ==="
grep -n "PDF_STORAGE_PATH\|storageBase\|path\.join\|partnerDir" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js

echo "=== SC-006: Segredos em logs ==="
grep -rn "console\.log.*token\|console\.log.*password\|console\.log.*secret\|console\.log.*key" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== SC-007: GOTENBERG_URL — exposta? ==="
grep -rn "GOTENBERG_URL\|gotenberg" \
  /home/user/parceiros/frontend/ 2>/dev/null
grep -n "GOTENBERG" /home/user/parceiros/docker-stack.yml

echo "=== SC-008: DATABASE_URL em stack traces ==="
grep -rn "catch.*e\|catch.*err\|catch.*error" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | grep "message\|stack" | head -10
```

---

### D02 — Autenticação [AU-001 → AU-008]

```bash
echo "=== AU-001: bcrypt salt rounds ==="
grep -rn "bcrypt\|saltRounds\|hash(" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== AU-002: JWT algorithm e secret strength ==="
grep -rn "sign\|verify\|jwt" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | grep -v "//\|node_modules" | head -15

echo "=== AU-003: Refresh token blacklist ==="
grep -rn "blacklist\|invalidate\|revoke\|refreshToken" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -15
# RISCO: se não há blacklist, tokens roubados são válidos por 7 dias após logout

echo "=== AU-004: Rate limiting no login ==="
grep -rn "rateLimit\|rate-limit\|express-rate\|limiter" \
  /home/user/parceiros/backend/src/ \
  --include="*.js"
grep -n "rateLimit\|rate" /home/user/parceiros/backend/package.json

echo "=== AU-005: change-password exige senha atual ==="
grep -n -A 20 "change-password\|changePassword" \
  /home/user/parceiros/backend/src/routes/auth.routes.js | head -30

echo "=== AU-006: Tokens expirados rejeitados ==="
grep -rn "verify\|TokenExpired\|expiresIn" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== AU-007: Logout invalida no banco ==="
grep -n -A 10 "logout\|POST.*logout" \
  /home/user/parceiros/backend/src/routes/auth.routes.js | head -20

echo "=== AU-008: sessionStorage vs httpOnly cookie ==="
grep -rn "sessionStorage\|localStorage\|cookie" \
  /home/user/parceiros/frontend/*.js \
  /home/user/parceiros/frontend/*.html 2>/dev/null | head -15
```

---

### D03 — Autorização [AZ-001 → AZ-006]

```bash
echo "=== AZ-001: partnerId do JWT, nunca do body ==="
grep -rn "req\.body.*partner\|partnerId.*body\|body.*partnerId" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | head -15
# CRÍTICO: qualquer ocorrência que não seja comentário é vulnerabilidade

echo "=== AZ-002: Acesso cruzado entre parceiros — leads ==="
grep -n "partnerId\|where.*partner" \
  /home/user/parceiros/backend/src/routes/funnel.routes.js | head -20

echo "=== AZ-003: Verificação de ownership em planos de parceiro ==="
grep -n -A 5 "ownerId\|plan\.ownerId\|partnerId.*plan" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -30

echo "=== AZ-004: Superadmin não criável via API ==="
grep -n "SUPERADMIN\|role.*SUPERADMIN" \
  /home/user/parceiros/backend/src/routes/auth.routes.js \
  /home/user/parceiros/backend/src/routes/partners.routes.js 2>/dev/null | head -10

echo "=== AZ-005: Rotas de superadmin retornam 403 para parceiro ==="
grep -rn "requireRole\|SUPERADMIN" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | head -20

echo "=== AZ-006: Verificação em DELETE e operações destrutivas ==="
grep -rn "\.delete\b\|DELETE" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | grep -v "//\|prisma\." | head -15
```

---

### D04 — Validação de Input [IV-001 → IV-007]

```bash
echo "=== IV-001: SQL Injection via $queryRaw ==="
grep -rn '\$queryRaw\|\$executeRaw' \
  /home/user/parceiros/backend/src/ \
  --include="*.js"
# Se encontrar: verificar se usa template literals com variáveis (CRÍTICO) ou parâmetros posicionais (OK)

echo "=== IV-002: XSS em innerHTML ==="
grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|document\.write" \
  /home/user/parceiros/frontend/*.js 2>/dev/null | wc -l
echo "Ocorrências de innerHTML (verificar se dados do servidor são inseridos sem escape):"
grep -rn "innerHTML" /home/user/parceiros/frontend/*.js 2>/dev/null | grep -v "spinnerHTML\|emptyHTML\|=\s*\`" | head -20

echo "=== IV-003: Validação de URLs (SSRF via configurações) ==="
grep -rn "logoLogin\|logoInternal\|logoPdf\|apiBaseUrl" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js | head -20
# Verificar se há validação de URL antes de persistir

echo "=== IV-004: HTML injection no PDF via dados do usuário ==="
grep -n "companyName\|planName\|businessName\|contactName" \
  /home/user/parceiros/frontend/partner-simulator.js | grep "html\|HTML\|innerHTML\|template\|\`" | head -20

echo "=== IV-005: Validação de tipos numéricos ==="
grep -rn "Number(\|parseInt(\|parseFloat(" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | head -20
# Verificar se há isNaN() ou validação de range

echo "=== IV-006: Path traversal via partnerId no PDF ==="
grep -n "partnerId\|path\.join\|partnerDir" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js

echo "=== IV-007: Content-Type validation ==="
grep -rn "req\.headers.*content-type\|Content-Type\|express\.json" \
  /home/user/parceiros/backend/src/server.js | head -10
```

---

### D05 — Segurança de Dados [DA-001 → DA-005]

```bash
echo "=== DA-001: passwordHash nunca retornado ==="
grep -rn "passwordHash\|password_hash" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | grep -v "data:\|where:\|//\|bcrypt" | head -10
# Verificar se algum SELECT inclui passwordHash no response

echo "=== DA-002: Dados financeiros em logs ==="
grep -rn "console\.log\|console\.error" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | grep -i "commission\|price\|amount\|salary" | head -10

echo "=== DA-003: PDFs não servidos diretamente pelo nginx ==="
grep -n "location\|/data/pdfs\|pdf\|static" \
  /home/user/parceiros/frontend/nginx.conf

echo "=== DA-004: SystemConfig não expõe apiBaseUrl ao público ==="
grep -n -A 15 "router\.get.*'/'" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js | head -25
# Verificar se delete config.apiBaseUrl ou equivalente está no GET público

echo "=== DA-005: PII em logs ==="
grep -rn "console\.log.*email\|console\.log.*phone\|console\.log.*cpf\|console\.log.*cnpj" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10
```

---

### D06 — Dependências [DS-001 → DS-006]

```bash
echo "=== DS-001: npm audit ==="
cd /home/user/parceiros/backend && npm audit --json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
vulns = data.get('vulnerabilities', {})
critical = sum(1 for v in vulns.values() if v.get('severity') == 'critical')
high     = sum(1 for v in vulns.values() if v.get('severity') == 'high')
print(f'Critical: {critical}, High: {high}, Total: {len(vulns)}')
for name, v in list(vulns.items())[:10]:
    print(f'  {name}: {v.get(\"severity\")} — {v.get(\"via\",[\"\"])[0] if v.get(\"via\") else \"\"}'[:100])
" 2>/dev/null || echo "npm audit não disponível no ambiente"

echo "=== DS-002: jsonwebtoken versão segura ==="
grep '"jsonwebtoken"' /home/user/parceiros/backend/package.json
# Deve ser >= 9.0.0

echo "=== DS-003: eval() e Function() no código ==="
grep -rn '\beval(\|\bnew Function(' \
  /home/user/parceiros/backend/src/ \
  /home/user/parceiros/frontend/ \
  --include="*.js" 2>/dev/null | grep -v "//\|node_modules"

echo "=== DS-004: Versões fixas no Dockerfile ==="
grep "FROM\|npm install" /home/user/parceiros/backend/Dockerfile
grep "FROM" /home/user/parceiros/frontend/Dockerfile
# Verificar se usa :latest (risco) ou versão fixada
```

---

### D07 — Segurança de API [AP-001 → AP-007]

```bash
echo "=== AP-001: CORS configuration ==="
grep -n "cors\|origin\|CORS" /home/user/parceiros/backend/src/server.js | head -10
# origin: '*' em produção é CRÍTICO

echo "=== AP-002: Rate limiting global ==="
grep -rn "rateLimit\|express-rate-limit\|slowDown" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== AP-003: Security headers (Helmet.js) ==="
grep -n "helmet\|Helmet\|X-Frame\|Content-Security\|nosniff" \
  /home/user/parceiros/backend/src/server.js \
  /home/user/parceiros/frontend/nginx.conf 2>/dev/null | head -15

echo "=== AP-004: Body size limit ==="
grep -n "json.*limit\|limit.*json\|bodyParser\|urlencoded" \
  /home/user/parceiros/backend/src/server.js

echo "=== AP-005: Health endpoint não expõe versões ==="
grep -n -A 10 "health\|/health\|/api/health" \
  /home/user/parceiros/backend/src/server.js | head -15

echo "=== AP-006: Paginação em listagens ==="
grep -rn "findMany\|findAll" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | grep -v "where\|take\|limit\|skip\|pagina" | head -15
# findMany sem take/limit pode retornar todos os registros

echo "=== AP-007: PUT /api/system-config autenticado ==="
grep -n -B 5 "system-config\|PUT.*config" \
  /home/user/parceiros/backend/src/routes/system-config.routes.js | head -20
```

---

### D08 — Upload/Geração de Arquivos [FU-001 → FU-006]

```bash
echo "=== FU-001: HTML ao Gotenberg sanitizado ==="
# Verificar se dados do usuário no HTML do PDF são escapados
grep -n "companyName\|planName\|businessName\|nome\|contact" \
  /home/user/parceiros/frontend/partner-simulator.js \
  | grep "html\|HTML\|proposta\|gerarHtml" | head -20

echo "=== FU-002: Gotenberg acessível publicamente? ==="
grep -n "gotenberg\|GOTENBERG\|traefik.*gotenberg\|pdf\." \
  /home/user/parceiros/docker-stack.yml | head -10

echo "=== FU-003: Body size limit para PDF HTML ==="
grep -n "limit\|json.*mb\|mb.*json" \
  /home/user/parceiros/backend/src/server.js \
  /home/user/parceiros/backend/src/routes/pdf.routes.js 2>/dev/null | head -5

echo "=== FU-004: Validar que fileName nunca usa input do usuário direto ==="
grep -n "fileName\|safeName\|download.*filename\|Content-Disposition" \
  /home/user/parceiros/backend/src/routes/pdf.routes.js | head -10

echo "=== FU-005: Volume /data/pdfs sem execução ==="
grep -n "pdf_data\|/data/pdfs\|volume" \
  /home/user/parceiros/docker-stack.yml | head -10

echo "=== FU-006: Gotenberg URL é interna ==="
grep -rn "GOTENBERG_URL\|gotenberg\|http.*gotenberg" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10
```

---

### D09 — Segurança de Sessão [SS-001 → SS-006]

```bash
echo "=== SS-001: sessionStorage (vulnerável a XSS) ==="
grep -rn "sessionStorage\.setItem\|sessionStorage\.getItem" \
  /home/user/parceiros/frontend/*.js \
  /home/user/parceiros/frontend/*.html 2>/dev/null | grep -v "//\|#" | head -15

echo "=== SS-002: Refresh token sem blacklist ==="
grep -rn "refreshToken\|refresh_token\|blacklist\|invalidate" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -15
# Se logout apenas faz sessionStorage.clear() sem invalidar no banco = RISCO

echo "=== SS-003: Múltiplas sessões simultâneas ==="
grep -rn "session.*limit\|concurrent\|active.*token\|token.*active" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -5

echo "=== SS-004: SameSite / httpOnly cookies ==="
grep -rn "cookie\|SameSite\|httpOnly\|secure.*cookie" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -5
# Se não usa cookies: registrar como risco informacional (sessionStorage é a alternativa)
```

---

### D10 — Criptografia [CR-001 → CR-005]

```bash
echo "=== CR-001: TLS no Traefik ==="
grep -n "certresolver\|tls\|websecure\|HTTPS\|letsencrypt" \
  /home/user/parceiros/docker-stack.yml | head -15

echo "=== CR-002: HTTP → HTTPS redirect ==="
grep -n "websecure\|redirect.*https\|entrypoints.*web\b" \
  /home/user/parceiros/docker-stack.yml | head -10

echo "=== CR-003: JWT secret entropia ==="
# Verificar no .env se JWT_SECRET tem >= 64 chars (256 bits)
grep -n "JWT_SECRET\|JWT_REFRESH" /home/user/parceiros/backend/.env 2>/dev/null || \
  echo "Verificar manualmente: JWT_SECRET deve ter >= 64 caracteres aleatórios"

echo "=== CR-004: bcrypt rounds ==="
grep -rn "bcrypt\|saltRound\|genSalt\|hash(" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | grep -v "//" | head -10

echo "=== CR-005: PostgreSQL SSL ==="
grep -n "sslmode\|ssl\|DATABASE_URL" \
  /home/user/parceiros/backend/.env 2>/dev/null || \
  echo "Verificar se DATABASE_URL inclui ?sslmode=require"
```

---

### D11 — Infraestrutura [IF-001 → IF-006]

```bash
echo "=== IF-001: Container não-root ==="
grep -n "USER\|user\|adduser\|addgroup" \
  /home/user/parceiros/backend/Dockerfile \
  /home/user/parceiros/frontend/Dockerfile

echo "=== IF-002: Imagens com versão fixada ==="
head -3 /home/user/parceiros/backend/Dockerfile
head -3 /home/user/parceiros/frontend/Dockerfile

echo "=== IF-003: Postgres exposto? ==="
grep -n "5432\|postgres.*port\|port.*5432" \
  /home/user/parceiros/docker-stack.yml

echo "=== IF-004: Gotenberg exposto publicamente? ==="
grep -n "3000\|gotenberg.*publish\|publish.*gotenberg" \
  /home/user/parceiros/docker-stack.yml | head -10

echo "=== IF-005: Docker Secrets vs environment ==="
grep -n "environment:\|secrets:\|JWT_SECRET\|PACOTICKET" \
  /home/user/parceiros/docker-stack.yml | head -20

echo "=== IF-006: Volume permissions ==="
grep -n "pdf_data\|volumes:" \
  /home/user/parceiros/docker-stack.yml | head -10
```

---

### D12 — Segurança de IA/LLM [AI-001 → AI-005]

```bash
echo "=== AI-001: Prompt injection via campos de texto ==="
# Campos que vão para o PDF gerado — verificar se há escape
grep -n "companyName\|contactName\|businessName\|planName\|nome" \
  /home/user/parceiros/frontend/partner-simulator.js \
  | grep -i "html\|gerarHtml\|innerHTML\|template" | head -15

echo "=== AI-002: HTML não escapado no template do PDF ==="
# Verificar função gerarHtmlProposta
grep -n "nomePlano\|businessName\|${d\." \
  /home/user/parceiros/frontend/partner-simulator.js \
  | head -20
# Procurar por: ${variavel} diretamente em HTML sem escaping

echo "=== AI-003: Token PacoTicket em logs ==="
grep -rn "PACOTICKET_BEARER\|bearer.*log\|log.*bearer\|console.*token" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== AI-004: Dados mínimos para APIs externas ==="
grep -rn "pacoticket\|createCompany\|updateCompany" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -15

echo "=== AI-005: businessName permite HTML no PDF ==="
# businessName é configurável pelo superadmin e aparece no PDF
grep -n "businessName\|bName" \
  /home/user/parceiros/frontend/partner-simulator.js \
  | grep "html\|HTML\|innerHTML\|\`" | head -10
```

---

### D13 — Security Headers [SH-001 → SH-005]

```bash
echo "=== SH-001 a SH-005: Headers no nginx.conf ==="
cat /home/user/parceiros/frontend/nginx.conf

echo ""
echo "Headers esperados:"
echo "  X-Frame-Options: DENY"
echo "  X-Content-Type-Options: nosniff"
echo "  Content-Security-Policy: ..."
echo "  Referrer-Policy: strict-origin-when-cross-origin"
echo "  Permissions-Policy: ..."

echo ""
echo "=== Verificar se headers estão presentes ==="
for header in "X-Frame-Options" "X-Content-Type-Options" "Content-Security-Policy" "Referrer-Policy"; do
  grep -q "$header" /home/user/parceiros/frontend/nginx.conf && \
    echo "OK: $header" || echo "MISSING: $header"
done
```

---

### D14 — Logging & Monitoring [LM-001 → LM-005]

```bash
echo "=== LM-001: ActivityLog cobre ações críticas ==="
grep -rn "ActivityLog\|activityLog\|CLIENT_CREATED\|COMMISSION_PAID\|TIER_CHANGED" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -20

echo "=== LM-002: Falhas de auth logadas ==="
grep -n "401\|403\|unauthorized\|forbidden\|failed\|FAIL" \
  /home/user/parceiros/backend/src/routes/auth.routes.js | head -10

echo "=== LM-003: Sem dados sensíveis em logs ==="
grep -rn "console\.log" \
  /home/user/parceiros/backend/src/routes/ \
  --include="*.js" | head -20

echo "=== LM-004: Stack traces em produção ==="
grep -rn "err\.stack\|error\.stack\|NODE_ENV" \
  /home/user/parceiros/backend/src/ \
  --include="*.js" | head -10

echo "=== LM-005: Erro global handler ==="
grep -n -A 10 "app\.use.*err\|globalError\|errorHandler" \
  /home/user/parceiros/backend/src/server.js | head -20
```

---

### D15 — DevSecOps [DO-001 → DO-006]

```bash
echo "=== DO-001: .gitignore correto ==="
cat /home/user/parceiros/.gitignore

echo ""
echo "=== DO-002: Secrets no histórico do Git ==="
git -C /home/user/parceiros log --all --full-diff -p -- "*.env" 2>/dev/null | head -20
git -C /home/user/parceiros log --oneline -20 2>/dev/null

echo "=== DO-003: npm ci no Dockerfile ==="
grep "npm ci\|npm install" /home/user/parceiros/backend/Dockerfile

echo "=== DO-004: NODE_ENV em produção ==="
grep "NODE_ENV" /home/user/parceiros/docker-stack.yml

echo "=== DO-005: Dependências de dev não em produção ==="
grep -n "devDependencies\|NODE_ENV\|--production\|--omit=dev" \
  /home/user/parceiros/backend/Dockerfile | head -5

echo "=== DO-006: Docker Secrets para variáveis sensíveis ==="
grep -n "secrets:\|secret_" /home/user/parceiros/docker-stack.yml | head -10
```

---

### D16 — Segurança de Frontend [FE-001 → FE-004]

```bash
echo "=== FE-001: innerHTML com dados não escapados ==="
# Contar e listar todas as ocorrências de innerHTML
grep -rn "\.innerHTML\s*=" \
  /home/user/parceiros/frontend/*.js 2>/dev/null \
  | grep -v "spinnerHTML\|emptyHTML\|renderK\|=\s*\`\s*<div\|#" \
  | wc -l
echo "Top ocorrências para revisar manualmente:"
grep -rn "\.innerHTML\s*=" \
  /home/user/parceiros/frontend/*.js 2>/dev/null \
  | grep -v "spinnerHTML\|emptyHTML" | head -20

echo "=== FE-002: eval() e new Function() no frontend ==="
grep -rn '\beval(\|\bnew Function(' \
  /home/user/parceiros/frontend/*.js 2>/dev/null | grep -v "//"

echo "=== FE-003: Links externos ==="
grep -rn 'target.*_blank\|href.*http' \
  /home/user/parceiros/frontend/*.html \
  /home/user/parceiros/frontend/*.js 2>/dev/null | grep -v "rel.*noopener" | head -10

echo "=== FE-004: localStorage para dados sensíveis ==="
grep -rn "localStorage" \
  /home/user/parceiros/frontend/*.js \
  /home/user/parceiros/frontend/*.html 2>/dev/null | head -10
# Qualquer uso de localStorage para tokens = CRÍTICO
```

---

## ETAPA 3 — Classificação e Relatório

Após executar todos os checks, produza o relatório consolidado:

```bash
cat > /tmp/audit/phase3/findings.md << 'FINDINGS'
# Findings Consolidados

## CRÍTICOS (corrigir imediatamente)
[listar findings críticos com evidência]

## ALTOS (corrigir em 7 dias)
[listar findings altos]

## MÉDIOS (corrigir em 30 dias)
[listar findings médios]

## INFORMATIVOS
[boas práticas e melhorias]

## Security Score: [0-100]
Cálculo: 100 - (críticos × 20) - (altos × 10) - (médios × 3) - (baixos × 1)
FINDINGS
```

---

## ETAPA 4 — Pentest Dinâmico (executar após corrigir críticos e altos)

```bash
echo "=== PENTEST 1: IDOR — acesso cruzado entre parceiros ==="
# Criar dois parceiros via API, obter tokens de ambos
# Tentar acessar recursos do parceiro B com token do parceiro A

TOKEN_A="[token do parceiro A]"
TOKEN_B="[token do parceiro B]"

# Listar leads do parceiro A
curl -s http://localhost:3000/api/funnel/leads \
  -H "Authorization: Bearer $TOKEN_A" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print([l['id'] for l in d.get('data',[])])"

# Tentar acessar o mesmo lead com token do parceiro B
LEAD_ID="[ID do lead do parceiro A]"
curl -s http://localhost:3000/api/funnel/leads/$LEAD_ID \
  -H "Authorization: Bearer $TOKEN_B"
# Esperado: 403 ou 404 — nunca os dados do lead

echo ""
echo "=== PENTEST 2: Força bruta no login ==="
for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@pacoticket.com.br\",\"password\":\"wrong${i}\"}")
  echo "Tentativa $i: HTTP $STATUS"
  if [ "$STATUS" = "429" ]; then
    echo "OK: Rate limiting ativou na tentativa $i"
    break
  fi
done

echo ""
echo "=== PENTEST 3: JWT manipulation ==="
# Pegar token válido, alterar role no payload, reenviar
VALID_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Decodificar (sem verificação de signature) e mostrar payload
echo $VALID_TOKEN | python3 -c "
import sys, base64, json
token = sys.stdin.read().strip()
parts = token.split('.')
payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
decoded = json.loads(base64.b64decode(payload))
print(json.dumps(decoded, indent=2))
"

# Tentar usar token com signature inválida
FAKE_TOKEN=$(echo $VALID_TOKEN | sed 's/\.[^.]*$/.invalidsignature/')
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $FAKE_TOKEN")
echo "Token com signature inválida: HTTP $STATUS (esperado: 401)"

echo ""
echo "=== PENTEST 4: SSRF via apiBaseUrl ==="
# Tentar configurar apiBaseUrl para URL interna
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -d '{"apiBaseUrl":"http://postgres:5432"}' \
  | python3 -m json.tool

echo ""
echo "=== PENTEST 5: HTML injection no PDF ==="
# Criar plano com nome contendo HTML malicioso
curl -s -X POST http://localhost:3000/api/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -d '{"name":"<script>alert(1)</script>","basePrice":100}' \
  | python3 -m json.tool | head -10
# Verificar se o HTML é escapado no PDF gerado

echo ""
echo "=== PENTEST 6: Path traversal em PDF storage ==="
# Verificar se partnerId é validado como UUID antes de usar no path
curl -s -X POST http://localhost:3000/api/pdf/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -d '{"html":"<h1>test</h1>","leadId":"../../../etc/passwd"}' \
  | python3 -m json.tool | head -10
```

---

## ETAPA 5 — Produzir relatório final

Ao concluir todos os checks e pentests, produza:

1. **Executive Summary** com security score (0–100)
2. **Top 5 vulnerabilidades** com evidência, CVSS estimado e remediação específica
3. **Checklist OWASP Top 10 2021** — pass/fail por categoria
4. **Roadmap de correções** priorizado por severidade
5. **Código de remediação** para cada finding crítico e alto

Salvar em `/tmp/audit/phase4/security-audit-report.md`

---

## Remediações prioritárias esperadas (baseado no histórico do sistema)

### R01 — Adicionar rate limiting (se ausente)
```javascript
// backend/src/server.js
const rateLimit = require('express-rate-limit');
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Aguarde 15 minutos.' }
}));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 100 }));
```

### R02 — Adicionar security headers no nginx.conf
```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:;" always;
```

### R03 — Escape HTML em dados do usuário no PDF
```javascript
// Adicionar função de escape em gerarHtmlProposta:
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
// Usar: escapeHtml(nomePlano), escapeHtml(businessName), escapeHtml(d.contactName)
```

### R04 — Refresh token blacklist (se ausente)
```javascript
// Adicionar tabela RefreshToken no schema.prisma
// No logout: prisma.refreshToken.delete({ where: { token: refreshToken } })
// No /refresh: verificar se token existe antes de renovar
```

### R05 — Validar URLs de configuração (contra SSRF)
```javascript
// No PUT /api/system-config, antes de persistir:
function isValidHttpsUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' && !url.hostname.match(/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
  } catch { return false; }
}
// Para apiBaseUrl, logoLogin, logoInternal, logoPdf:
if (value && !isValidHttpsUrl(value)) throw new Error('URL inválida ou não permitida');
```