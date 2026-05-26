# Plano: Microservico de Abertura de Chamados em Lote (Container Separado)

## Contexto

O sistema de monitoramento gera JSONs com dispositivos inativos/alertas. Precisamos de um servico independente que receba esse JSON via API, aplique templates configuraveis e abra chamados no GLPI automaticamente. Roda em container proprio, banco proprio, sem dependencia do backend principal.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                     Docker Compose                        │
│                                                           │
│  backend (existente)       bulk-tickets (NOVO)            │
│  Port 3000 (interno)       Port 3001 (exposto)           │
│  Volume: db-data           Volume: bulk-data              │
│  SQLite: db.sqlite         SQLite: bulk-tickets.sqlite    │
│                                                           │
│  frontend (Nginx)          Acesso externo direto          │
│  Port 8888                 curl / scripts / cron          │
└──────────────────────────────────────────────────────────┘
```

- Sem compartilhamento de banco
- Sem rota no nginx — porta exposta direto
- Auth via `X-API-Key` (opcional, configuravel)
- Credenciais GLPI via body da request OU env vars

---

## Arquivos a Criar

```
bulk-tickets-service/
  index.js          ← Servico completo (Express + SQLite)
  package.json      ← Deps: express, better-sqlite3, cors
  Dockerfile        ← Node 20 Alpine (mesmo padrao do server/)
  .dockerignore     ← node_modules, *.sqlite
```

## Arquivo a Modificar

```
docker-compose.yml  ← Adicionar servico bulk-tickets + volume bulk-data
```

---

## 1. `bulk-tickets-service/package.json`

```json
{
  "name": "bulk-tickets-service",
  "version": "1.0.0",
  "private": true,
  "scripts": { "start": "node index.js" },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.1"
  }
}
```

Sem JWT, sem bcrypt — auth e por API key simples.

---

## 2. `bulk-tickets-service/Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js .

ENV DB_PATH=/data/bulk-tickets.sqlite

EXPOSE 3001

CMD ["node", "index.js"]
```

Mesmo padrao de `server/Dockerfile`.

---

## 3. `docker-compose.yml` — Adicionar servico

```yaml
  bulk-tickets:
    build: ./bulk-tickets-service
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - DB_PATH=/data/bulk-tickets.sqlite
      - API_KEY=${BULK_API_KEY:-}
      - AUTH_ENABLED=${BULK_AUTH_ENABLED:-false}
      - GLPI_BASE_URL=${GLPI_BASE_URL:-}
      - GLPI_APP_TOKEN=${GLPI_APP_TOKEN:-}
      - GLPI_USER_TOKEN=${GLPI_USER_TOKEN:-}
    volumes:
      - bulk-data:/data
    restart: unless-stopped
```

Adicionar `bulk-data:` em `volumes:`.

---

## 4. `bulk-tickets-service/index.js` — Estrutura

### Schema SQLite

```sql
CREATE TABLE IF NOT EXISTS batch_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT UNIQUE NOT NULL,
  total_items INTEGER NOT NULL,
  created_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  glpi_base_url TEXT NOT NULL,
  template_title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS created_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  glpi_ticket_id INTEGER,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',  -- created | skipped | failed
  error_message TEXT,
  item_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup ON created_tickets(dedup_key);
