# Fix Cirúrgico — Módulos no Simulador e Configurações de Módulos

## Problemas confirmados

1. **Simulador do parceiro:** módulos com `isVisible = true` não aparecem na tela
2. **SuperAdmin → Configurações:** não é possível alterar o nome do módulo nem adicionar novos módulos

---

## Regra absoluta: diagnóstico antes de qualquer edição

Leia cada arquivo indicado abaixo **antes** de tocar em qualquer coisa. Use `grep` e `cat` com `head`/`tail` para não estourar o contexto.

---

## DIAGNÓSTICO 1 — Módulos invisíveis no simulador

### D1.1 — Verificar o que o endpoint retorna

```bash
# Pegar token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])")

# Checar o que GET /plans/modules/prices retorna
curl -s http://localhost:3000/api/plans/modules/prices \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -60
```

Anote: o campo `isVisible` existe na resposta? Qual o valor? Se não existe ou é sempre `false`, o problema está no backend.

### D1.2 — Verificar o banco diretamente

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.modulePrice.findMany({ select: { moduleKey:1, label:1, isVisible:1 } })
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => console.error(e.message))
      .finally(() => p.\$disconnect());
  "
```

Anote: `isVisible` está no banco? Qual valor para cada registro?

### D1.3 — Verificar o frontend do simulador

```bash
# Ver como _simModules é filtrado
grep -n "isVisible\|_simModules\|simModules\|filter" \
  /home/user/parceiros/frontend/partner-simulator.js | head -30

# Ver onde os módulos são renderizados
grep -n "sim-module\|_simModules\|simModules.length\|simModules.map" \
  /home/user/parceiros/frontend/partner-simulator.js | head -20
```

### D1.4 — Verificar se o campo existe no Prisma schema

```bash
grep -n "isVisible\|setupFee" /home/user/parceiros/backend/prisma/schema.prisma
```

### D1.5 — Verificar se a coluna existe no banco

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$queryRaw\`SELECT column_name FROM information_schema.columns WHERE table_name = 'ModulePrice'\`
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .finally(() => p.\$disconnect());
  "
```

---

## DIAGNÓSTICO 2 — Configurações: alterar nome e adicionar módulo

### D2.1 — Ver o que a aba de configurações realmente renderiza

```bash
# Ver a função loadConfig e as funções de módulo
grep -n "loadConfig\|salvarModulos\|salvarPrecos\|moduleKey\|label.*input\|label.*edit" \
  /home/user/parceiros/frontend/superadmin-config.js | head -40
```

### D2.2 — Ver como a tabela de módulos é gerada (HTML dinâmico)

```bash
# Ler o bloco que gera as linhas da tabela de módulos
sed -n '/function.*[Mm]odulo\|function.*[Cc]onfig\|renderMod/,/^}/p' \
  /home/user/parceiros/frontend/superadmin-config.js | head -80
```

### D2.3 — Ver o endpoint PUT de módulos no backend

```bash
grep -n "modules/prices\|moduleKey\|label\|isVisible\|setupFee" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -30
```

### D2.4 — Ver se existe rota para adicionar módulo novo

```bash
grep -n "POST.*module\|module.*POST\|createMany\|modulePrice.*create" \
  /home/user/parceiros/backend/src/routes/plans.routes.js
```

---

## CORREÇÕES — execute após o diagnóstico, uma por vez

---

### FIX A — Se `isVisible` não existe no banco (coluna ausente)

Aplicar migration manualmente:

```bash
docker exec $(docker ps -qf "name=pacoticket_backend") \
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$executeRaw\`ALTER TABLE \"ModulePrice\" ADD COLUMN IF NOT EXISTS \"isVisible\" BOOLEAN NOT NULL DEFAULT TRUE\`
      .then(() => p.\$executeRaw\`ALTER TABLE \"ModulePrice\" ADD COLUMN IF NOT EXISTS \"setupFee\" DECIMAL(10,2) NOT NULL DEFAULT 0\`)
      .then(() => console.log('OK — colunas adicionadas'))
      .catch(e => console.error(e.message))
      .finally(() => p.\$disconnect());
  "
```

