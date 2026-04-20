# README - Consultas GLPI Para IA (Grupos e Tecnico)

## Objetivo
Este documento explica como o sistema consulta o GLPI hoje, quais campos usa, quais variaveis controla e como aplicar filtros por grupo tecnico e por tecnico.

A ideia e permitir que uma IA replique o mesmo comportamento com alta fidelidade.

---

## 0) De Onde Vem a Configuracao

O front carrega credenciais do GLPI via backend:

- `GET /api/glpi-config`
  - retorna `base_url`, `app_token`, `user_token`, `poll_interval`, `overview_group_id`, `overview_days`
- fallback local (quando nao existe config no backend):
  - `VITE_GLPI_URL`
  - `VITE_GLPI_APP_TOKEN`
  - `VITE_GLPI_USER_TOKEN`

Normalizacao da URL:
- remove barra final
- remove `/apirest.php` se vier duplicado

Em ambiente de desenvolvimento, o sistema pode usar proxy local (`/glpi-api`) para evitar CORS.

---

## 1) Variaveis de Entrada Minimas

Use este bloco como contrato de entrada para a IA:

```json
{
  "baseUrl": "https://seu-glpi.com",
  "appToken": "GLPI_APP_TOKEN",
  "userToken": "GLPI_USER_TOKEN",
  "groupId": 123,
  "dateFrom": "2026-04-01",
  "dateTo": "2026-04-20",
  "filters": {
    "statusFilter": "all",
    "priorityFilter": "all",
    "technicianFilter": "all",
    "tagFilter": "all"
  }
}
```

Regras:
- `groupId`: `number | null` (`null` = todos os grupos).
- `dateFrom` e `dateTo`: formato `yyyy-MM-dd`.
- `baseUrl`: pode vir com ou sem `/apirest.php`; o sistema normaliza.

---

## 2) Fluxo Oficial de Consulta (Implementacao Atual)

## 2.1) Iniciar sessao GLPI
Endpoint:
- `GET {baseUrlNormalizada}/apirest.php/initSession`

Headers:
- `App-Token: {appToken}`
- `Authorization: user_token {userToken}`

Saida esperada:
- JSON com `session_token`.

Se retornar HTML (`<!DOCTYPE html>`), a URL/token nao esta no endpoint REST valido.

## 2.2) Buscar grupos tecnicos
Endpoint:
- `GET {baseUrl}/apirest.php/Group?range=0-999&order=ASC`

Headers:
- `App-Token`
- `Session-Token`

O sistema aceita `HTTP 200` ou `HTTP 206`.

## 2.3) Descobrir campo de Tags (plugin)
Endpoint:
- `GET {baseUrl}/apirest.php/listSearchOptions/Ticket`

Regra:
- Procurar opcao cujo `uid` contenha `plugintag`.
- Guardar o `id` numerico encontrado em `tagFieldId`.
- Se nao achar, continuar sem campo de tag.

## 2.4) Buscar chamados por grupo e periodo
Endpoint base:
- `GET {baseUrl}/apirest.php/search/Ticket?...`

### Campos `forcedisplay` usados
- `forcedisplay[0]=1`  -> titulo (`name`)
- `forcedisplay[1]=2`  -> id do chamado
- `forcedisplay[2]=12` -> status
- `forcedisplay[3]=15` -> data de abertura
- `forcedisplay[4]=19` -> data de atualizacao
- `forcedisplay[5]=3`  -> prioridade
- `forcedisplay[6]=5`  -> tecnico
- `forcedisplay[7]=4`  -> solicitante
- `forcedisplay[8]={tagFieldId}` -> tags (somente se existir)

### Criteria usados
Filtro de grupo (somente se `groupId` nao nulo):
- `criteria[i][field]=8`
- `criteria[i][searchtype]=equals`
- `criteria[i][value]={groupId}`

Filtro de data de abertura:
- `field=15`
- `searchtype=morethan` com `dateFrom - 1 dia`
- `searchtype=lessthan` com `dateTo + 1 dia`

Isso torna o intervalo inclusivo na pratica.

### Paginacao
- `range` de `500` em `500`
- faixa por chamada: `0-499`, `500-999`, etc
- limite maximo: `5000` itens
- para quando `allRows.length >= totalcount`

---

## 3) Mapeamento de Campos e Tipos

## 3.1) Linha crua vinda de `search/Ticket`
O sistema le:
- `row["2"]`   -> `id`
- `row["1"]`   -> `name`
- `row["12"]`  -> `status` (numero GLPI)
- `row["3"]`   -> `priority` (numero GLPI)
- `row["15"]`  -> `date` (abertura)
- `row["19"]`  -> `date_mod` (ultima atualizacao)
- `row["5"]`   -> tecnico (id ou texto)
- `row["4"]`   -> solicitante (id ou texto)
- `row[tagFieldId]` -> tags (se existir)

## 3.2) Resolucao de nomes (tecnico e solicitante)
Se `row["5"]` ou `row["4"]` for numero valido (`>0`), resolver com:
- `GET /apirest.php/User/{id}`

Se vier texto bruto no proprio `search`, manter o texto.

## 3.3) Estrutura final por chamado (`MonitorTicket`)
```json
{
  "id": 12169,
  "name": "Titulo do chamado",
  "technician": "Nome tecnico",
  "requester": "Nome solicitante",
  "status": 2,
  "priority": 3,
  "date": "2026-03-21 10:00:00",
  "date_mod": "2026-03-24 08:10:00",
  "tags": "associado$$vip"
}
```

---

## 4) Filtros Por Tecnico e Grupo (Como o Sistema Faz Hoje)

## 4.1) Grupo tecnico
Aplica no GLPI via `criteria field=8 equals groupId`.

