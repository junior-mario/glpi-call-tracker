# GLPI REST API - Guia Pratico de Consultas

Referencia pratica para agentes de IA que precisam consultar dados do GLPI via REST API.
Baseado nos padroes reais utilizados neste projeto (GLPI 10.x, REST API com App Token + User Token).

---

## 1. Autenticacao

Toda interacao com a API exige uma sessao ativa. O ciclo e: **initSession -> operacoes -> killSession**.

### 1.1 Iniciar Sessao

```http
GET {BASE_URL}/apirest.php/initSession
Headers:
  App-Token: {APP_TOKEN}
  Authorization: user_token {USER_TOKEN}
```

**Resposta (200):**
```json
{
  "session_token": "abc123def456..."
}
```

### 1.2 Headers para Todas as Requisicoes Seguintes

```http
App-Token: {APP_TOKEN}
Session-Token: {SESSION_TOKEN}
```

### 1.3 Encerrar Sessao

Sempre encerrar ao final para liberar recursos no servidor.

```http
GET {BASE_URL}/apirest.php/killSession
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

### 1.4 Erros de Autenticacao

| Erro | Causa |
|------|-------|
| `ERROR_SESSION_TOKEN_INVALID` | Token expirado, fazer novo initSession |
| `ERROR_WRONG_APP_TOKEN_PARAMETER` | App Token incorreto |
| `ERROR_NOT_ALLOWED_IP` | IP nao autorizado na config da API |

---

## 2. Consultar Grupos

Retorna todos os grupos tecnicos cadastrados no GLPI.

```http
GET {BASE_URL}/apirest.php/Group?range=0-999&order=ASC
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

**Resposta (200 ou 206):**
```json
[
  {
    "id": 1,
    "name": "Suporte N1",
    "completename": "TI > Suporte N1",
    "entities_id": 0,
    "is_assign": 1
  },
  {
    "id": 2,
    "name": "Infraestrutura",
    "completename": "TI > Infraestrutura",
    "entities_id": 0,
    "is_assign": 1
  }
]
```

**Campos uteis:**
- `id` — ID do grupo (usar em filtros de busca)
- `name` — Nome curto
- `completename` — Nome com hierarquia completa
- `is_assign` — Se o grupo pode ser atribuido a chamados

**Nota:** HTTP 206 (Partial Content) e valido — indica paginacao.

---

## 3. Consultar Usuarios / Tecnicos

### 3.1 Buscar Usuario por ID

```http
GET {BASE_URL}/apirest.php/User/{USER_ID}
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

**Resposta:**
```json
{
  "id": 10,
  "name": "jsilva",
  "realname": "Silva",
  "firstname": "Joao",
  "email": "joao.silva@empresa.com",
  "is_active": 1
}
```

**Para montar o nome completo:**
- Se `firstname` e `realname` existem: `"Joao Silva"`
- Senao: usar campo `name` (login)

### 3.2 Identificar Tecnico de um Chamado

O tecnico atribuido nao vem diretamente no chamado. E preciso consultar o vinculo `Ticket_User`:

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/Ticket_User
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

**Resposta:**
```json
[
  {
    "id": 1,
    "tickets_id": 500,
    "users_id": 10,
    "type": 1
  },
  {
    "id": 2,
    "tickets_id": 500,
    "users_id": 25,
    "type": 2
  }
]
```

**Tipos (campo `type`):**
| type | Papel |
|------|-------|
| 1 | Solicitante (Requester) |
| 2 | Tecnico atribuido (Assigned) |
| 3 | Observador (Observer) |

Para obter o tecnico: filtrar onde `type === 2`, pegar `users_id`, depois consultar `GET /User/{users_id}`.

---

## 4. Buscar Chamados por Periodo (Search API)

A busca avancada usa o endpoint `/search/Ticket` com query params.

### 4.1 Descobrir Campos Disponiveis

```http
GET {BASE_URL}/apirest.php/listSearchOptions/Ticket
```

Retorna um objeto onde cada chave e o ID do campo de busca:

```json
{
  "1":  { "uid": "Ticket.name",       "name": "Titulo" },
  "2":  { "uid": "Ticket.id",         "name": "ID" },
  "3":  { "uid": "Ticket.priority",   "name": "Prioridade" },
  "4":  { "uid": "Ticket.users_id_recipient", "name": "Solicitante" },
  "5":  { "uid": "Ticket.users_id",   "name": "Tecnico" },
  "7":  { "uid": "Ticket.itilcategories_id", "name": "Categoria" },
  "8":  { "uid": "Ticket.groups_id",  "name": "Grupo tecnico" },
  "12": { "uid": "Ticket.status",     "name": "Status" },
  "15": { "uid": "Ticket.date",       "name": "Data de abertura" },
  "19": { "uid": "Ticket.date_mod",   "name": "Ultima atualizacao" }
}
```

**Nota sobre plugins:** Se o plugin Tag estiver instalado, o campo de tags tera um ID dinamico. Para descobri-lo, itere sobre as opcoes e procure por `uid` contendo `"plugintag"`.

### 4.2 Campos de Busca Mais Usados (Ticket)

| ID | Campo | Descricao |
|----|-------|-----------|
| 1 | name | Titulo do chamado |
| 2 | id | ID numerico |
| 3 | priority | Prioridade (1-6) |
| 4 | users_id_recipient | ID do solicitante |
| 5 | users_id (Ticket_User type=2) | ID do tecnico |
| 7 | itilcategories_id | Categoria ITIL (completename) |
| 8 | groups_id | Grupo tecnico atribuido |
| 12 | status | Status do chamado (1-6) |
| 15 | date | Data de abertura |
| 19 | date_mod | Data da ultima modificacao |

### 4.3 Busca com Filtros por Periodo e Grupo

```http
GET {BASE_URL}/apirest.php/search/Ticket?{PARAMS}
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