Depois verificar se o Prisma schema está atualizado com esses campos. Se não estiver:

```bash
grep -n "ModulePrice" /home/user/parceiros/backend/prisma/schema.prisma
```

Se `isVisible` e `setupFee` não estiverem no schema, adicione com `str_replace` — localize o model `ModulePrice` e insira os campos faltantes:

```prisma
model ModulePrice {
  id        String   @id @default(uuid())
  moduleKey String   @unique
  label     String
  price     Decimal  @db.Decimal(10, 2)
  setupFee  Decimal  @db.Decimal(10, 2) @default(0)   // ← adicionar se faltar
  isVisible Boolean  @default(true)                    // ← adicionar se faltar
  updatedAt DateTime @updatedAt
}
```

Após editar o schema: `cd backend && npx prisma generate`

---

### FIX B — Se `isVisible` existe no banco mas o endpoint não retorna o campo

Leia o controller/route que responde `GET /plans/modules/prices` e verifique o `select` do Prisma:

```bash
grep -n -A 10 "modules/prices" /home/user/parceiros/backend/src/routes/plans.routes.js | head -30
```

Se o `findMany` usa `select` explícito que omite `isVisible`, corrija adicionando o campo. Se não usa `select` (retorna tudo), o campo deveria aparecer — nesse caso o problema é no banco (FIX A).

Exemplo de correção com `str_replace`:

```javascript
// ANTES (se tiver select restritivo):
prisma.modulePrice.findMany({ select: { moduleKey: true, label: true, price: true } })

// DEPOIS:
prisma.modulePrice.findMany({
  select: { id: true, moduleKey: true, label: true, price: true, setupFee: true, isVisible: true },
  orderBy: { label: 'asc' }
})
```

---

### FIX C — Se o filtro no simulador está errado

Leia exatamente como `_simModules` é filtrado em `partner-simulator.js`:

```bash
grep -n "isVisible\|filter\|_simModules" /home/user/parceiros/frontend/partner-simulator.js
```

O filtro correto é:

```javascript
_simModules = (rModules?.data || []).filter(m => m.isVisible !== false);
```

Se estiver como `m.isVisible === true` e o banco retorna `null` ou `undefined` (coluna recém-adicionada com registros antigos), nenhum módulo passa. Use `!== false` para aceitar `null`/`undefined` como visível.

Corrija com `str_replace` apenas a linha do filtro.

---

### FIX D — Configurações: alterar nome do módulo

**Problema provável:** a tabela de módulos em `superadmin-config.js` renderiza o `label` como texto puro (`<td>${m.label}</td>`) em vez de input editável.

#### D-1: Ler como a tabela é gerada

```bash
sed -n '/function loadConfig\|function renderMod/,/^}/p' \
  /home/user/parceiros/frontend/superadmin-config.js | head -100
```

#### D-2: Corrigir a geração da linha de módulo

Encontre o trecho que gera cada linha da tabela e substitua com `str_replace`. A linha correta deve ser:

```javascript
// Dentro do .map() que gera cada <tr> de módulo:
`<tr class="border-b hover:bg-gray-50">
  <td class="py-2 px-3 text-center">
    <input type="checkbox" class="w-4 h-4 rounded text-blue-600 mod-visible"
      data-key="${m.moduleKey}" ${m.isVisible !== false ? 'checked' : ''}>
  </td>
  <td class="py-2 px-3">
    <input type="text" class="w-full px-2 py-1 border border-gray-200 rounded text-sm mod-label"
      data-key="${m.moduleKey}" value="${(m.label || '').replace(/"/g, '&quot;')}">
  </td>
  <td class="py-2 px-3 text-xs text-gray-400 font-mono">${m.moduleKey}</td>
  <td class="py-2 px-3">
    <input type="number" step="0.01" min="0"
      class="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right mod-price"
      data-key="${m.moduleKey}" value="${Number(m.price || 0).toFixed(2)}">
  </td>
  <td class="py-2 px-3">
    <input type="number" step="0.01" min="0"
      class="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right mod-setup"
      data-key="${m.moduleKey}" value="${Number(m.setupFee || 0).toFixed(2)}">
  </td>
</tr>`
```

