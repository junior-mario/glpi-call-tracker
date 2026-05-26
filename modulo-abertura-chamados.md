# Modulo de Abertura Automatica de Chamados via API GLPI

Documento de projeto para implementar a funcionalidade de **abrir chamados automaticamente no GLPI** a partir de um JSON de dados estruturados (ex: relatorio de equipamentos inativos), sem interacao manual de formulario.

---

## 1. Visao Geral

O sistema recebe um **array JSON** com informacoes de equipamentos/clientes (ex: inativos, fora de SLA) e, para cada item, cria automaticamente um chamado no GLPI via REST API.

### Caso de uso principal

Um sistema de monitoramento gera um JSON com dispositivos inativos:

```json
[
  {
    "codigo": "11",
    "cliente": "Sergio Lulia Jacob",
    "ultima_atividade": "09/04/26 15:37",
    "tempo_inativo": "14,3 horas",
    "tempo_permitido": "12 horas",
    "situacao": "INOPERANTE",
    "arquivo": "inativos_20260410_090526.pdf",
    "generatedAt": "2026-04-10T14:56:32.237Z"
  },
  {
    "codigo": "150",
    "cliente": "Rafael Marques Canto Porto",
    "ultima_atividade": "09/04/26 15:32",
    "tempo_inativo": "14,3 horas",
    "tempo_permitido": "1 horas",
    "situacao": "INOPERANTE",
    "arquivo": "inativos_20260410_090526.pdf",
    "generatedAt": "2026-04-10T14:56:32.237Z"
  },
  {
    "codigo": "443",
    "cliente": "Alan Goldlust",
    "ultima_atividade": "09/04/26 17:24",
    "tempo_inativo": "12,5 horas",
    "tempo_permitido": "1 horas",
    "situacao": "INOPERANTE",
    "arquivo": "inativos_20260410_090526.pdf",
    "generatedAt": "2026-04-10T14:56:32.237Z"
  }
]
```

Para cada item, o sistema abre um chamado no GLPI automaticamente.

### Fluxo resumido

```
JSON de entrada → Backend recebe array → Abre sessao GLPI (1x)
→ Loop: transforma cada item em ticket → POST /apirest.php/Ticket
→ Coleta resultados (sucesso/falha por item) → Fecha sessao → Retorna relatorio
```

---

## 2. Estrutura do JSON de Entrada

### Formato esperado

```typescript
interface DispositivoInativo {
  codigo: string;           // Codigo/ID do dispositivo no sistema de monitoramento
  cliente: string;          // Nome do cliente/responsavel
  ultima_atividade: string; // Data/hora da ultima atividade (formato "DD/MM/AA HH:mm")
  tempo_inativo: string;    // Tempo sem atividade (ex: "14,3 horas")
  tempo_permitido: string;  // Limite maximo permitido (ex: "12 horas")
  situacao: string;         // Estado atual (ex: "INOPERANTE")
  arquivo: string;          // Nome do relatorio PDF de origem
  generatedAt: string;      // Timestamp ISO de quando o relatorio foi gerado
}
```

### Campos opcionais adicionais (configuracao)

Alem do array de dispositivos, o endpoint pode receber configuracoes que se aplicam a **todos** os chamados do lote:

```typescript
interface BulkTicketRequest {
  items: DispositivoInativo[];   // Array de dispositivos
  config?: {
    type?: 1 | 2;               // 1=Incidente, 2=Requisicao. Default: 1
    urgency?: 1 | 2 | 3 | 4 | 5; // Default: 4 (Alta)
    impact?: 1 | 2 | 3 | 4 | 5;  // Default: 4 (Alto)
    itilcategories_id?: number;  // Categoria ITIL fixa para todos
    _groups_id_assign?: number;  // Grupo tecnico para atribuir
    entities_id?: number;        // Entidade. Default: 0
    requesttypes_id?: number;    // Tipo de requisicao. Default: 7 (Outro)
  };
}
```

