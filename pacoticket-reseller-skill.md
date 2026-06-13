# SKILL: pacoticket-reseller-system

## Quando usar esta skill
Use ao implementar qualquer parte do sistema PacoTicket de revendedores. Contém contratos detalhados, algoritmos, padrões de UI e anti-padrões.

---

## 1. Princípio dos Planos Internos

**Planos não vêm da API PacoTicket. Ponto.**

A API PacoTicket (`/plans/all`) não é consultada para gestão de planos. Todo plano exibido no sistema vem da tabela `Plan` do banco de dados próprio.

O campo `pacoticketPlanId` (inteiro, opcional) é um **identificador de referência cruzada**:
- O superadmin o preenche quando sabe que o plano interno corresponde a um plano específico da plataforma PacoTicket
- Serve para leitura futura — ex: ao sincronizar faturas, cruzar `pacoticketPlanId` com dados retornados pela API para exibir o nome do plano correto
- **Não afeta preço, comissão, tier nem nenhuma regra de negócio**
- Pode ficar nulo indefinidamente — o sistema funciona normalmente sem ele

```
Plano Interno "Pro Plus" (id: uuid-abc)
  ├── basePrice: R$ 200
  ├── módulos: WhatsApp + CRM + AI
  ├── totalPrice: R$ 380
  └── pacoticketPlanId: 13  ← "este plano equivale ao plano 13 na plataforma PacoTicket"
```

### O que usar de cada sistema
| Dado | Fonte |
|---|---|
| Lista de planos disponíveis | Banco de dados próprio (`Plan`) |
| Preço do plano | `Plan.totalPrice` no banco |
| Módulos incluídos | Campos `use*` booleanos no banco |
| Criação/edição de planos | SuperAdmin → banco de dados |
| ID da empresa do cliente | API PacoTicket (retornado ao criar) |
| Faturas do cliente | API PacoTicket (sincronização) |

---

## 2. Contratos de API do Backend

### 2.1 Login
```
POST /api/auth/login
Body: { email, password }
Response: {
  success: true,
  data: {
    accessToken: "eyJ...",
    refreshToken: "eyJ...",
    user: { id, email, role, resellerId }  // resellerId = null para SUPERADMIN
  }
}
```
O `role` no response determina para qual portal redirecionar:
- `SUPERADMIN` → `superadmin.html`
- `RESELLER` → `reseller.html`

### 2.2 Criar Plano
```
POST /api/plans
Authorization: Bearer {accessToken}  (SUPERADMIN)
Body: {
  name: string,
  description: string,           // opcional
  basePrice: number,
  users: number,
  connections: number,
  queues: number,
  pacoticketPlanId: number|null, // opcional — ID do plano na plataforma PacoTicket
  // módulos booleanos:
  useWhatsapp: boolean,
  useFacebook: boolean,
  useInstagram: boolean,
  // ... todos os use*
}
Response: {
  success: true,
  data: {
    id: uuid,
    name: string,
    basePrice: number,
    totalPrice: number,       // calculado pelo backend
    pacoticketPlanId: number|null,
    modules: [                // lista dos módulos ativos com label e preço
      { key: "useWhatsapp", label: "WhatsApp", price: 50 }
    ],
    ...
  }
}
```

**Backend calcula `totalPrice`:**
```javascript
async function calculateTotalPrice(planData, prisma) {
  const modulePrices = await prisma.modulePrice.findMany();
  const priceMap = Object.fromEntries(modulePrices.map(m => [m.moduleKey, Number(m.price)]));

  let total = Number(planData.basePrice);
  for (const [key, value] of Object.entries(planData)) {
    if (key.startsWith('use') && value === true && priceMap[key] !== undefined) {
      total += priceMap[key];
    }
  }
  return total;
}
```

### 2.3 Listar Planos
```
GET /api/plans
Response: {
  success: true,
  data: [
    {
      id: uuid,
      name: string,
      basePrice: number,
      totalPrice: number,
      pacoticketPlanId: number|null,
      users: number,
      connections: number,
      queues: number,
      activeModules: [{ key, label, price }],  // apenas os true
      allModules: { useWhatsapp: bool, ... },   // todos os campos use*
      clientCount: number,                      // clientes ativos neste plano
      createdAt: ISO
    }
  ]
}
```

### 2.4 Criar Cliente
```
POST /api/clients
Authorization: Bearer {accessToken}
Body: {
  resellerId: uuid,       // SUPERADMIN informa; RESELLER ignora — vem do JWT
  planId: uuid,           // ID interno do plano (nosso banco)
  companyName: string,
  contactName: string,
  email: string,
  phone: string,          // 5511999999999
  recurrence: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL",
  dueDate: "2025-12-31",  // ISO — backend converte para PacoTicket
  password: string
}
```

