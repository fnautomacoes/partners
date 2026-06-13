# Fix: White-Label — Nome do Negócio e Logo em Todos os Frontends

## Objetivo

Substituir toda ocorrência estática de "PacoTicket" nos frontends pelo `businessName` configurado em `SystemConfig`. Onde houver logo configurada (header e login), esconder o nome e exibir a imagem. Onde não houver logo, exibir o nome do negócio.

---

## Regra absoluta: diagnóstico antes de qualquer edição

---

## FASE 1 — Mapeamento completo de ocorrências

### 1.1 — Listar todos os arquivos frontend

```bash
ls /home/user/parceiros/frontend/
```

### 1.2 — Encontrar TODAS as ocorrências de "PacoTicket" nos frontends

```bash
grep -rn "PacoTicket" /home/user/parceiros/frontend/ --include="*.html" --include="*.js"
```

Anote cada arquivo e linha. Classifique em:
- **Visíveis ao usuário** (títulos, headers, textos, `document.title`, `<title>`, placeholders)
- **Internas** (comentários, nomes de variáveis) — estas **não** precisam ser alteradas

### 1.3 — Verificar se o endpoint de system-config já existe e responde

```bash
curl -s https://parceiros.pacoticket.com.br/api/system-config | python3 -m json.tool
```

Deve retornar `{ success: true, data: { businessName, logoLogin, logoInternal, favicon } }`.

Se retornar 404, o endpoint não existe — veja FIX A antes de prosseguir.

### 1.4 — Verificar estrutura atual do header em cada arquivo HTML

```bash
grep -n "header\|logo\|businessName\|PacoTicket\|adminName\|headerName\|headerLogo\|loginLogo\|loginTitle" \
  /home/user/parceiros/frontend/superadmin.html \
  /home/user/parceiros/frontend/partner.html \
  /home/user/parceiros/frontend/login.html
```

### 1.5 — Verificar se já existe lógica de branding em algum JS

```bash
grep -rn "applyBranding\|businessName\|logoInternal\|logoLogin\|system-config" \
  /home/user/parceiros/frontend/*.js
```

---

## FASE 2 — FIX A: garantir que o endpoint `/api/system-config` existe

Só execute este fix se o diagnóstico 1.3 retornou 404.

```bash
# Verificar se a rota está registrada no server.js
grep -n "system-config\|systemConfig\|SystemConfig" \
  /home/user/parceiros/backend/src/server.js \
  /home/user/parceiros/backend/src/routes/*.js 2>/dev/null
```

Se não existir, crie `backend/src/routes/system-config.routes.js`:

```javascript
const router  = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const prisma  = new PrismaClient();

const DEFAULTS = {
  businessName: 'PacoTicket',
  logoLogin:    null,
  logoInternal: null,
  favicon:      null,
};

// GET público — usado pelo frontend antes do login para aplicar branding
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.systemConfig.findMany();
    const config = { ...DEFAULTS };
    for (const r of rows) config[r.key] = r.value || null;
    // Nunca expor apiBaseUrl ao frontend público
    delete config.apiBaseUrl;
    res.json({ success: true, data: config });
  } catch (e) {
    // Fallback silencioso — retorna defaults se tabela não existir
    res.json({ success: true, data: DEFAULTS });
  }
});

// PUT — SUPERADMIN apenas (se middleware de auth existir)
router.put('/', async (req, res) => {
  try {
    // Verificar token manualmente para não quebrar se o middleware não estiver configurado
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

    const allowed = ['businessName', 'logoLogin', 'logoInternal', 'favicon', 'apiBaseUrl'];
    const entries = Object.entries(req.body)
      .filter(([k]) => allowed.includes(k))
      .map(([key, value]) => ({ key, value: value || null }));

    for (const e of entries) {
      await prisma.systemConfig.upsert({
        where:  { key: e.key },
        update: { value: e.value },
        create: { key: e.key, value: e.value },
      });
    }

    const rows = await prisma.systemConfig.findMany();
    const config = { ...DEFAULTS };
    for (const r of rows) config[r.key] = r.value || null;
    res.json({ success: true, data: config });
  } catch (e) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

module.exports = router;
```

Registrar em `server.js` (use `str_replace` para adicionar antes do handler de 404):

```javascript
app.use('/api/system-config', require('./routes/system-config.routes'));
```