---

## 3. Transformacao: JSON → Ticket GLPI

Cada item do array e transformado em um payload de ticket:

### Regra de mapeamento

| Campo JSON entrada | Campo GLPI Ticket | Logica |
|---------------------|-------------------|--------|
| `codigo` + `cliente` | `name` (titulo) | `"[INOPERANTE] Cod. {codigo} - {cliente}"` |
| todos os campos | `content` (descricao) | Template HTML com todas as informacoes |
| `situacao` | `urgency` | INOPERANTE = 4 (Alta), outros = 3 (Media) |
| (config) | `type` | Default: 1 (Incidente) |
| (config) | `itilcategories_id` | Categoria fixa configuravel |
| (config) | `_groups_id_assign` | Grupo tecnico configuravel |

### Template de titulo

```
[{situacao}] Cod. {codigo} - {cliente}
```

**Exemplos gerados:**
- `[INOPERANTE] Cod. 11 - Sergio Lulia Jacob`
- `[INOPERANTE] Cod. 150 - Rafael Marques Canto Porto`
- `[INOPERANTE] Cod. 443 - Alan Goldlust`

### Template de descricao (content)

```html
<h3>Alerta de Equipamento Inativo</h3>
<table border="1" cellpadding="5" cellspacing="0">
  <tr><td><b>Codigo</b></td><td>{codigo}</td></tr>
  <tr><td><b>Cliente</b></td><td>{cliente}</td></tr>
  <tr><td><b>Situacao</b></td><td>{situacao}</td></tr>
  <tr><td><b>Ultima Atividade</b></td><td>{ultima_atividade}</td></tr>
  <tr><td><b>Tempo Inativo</b></td><td>{tempo_inativo}</td></tr>
  <tr><td><b>Tempo Permitido</b></td><td>{tempo_permitido}</td></tr>
  <tr><td><b>Relatorio de Origem</b></td><td>{arquivo}</td></tr>
  <tr><td><b>Gerado em</b></td><td>{generatedAt}</td></tr>
</table>
<p><i>Chamado aberto automaticamente pelo sistema de monitoramento.</i></p>
```

### Exemplo de payload gerado para a API GLPI

Para o item `codigo: "11"`:

```json
{
  "input": {
    "name": "[INOPERANTE] Cod. 11 - Sergio Lulia Jacob",
    "content": "<h3>Alerta de Equipamento Inativo</h3><table border=\"1\" cellpadding=\"5\" cellspacing=\"0\"><tr><td><b>Codigo</b></td><td>11</td></tr><tr><td><b>Cliente</b></td><td>Sergio Lulia Jacob</td></tr><tr><td><b>Situacao</b></td><td>INOPERANTE</td></tr><tr><td><b>Ultima Atividade</b></td><td>09/04/26 15:37</td></tr><tr><td><b>Tempo Inativo</b></td><td>14,3 horas</td></tr><tr><td><b>Tempo Permitido</b></td><td>12 horas</td></tr><tr><td><b>Relatorio de Origem</b></td><td>inativos_20260410_090526.pdf</td></tr><tr><td><b>Gerado em</b></td><td>2026-04-10T14:56:32.237Z</td></tr></table><p><i>Chamado aberto automaticamente pelo sistema de monitoramento.</i></p>",
    "type": 1,
    "urgency": 4,
    "impact": 4,
    "itilcategories_id": 5,
    "_groups_id_assign": 3,
    "entities_id": 0,
    "requesttypes_id": 7
  }
}
```

---

## 4. API — Endpoint do Backend

### `POST /api/glpi/tickets/bulk`

Endpoint principal que recebe o JSON e abre os chamados em lote.

```http
POST /api/glpi/tickets/bulk
Authorization: Bearer {JWT do usuario}
Content-Type: application/json

Body:
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
    },
    ...
  ],
  "config": {
    "type": 1,
    "urgency": 4,
    "impact": 4,
    "itilcategories_id": 5,
    "_groups_id_assign": 3
  }
}
```