Backend ao criar cliente:
1. Valida `planId` existe no banco e está ativo
2. Salva `Client` no banco
3. Chama `pacoticket.service.createCompany()` → recebe `pacoticketId`
4. Atualiza `Client.pacoticketId` com o retorno
5. Registra `ActivityLog: CLIENT_CREATED`
6. Recalcula tier do revendedor

**Ao montar o payload para a API PacoTicket:**
```javascript
// Se o plano interno tem pacoticketPlanId preenchido, usar esse ID
// Se não tem, enviar sem planId (ou com o planId padrão configurado)
const pacoPayload = {
  name:         client.companyName,
  namecomplete: client.contactName,
  email:        client.email,
  phone:        client.phone,
  pais:         'BR',
  indicator:    reseller.id,
  planId:       plan.pacoticketPlanId ?? undefined,
  status:       true,
  dueDate:      formatDateForPacoticket(client.dueDate), // YYYY/MM/DD
  recurrence:   mapRecurrence(client.recurrence),
  password:     password
};
```

### 2.5 Dashboard do Revendedor
```
GET /api/resellers/me/dashboard
Authorization: Bearer {accessToken}  (RESELLER)

Response: {
  success: true,
  data: {
    reseller: { name, email, phone, document },
    tier: { current: 1|2|3, name: "Indicador"|"Revendedor"|"Master", percentage: 15|20|25 },
    progress: {
      activeClients: number,
      nextTierAt: number|null,
      remaining: number|null
    },
    currentMonth: {
      commissionTotal: number,
      commissionStatus: "PENDING"|"PAID"|"MIXED",
      activeClients: number,
      paidInvoices: number
    },
    nextDue: {
      clientName: string,
      dueDate: ISO,
      amount: number
    } | null
  }
}
```

---

## 3. Algoritmos Críticos

### 3.1 Tier
```javascript
// tier.service.js
function getTier(activeClientCount) {
  if (activeClientCount >= 10) return { tier: 3, name: 'Master',     percentage: 25 };
  if (activeClientCount >= 3)  return { tier: 2, name: 'Revendedor', percentage: 20 };
  return                              { tier: 1, name: 'Indicador',  percentage: 15 };
}

function getProgressToNextTier(activeClientCount) {
  if (activeClientCount >= 10) return { nextTierAt: null, remaining: null };
  if (activeClientCount >= 3)  return { nextTierAt: 10, remaining: 10 - activeClientCount };
  return                              { nextTierAt: 3,  remaining: 3  - activeClientCount };
}
```

### 3.2 Engine de Comissão
```javascript
// commission.service.js
async function calculateCommissions(month, year, prisma) {
  const resellers = await prisma.reseller.findMany({
    where: { status: 'ACTIVE' },
    include: {
      clients: {
        where: { status: 'ACTIVE' },
        include: {
          invoices: {
            where: {
              status: 'PAID',
              paidAt: {
                gte: new Date(year, month - 1, 1),
                lt:  new Date(year, month, 1)
              }
            }
          }
        }
      }
    }
  });

  const summary = [];

  for (const reseller of resellers) {
    const activeCount = reseller.clients.length;
    const { tier, percentage } = getTier(activeCount);

    for (const client of reseller.clients) {
      for (const invoice of client.invoices) {
        const base = Number(invoice.amount);
        const commission = parseFloat((base * percentage / 100).toFixed(2));

        await prisma.commission.upsert({
          where: {
            resellerId_clientId_periodMonth_periodYear: {
              resellerId: reseller.id,
              clientId:   client.id,
              periodMonth: month,
              periodYear:  year
            }
          },
          update:  { tier, percentage, baseAmount: base, commissionAmount: commission },
          create:  {
            resellerId: reseller.id,
            clientId:   client.id,
            invoiceId:  invoice.id,
            periodMonth: month,
            periodYear:  year,
            tier, percentage,
            baseAmount:       base,
            commissionAmount: commission,
            status: 'PENDING'
          }
        });

        summary.push({ resellerId: reseller.id, commissionAmount: commission });
      }
    }
  }

  return summary;
}
```

---

## 4. Frontend — Montador de Planos (SuperAdmin)

O formulário de criação/edição de plano é a feature mais importante do módulo de planos.