## 4.2) Tecnico no Monitor (`src/pages/Monitor.tsx`)
Filtro local (apos consulta GLPI):
- `technicianFilter === "all"` -> nao filtra
- senao -> `ticket.technician === technicianFilter` (igualdade exata)

Filtros locais adicionais do Monitor:
- Status:
  - `unsolved` exclui status `5` e `6`
  - filtro `3` aceita status `3` e `4`
  - demais: igualdade exata
- Prioridade: igualdade numerica (`ticket.priority === Number(priorityFilter)`)
- Tag: `contains` case-insensitive em `ticket.tags`

## 4.3) Tecnico em Dashboard custom (modo columns)
No modo `columns`, o filtro `filter_technician` e parcial (`includes` case-insensitive), com regra por coluna:

- Coluna "Abertos":
  - compara com **solicitante** (`requester`)
- Coluna "Atualizados":
  - compara com **tecnico atribuido** (`assignee`)
- Coluna "Fechados":
  - compara com **tecnico atribuido** (`assignee`)

Observacao importante:
- O campo `filter_requester` existe no modelo e e salvo, mas hoje nao esta aplicado no filtro em `CustomDashboardsTab`.

---

## 5) Consulta de Chamado + Interacoes (Detalhe Completo)

Para um ticket especifico (`ticketId`), o sistema consulta:

1. `GET /apirest.php/Ticket/{ticketId}`
2. `GET /apirest.php/Ticket/{ticketId}/ITILFollowup`
3. `GET /apirest.php/Ticket/{ticketId}/ITILSolution`
4. `GET /apirest.php/Ticket/{ticketId}/TicketTask`
5. `GET /apirest.php/Ticket/{ticketId}/TicketValidation`
6. `GET /apirest.php/Ticket/{ticketId}/Document_Item`
7. `GET /apirest.php/Ticket/{ticketId}/Ticket_User` (para achar atribuido)
8. `GET /apirest.php/Document/{documentId}` (para anexos)
9. `GET /apirest.php/User/{userId}` (resolver nomes)

Depois, monta `updates[]` com tipos:
- `comment`
- `solution`
- `task`
- `validation`
- `attachment`

E ordena por data decrescente.

---

## 6) Mapeamento de Status e Prioridade

## 6.1) Status GLPI -> status interno
- `1` -> `new`
- `2` -> `in-progress`
- `3` -> `pending`
- `4` -> `pending`
- `5` -> `resolved`
- `6` -> `closed`

## 6.2) Prioridade GLPI -> prioridade interna
- `1` -> `low`
- `2` -> `low`
- `3` -> `medium`
- `4` -> `high`
- `5` -> `urgent`
- `6` -> `urgent`

---

## 7) Exemplo Pratico de Query String (`search/Ticket`)

Exemplo para:
- grupo `8`
- periodo `2026-04-01` ate `2026-04-20`
- primeira pagina `0-499`

```text
forcedisplay[0]=1
&forcedisplay[1]=2
&forcedisplay[2]=12
&forcedisplay[3]=15
&forcedisplay[4]=19
&forcedisplay[5]=3
&forcedisplay[6]=5
&forcedisplay[7]=4
&range=0-499
&criteria[0][field]=8
&criteria[0][searchtype]=equals
&criteria[0][value]=8
&criteria[1][link]=AND
&criteria[1][field]=15
&criteria[1][searchtype]=morethan
&criteria[1][value]=2026-03-31
&criteria[2][link]=AND
&criteria[2][field]=15
&criteria[2][searchtype]=lessthan
&criteria[2][value]=2026-04-21
```

---

## 8) Pseudocodigo Para IA Executar

```pseudo
input: config, groupId, dateFrom, dateTo, localFilters

sessionToken = initSession(config)
try:
  tagFieldId = discoverTagFieldId(sessionToken) // optional

  adjustedFrom = dateFrom - 1 day
  adjustedTo   = dateTo + 1 day

  rows = []
  for start in [0..5000 step 500]:
    end = start + 499
    query = buildSearchQuery(groupId, adjustedFrom, adjustedTo, start, end, tagFieldId)
    page = GET /search/Ticket?query
    append page.data into rows
    if rows >= page.totalcount: break

  rows = resolveUsersFromFields4and5(rows) // requester and technician
  tickets = mapRowsToMonitorTicket(rows, tagFieldId)
  tickets = applyLocalFilters(tickets, localFilters)

  return tickets
finally:
  killSession(sessionToken)
```

---

## 9) Erros Comuns e Diagnostico Rapido

- `Failed to fetch` com CORS:
  - chamada direta do browser para dominio GLPI sem permissao CORS.

- `Unexpected token '<'` ou `content-type: text/html`:
  - retornou pagina HTML (login/documentacao) no lugar de JSON REST.
  - normalmente URL base incorreta, token invalido, ou endpoint nao REST.

- `HTTP 200 sem session_token` no `initSession`:
  - resposta nao JSON da API REST.
  - validar `baseUrl` real da API (`.../apirest.php`) e tokens.

---

## 10) Referencias de Codigo (fonte da verdade)

- `src/services/glpiService.ts`
  - `initSession`, `killSession`
  - `fetchGLPIGroups`
  - `discoverTagFieldId`
  - `searchTicketsByGroup`
  - `fetchGLPITicket`

- `src/pages/Monitor.tsx`
  - filtros locais por status, prioridade, tecnico e tag

- `src/components/dashboard/CustomDashboardsTab.tsx`
  - regra de filtro por tecnico nas 3 colunas

- `src/components/dashboard/OverviewTab.tsx`
  - consulta automatica da visao geral por periodo/grupo configurado
