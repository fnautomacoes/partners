Prompt de Atualização — PacoTicket SuperAdmin
Contexto
Este sistema foi criado a partir do prompt-inicial-claude-code.md e já está rodando em produção com Docker Swarm. O backend Express + Prisma + PostgreSQL está funcional. O frontend superadmin.html e superadmin.js existem mas várias abas estão incompletas ou sem funcionalidade real ligada ao backend.
Leia antes de começar:
* CLAUDE.md — arquitetura, schema, APIs, regras de negócio
* pacoticket-reseller-skill.md — algoritmos e contratos detalhados
* A estrutura atual do projeto em frontend/superadmin.html e frontend/superadmin.js
Objetivo desta atualização
Tornar todos os menus do SuperAdmin completamente funcionais, integrados ao backend existente, sem quebrar nada que já funciona.
Regras inegociáveis (não mude)
1. Terminologia: o usuário é chamado de parceiro (nunca revendedor/reseller). Endpoints internos e variáveis de código usam partner/partnerId. Nenhuma ocorrência de "revendedor" ou "reseller" pode aparecer na interface.
2. Planos são 100% internos. Jamais consulte a API PacoTicket para listar, criar ou editar planos.
3. Design: mantenha o tema azul (#1e3a8a, #2563eb), layout de abas, e o padrão visual já existente.
4. Autenticação: JWT em sessionStorage. Botão "Sair" deve chamar POST /api/auth/logout, limpar sessionStorage e redirecionar para login.html.
5. API Base: todas as chamadas usam /api (relativo, sem hostname) — o nginx já faz o proxy.
6. Response padrão do backend: { success: true, data: {} } — sempre acessar .data ao consumir.
O que deve ser implementado / corrigido
1. Botão "Sair"
O botão Sair no header deve:
async function logout() {   try {     await apiRequest('POST', '/auth/logout');   } finally {     sessionStorage.clear();     window.location.href = 'login.html';   } } 
Funciona mesmo se o backend retornar erro (bloco finally).
2. Aba Dashboard
Carregar dados reais via GET /api/partners e GET /api/clients e GET /api/commissions/summary.
Componentes obrigatórios:
* 4 KPI Cards: Total de Parceiros Ativos | Total de Clientes Ativos | Comissões Pendentes (R$) | Receita Mensal Total (R$)
* Tabela Top Parceiros: nome, tier (badge colorido), clientes ativos, comissão do mês — ordenado por clientes ativos desc, limitado a 5
* Log de Atividades Recentes: GET /api/activity-log ou os últimos registros de ActivityLog — exibir ação, descrição, data. Se o endpoint não existir, exibir mensagem "Nenhuma atividade recente"
* Distribuição por Tier: 3 cards mostrando quantos parceiros estão em cada tier (calcular no frontend a partir da lista de parceiros)
Formato de tier:
Tier 1 — Indicador  : 1–2 clientes ACTIVE → 15% Tier 2 — Parceiro   : 3–9 clientes ACTIVE → 25% Tier 3 — Master     : 10+ clientes ACTIVE → 35% 
3. Aba Parceiros
CRUD completo ligado ao backend.
Listagem (GET /api/partners):
* Tabela com: Nome, Email, Telefone, CPF/CNPJ, Tier (badge), Clientes Ativos, Comissão Pendente, Status (badge), Ações
* Botões por linha: Editar (abre modal preenchido) | Ver Clientes (filtra aba Clientes por esse parceiro) | Desativar/Ativar
Modal Novo/Editar Parceiro:
* Campos: Nome completo*, Email*, Senha (obrigatório só na criação), Telefone*, CPF/CNPJ, Status (select: Ativo/Inativo — só aparece ao editar)
* POST /api/partners para criar | PUT /api/partners/:id para editar
* Ao salvar, recarregar a listagem
Desativar: DELETE /api/partners/:id (soft delete) com confirmação confirm()
Card de detalhe (drawer ou seção expansível):
* Tier atual + barra de progresso para o próximo
* Lista dos clientes vinculados com status
* Histórico de comissões dos últimos 3 meses
4. Aba Planos
CRUD completo com montador de módulos.
Listagem (GET /api/plans):
* Cards ou tabela: Nome, Preço Base, Preço Total, Usuários, Conexões, Filas, Módulos ativos (badges), Clientes vinculados, Badge "PacoTicket #N" se pacoticketPlanId preenchido, Ações (Editar | Desativar)
Modal Novo/Editar Plano:
* Campos básicos: Nome*, Descrição, Preço Base*, Usuários*, Conexões*, Filas*
* Campo pacoticketPlanId: number input, label "ID do Plano na PacoTicket", texto auxiliar: "Opcional. Preencha se este plano corresponde a um plano existente na plataforma PacoTicket. Usado apenas para identificação."
* Montador de módulos: carregar via GET /api/plans/modules/prices, renderizar cada módulo como toggle pill (label + preço). Ao ativar/desativar um módulo, recalcular o total em tempo real:
totalPrice = basePrice + SUM(preço dos módulos ativos) 
* Exibir subtotal de módulos e totalPrice em tempo real, formatado em BRL
* POST /api/plans para criar | PUT /api/plans/:id para editar
Desativar: DELETE /api/plans/:id com confirmação. Exibir erro da API se o plano tiver clientes ativos.
5. Aba Clientes
CRUD completo.
Listagem (GET /api/clients):
* Filtros: Parceiro (select), Status (select), Plano (select)
* Tabela: Empresa, Contato, Email, Parceiro, Plano (com badge PacoTicket se aplicável), Recorrência, Vencimento (vermelho se vencido), Status, Fatura (badge: Pago/Pendente/Vencido/Sem fatura), Ações
Função de badge de fatura:
function faturaBadge(invoices) {   const last = invoices?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];   if (!last)                       return badge('Sem fatura', 'gray');   if (last.status === 'PAID')      return badge('Pago',      'green');   if (last.status === 'OVERDUE')   return badge('Vencido',   'red');   return                                  badge('Pendente',  'yellow'); } 
Modal Novo/Editar Cliente:
* Campos: Nome da Empresa*, Nome do Contato*, Email*, Telefone*, Parceiro* (select de GET /api/partners), Plano* (select de GET /api/plans — exibir nome + preço total), Recorrência* (Mensal/Trimestral/Semestral/Anual), Data de Vencimento*
* Ao selecionar plano, mostrar abaixo os módulos ativos do plano selecionado
* Senha (só na criação, se aplicável ao fluxo)
* POST /api/clients | PUT /api/clients/:id
Desativar: DELETE /api/clients/:id com confirmação.
6. Aba Comissões
Filtros: Mês (select 1–12), Ano (select últimos 3 anos), Parceiro (select), Status (Pendente/Pago/Cancelado)
Botão "Calcular Comissões": POST /api/commissions/calculate com { month, year }. Exibir resultado: quantas foram processadas e valor total.
Card de resumo no topo: Pendente | Pago | Total — do período filtrado via GET /api/commissions/summary
Tabela (GET /api/commissions):
* Parceiro, Cliente, Período, Tier (badge), %, Base (R$), Comissão (R$), Status (badge), Pago em, Ação
Botão "Marcar como Pago" por linha: PUT /api/commissions/:id/pay. Visível apenas para status PENDING.
Exportar CSV: gerar CSV no frontend com os dados exibidos na tabela. Usar Blob + URL.createObjectURL:
function exportCSV(data) {   const headers = ['Parceiro','Cliente','Período','Tier','%','Base','Comissão','Status'];   const rows = data.map(c => [     c.partner?.name, c.client?.companyName,     `${c.periodMonth}/${c.periodYear}`,     c.tier, c.percentage,     formatCurrency(c.baseAmount), formatCurrency(c.commissionAmount),     c.status   ]);   const csv = [headers, ...rows].map(r => r.join(';')).join('\n');   const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });   const url = URL.createObjectURL(blob);   const a = document.createElement('a');   a.href = url; a.download = `comissoes_${Date.now()}.csv`; a.click(); } 
7. Aba Faturas
Botão "Sincronizar PacoTicket": POST /api/invoices/sync. Mostrar resultado: quantas faturas foram sincronizadas.
Filtros: Mês, Ano, Status (Pendente/Pago/Vencido/Cancelado), Cliente
Tabela (GET /api/invoices):
* Cliente, Parceiro, Plano, Valor (R$), Vencimento (vermelho se vencido e não pago), Status (badge colorido), Pago em
8. Aba Configurações
Seção: Preços dos Módulos
* Tabela editável com todos os 35 módulos (carregar via GET /api/plans/modules/prices)
* Cada linha: Label, moduleKey (somente leitura, fonte menor cinza), campo de preço editável
* Botão "Salvar Preços" → PUT /api/plans/modules/prices com array [{ moduleKey, price }]
* Aviso fixo abaixo do botão: "⚠️ Alterar preços não recalcula planos já cadastrados. Edite os planos manualmente se necessário."
Seção: Token PacoTicket
* Texto: "O token de acesso à API PacoTicket está configurado via variável de ambiente no servidor e não pode ser editado por aqui."
* Badge verde "Configurado" (sempre — não temos como verificar do frontend)
Seção: Regras de Comissionamento (somente leitura)
* 3 cards com as regras de tier conforme CLAUDE.md:
   * Tier 1 — Indicador (15%): 1 a 2 clientes ativos
   * Tier 2 — Parceiro (25%): 3 a 9 clientes ativos
   * Tier 3 — Master (35%): 10 ou mais clientes ativos