### Resposta de sucesso (200)

```json
{
  "total": 3,
  "created": 3,
  "failed": 0,
  "results": [
    {
      "codigo": "11",
      "cliente": "Sergio Lulia Jacob",
      "success": true,
      "ticket_id": 1500,
      "message": "Item successfully added"
    },
    {
      "codigo": "150",
      "cliente": "Rafael Marques Canto Porto",
      "success": true,
      "ticket_id": 1501,
      "message": "Item successfully added"
    },
    {
      "codigo": "443",
      "cliente": "Alan Goldlust",
      "success": true,
      "ticket_id": 1502,
      "message": "Item successfully added"
    }
  ]
}
```

### Resposta com falhas parciais (200)

```json
{
  "total": 3,
  "created": 2,
  "failed": 1,
  "results": [
    {
      "codigo": "11",
      "cliente": "Sergio Lulia Jacob",
      "success": true,
      "ticket_id": 1500,
      "message": "Item successfully added"
    },
    {
      "codigo": "150",
      "cliente": "Rafael Marques Canto Porto",
      "success": false,
      "ticket_id": null,
      "message": "ERROR_RIGHT_MISSING: Sem permissao para criar ticket nesta entidade"
    },
    {
      "codigo": "443",
      "cliente": "Alan Goldlust",
      "success": true,
      "ticket_id": 1502,
      "message": "Item successfully added"
    }
  ]
}
```

---

## 5. Implementacao — Backend (server/index.js)

### 5.1 Funcoes auxiliares GLPI (adicionar ao server/index.js)

```javascript
// ─── GLPI Proxy Helpers ──────────────────────────────────────

async function initGLPISession(config) {
  const baseUrl = config.base_url.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "");
  const response = await fetch(`${baseUrl}/apirest.php/initSession`, {
    headers: {
      "App-Token": config.app_token,
      "Authorization": `user_token ${config.user_token}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao autenticar no GLPI (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.session_token;
}

async function killGLPISession(config, sessionToken) {
  const baseUrl = config.base_url.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "");
  await fetch(`${baseUrl}/apirest.php/killSession`, {
    headers: {
      "App-Token": config.app_token,
      "Session-Token": sessionToken,
    },
  }).catch(() => {});
}

function buildTicketPayload(item, config = {}) {
  const titulo = `[${item.situacao || "ALERTA"}] Cod. ${item.codigo} - ${item.cliente}`;

  const content = `
<h3>Alerta de Equipamento Inativo</h3>
<table border="1" cellpadding="5" cellspacing="0">
  <tr><td><b>Codigo</b></td><td>${item.codigo}</td></tr>
  <tr><td><b>Cliente</b></td><td>${item.cliente}</td></tr>
  <tr><td><b>Situacao</b></td><td>${item.situacao}</td></tr>
  <tr><td><b>Ultima Atividade</b></td><td>${item.ultima_atividade}</td></tr>
  <tr><td><b>Tempo Inativo</b></td><td>${item.tempo_inativo}</td></tr>
  <tr><td><b>Tempo Permitido</b></td><td>${item.tempo_permitido}</td></tr>
  <tr><td><b>Relatorio de Origem</b></td><td>${item.arquivo}</td></tr>
  <tr><td><b>Gerado em</b></td><td>${item.generatedAt}</td></tr>
</table>
<p><i>Chamado aberto automaticamente pelo sistema de monitoramento.</i></p>`.trim();

  const input = {
    name: titulo,
    content: content,
    type: config.type || 1,
    urgency: config.urgency || (item.situacao === "INOPERANTE" ? 4 : 3),
    impact: config.impact || 4,
    entities_id: config.entities_id || 0,
    requesttypes_id: config.requesttypes_id || 7,
  };

  // Campos opcionais — so inclui se configurados
  if (config.itilcategories_id) input.itilcategories_id = config.itilcategories_id;
  if (config._groups_id_assign) input._groups_id_assign = config._groups_id_assign;
  if (config._users_id_assign) input._users_id_assign = config._users_id_assign;

  return { input };
}
```

### 5.2 Endpoint de criacao em lote

```javascript
// ─── GLPI Bulk Ticket Creation ──────────────────────────────