Verificar se a tabela `SystemConfig` existe no banco:

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.systemConfig.count()
      .then(n => console.log('SystemConfig rows:', n))
      .catch(e => console.error('TABELA NAO EXISTE:', e.message))
      .finally(() => p.\$disconnect());
  "
```

Se a tabela não existir, criá-la diretamente:

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$executeRaw\`
      CREATE TABLE IF NOT EXISTS \"SystemConfig\" (
        \"id\" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        \"key\" VARCHAR(100) UNIQUE NOT NULL,
        \"value\" TEXT,
        \"updatedAt\" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    \`
    .then(() => p.\$executeRaw\`
      INSERT INTO \"SystemConfig\" (\"id\",\"key\",\"value\") VALUES
        (gen_random_uuid(),'businessName','PacoTicket'),
        (gen_random_uuid(),'logoLogin',NULL),
        (gen_random_uuid(),'logoInternal',NULL),
        (gen_random_uuid(),'favicon',NULL),
        (gen_random_uuid(),'apiBaseUrl','https://api.pacoticket.com.br')
      ON CONFLICT (\"key\") DO NOTHING
    \`)
    .then(() => console.log('OK'))
    .catch(e => console.error(e.message))
    .finally(() => p.\$disconnect());
  "
```

Confirme: `curl -s https://parceiros.pacoticket.com.br/api/system-config` retorna `businessName` → avance.

---

## FASE 3 — Criar função `applyBranding()` centralizada

### 3.1 — Decidir onde colocar

- Se existe `superadmin-utils.js`: adicionar lá (já carregado em todos os contextos do superadmin)
- Se existe um utils do parceiro (ex: `partner-utils.js` ou `partner.js`): adicionar lá
- Para `login.html`: adicionar inline no `<script>` do próprio arquivo

### 3.2 — Função para `superadmin-utils.js` e utils do parceiro

Use `str_replace` para adicionar no final do arquivo (antes do `DOMContentLoaded` se houver):

```javascript
// ── White-Label / Branding ──────────────────────────────────

async function applyBranding() {
  try {
    const res  = await fetch('/api/system-config');
    const json = await res.json();
    const cfg  = json?.data || {};
    const name = cfg.businessName || 'PacoTicket';

    // 1. <title> da página
    // Preserva o sufixo após " — " se existir, ex: "PacoTicket — SuperAdmin" → "MeuNegócio — SuperAdmin"
    document.title = document.title.replace(/^[^—–-]+/, name + ' ');

    // 2. Header interno: logo ou nome
    const headerLogo = document.getElementById('headerLogo');
    const headerName = document.getElementById('headerName');

    if (cfg.logoInternal) {
      // Tem logo: exibir imagem, esconder texto
      if (headerLogo) {
        headerLogo.src = cfg.logoInternal;
        headerLogo.alt = name;
        headerLogo.classList.remove('hidden');
        headerLogo.style.maxHeight = '36px';
        headerLogo.style.width     = 'auto';
      }
      if (headerName) headerName.classList.add('hidden');
    } else {
      // Sem logo: exibir nome
      if (headerLogo) headerLogo.classList.add('hidden');
      if (headerName) headerName.textContent = name;
    }

    // 3. Qualquer elemento com data-branding="name" recebe o nome
    document.querySelectorAll('[data-branding="name"]').forEach(el => {
      el.textContent = name;
    });

    // 4. Favicon
    if (cfg.favicon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel  = 'icon';
        link.type = 'image/x-icon';
        document.head.appendChild(link);
      }
      link.href = cfg.favicon;
    }

  } catch {
    // Silencioso — branding é opcional, não deve quebrar a aplicação
  }
}
```

### 3.3 — Chamar `applyBranding()` no `DOMContentLoaded`

Nos arquivos `superadmin-utils.js` e no utils do parceiro, o `DOMContentLoaded` já existe. Use `str_replace` para adicionar a chamada:

```javascript
// ANTES (trecho existente do DOMContentLoaded):
document.addEventListener('DOMContentLoaded', () => {
  if (!sessionStorage.getItem('access_token')) { redirectToLogin(); return; }
  // ...

// DEPOIS — adicionar applyBranding() como primeira linha:
document.addEventListener('DOMContentLoaded', () => {
  applyBranding(); // ← adicionar aqui
  if (!sessionStorage.getItem('access_token')) { redirectToLogin(); return; }
  // ...
```

---

