# No painel do parceiro

* Observe no primeiro print, do menu Propostas, que na seção "Taxa de Setup Adicional", existem dois campos. O "acréscimo", que é um campo editável, e o "Setup total cobrado do cliente", que é um campo não editável, e já vem pré configurado do plano base.

* Preciso que, os valores capturados ali, sejam os valores que aparecem na sessão "Taxa de Setup", do segundo print, de forma fiel. Provavelmente, teremos que armazenar o id do plano base no plano do parceiro, para buscar esses dados de forma mais assertiva. 

* Ainda sobre o segundo print. Alterar um item de Infraestrutura (seja adicionando ou retirando), Módulos Adicionais, deve impactar na "Precificação", na "Taxa de Setup" e nos itens do card logo abaixo, que pode ser visto no terceiro print. é o seguimento do segundo, como pode ser observado.

# Me de o schema_update.sql para essas alterações, por favor.

Em se falando de planos, cards de planos, edição de planos, observe o primeiro e o segundo print, como são apresentados no painel do parceiro. Observe os terceiro e quarto prints, como são apresentados no painel do SuperAdmin.

Quero uma mistura entre os dois. 

A granularidade de dados do parceiro, presentes na visão do parceiro (primeiro e segundo print), aplicados na visão do superadmin. Visual e funções de Infraestrutura e Modulos Adicionais na visão do parceiro, devem seguir o modelo do segundo e terceiro prints, que são da visão do superadmin


Na visualização do parceiro:

a aparencia, os seletores, e os icones devem aparecer também nos modulos adicionais do parceiro.
Ao mudar os valores dos campos de infraestura: "Usuarios", "Filas", "Whatsapp não oficial", "Whatsapp Oficial" deve necessáriamente alterar o valor em "Preço Mensal"

Na visualização do superadmin:

De "ID do Plano na PacoTicket" para cima, deve seguir a mesma aparencia dessa area na visualização do parceiro.