app.post("/api/glpi/tickets/bulk", authenticate, async (req, res) => {
  const { items, config: ticketConfig } = req.body;

  // Validacao
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "O campo 'items' deve ser um array com pelo menos 1 item" });
  }

  // Limite de seguranca
  if (items.length > 100) {
    return res.status(400).json({ error: "Maximo de 100 chamados por requisicao" });
  }

  // Validar campos obrigatorios de cada item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.codigo || !item.cliente) {
      return res.status(400).json({
        error: `Item [${i}] invalido: 'codigo' e 'cliente' sao obrigatorios`,
      });
    }
  }

  // Buscar config GLPI do usuario
  const glpiConfig = db.prepare("SELECT * FROM glpi_configs WHERE user_id = ?").get(req.userId);
  if (!glpiConfig) {
    return res.status(400).json({ error: "Configuracao GLPI nao encontrada. Configure em Configuracoes." });
  }

  // Abrir sessao GLPI (1x para todo o lote)
  let sessionToken;
  try {
    sessionToken = await initGLPISession(glpiConfig);
  } catch (err) {
    return res.status(502).json({ error: `Falha na conexao com GLPI: ${err.message}` });
  }

  const baseUrl = glpiConfig.base_url.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "");
  const results = [];

  try {
    // Processar cada item sequencialmente (evitar sobrecarga no GLPI)
    for (const item of items) {
      try {
        const payload = buildTicketPayload(item, ticketConfig || {});

        const response = await fetch(`${baseUrl}/apirest.php/Ticket`, {
          method: "POST",
          headers: {
            "App-Token": glpiConfig.app_token,
            "Session-Token": sessionToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok || response.status === 201) {
          results.push({
            codigo: item.codigo,
            cliente: item.cliente,
            success: true,
            ticket_id: data.id,
            message: data.message || "Chamado criado com sucesso",
          });
        } else {
          // Extrair mensagem de erro do GLPI
          let errorMsg = `HTTP ${response.status}`;
          if (Array.isArray(data)) {
            errorMsg = `${data[0]}${data[1] ? `: ${data[1]}` : ""}`;
          } else if (data.message) {
            errorMsg = data.message;
          }

          results.push({
            codigo: item.codigo,
            cliente: item.cliente,
            success: false,
            ticket_id: null,
            message: errorMsg,
          });
        }
      } catch (err) {
        results.push({
          codigo: item.codigo,
          cliente: item.cliente,
          success: false,
          ticket_id: null,
          message: `Erro interno: ${err.message}`,
        });
      }
    }
  } finally {
    // Sempre fechar sessao
    await killGLPISession(glpiConfig, sessionToken);
  }

  const created = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  res.json({
    total: items.length,
    created,
    failed,
    results,
  });
});
```

### 5.3 Endpoint unitario (criar 1 ticket por vez)

```javascript
// ─── GLPI Single Ticket Creation ────────────────────────────