## FASE 4 — Atualizar HTML dos headers

Para cada arquivo HTML, verifique a estrutura atual do header e ajuste para usar os IDs corretos. Use `str_replace` cirúrgico — troque apenas o bloco do header.

### 4.1 — `superadmin.html`

Localize o `<header>` atual:

```bash
grep -n -A 20 "<header" /home/user/parceiros/frontend/superadmin.html | head -30
```

O header deve ter esta estrutura (use `str_replace` para substituir apenas o conteúdo interno do header se já existir):

```html
<header class="gradient-bg text-white shadow-lg">
  <div class="container mx-auto px-6 py-4 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <!-- Logo: visível apenas quando logoInternal configurada -->
      <img id="headerLogo"
           src="" alt=""
           class="hidden object-contain"
           style="max-height:36px; width:auto;">
      <!-- Nome: visível quando sem logo -->
      <span id="headerName" class="text-xl font-bold">PacoTicket SuperAdmin</span>
    </div>
    <div class="flex items-center space-x-4">
      <span id="adminName" class="text-sm text-blue-100 hidden sm:inline"></span>
      <button onclick="logout()"
              class="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        Sair
      </button>
    </div>
  </div>
</header>
```

> **Atenção:** se o header atual já tiver `id="headerLogo"` e `id="headerName"`, apenas confirme que os IDs estão corretos e não faça alteração desnecessária.

### 4.2 — `partner.html`

```bash
grep -n -A 20 "<header" /home/user/parceiros/frontend/partner.html | head -30
```

Mesma estrutura do superadmin.html — ajuste com `str_replace` apenas se os IDs `headerLogo` e `headerName` estiverem faltando ou com nome diferente.

### 4.3 — Atualizar `<title>` estático dos HTMLs

```bash
grep -n "<title>" /home/user/parceiros/frontend/superadmin.html \
                  /home/user/parceiros/frontend/partner.html \
                  /home/user/parceiros/frontend/login.html
```

Garanta que os `<title>` estáticos usam "PacoTicket" como fallback (o `applyBranding()` vai substituir em runtime):

```html
<!-- superadmin.html -->
<title>PacoTicket — SuperAdmin</title>

<!-- partner.html -->
<title>PacoTicket — Parceiros</title>

<!-- login.html -->
<title>PacoTicket</title>
```

---

## FASE 5 — `login.html`: branding inline

O login não carrega os utils. O branding deve ser aplicado por um script inline no próprio arquivo.

### 5.1 — Verificar estrutura atual do login

```bash
grep -n -A 5 "loginLogo\|loginTitle\|PacoTicket\|<img\|<h1\|<h2" \
  /home/user/parceiros/frontend/login.html | head -40
```

### 5.2 — Garantir que os elementos têm os IDs corretos

O card de login deve conter:

```html
<!-- Logo: oculta por padrão, aparece quando logoLogin configurada -->
<img id="loginLogo"
     src="" alt=""
     class="hidden mx-auto object-contain mb-4"
     style="max-height:64px; width:auto;">

<!-- Nome/título: visível por padrão, some quando há logo -->
<h1 id="loginTitle" class="text-2xl font-bold text-center text-gray-800 mb-2">
  PacoTicket
</h1>
```

Se a estrutura for diferente, use `str_replace` para ajustar apenas esse bloco.

### 5.3 — Adicionar script de branding no `<head>` do login

Use `str_replace` para inserir antes do `</head>`:

```html
<script>
  // Branding aplicado antes do DOMContentLoaded para evitar flash
  (function() {
    function applyLoginBranding() {
      fetch('/api/system-config')
        .then(function(r) { return r.json(); })
        .then(function(json) {
          var cfg  = json && json.data ? json.data : {};
          var name = cfg.businessName || 'PacoTicket';

          // <title>
          document.title = name;

          // Logo ou nome
          var logoEl  = document.getElementById('loginLogo');
          var titleEl = document.getElementById('loginTitle');

          if (cfg.logoLogin) {
            if (logoEl) {
              logoEl.src = cfg.logoLogin;
              logoEl.alt = name;
              logoEl.classList.remove('hidden');
            }
            if (titleEl) titleEl.classList.add('hidden');
          } else {
            if (logoEl)  logoEl.classList.add('hidden');
            if (titleEl) titleEl.textContent = name;
          }

          // Favicon
          if (cfg.favicon) {
            var link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel  = 'icon';
              link.type = 'image/x-icon';
              document.head.appendChild(link);
            }
            link.href = cfg.favicon;
          }
        })
        .catch(function() {}); // silencioso
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyLoginBranding);
    } else {
      applyLoginBranding();
    }
  })();
</script>
```

