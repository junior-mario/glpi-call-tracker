const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
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
`);

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
  const { ticket_id, title, status, priority, assignee, requester, has_new_updates, glpi_created_at, glpi_updated_at } = req.body;
  if (!ticket_id) {
    return res.status(400).json({ error: "ticket_id é obrigatório" });
  }

  db.prepare(`
    INSERT INTO tracked_tickets (user_id, ticket_id, title, status, priority, assignee, requester, has_new_updates, glpi_created_at, glpi_updated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, ticket_id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      priority = excluded.priority,
      assignee = excluded.assignee,
      requester = excluded.requester,
      has_new_updates = excluded.has_new_updates,
      glpi_created_at = excluded.glpi_created_at,
      glpi_updated_at = excluded.glpi_updated_at,
      updated_at = excluded.updated_at
  `).run(req.userId, ticket_id, title || "", status || "new", priority || "medium", assignee || "Não atribuído", requester || "", has_new_updates ? 1 : 0, glpi_created_at || null, glpi_updated_at || null);

  const row = db.prepare(
    "SELECT * FROM tracked_tickets WHERE user_id = ? AND ticket_id = ?"
  ).get(req.userId, ticket_id);

  res.json(row);
});

app.patch("/api/tracked-tickets/:ticketId", authenticate, (req, res) => {
  const { ticketId } = req.params;
  const fields = req.body;

  const allowed = ["title", "status", "priority", "assignee", "requester", "has_new_updates", "glpi_created_at", "glpi_updated_at"];
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

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