**Parametros (query string):**

```
forcedisplay[0]=1      # Titulo
forcedisplay[1]=2      # ID
forcedisplay[2]=12     # Status
forcedisplay[3]=15     # Data abertura
forcedisplay[4]=19     # Ultima atualizacao
forcedisplay[5]=3      # Prioridade
forcedisplay[6]=5      # Tecnico (users_id)
forcedisplay[7]=4      # Solicitante (users_id)
range=0-499            # Paginacao

# Filtro por grupo tecnico
criteria[0][field]=8
criteria[0][searchtype]=equals
criteria[0][value]=1              # ID do grupo

# Filtro por data de abertura >= DATA_INICIO
criteria[1][link]=AND
criteria[1][field]=15
criteria[1][searchtype]=morethan
criteria[1][value]=2025-12-31     # Data - 1 dia (para inclusivo)

# Filtro por data de abertura <= DATA_FIM
criteria[2][link]=AND
criteria[2][field]=15
criteria[2][searchtype]=lessthan
criteria[2][value]=2026-02-02     # Data + 1 dia (para inclusivo)
```

**IMPORTANTE sobre datas:** Os operadores `morethan` e `lessthan` sao **exclusivos** (nao incluem a data exata). Para tornar as bordas inclusivas:
- `dateFrom`: subtrair 1 dia
- `dateTo`: somar 1 dia

### 4.4 Resposta da Busca

```json
{
  "totalcount": 150,
  "count": 150,
  "sort": 1,
  "order": "ASC",
  "data": [
    {
      "1": "Problema com impressora",
      "2": 501,
      "12": 5,
      "15": "2026-01-15 08:30:00",
      "19": "2026-01-16 14:20:00",
      "3": 3,
      "5": 25,
      "4": 10
    }
  ]
}
```

**Mapeamento dos dados:**
- As chaves no objeto `data` correspondem aos IDs dos campos em `forcedisplay`
- Campos de usuario (5, 4) retornam o `users_id` — e preciso resolver para nome com `GET /User/{id}`
- `totalcount` indica o total de resultados (para paginacao)

### 4.5 Paginacao

O GLPI limita resultados por pagina (geralmente 500). Para buscar tudo:

```
Pagina 1: range=0-499
Pagina 2: range=500-999
Pagina 3: range=1000-1499
...
```

Parar quando `data` vier vazio ou `allRows.length >= totalcount`.

### 4.6 Valores de Status

| Codigo | Status |
|--------|--------|
| 1 | Novo |
| 2 | Em atendimento (Processando) |
| 3 | Planejado |
| 4 | Pendente |
| 5 | Solucionado |
| 6 | Fechado |

### 4.7 Valores de Prioridade

| Codigo | Prioridade |
|--------|------------|
| 1 | Muito baixa |
| 2 | Baixa |
| 3 | Media |
| 4 | Alta |
| 5 | Muito alta |
| 6 | Critica |

---

## 5. Consultar Chamado Individual (Dados Completos)

### 5.1 Dados Basicos do Chamado

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}
Headers:
  App-Token: {APP_TOKEN}
  Session-Token: {SESSION_TOKEN}