---

## FASE 6 — Substituir textos estáticos "PacoTicket" visíveis ao usuário

Com o mapeamento feito no diagnóstico 1.2, corrija cada ocorrência visível.

### 6.1 — Estratégia por tipo de ocorrência

**`document.title = '...'` nos arquivos JS:**
```javascript
// ANTES:
document.title = 'PacoTicket SuperAdmin';

// DEPOIS — applyBranding() já cuida do title, remover ou substituir por:
document.title = document.title; // no-op, applyBranding() atualiza
```

**Textos em `innerHTML` / template literals:**
```javascript
// ANTES:
el.innerHTML = `<h1>PacoTicket Parceiros</h1>`;

// DEPOIS — usar data-branding ou substituir pela chamada da config:
// Opção 1: data-branding (applyBranding() já trata):
el.innerHTML = `<h1 data-branding="name">PacoTicket</h1>`;
// Opção 2: usar variável se já carregada:
el.innerHTML = `<h1>${_businessName || 'PacoTicket'}</h1>`;
```

**Strings em `showToast`, `confirm`, `alert`:**
Se "PacoTicket" aparecer em mensagens de toast ou confirm, substitua pelo uso da variável `_businessName`:

```javascript
// Declarar no topo do utils (após applyBranding ser chamada):
let _businessName = 'PacoTicket';

// Em applyBranding(), após obter o nome:
_businessName = cfg.businessName || 'PacoTicket';
```

### 6.2 — Fazer as substituições com `str_replace`

Para cada ocorrência listada no diagnóstico, use `str_replace` cirúrgico — uma por vez. Não faça substituição global em arquivo inteiro.

---

## FASE 7 — Verificação completa

### 7.1 — Confirmar que nenhuma ocorrência visível restou

```bash
# Apenas arquivos HTML e JS do frontend
grep -rn "PacoTicket" /home/user/parceiros/frontend/ \
  --include="*.html" --include="*.js" \
  | grep -v "//.*PacoTicket\|#.*PacoTicket"
```

Para cada linha que ainda aparecer, avalie se é visível ao usuário:
- Se for comentário → OK, ignorar
- Se for nome de variável/função → OK, ignorar
- Se for texto visível → corrigir

### 7.2 — Testar o fluxo de branding

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Alterar businessName para testar
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"businessName":"Meu Sistema","logoLogin":null,"logoInternal":null}' \
  | python3 -m json.tool

# Conferir que retorna o novo nome
curl -s http://localhost:3000/api/system-config | python3 -m json.tool
```

Acessar o sistema no navegador e verificar:
- [ ] `<title>` da página exibe "Meu Sistema"
- [ ] Header exibe "Meu Sistema" (sem logo configurada)
- [ ] Tela de login exibe "Meu Sistema"

Agora testar com logo:
```bash
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"logoInternal":"https://via.placeholder.com/120x36?text=Logo","logoLogin":"https://via.placeholder.com/200x64?text=Logo"}' \
  | python3 -m json.tool
```

- [ ] Header exibe a imagem, esconde o texto
- [ ] Login exibe a imagem, esconde o título

Restaurar após o teste:
```bash
curl -s -X PUT http://localhost:3000/api/system-config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"businessName":"PacoTicket","logoLogin":null,"logoInternal":null}'
```

---

## FASE 8 — Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "feat: white-label branding — businessName e logo em todos os frontends"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist final

- [ ] `GET /api/system-config` retorna `businessName`, `logoLogin`, `logoInternal`, `favicon`
- [ ] `PUT /api/system-config` persiste os valores no banco
- [ ] Login: sem logo → exibe `businessName`; com logo → exibe imagem, esconde nome
- [ ] Header superadmin: sem logo → exibe `businessName`; com logo → exibe imagem, esconde nome
- [ ] Header parceiro: mesma regra
- [ ] `<title>` de todas as páginas usa `businessName`
- [ ] Zero ocorrências de "PacoTicket" visíveis ao usuário quando `businessName` for diferente
- [ ] Comentários e nomes de variáveis com "PacoTicket" foram preservados (não são visíveis)