app.post("/api/glpi/tickets", authenticate, async (req, res) => {
  const { item, config: ticketConfig } = req.body;

  if (!item || !item.codigo || !item.cliente) {
    return res.status(400).json({ error: "'item' com 'codigo' e 'cliente' e obrigatorio" });
  }

  const glpiConfig = db.prepare("SELECT * FROM glpi_configs WHERE user_id = ?").get(req.userId);
  if (!glpiConfig) {
    return res.status(400).json({ error: "Configuracao GLPI nao encontrada" });
  }

  let sessionToken;
  try {
    sessionToken = await initGLPISession(glpiConfig);
  } catch (err) {
    return res.status(502).json({ error: `Falha na conexao com GLPI: ${err.message}` });
  }

  const baseUrl = glpiConfig.base_url.replace(/\/+$/, "").replace(/\/apirest\.php$/i, "");

  try {
    const payload = buildTicketPayload(item, ticketConfig || {});

    const response = await fetch(`${baseUrl}/apirest.php/Ticket`, {
      method: "POST",
      headers: {
        "App-Token": glpiConfig.app_token,
        "Session-Token": sessionToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok && response.status !== 201) {
      let errorMsg = `HTTP ${response.status}`;
      if (Array.isArray(data)) errorMsg = `${data[0]}${data[1] ? `: ${data[1]}` : ""}`;
      else if (data.message) errorMsg = data.message;
      return res.status(response.status).json({ error: errorMsg });
    }

    res.status(201).json({
      ticket_id: data.id,
      message: data.message || "Chamado criado com sucesso",
    });
  } finally {
    await killGLPISession(glpiConfig, sessionToken);
  }
});
```

---

## 6. Protecao contra Duplicatas

Um problema critico: se o mesmo JSON for enviado 2 vezes, cria chamados duplicados. Estrategias:

### 6.1 Tabela de controle no SQLite

```sql
CREATE TABLE IF NOT EXISTS bulk_ticket_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_codigo TEXT NOT NULL,
  item_cliente TEXT NOT NULL,
  glpi_ticket_id INTEGER NOT NULL,
  source_file TEXT,              -- nome do arquivo de origem (ex: "inativos_20260410_090526.pdf")
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, item_codigo, source_file)
);
```

### 6.2 Logica de verificacao antes de criar

```javascript
// Antes de criar o ticket, verificar se ja foi criado
const existing = db.prepare(
  "SELECT glpi_ticket_id FROM bulk_ticket_log WHERE user_id = ? AND item_codigo = ? AND source_file = ?"
).get(req.userId, item.codigo, item.arquivo);

if (existing) {
  results.push({
    codigo: item.codigo,
    cliente: item.cliente,
    success: true,
    ticket_id: existing.glpi_ticket_id,
    message: "Chamado ja existente (duplicata ignorada)",
    skipped: true,
  });
  continue; // Pula para o proximo item
}

// ... cria o ticket normalmente ...

// Apos criar com sucesso, registra no log
db.prepare(
  "INSERT INTO bulk_ticket_log (user_id, item_codigo, item_cliente, glpi_ticket_id, source_file) VALUES (?, ?, ?, ?, ?)"
).run(req.userId, item.codigo, item.cliente, data.id, item.arquivo);
```

### 6.3 Resposta com itens ignorados

```json
{
  "total": 3,
  "created": 1,
  "skipped": 2,
  "failed": 0,
  "results": [
    {
      "codigo": "11",
      "cliente": "Sergio Lulia Jacob",
      "success": true,
      "ticket_id": 1500,
      "message": "Chamado ja existente (duplicata ignorada)",
      "skipped": true
    },
    {
      "codigo": "150",
      "cliente": "Rafael Marques Canto Porto",
      "success": true,
      "ticket_id": 1501,
      "message": "Chamado ja existente (duplicata ignorada)",
      "skipped": true
    },
    {
      "codigo": "443",
      "cliente": "Alan Goldlust",
      "success": true,
      "ticket_id": 1502,
      "message": "Chamado criado com sucesso"
    }
  ]
}
```

---

## 7. Fluxo Completo Detalhado

```
1. Sistema externo (monitoramento) gera JSON com dispositivos inativos
2. JSON e enviado para POST /api/glpi/tickets/bulk
3. Backend:
   a. Valida JWT do usuario
   b. Valida estrutura do JSON (items obrigatorios, limite de 100)
   c. Busca config GLPI do usuario no SQLite
   d. Abre UMA sessao GLPI (initSession)
   e. Para cada item do array:
      i.   Verifica duplicata na tabela bulk_ticket_log
      ii.  Se ja existe → marca como "skipped" e segue
      iii. Transforma item em payload GLPI (buildTicketPayload)
      iv.  POST /apirest.php/Ticket
      v.   Se sucesso → registra na tabela bulk_ticket_log
      vi.  Coleta resultado (sucesso/falha) no array de results
   f. Fecha sessao GLPI (killSession)
   g. Retorna relatorio com total/created/skipped/failed + array de results