#### D-3: Corrigir a função de salvar para incluir o `label`

Encontre a função que monta o payload para `PUT /api/plans/modules/prices`:

```bash
grep -n "salvarModulos\|salvarPrecos\|mod-price\|moduleKey\|PUT.*module" \
  /home/user/parceiros/frontend/superadmin-config.js | head -20
```

A função correta deve coletar todos os campos incluindo `label`:

```javascript
function salvarModulos() {
  const rows = [];
  document.querySelectorAll('input.mod-price').forEach(inp => {
    const key = inp.dataset.key;
    const labelEl  = document.querySelector(`.mod-label[data-key="${key}"]`);
    const visEl    = document.querySelector(`.mod-visible[data-key="${key}"]`);
    const setupEl  = document.querySelector(`.mod-setup[data-key="${key}"]`);
    rows.push({
      moduleKey: key,
      label:     labelEl?.value?.trim() || key,
      price:     parseFloat(inp.value)          || 0,
      setupFee:  parseFloat(setupEl?.value)      || 0,
      isVisible: visEl?.checked ?? true,
    });
  });

  apiRequest('PUT', '/plans/modules/prices', rows)
    .then(res => {
      if (res?.success) showToast('Módulos salvos com sucesso.', 'success');
      else showToast(res?.message || 'Erro ao salvar.', 'error');
    })
    .catch(e => showToast(e.message, 'error'));
}
```

Se a função existir mas estiver diferente, substitua com `str_replace` apenas o corpo dela.

#### D-4: Corrigir o endpoint PUT no backend para aceitar `label`

```bash
grep -n -A 20 "PUT.*modules/prices\|modules.*prices.*PUT\|modulePrice.*upsert\|updateMany" \
  /home/user/parceiros/backend/src/routes/plans.routes.js | head -40
```

O `upsert` deve incluir `label` no update:

```javascript
// Para cada item do body:
await prisma.modulePrice.upsert({
  where:  { moduleKey: item.moduleKey },
  update: {
    label:     item.label     ?? undefined,   // ← atualizar label se enviado
    price:     item.price     ?? undefined,
    setupFee:  item.setupFee  ?? undefined,
    isVisible: item.isVisible ?? undefined,
  },
  create: {
    moduleKey: item.moduleKey,
    label:     item.label || item.moduleKey,
    price:     item.price || 0,
    setupFee:  item.setupFee  || 0,
    isVisible: item.isVisible ?? true,
  },
});
```

Se o `update` atual não inclui `label`, corrija com `str_replace` apenas esse objeto.

---

### FIX E — Configurações: adicionar novo módulo

**Problema provável:** não existe botão "+ Novo Módulo" nem modal/formulário para criação.

#### E-1: Verificar se existe

```bash
grep -n "Novo Módulo\|addModule\|novoModulo\|POST.*module" \
  /home/user/parceiros/frontend/superadmin-config.js \
  /home/user/parceiros/frontend/superadmin-config.js 2>/dev/null
```

#### E-2: Adicionar botão e modal

Na função `loadConfig()`, localize onde a seção de módulos é renderizada (onde aparece o botão "Salvar Módulos") e adicione o botão "+ Novo Módulo" ao lado:

```javascript
// Encontre a linha com o botão de salvar, algo como:
// '<button onclick="salvarModulos()"...'
// E adicione antes ou depois:
`<button onclick="abrirModalNovoModulo()"
  class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition">
  + Novo Módulo
</button>`
```

#### E-3: Adicionar função do modal e de criação

No final de `superadmin-config.js`, adicione as funções (use `str_replace` para inserir antes do último `}` ou no final do arquivo):