```

**Resposta:**
```json
{
  "id": 501,
  "name": "Problema com impressora",
  "content": "<p>A impressora do 2o andar nao imprime...</p>",
  "status": 5,
  "priority": 3,
  "date_creation": "2026-01-15 08:30:00",
  "date_mod": "2026-01-16 14:20:00",
  "users_id_recipient": 10,
  "users_id_lastupdater": 25,
  "itilcategories_id": 5,
  "type": 1,
  "urgency": 3,
  "impact": 3,
  "entities_id": 0
}
```

**Nota:** O campo `content` contem HTML. Sanitizar antes de usar.

---

## 6. Interacoes do Chamado (Timeline Completa)

Para montar a timeline completa de um chamado, e preciso consultar **5 tipos de sub-itens** separadamente.

### 6.1 Acompanhamentos (Followups / Comentarios)

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/ITILFollowup
```

**Resposta:**
```json
[
  {
    "id": 1,
    "content": "<p>Verificando o problema...</p>",
    "date_creation": "2026-01-15 09:00:00",
    "users_id": 25,
    "is_private": 0
  }
]
```

### 6.2 Solucoes

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/ITILSolution
```

**Resposta:**
```json
[
  {
    "id": 1,
    "content": "<p>Driver reinstalado, impressora funcionando.</p>",
    "date_creation": "2026-01-16 14:00:00",
    "users_id": 25,
    "status": 2
  }
]
```

**Status da solucao:**
| status | Significado |
|--------|-------------|
| 2 | Aprovada |
| 3 | Recusada |
| 4 | Aguardando aprovacao |

### 6.3 Tarefas

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/TicketTask
```

**Resposta:**
```json
[
  {
    "id": 1,
    "content": "<p>Trocado cabo USB da impressora</p>",
    "date_creation": "2026-01-15 11:00:00",
    "users_id": 25,
    "state": 2,
    "is_private": 0,
    "actiontime": 1800
  }
]
```

**State (estado da tarefa):**
| state | Significado |
|-------|-------------|
| 0 | Informacao |
| 1 | A fazer |
| 2 | Feita |

**actiontime:** Tempo gasto em segundos.

### 6.4 Validacoes

```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/TicketValidation
```

**Resposta:**
```json
[
  {
    "id": 1,
    "comment_submission": "Precisa de aprovacao para compra",
    "comment_validation": "Aprovado",
    "date_creation": "2026-01-15 10:00:00",
    "date_mod": "2026-01-15 15:00:00",
    "users_id": 10,
    "users_id_validate": 30,
    "status": 3
  }
]
```

**Status da validacao:**
| status | Significado |
|--------|-------------|
| 2 | Aguardando |
| 3 | Aprovada |
| 4 | Recusada |

**Campos de usuario:**
- `users_id` — Quem solicitou a validacao
- `users_id_validate` — Quem aprovou/recusou

### 6.5 Documentos / Anexos

Primeiro buscar os vinculos, depois os metadados de cada documento:

**Passo 1: Listar vinculos**
```http
GET {BASE_URL}/apirest.php/Ticket/{TICKET_ID}/Document_Item
```

**Resposta:**
```json
[
  {
    "id": 1,
    "documents_id": 200,
    "date_creation": "2026-01-15 08:35:00",
    "users_id": 10
  }
]
```

**Passo 2: Buscar metadados do documento**
```http
GET {BASE_URL}/apirest.php/Document/{DOCUMENT_ID}
```

**Resposta:**
```json
{
  "id": 200,
  "name": "foto_impressora",
  "filename": "foto_impressora.jpg",
  "date_creation": "2026-01-15 08:35:00",
  "users_id": 10,
  "mime": "image/jpeg"
}
```

### 6.6 Montando a Timeline Completa

Para montar a timeline de um chamado, busque todos os sub-itens em paralelo e unifique:

```
1. GET /Ticket/{id}                    -> Descricao inicial (content)
2. GET /Ticket/{id}/ITILFollowup      -> Comentarios
3. GET /Ticket/{id}/ITILSolution      -> Solucoes
4. GET /Ticket/{id}/TicketTask        -> Tarefas
5. GET /Ticket/{id}/TicketValidation  -> Validacoes
6. GET /Ticket/{id}/Document_Item     -> Anexos (+ GET /Document/{id} para cada)
7. GET /Ticket/{id}/Ticket_User       -> Tecnico e solicitante
```

**Ordenar tudo por `date_creation` para formar a timeline cronologica.**

Cada item na timeline tera:
- **data** — `date_creation`
- **autor** — resolver `users_id` com `GET /User/{id}`
- **conteudo** — `content` (HTML, sanitizar)
- **tipo** — followup, solution, task, validation, attachment

---

## 7. Resolucao de Nomes de Usuario (Cache)