4. Frontend/chamador recebe o relatorio e exibe resultado
```

---

## 8. Frontend — Integracao (Opcional)

Embora o processo principal seja via API, pode ser util ter uma interface no frontend para:

### 8.1 Tela de envio de JSON

- Textarea ou area de drag-and-drop para colar/carregar o JSON
- Configuracoes do lote (categoria, grupo, urgencia) em campos ao lado
- Botao "Processar" que envia para `POST /api/glpi/tickets/bulk`
- Tabela de resultados exibida apos o processamento

### 8.2 Historico de aberturas em lote

- Tela que consulta a tabela `bulk_ticket_log`
- Filtros por data, arquivo de origem
- Links diretos para os chamados criados no GLPI

### 8.3 Service (src/services/glpiService.ts)

```typescript
export interface DispositivoInativo {
  codigo: string;
  cliente: string;
  ultima_atividade: string;
  tempo_inativo: string;
  tempo_permitido: string;
  situacao: string;
  arquivo: string;
  generatedAt: string;
}

export interface BulkTicketConfig {
  type?: 1 | 2;
  urgency?: 1 | 2 | 3 | 4 | 5;
  impact?: 1 | 2 | 3 | 4 | 5;
  itilcategories_id?: number;
  _groups_id_assign?: number;
  entities_id?: number;
}

export interface BulkTicketResult {
  codigo: string;
  cliente: string;
  success: boolean;
  ticket_id: number | null;
  message: string;
  skipped?: boolean;
}

export interface BulkTicketResponse {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: BulkTicketResult[];
}

export async function createBulkTickets(
  items: DispositivoInativo[],
  config?: BulkTicketConfig
): Promise<BulkTicketResponse> {
  return api.post<BulkTicketResponse>("/api/glpi/tickets/bulk", { items, config });
}
```

---

## 9. Uso via API Externa (sem frontend)

O endpoint pode ser chamado diretamente por qualquer sistema externo que tenha o JWT:

### 9.1 Obter token JWT

```bash
# Login para obter o token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "usuario@empresa.com", "password": "senha123"}'
# Retorna: {"token": "eyJhbG...", "user": {"id": "1", "email": "..."}}
```

### 9.2 Enviar JSON de inativos

```bash
curl -s -X POST http://localhost:3000/api/glpi/tickets/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbG..." \
  -d '{
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
      },
      {
        "codigo": "150",
        "cliente": "Rafael Marques Canto Porto",
        "ultima_atividade": "09/04/26 15:32",
        "tempo_inativo": "14,3 horas",
        "tempo_permitido": "1 horas",
        "situacao": "INOPERANTE",
        "arquivo": "inativos_20260410_090526.pdf",
        "generatedAt": "2026-04-10T14:56:32.237Z"
      }
    ],
    "config": {
      "type": 1,
      "urgency": 4,
      "impact": 4,
      "itilcategories_id": 5,
      "_groups_id_assign": 3
    }
  }'
```

### 9.3 Resposta

```json
{
  "total": 2,
  "created": 2,
  "skipped": 0,
  "failed": 0,
  "results": [
    {
      "codigo": "11",
      "cliente": "Sergio Lulia Jacob",
      "success": true,
      "ticket_id": 1500,
      "message": "Chamado criado com sucesso"
    },
    {
      "codigo": "150",
      "cliente": "Rafael Marques Canto Porto",
      "success": true,
      "ticket_id": 1501,
      "message": "Chamado criado com sucesso"
    }
  ]
}
```

### 9.4 Automacao com script

Exemplo de integracao em um script que le o JSON de um arquivo e envia:

```bash
#!/bin/bash
# Script: abrir-chamados-inativos.sh

