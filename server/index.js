const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "db.sqlite");

// Ensure data directory exists
const fs = require("fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Initialize SQLite
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS glpi_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    base_url TEXT NOT NULL,
    app_token TEXT NOT NULL,
    user_token TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tracked_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT NOT NULL DEFAULT 'medium',
    assignee TEXT DEFAULT 'Não atribuído',
    requester TEXT DEFAULT '',
    has_new_updates INTEGER DEFAULT 0,
    glpi_created_at TEXT,
    glpi_updated_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, ticket_id)
  );

  CREATE TABLE IF NOT EXISTS kanban_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nova coluna',
    position INTEGER NOT NULL DEFAULT 0
  );
`);

// Migration: add display_column to tracked_tickets (idempotent)
try {
  db.exec("ALTER TABLE tracked_tickets ADD COLUMN display_column INTEGER DEFAULT 0");
} catch (_) {
  // Column already exists — ignore
}

// Migration: add last_seen_update_date to tracked_tickets (idempotent)
try {
  db.exec("ALTER TABLE tracked_tickets ADD COLUMN last_seen_update_date TEXT");
} catch (_) {
  // Column already exists — ignore
}

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function generateToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

// ─── Auth Routes ────────────────────────────────────────────

app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Este email já está cadastrado" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
  const user = { id: result.lastInsertRowid, email };
  const token = generateToken(user);

  res.status(201).json({ token, user: { id: String(user.id), email: user.email } });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios" });
  }

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const token = generateToken(row);
  res.json({ token, user: { id: String(row.id), email: row.email } });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  const row = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId);
  if (!row) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json({ user: { id: String(row.id), email: row.email } });
});

// ─── GLPI Config Routes ─────────────────────────────────────

app.get("/api/glpi-config", authenticate, (req, res) => {
  const row = db.prepare("SELECT * FROM glpi_configs WHERE user_id = ?").get(req.userId);
  if (!row) return res.status(404).json({ error: "Configuração não encontrada" });
  res.json({ base_url: row.base_url, app_token: row.app_token, user_token: row.user_token });
});

app.put("/api/glpi-config", authenticate, (req, res) => {
  const { base_url, app_token, user_token } = req.body;
  if (!base_url || !app_token || !user_token) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }

  db.prepare(`
    INSERT INTO glpi_configs (user_id, base_url, app_token, user_token, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      base_url = excluded.base_url,
      app_token = excluded.app_token,
      user_token = excluded.user_token,
      updated_at = excluded.updated_at
  `).run(req.userId, base_url, app_token, user_token);

  res.json({ success: true });
});

app.delete("/api/glpi-config", authenticate, (req, res) => {
  db.prepare("DELETE FROM glpi_configs WHERE user_id = ?").run(req.userId);
  res.json({ success: true });
});

// ─── Tracked Tickets Routes ─────────────────────────────────

app.get("/api/tracked-tickets", authenticate, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM tracked_tickets WHERE user_id = ? ORDER BY created_at DESC"
  ).all(req.userId);
  res.json(rows);
});

app.post("/api/tracked-tickets", authenticate, (req, res) => {
  const { ticket_id, title, status, priority, assignee, requester, has_new_updates, glpi_created_at, glpi_updated_at, display_column, last_seen_update_date } = req.body;
  if (!ticket_id) {
    return res.status(400).json({ error: "ticket_id é obrigatório" });
  }

  db.prepare(`
    INSERT INTO tracked_tickets (user_id, ticket_id, title, status, priority, assignee, requester, has_new_updates, glpi_created_at, glpi_updated_at, display_column, last_seen_update_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, ticket_id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      priority = excluded.priority,
      assignee = excluded.assignee,
      requester = excluded.requester,
      has_new_updates = excluded.has_new_updates,
      glpi_created_at = excluded.glpi_created_at,
      glpi_updated_at = excluded.glpi_updated_at,
      display_column = excluded.display_column,
      last_seen_update_date = excluded.last_seen_update_date,
      updated_at = excluded.updated_at
  `).run(req.userId, ticket_id, title || "", status || "new", priority || "medium", assignee || "Não atribuído", requester || "", has_new_updates ? 1 : 0, glpi_created_at || null, glpi_updated_at || null, display_column || 0, last_seen_update_date || null);

  const row = db.prepare(
    "SELECT * FROM tracked_tickets WHERE user_id = ? AND ticket_id = ?"
  ).get(req.userId, ticket_id);

  res.json(row);
});

app.patch("/api/tracked-tickets/:ticketId", authenticate, (req, res) => {
  const { ticketId } = req.params;
  const fields = req.body;

  const allowed = ["title", "status", "priority", "assignee", "requester", "has_new_updates", "glpi_created_at", "glpi_updated_at", "display_column", "last_seen_update_date"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(key === "has_new_updates" ? (fields[key] ? 1 : 0) : fields[key]);
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar" });
  }

  sets.push("updated_at = datetime('now')");
  values.push(req.userId, ticketId);

  db.prepare(
    `UPDATE tracked_tickets SET ${sets.join(", ")} WHERE user_id = ? AND ticket_id = ?`
  ).run(...values);

  const row = db.prepare(
    "SELECT * FROM tracked_tickets WHERE user_id = ? AND ticket_id = ?"
  ).get(req.userId, ticketId);

  if (!row) return res.status(404).json({ error: "Ticket não encontrado" });
  res.json(row);
});

app.delete("/api/tracked-tickets/:ticketId", authenticate, (req, res) => {
  const { ticketId } = req.params;
  db.prepare("DELETE FROM tracked_tickets WHERE user_id = ? AND ticket_id = ?").run(req.userId, ticketId);
  res.json({ success: true });
});

// ─── Kanban Columns Routes ───────────────────────────────────

app.get("/api/kanban-columns", authenticate, (req, res) => {
  let columns = db.prepare(
    "SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position"
  ).all(req.userId);

  // Auto-create 2 default columns on first access
  if (columns.length === 0) {
    const insert = db.prepare(
      "INSERT INTO kanban_columns (user_id, title, position) VALUES (?, ?, ?)"
    );
    const tx = db.transaction(() => {
      insert.run(req.userId, "Coluna 1", 0);
      insert.run(req.userId, "Coluna 2", 1);
    });
    tx();

    columns = db.prepare(
      "SELECT * FROM kanban_columns WHERE user_id = ? ORDER BY position"
    ).all(req.userId);

    // Remap existing tickets: display_column 0 → col1.id, 1 → col2.id
    const col1 = columns[0];
    const col2 = columns[1];
    if (col1 && col2) {
      db.prepare(
        "UPDATE tracked_tickets SET display_column = ? WHERE user_id = ? AND display_column = 0"
      ).run(col1.id, req.userId);
      db.prepare(
        "UPDATE tracked_tickets SET display_column = ? WHERE user_id = ? AND display_column = 1"
      ).run(col2.id, req.userId);
    }
  }

  res.json(columns);
});

app.post("/api/kanban-columns", authenticate, (req, res) => {
  const { title } = req.body;
  const maxPos = db.prepare(
    "SELECT COALESCE(MAX(position), -1) AS max_pos FROM kanban_columns WHERE user_id = ?"
  ).get(req.userId);
  const position = (maxPos?.max_pos ?? -1) + 1;

  const result = db.prepare(
    "INSERT INTO kanban_columns (user_id, title, position) VALUES (?, ?, ?)"
  ).run(req.userId, title || "Nova coluna", position);

  const column = db.prepare("SELECT * FROM kanban_columns WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(column);
});

app.patch("/api/kanban-columns/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title é obrigatório" });

  const existing = db.prepare(
    "SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Coluna não encontrada" });

  db.prepare("UPDATE kanban_columns SET title = ? WHERE id = ? AND user_id = ?").run(title, id, req.userId);
  res.json({ ...existing, title });
});

app.put("/api/kanban-columns/reorder", authenticate, (req, res) => {
  const { order } = req.body; // array of column IDs in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: "order deve ser um array" });

  const update = db.prepare(
    "UPDATE kanban_columns SET position = ? WHERE id = ? AND user_id = ?"
  );
  const tx = db.transaction(() => {
    order.forEach((colId, idx) => {
      update.run(idx, colId, req.userId);
    });
  });
  tx();

  res.json({ success: true });
});

app.delete("/api/kanban-columns/:id", authenticate, (req, res) => {
  const { id } = req.params;

  const existing = db.prepare(
    "SELECT * FROM kanban_columns WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Coluna não encontrada" });

  // Find first available column to move orphaned tickets
  const fallback = db.prepare(
    "SELECT id FROM kanban_columns WHERE user_id = ? AND id != ? ORDER BY position LIMIT 1"
  ).get(req.userId, id);

  if (!fallback) {
    return res.status(400).json({ error: "Não é possível remover a última coluna" });
  }

  const tx = db.transaction(() => {
    // Move tickets to fallback column
    db.prepare(
      "UPDATE tracked_tickets SET display_column = ? WHERE user_id = ? AND display_column = ?"
    ).run(fallback.id, req.userId, Number(id));

    // Delete column
    db.prepare("DELETE FROM kanban_columns WHERE id = ? AND user_id = ?").run(id, req.userId);
  });
  tx();

  res.json({ success: true, movedTo: fallback.id });
});

// ─── WhatsApp (WhAPI) Route ──────────────────────────────────

app.post("/api/whatsapp/send", authenticate, async (req, res) => {
  if (!WHAPI_TOKEN) {
    return res.status(503).json({ error: "WHAPI_TOKEN não configurado no servidor" });
  }

  const { to, body } = req.body;
  if (!to || !body) {
    return res.status(400).json({ error: "Campos 'to' e 'body' são obrigatórios" });
  }

  try {
    const response = await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHAPI_TOKEN}`,
      },
      body: JSON.stringify({ to, body }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "Erro ao enviar mensagem", details: data });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro ao enviar WhatsApp:", err);
    res.status(500).json({ error: "Erro interno ao enviar mensagem" });
  }
});

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