### Comportamento esperado
1. Ao abrir o formulário, carregar preços via `GET /plans/modules/prices`
2. Exibir cada módulo como toggle (checkbox estilizado) com label e preço adicional
3. Atualizar `totalPrice` em tempo real a cada toggle
4. Campo separado para `pacoticketPlanId` (number input, opcional) com tooltip explicando seu propósito
5. Ao salvar, o backend confirma o `totalPrice` real (frontend é apenas UX)

### Estrutura do formulário
```
┌─────────────────────────────────────────────────────┐
│ Nome do Plano         [___________________________] │
│ Descrição             [___________________________] │
│                                                     │
│ Usuários [__]  Conexões [__]  Filas [__]            │
│                                                     │
│ Preço Base            R$ [_________]                │
│                                                     │
│ ID na Plataforma PacoTicket  [____] (?)             │
│ ← opcional, apenas para identificação               │
│                                                     │
│ ── Módulos Adicionais ───────────────────────────── │
│ [●] WhatsApp              + R$ 50,00                │
│ [○] Facebook              + R$ 30,00                │
│ [●] Instagram             + R$ 30,00                │
│ [●] CRM                   + R$ 50,00                │
│ [○] Inteligência Artificial + R$ 80,00              │
│ ...                                                 │
│                                                     │
│ ── Resumo de Preço ──────────────────────────────── │
│ Base:     R$ 200,00                                 │
│ Módulos:  R$ 130,00  (3 módulos ativos)             │
│ Total:    R$ 330,00                                 │
│                                                     │
│           [Cancelar]          [Salvar Plano]        │
└─────────────────────────────────────────────────────┘
```

### Código do recálculo em tempo real
```javascript
let modulePrices = {};

async function initPlanForm() {
  const res = await apiRequest('GET', '/plans/modules/prices');
  modulePrices = Object.fromEntries(res.data.map(m => [m.moduleKey, Number(m.price)]));
  
  document.querySelectorAll('.module-toggle').forEach(cb => {
    cb.addEventListener('change', updatePlanTotal);
  });
  document.getElementById('basePrice').addEventListener('input', updatePlanTotal);
}

function updatePlanTotal() {
  const base = parseFloat(document.getElementById('basePrice').value) || 0;
  let modulesTotal = 0;
  let activeCount = 0;

  document.querySelectorAll('.module-toggle:checked').forEach(cb => {
    const price = modulePrices[cb.dataset.key] || 0;
    modulesTotal += price;
    activeCount++;
  });

  document.getElementById('summaryBase').textContent    = formatCurrency(base);
  document.getElementById('summaryModules').textContent = formatCurrency(modulesTotal);
  document.getElementById('summaryModuleCount').textContent = activeCount;
  document.getElementById('summaryTotal').textContent   = formatCurrency(base + modulesTotal);
}
```

---

## 5. Frontend — Portal Revendedor

### Layout do Dashboard
```
┌─────────────────────────────────────────────────┐
│  PacoTicket Revendedores    [Nome]    [Sair]    │
├─────────────────────────────────────────────────┤
│  TIER ATUAL                                     │
│  ●●●●●●●●○○  Revendedor (25%)                  │
│  8 clientes ativos · Faltam 2 para Master (35%) │
├──────────┬──────────┬──────────┬────────────────┤
│  8       │ R$1.200  │    6     │ Acme Corp      │
│ Clientes │ Comissão │ Faturas  │ vence 15/01    │
│ Ativos   │ do Mês   │ Pagas    │ R$ 437,00      │
├─────────────────────────────────────────────────┤
│ [Meus Clientes]  [Comissões]  [Perfil]         │
└─────────────────────────────────────────────────┘
```

### Tabela de Clientes — Colunas
| Empresa | Plano | Módulos | Valor/mês | Recorrência | Vencimento | Status | Fatura |

- **Plano:** nome do plano interno (ex: "Pro Plus")
- **Módulos:** ícones dos módulos ativos (tooltip com nome completo)
- **Valor/mês:** `plan.totalPrice` formatado em BRL
- **Vencimento:** vermelho se `dueDate < hoje`
- **Fatura:** badge colorido baseado no status da última `Invoice` do cliente

Badge de fatura:
```javascript
function getFaturaBadge(invoices) {
  const latest = invoices?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!latest)                   return '<span class="badge badge-gray">Sem fatura</span>';
  if (latest.status === 'PAID')  return '<span class="badge badge-green">Pago</span>';
  if (latest.status === 'OVERDUE') return '<span class="badge badge-red">Vencido</span>';
  return                                '<span class="badge badge-yellow">Pendente</span>';
}
```

### Tabela de Comissões — Colunas
| Período | Cliente | Tier | % | Base | Comissão | Status | Pago em |