TOKEN="eyJhbG..."
API_URL="http://localhost:3000/api/glpi/tickets/bulk"
JSON_FILE="inativos.json"

# Le o JSON do arquivo e envia
ITEMS=$(cat "$JSON_FILE")

curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"items\": $ITEMS,
    \"config\": {
      \"type\": 1,
      \"urgency\": 4,
      \"_groups_id_assign\": 3
    }
  }" | jq .
```

---

## 10. Tratamento de Erros

| Cenario | HTTP | Resposta |
|---------|------|----------|
| JSON invalido / items vazio | 400 | `{ "error": "O campo 'items' deve ser um array..." }` |
| Limite excedido (>100 items) | 400 | `{ "error": "Maximo de 100 chamados por requisicao" }` |
| Item sem codigo/cliente | 400 | `{ "error": "Item [2] invalido: 'codigo' e 'cliente' sao obrigatorios" }` |
| Config GLPI nao encontrada | 400 | `{ "error": "Configuracao GLPI nao encontrada" }` |
| Falha no initSession GLPI | 502 | `{ "error": "Falha na conexao com GLPI: ..." }` |
| Falha em 1 item do lote | 200 | Retorna normalmente com `failed: 1` no resultado |
| Sessao GLPI expira no meio | — | Tentar reconectar (initSession) e continuar |

### Estrategia de resiliencia

- Se a sessao expirar durante o processamento do lote, o backend pode tentar `initSession` novamente e continuar
- Cada item e processado em um try/catch individual — falha de 1 nao impede os demais
- O resultado final sempre lista o status de cada item individualmente

---

## 11. Permissoes Necessarias no GLPI

O usuario cujo `user_token` esta configurado precisa ter:

- **Perfil com permissao de criar Tickets** (Technician, Super-Admin, ou perfil custom)
- API habilitada em **Configuracao > Geral > API** no GLPI
- Se usar `_groups_id_assign`: permissao de atribuir grupo
- Se usar `itilcategories_id`: a categoria deve estar visivel para a entidade do usuario

---

## 12. Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `server/index.js` | Modificar | Adicionar `initGLPISession`, `killGLPISession`, `buildTicketPayload`, rotas `/api/glpi/tickets/bulk` e `/api/glpi/tickets` |
| `server/index.js` | Modificar | Adicionar tabela `bulk_ticket_log` (migracao) |
| `src/services/glpiService.ts` | Modificar (opcional) | Adicionar `createBulkTickets()` se houver interface frontend |
| `src/types/glpi.ts` | Modificar (opcional) | Adicionar tipos `DispositivoInativo`, `BulkTicketResponse` |

---

## 13. Melhorias Futuras

- **Webhook / Cron**: Receber o JSON automaticamente de um webhook do sistema de monitoramento, eliminando o envio manual
- **Filas com retry**: Para lotes muito grandes (>100), usar uma fila interna com retry automatico
- **Anexar PDF de origem**: Upload automatico do arquivo PDF (`arquivo` no JSON) como anexo do chamado no GLPI
- **Templates configuraveis**: Permitir ao usuario customizar o template de titulo e descricao via Settings
- **Mapeamento de campos dinamico**: Interface para mapear campos do JSON de entrada para campos do GLPI (suportar diferentes fontes de dados)
- **Vinculacao de ativo**: Se o `codigo` corresponder a um Computer/equipamento no GLPI, vincular automaticamente via `Item_Ticket`
- **Notificacao pos-abertura**: Enviar WhatsApp (via modulo existente) avisando o tecnico sobre os novos chamados
- **Rate limiting**: Limitar quantidade de chamados por minuto para nao sobrecarregar o GLPI
- **Dashboard de aberturas**: Grafico mostrando chamados abertos automaticamente por dia/semana