```

### Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `POST` | `/api/bulk-tickets` | Recebe JSON, cria chamados em lote |
| `GET` | `/api/bulk-tickets/history` | Lista batches anteriores |
| `GET` | `/api/bulk-tickets/history/:batchId` | Detalhe de um batch |
| `GET` | `/api/health` | Health check (sem auth) |

### Request `POST /api/bulk-tickets`

```json
{
  "items": [
    {
      "codigo": "11",
      "cliente": "Sergio Lulia Jacob",
      "ultima_atividade": "09/04/26 15:37",
      "tempo_inativo": "14,3 horas",
      "tempo_permitido": "12 horas",
      "situacao": "INOPERANTE",
      "arquivo": "inativos_20260410_090526.pdf",
      "generatedAt": "2026-04-10T14:56:32.237Z"
    }
  ],
  "template": {
    "title": "[{situacao}] Cod. {codigo} - {cliente}",
    "content": "<p><b>Cliente:</b> {cliente}</p><p><b>Situacao:</b> {situacao}</p><p><b>Tempo inativo:</b> {tempo_inativo}</p>"
  },
  "ticket_defaults": {
    "type": 1,
    "urgency": 4,
    "impact": 4,
    "itilcategories_id": 5,
    "_groups_id_assign": 3
  },
  "glpi": {
    "base_url": "https://glpi.empresa.com",
    "app_token": "abc123",
    "user_token": "xyz789"
  },
  "dedup_key": ["codigo", "arquivo"]
}
```

- `items` — obrigatorio, array com campos livres
- `template` — obrigatorio, `{campo}` e substituido pelos valores do item
- `ticket_defaults` — opcional, campos fixos enviados ao GLPI para todos os tickets
- `glpi` — opcional se env vars estiverem configuradas, body tem prioridade
- `dedup_key` — opcional, array de nomes de campos que formam a chave unica (ex: `codigo=11|arquivo=inativos_20260410_090526.pdf`)

### Response `POST /api/bulk-tickets`

```json
{
  "batch_id": "uuid-aqui",
  "summary": { "total": 3, "created": 2, "skipped": 1, "failed": 0 },
  "results": [
    { "index": 0, "status": "created", "glpi_ticket_id": 1500, "title": "[INOPERANTE] Cod. 11 - Sergio...", "dedup_key": "codigo=11|arquivo=inativos..." },
    { "index": 1, "status": "skipped", "reason": "duplicate", "dedup_key": "codigo=150|arquivo=inativos..." },
    { "index": 2, "status": "created", "glpi_ticket_id": 1502, "title": "[INOPERANTE] Cod. 443 - Alan...", "dedup_key": "codigo=443|arquivo=inativos..." }
  ]
}
```

### Funcoes internas do index.js

1. **`interpolate(template, item)`** — substitui `{campo}` pelos valores do item
2. **`computeDedupKey(item, fields)`** — gera chave tipo `campo1=valor1|campo2=valor2`
3. **`initSession(glpiConfig)`** — `GET /apirest.php/initSession` (mesmo padrao de `glpiService.ts:280`)
4. **`killSession(baseUrl, appToken, sessionToken)`** — `GET /apirest.php/killSession`
5. **`createGLPITicket(baseUrl, appToken, sessionToken, ticketData)`** — `POST /apirest.php/Ticket`
6. **Auth middleware** — verifica `X-API-Key` se `AUTH_ENABLED=true`

### Fluxo do endpoint principal

```
1. Valida body (items obrigatorio, template obrigatorio)
2. Resolve credenciais GLPI (body ?? env vars)
3. Gera batch_id (crypto.randomUUID)
4. Abre 1 sessao GLPI (initSession)
5. Para cada item:
   a. Computa dedup_key
   b. Verifica duplicata no SQLite → se existe, skip
   c. Interpola template (titulo + conteudo)
   d. POST /apirest.php/Ticket com { input: { name, content, ...defaults } }
   e. Grava resultado no SQLite
   f. Se falha em 1 item, continua os demais (try/catch individual)
6. Fecha sessao GLPI (killSession)
7. Grava batch_runs com contadores
8. Retorna JSON com batch_id + summary + results
```

### Resiliencia

- Se sessao GLPI expira no meio do lote: detecta `ERROR_SESSION_TOKEN_INVALID`, faz novo `initSession`, retenta o item
- `express.json({ limit: '10mb' })` para lotes grandes
- Limite de 100 items por request (configuravel via `MAX_ITEMS` env)

---

## Variaveis de Ambiente

| Variavel | Default | Uso |
|----------|---------|-----|
| `PORT` | `3001` | Porta HTTP |
| `DB_PATH` | `/data/bulk-tickets.sqlite` | Caminho do SQLite |
| `API_KEY` | (vazio) | Chave para auth via `X-API-Key` |
| `AUTH_ENABLED` | `false` | Ativar/desativar auth |
| `MAX_ITEMS` | `100` | Limite de items por request |
| `GLPI_BASE_URL` | (vazio) | URL base GLPI default |
| `GLPI_APP_TOKEN` | (vazio) | App token GLPI default |
| `GLPI_USER_TOKEN` | (vazio) | User token GLPI default |

---

## Verificacao / Testes

1. `cd bulk-tickets-service && npm install && node index.js` — servico sobe na porta 3001
2. `curl http://localhost:3001/api/health` — deve retornar `{ "status": "ok" }`
3. `curl -X POST http://localhost:3001/api/bulk-tickets -H "Content-Type: application/json" -d '{ JSON de teste }'` — cria tickets e retorna relatorio
4. Enviar mesmo JSON novamente — items devem vir como `skipped` (dedup)
5. `curl http://localhost:3001/api/bulk-tickets/history` — lista batches
6. `docker-compose up --build` — verifica que o container sobe junto com os demais
