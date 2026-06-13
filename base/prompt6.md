# Fix Cirúrgico — 404 nos arquivos JS do SuperAdmin

## Diagnóstico confirmado

Os arquivos `superadmin-utils.js`, `superadmin-dashboard.js` etc. existem no repositório mas o nginx retorna 404 para eles. O `superadmin.js` existe mas `showTab` não está definida nele (está nos novos arquivos que o nginx não serve).

**Causa provável:** o `Dockerfile` do frontend ou o `nginx.conf` só copia/serve arquivos específicos, não todos os `.js` da pasta.

## FASE 1 — Diagnóstico

### 1.1 — Verificar o que está dentro do container em execução

```bash
docker exec $(docker ps -qf "name=pacoticket_frontend") ls -la /usr/share/nginx/html/
```

Compare com o que existe no repositório:

```bash
ls -la /opt/parceiros/frontend/*.js
```

Se os arquivos `superadmin-*.js` não apareceram no container, o problema é no Dockerfile ou no COPY.

### 1.2 — Ver o Dockerfile do frontend

```bash
cat /opt/parceiros/frontend/Dockerfile
```

Procure pela linha `COPY`. Se estiver assim:

```dockerfile
COPY superadmin.html .
COPY superadmin.js .
COPY login.html .
# etc — listando arquivos individualmente
```

Este é o problema. Precisa ser:

```dockerfile
COPY . .
```

ou pelo menos incluir todos os `.js`.

### 1.3 — Ver o nginx.conf

```bash
cat /opt/parceiros/frontend/nginx.conf
```

Verifique se há alguma restrição que bloqueie arquivos `.js` não listados explicitamente.

---

## FASE 2 — Correção

### FIX A — Corrigir o Dockerfile do frontend

Edite `/opt/parceiros/frontend/Dockerfile`. A seção de cópia de arquivos estáticos deve ser:

```dockerfile
# Copia TODOS os arquivos estáticos
COPY . /usr/share/nginx/html/
```

Se o Dockerfile atual lista arquivos individualmente, substitua todas as linhas `COPY arquivo.html .` e `COPY arquivo.js .` por uma única linha:

```dockerfile
COPY . /usr/share/nginx/html/
```

Certifique-se de que o `.dockerignore` do frontend **não** está excluindo os arquivos `.js`. Verifique:

```bash
cat /opt/parceiros/frontend/.dockerignore 2>/dev/null || echo "Sem .dockerignore"
```

Se o `.dockerignore` listar arquivos `.js`, remova essas linhas.

### FIX B — Verificar nginx.conf

O nginx.conf deve servir qualquer arquivo estático sem restrição. O bloco `location /` deve ser:

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ =404;
}
```

Não deve haver nenhuma restrição de extensão de arquivo.

### FIX C — Corrigir o `superadmin.js` para não quebrar enquanto os outros carregam

O `superadmin.js` atual tem `showTab` chamada no `DOMContentLoaded` mas `showTab` só existe no `superadmin-utils.js`. Enquanto o problema do 404 não for resolvido, o `superadmin.js` vai continuar quebrando.

Substitua o conteúdo de `superadmin.js` por apenas isto (o arquivo vai virar um fallback vazio — toda a lógica já está nos novos arquivos):

```javascript
// superadmin.js — este arquivo é mantido apenas por compatibilidade.
// Toda a lógica está em superadmin-utils.js e superadmin-*.js
```

Isso evita o erro `showTab is not defined` que aparece antes dos outros scripts carregarem.

---

## FASE 3 — Rebuild e deploy

```bash
cd /opt/parceiros

# Pull das últimas alterações
git pull

# Rebuild do frontend (forçar sem cache para garantir que os novos arquivos entram)
docker build --no-cache -t pacoticket-frontend:latest ./frontend

# Deploy
docker stack deploy -c docker-stack.yml pacoticket

# Aguardar
sleep 20

# Verificar se o container novo subiu
docker stack services pacoticket
```

## FASE 4 — Validação

```bash
# Verificar se os arquivos estão dentro do container novo
docker exec $(docker ps -qf "name=pacoticket_frontend") ls -la /usr/share/nginx/html/superadmin*.js
```

Deve listar todos os arquivos:
- superadmin.js
- superadmin-utils.js
- superadmin-dashboard.js
- superadmin-parceiros.js
- superadmin-planos.js
- superadmin-clientes.js
- superadmin-comissoes.js
- superadmin-faturas.js
- superadmin-config.js

Depois teste via curl:

```bash
curl -si https://partners.pacoticket.com.br/superadmin-utils.js | head -5
```

Deve retornar `HTTP/2 200` e o início do arquivo JS. Se ainda retornar 404, o problema está no nginx.conf — compartilhe o conteúdo dele para análise.

---

## Regras

- Não altere `login.html`, `partner.html`, `partner.js`, nenhum arquivo em `backend/`
- Use `--no-cache` no build para garantir que os arquivos novos entram na imagem