Padrões obrigatórios
Helper de requisição (já existe, manter exatamente assim)
const API_BASE = '/api';  async function apiRequest(method, endpoint, body = null) {   const token = sessionStorage.getItem('access_token');   const opts = {     method,     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }   };   if (body) opts.body = JSON.stringify(body);   let res = await fetch(`${API_BASE}${endpoint}`, opts);   if (res.status === 401) {     const refreshed = await tryRefreshToken();     if (!refreshed) { redirectToLogin(); return null; }     return apiRequest(method, endpoint, body);   }   return res.json(); } 
Formatação
const formatCurrency = (v) =>   new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);  const formatDate = (iso) =>   iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'; 
Estados de carregamento
Toda seção que faz requisição ao backend deve mostrar um spinner enquanto carrega e uma mensagem amigável se a lista estiver vazia.
Tratamento de erros
async function loadAlgo() {   try {     const res = await apiRequest('GET', '/endpoint');     if (!res?.success) throw new Error(res?.message || 'Erro desconhecido');     renderAlgo(res.data);   } catch (err) {     showToast(err.message, 'error');   } } 
Toast de feedback
Implementar função showToast(message, type) (type: 'success' | 'error' | 'warning') que exibe notificação no canto inferior direito por 3 segundos.
O que NÃO mudar
* login.html — está funcionando, não toque
* partner.html e partner.js — portal do parceiro, não toque
* Todo o backend — não altere nenhum arquivo em backend/
* docker-stack.yml, Dockerfiles, nginx.conf — infraestrutura, não toque
Entrega
Reescreva frontend/superadmin.html e frontend/superadmin.js com todas as funcionalidades acima implementadas.
Ao concluir, liste o que foi implementado em cada aba e confirme que o botão Sair está funcional.