Card de resumo acima da tabela:
```
┌──────────────┬──────────────┬──────────────┐
│  Pendente    │  Pago        │  Total       │
│  R$ 800,00   │  R$ 2.400,00 │  R$ 3.200,00 │
└──────────────┴──────────────┴──────────────┘
```

---

## 6. Mapeamento Completo de Módulos

```javascript
const MODULE_MAP = {
  useWhatsapp:     { label: 'WhatsApp',               icon: '💬' },
  useFacebook:     { label: 'Facebook',               icon: '📘' },
  useInstagram:    { label: 'Instagram',              icon: '📸' },
  useCampaigns:    { label: 'Campanhas',              icon: '📣' },
  useSchedules:    { label: 'Agendamentos',           icon: '📅' },
  useInternalChat: { label: 'Chat Interno',           icon: '🗨️'  },
  useExternalApi:  { label: 'API Externa',            icon: '🔌' },
  useKanban:       { label: 'Kanban',                 icon: '📋' },
  usePixel:        { label: 'Pixel',                  icon: '🎯' },
  usePerfex:       { label: 'Perfex',                 icon: '⚙️'  },
  useRD:           { label: 'RD Station',             icon: '📊' },
  useCV:           { label: 'CV CRM',                 icon: '👥' },
  useIXC:          { label: 'IXC Soft',               icon: '🖥️'  },
  useAI:           { label: 'Inteligência Artificial', icon: '🤖' },
  useCHAMA:        { label: 'Chama',                  icon: '🔥' },
  useTYPE:         { label: 'Typebot',                icon: '🤖' },
  useZAIA:         { label: 'Zaia',                   icon: '⚡' },
  useGPT:          { label: 'ChatGPT',                icon: '🧠' },
  useGPTA:         { label: 'GPT Avançado',           icon: '🧠' },
  useHS:           { label: 'HubSpot',                icon: '🔶' },
  useNNN:          { label: 'NNN',                    icon: '🔷' },
  useHUB:          { label: 'Hub de Integrações',     icon: '🔗' },
  useCRM:          { label: 'CRM',                    icon: '📇' },
  useFLOW:         { label: 'Flow Builder',           icon: '🌊' },
  useBTN:          { label: 'Botões Rápidos',         icon: '🔘' },
  useCALL:         { label: 'Chamadas',               icon: '📞' },
  useVOIP:         { label: 'VoIP',                   icon: '☎️'  },
  useDIFY:         { label: 'Dify AI',                icon: '🤖' },
  usePUSH:         { label: 'Push Notifications',     icon: '🔔' },
  useWABAOWN:      { label: 'WABA Próprio',           icon: '✅' },
  useWABAAINI:     { label: 'WABA Ainini',            icon: '✅' },
  useProducts:     { label: 'Produtos',               icon: '📦' },
  useServices:     { label: 'Serviços',               icon: '🛠️'  },
  useWEBCHAT:      { label: 'Web Chat',               icon: '💻' },
  useInternal:     { label: 'Uso Interno',            icon: '🏢' },
};
```

---

## 7. Checklist antes de implementar uma feature

- [ ] A rota verifica o `role` correto?
- [ ] Se RESELLER, o controller filtra por `resellerId` do JWT (não do body)?
- [ ] `totalPrice` do plano é calculado no backend (frontend é só UX)?
- [ ] `pacoticketPlanId` é tratado como opcional — nunca obrigatório?
- [ ] Ao criar cliente, o backend busca `plan.pacoticketPlanId` para montar o payload da API PacoTicket?
- [ ] Datas para API PacoTicket estão em `YYYY/MM/DD` (barra)?
- [ ] Comissões usam `upsert` para evitar duplicatas no mesmo período?
- [ ] `ActivityLog` é registrado após ações importantes?

---

## 8. Anti-padrões a evitar

❌ Consultar `/plans/all` da API PacoTicket para listar planos — planos são internos  
❌ Exibir `pacoticketPlanId` como campo obrigatório — é apenas referência, sempre opcional  
❌ Recalcular retroativamente o `totalPrice` de planos ao alterar preço de módulo  
❌ Expor o token PacoTicket no frontend — sempre proxy pelo backend  
❌ Calcular tier no frontend sem confirmar no backend  
❌ Revendedor acessar dados de outro — sempre filtrar por JWT no backend  
❌ Criar `Commission` sem `upsert` — gera duplicatas no mesmo período  
❌ Enviar data com traço para API PacoTicket — sempre `YYYY/MM/DD`  
❌ JWT em `localStorage` — sempre `sessionStorage`  