```javascript
function abrirModalNovoModulo() {
  // Criar modal dinamicamente se não existir
  let modal = document.getElementById('modalNovoModulo');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalNovoModulo';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 hidden';
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-800">Novo Módulo</h3>
          <button onclick="fecharModalNovoModulo()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nome do Módulo *</label>
            <input type="text" id="novoModLabel" placeholder="Ex: Meu Módulo"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Chave única (moduleKey) *</label>
            <input type="text" id="novoModKey" placeholder="Ex: useMyModule"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <p class="text-xs text-gray-400 mt-1">Deve começar com "use", sem espaços. Ex: useMyModule</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Preço/mês (R$)</label>
              <input type="number" id="novoModPrice" step="0.01" min="0" value="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Taxa Setup (R$)</label>
              <input type="number" id="novoModSetup" step="0.01" min="0" value="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" id="novoModVisible" checked class="w-4 h-4 rounded text-blue-600">
            <label for="novoModVisible" class="text-sm text-gray-700">Visível no montador de planos</label>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button onclick="fecharModalNovoModulo()"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onclick="salvarNovoModulo()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition">
            Criar Módulo
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  // Limpar campos
  document.getElementById('novoModLabel').value   = '';
  document.getElementById('novoModKey').value     = '';
  document.getElementById('novoModPrice').value   = '0';
  document.getElementById('novoModSetup').value   = '0';
  document.getElementById('novoModVisible').checked = true;
  modal.classList.remove('hidden');
  document.getElementById('novoModLabel').focus();
}

function fecharModalNovoModulo() {
  const modal = document.getElementById('modalNovoModulo');
  if (modal) modal.classList.add('hidden');
}

async function salvarNovoModulo() {
  const label    = document.getElementById('novoModLabel')?.value?.trim();
  const key      = document.getElementById('novoModKey')?.value?.trim();
  const price    = parseFloat(document.getElementById('novoModPrice')?.value) || 0;
  const setupFee = parseFloat(document.getElementById('novoModSetup')?.value) || 0;
  const isVisible = document.getElementById('novoModVisible')?.checked ?? true;

  if (!label) { showToast('Informe o nome do módulo.', 'warning'); return; }
  if (!key)   { showToast('Informe a chave do módulo.', 'warning'); return; }
  if (!key.startsWith('use')) { showToast('A chave deve começar com "use". Ex: useMyModule', 'warning'); return; }
  if (/\s/.test(key)) { showToast('A chave não pode ter espaços.', 'warning'); return; }

  try {
    // Upsert via PUT (cria se não existir)
    const res = await apiRequest('PUT', '/plans/modules/prices', [
      { moduleKey: key, label, price, setupFee, isVisible }
    ]);
    if (!res?.success) throw new Error(res?.message || 'Erro ao criar módulo.');
    showToast(`Módulo "${label}" criado com sucesso.`, 'success');
    fecharModalNovoModulo();
    loadConfig(); // Recarregar a lista
  } catch (e) {
    showToast(e.message, 'error');
  }
}
```

---

## Verificação final antes do deploy

```bash
# 1. Testar GET de módulos — isVisible deve aparecer
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pacoticket.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

curl -s http://localhost:3000/api/plans/modules/prices \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(m['moduleKey'], '| isVisible:', m.get('isVisible'), '| label:', m.get('label')) for m in d.get('data',[])]"

# 2. Verificar arquivos do frontend no container
docker exec $(docker ps -qf "name=pacoticket_frontend") \
  ls -la /usr/share/nginx/html/partner-simulator.js

# 3. Verificar que não há reseller/revendedor
grep -ri "revendedor\|reseller" /home/user/parceiros/frontend/*.html \
  /home/user/parceiros/frontend/*.js 2>/dev/null
```

---

## Deploy

```bash
cd /opt/parceiros
git add -A && git commit -m "fix: simulator modules visibility, config label edit and new module"
git push

docker build --no-cache -t pacoticket-backend:latest  ./backend
docker build --no-cache -t pacoticket-frontend:latest ./frontend
docker stack deploy -c docker-stack.yml pacoticket
sleep 20
docker stack services pacoticket
```

---

## Checklist

- [ ] `GET /plans/modules/prices` retorna `isVisible` e `label` para todos os registros
- [ ] Módulos com `isVisible: true` aparecem no simulador do parceiro
- [ ] Na aba Configurações do superadmin, coluna "Nome" é um input editável
- [ ] Alterar o nome de um módulo e clicar "Salvar Módulos" persiste no banco
- [ ] Botão "+ Novo Módulo" abre modal
- [ ] Criar novo módulo via modal aparece imediatamente na lista
- [ ] Novo módulo com `isVisible: true` aparece no simulador após reload