Como muitas consultas retornam apenas `users_id`, e comum resolver IDs para nomes.

**Estrategia de cache recomendada:**
1. Coletar todos os `users_id` unicos dos resultados
2. Fazer `GET /User/{id}` para cada um (em paralelo)
3. Armazenar em Map/Dict: `{ id: "Nome Completo" }`
4. Reutilizar o cache dentro da mesma sessao

```
GET /User/10  -> { firstname: "Joao", realname: "Silva" }  -> "Joao Silva"
GET /User/25  -> { firstname: "Maria", realname: "Santos" } -> "Maria Santos"
```

---

## 8. Descobrir Tags (Plugin Tag)

Se o GLPI tiver o plugin Tag instalado, o campo de tags nao tem um ID fixo. Para descobri-lo:

```http
GET {BASE_URL}/apirest.php/listSearchOptions/Ticket
```

Iterar sobre o resultado e procurar um campo cujo `uid` contenha `"plugintag"`:

```json
{
  "9998": {
    "uid": "PluginTagTagItem.name",
    "name": "Tags",
    "field": "name"
  }
}
```

O ID encontrado (ex: `9998`) pode ser usado em `forcedisplay` para incluir tags nos resultados de busca.

---

## 9. Resumo dos Endpoints

| Operacao | Metodo | Endpoint |
|----------|--------|----------|
| Iniciar sessao | GET | `/apirest.php/initSession` |
| Encerrar sessao | GET | `/apirest.php/killSession` |
| Listar grupos | GET | `/apirest.php/Group?range=0-999` |
| Buscar usuario | GET | `/apirest.php/User/{id}` |
| Buscar chamado | GET | `/apirest.php/Ticket/{id}` |
| Buscar chamados (search) | GET | `/apirest.php/search/Ticket?{params}` |
| Listar campos de busca | GET | `/apirest.php/listSearchOptions/Ticket` |
| Followups do chamado | GET | `/apirest.php/Ticket/{id}/ITILFollowup` |
| Solucoes do chamado | GET | `/apirest.php/Ticket/{id}/ITILSolution` |
| Tarefas do chamado | GET | `/apirest.php/Ticket/{id}/TicketTask` |
| Validacoes do chamado | GET | `/apirest.php/Ticket/{id}/TicketValidation` |
| Anexos do chamado | GET | `/apirest.php/Ticket/{id}/Document_Item` |
| Metadados do documento | GET | `/apirest.php/Document/{id}` |
| Usuarios do chamado | GET | `/apirest.php/Ticket/{id}/Ticket_User` |

---

## 10. Exemplo Completo: Buscar Chamados Fechados de um Grupo nos Ultimos 30 Dias

```
# 1. Iniciar sessao
GET /apirest.php/initSession
  -> session_token

# 2. Buscar chamados
GET /apirest.php/search/Ticket?
  forcedisplay[0]=1&         # Titulo
  forcedisplay[1]=2&         # ID
  forcedisplay[2]=12&        # Status
  forcedisplay[3]=15&        # Data abertura
  forcedisplay[4]=19&        # Ultima atualizacao
  forcedisplay[5]=3&         # Prioridade
  forcedisplay[6]=5&         # Tecnico
  forcedisplay[7]=4&         # Solicitante
  range=0-499&
  criteria[0][field]=8&               # Grupo
  criteria[0][searchtype]=equals&
  criteria[0][value]=1&               # ID do grupo
  criteria[1][link]=AND&
  criteria[1][field]=15&              # Data abertura
  criteria[1][searchtype]=morethan&
  criteria[1][value]=2026-01-01&      # (Data inicio - 1 dia)
  criteria[2][link]=AND&
  criteria[2][field]=15&
  criteria[2][searchtype]=lessthan&
  criteria[2][value]=2026-02-02       # (Data fim + 1 dia)

# 3. Filtrar resultados onde status = 5 (Solucionado) ou 6 (Fechado)

# 4. Para cada chamado, resolver nomes:
GET /apirest.php/User/{tecnico_id}
GET /apirest.php/User/{solicitante_id}

# 5. Para timeline completa de um chamado especifico:
GET /apirest.php/Ticket/{id}
GET /apirest.php/Ticket/{id}/ITILFollowup
GET /apirest.php/Ticket/{id}/ITILSolution
GET /apirest.php/Ticket/{id}/TicketTask
GET /apirest.php/Ticket/{id}/TicketValidation
GET /apirest.php/Ticket/{id}/Document_Item
GET /apirest.php/Ticket/{id}/Ticket_User

# 6. Encerrar sessao
GET /apirest.php/killSession
```
