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

  CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_dashboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Nova Dashboard',
    group_id INTEGER,
    date_from TEXT,
    date_to TEXT,
    visible_charts TEXT NOT NULL DEFAULT '["kpis","status","priority","technician","tags","timeline"]',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id TEXT NOT NULL,
    analysis_text TEXT NOT NULL,
    model_used TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, ticket_id)
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

// Migration: add poll_interval to glpi_configs (idempotent)
try {
  db.exec("ALTER TABLE glpi_configs ADD COLUMN poll_interval INTEGER DEFAULT 10");
} catch (_) {
  // Column already exists — ignore
}

// Migration: add overview settings to glpi_configs (idempotent)
try {
  db.exec("ALTER TABLE glpi_configs ADD COLUMN overview_group_id INTEGER");
} catch (_) {}
try {
  db.exec("ALTER TABLE glpi_configs ADD COLUMN overview_date_from TEXT");
} catch (_) {}
try {
  db.exec("ALTER TABLE glpi_configs ADD COLUMN overview_date_to TEXT");
} catch (_) {}
try {
  db.exec("ALTER TABLE glpi_configs ADD COLUMN overview_days INTEGER");
} catch (_) {}

// Migration: add display_mode and filters to custom_dashboards (idempotent)
try {
  db.exec("ALTER TABLE custom_dashboards ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'charts'");
} catch (_) {}
try {
  db.exec("ALTER TABLE custom_dashboards ADD COLUMN filter_statuses TEXT");
} catch (_) {}
try {
  db.exec("ALTER TABLE custom_dashboards ADD COLUMN filter_technician TEXT");
} catch (_) {}
try {
  db.exec("ALTER TABLE custom_dashboards ADD COLUMN filter_requester TEXT");
} catch (_) {}
try {
  db.exec("ALTER TABLE custom_dashboards ADD COLUMN period_days INTEGER");
} catch (_) {}

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
  res.json({
    base_url: row.base_url,
    app_token: row.app_token,
    user_token: row.user_token,
    poll_interval: row.poll_interval ?? 10,
    overview_group_id: row.overview_group_id ?? null,
    overview_days: row.overview_days ?? null,
  });
});

app.put("/api/glpi-config", authenticate, (req, res) => {
  const { base_url, app_token, user_token, poll_interval, overview_group_id, overview_days } = req.body;
  if (!base_url || !app_token || !user_token) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }

  const interval = Number(poll_interval) > 0 ? Number(poll_interval) : 10;
  const days = overview_days != null && Number(overview_days) > 0 ? Number(overview_days) : null;

  db.prepare(`
    INSERT INTO glpi_configs (user_id, base_url, app_token, user_token, poll_interval, overview_group_id, overview_days, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      base_url = excluded.base_url,
      app_token = excluded.app_token,
      user_token = excluded.user_token,
      poll_interval = excluded.poll_interval,
      overview_group_id = excluded.overview_group_id,
      overview_days = excluded.overview_days,
      updated_at = excluded.updated_at
  `).run(req.userId, base_url, app_token, user_token, interval, overview_group_id ?? null, days);

  res.json({ success: true });
});

app.delete("/api/glpi-config", authenticate, (req, res) => {
  db.prepare("DELETE FROM glpi_configs WHERE user_id = ?").run(req.userId);
  res.json({ success: true });
});

// ─── Tracked Tickets Routes ─────────────────────────────────

app.get("/api/tracked-tickets", authenticate, (req, res) => {
  // Fix orphaned tickets whose display_column doesn't match any existing column
  const validColIds = db.prepare(
    "SELECT id FROM kanban_columns WHERE user_id = ?"
  ).all(req.userId).map((c) => c.id);

  if (validColIds.length > 0) {
    const firstColId = validColIds[0];
    const placeholders = validColIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE tracked_tickets SET display_column = ? WHERE user_id = ? AND display_column NOT IN (${placeholders})`
    ).run(firstColId, req.userId, ...validColIds);
  }

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

  // Resolve display_column: use provided value, or fall back to user's first column
  let resolvedColumn = display_column;
  if (!resolvedColumn) {
    const firstCol = db.prepare(
      "SELECT id FROM kanban_columns WHERE user_id = ? ORDER BY position LIMIT 1"
    ).get(req.userId);
    resolvedColumn = firstCol ? firstCol.id : 0;
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
  `).run(req.userId, ticket_id, title || "", status || "new", priority || "medium", assignee || "Não atribuído", requester || "", has_new_updates ? 1 : 0, glpi_created_at || null, glpi_updated_at || null, resolvedColumn, last_seen_update_date || null);

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

// ─── Custom Dashboards Routes ────────────────────────────────

function serializeDashRow(r) {
  return { ...r, visible_charts: JSON.parse(r.visible_charts), filter_statuses: r.filter_statuses ? JSON.parse(r.filter_statuses) : null };
}

app.get("/api/custom-dashboards", authenticate, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM custom_dashboards WHERE user_id = ? ORDER BY position"
  ).all(req.userId);
  res.json(rows.map(serializeDashRow));
});

app.post("/api/custom-dashboards", authenticate, (req, res) => {
  const { name, group_id, date_from, date_to, visible_charts, display_mode, filter_statuses, filter_technician, filter_requester, period_days } = req.body;
  const maxPos = db.prepare(
    "SELECT COALESCE(MAX(position), -1) AS max_pos FROM custom_dashboards WHERE user_id = ?"
  ).get(req.userId);
  const position = (maxPos?.max_pos ?? -1) + 1;

  const charts = visible_charts ? JSON.stringify(visible_charts) : '["kpis","status","priority","technician","tags","timeline"]';
  const statuses = filter_statuses ? JSON.stringify(filter_statuses) : null;
  const pDays = period_days != null && Number(period_days) > 0 ? Number(period_days) : null;

  const result = db.prepare(
    "INSERT INTO custom_dashboards (user_id, name, group_id, date_from, date_to, visible_charts, display_mode, filter_statuses, filter_technician, filter_requester, period_days, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(req.userId, name || "Nova Dashboard", group_id || null, date_from || null, date_to || null, charts, display_mode || "charts", statuses, filter_technician || null, filter_requester || null, pDays, position);

  const row = db.prepare("SELECT * FROM custom_dashboards WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(serializeDashRow(row));
});

app.get("/api/custom-dashboards/:id", authenticate, (req, res) => {
  const row = db.prepare(
    "SELECT * FROM custom_dashboards WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: "Dashboard não encontrada" });
  res.json(serializeDashRow(row));
});

app.patch("/api/custom-dashboards/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(
    "SELECT * FROM custom_dashboards WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Dashboard não encontrada" });

  const fields = req.body;
  const allowed = ["name", "group_id", "date_from", "date_to", "visible_charts", "display_mode", "filter_statuses", "filter_technician", "filter_requester", "period_days"];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      const val = (key === "visible_charts" || key === "filter_statuses") ? JSON.stringify(fields[key]) : fields[key];
      values.push(val);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });

  sets.push("updated_at = datetime('now')");
  values.push(id, req.userId);

  db.prepare(
    `UPDATE custom_dashboards SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
  ).run(...values);

  const row = db.prepare("SELECT * FROM custom_dashboards WHERE id = ?").get(id);
  res.json(serializeDashRow(row));
});

app.put("/api/custom-dashboards/reorder", authenticate, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: "order deve ser um array" });

  const update = db.prepare(
    "UPDATE custom_dashboards SET position = ? WHERE id = ? AND user_id = ?"
  );
  const tx = db.transaction(() => {
    order.forEach((dashId, idx) => {
      update.run(idx, dashId, req.userId);
    });
  });
  tx();

  res.json({ success: true });
});

app.delete("/api/custom-dashboards/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare(
    "SELECT * FROM custom_dashboards WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Dashboard não encontrada" });

  db.prepare("DELETE FROM custom_dashboards WHERE id = ? AND user_id = ?").run(id, req.userId);
  res.json({ success: true });
});

// ─── WhatsApp Contacts Routes ────────────────────────────────

app.get("/api/whatsapp-contacts", authenticate, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM whatsapp_contacts WHERE user_id = ? ORDER BY name"
  ).all(req.userId);
  res.json(rows);
});

app.post("/api/whatsapp-contacts", authenticate, (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  }

  const result = db.prepare(
    "INSERT INTO whatsapp_contacts (user_id, name, phone) VALUES (?, ?, ?)"
  ).run(req.userId, name.trim(), phone.trim());

  const row = db.prepare("SELECT * FROM whatsapp_contacts WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(row);
});

app.patch("/api/whatsapp-contacts/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const { name, phone } = req.body;

  const existing = db.prepare(
    "SELECT * FROM whatsapp_contacts WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Contato não encontrado" });

  const newName = name !== undefined ? name.trim() : existing.name;
  const newPhone = phone !== undefined ? phone.trim() : existing.phone;

  if (!newName || !newPhone) {
    return res.status(400).json({ error: "Nome e telefone não podem ficar vazios" });
  }

  db.prepare(
    "UPDATE whatsapp_contacts SET name = ?, phone = ? WHERE id = ? AND user_id = ?"
  ).run(newName, newPhone, id, req.userId);

  res.json({ ...existing, name: newName, phone: newPhone });
});

app.delete("/api/whatsapp-contacts/:id", authenticate, (req, res) => {
  const { id } = req.params;

  const existing = db.prepare(
    "SELECT * FROM whatsapp_contacts WHERE id = ? AND user_id = ?"
  ).get(id, req.userId);
  if (!existing) return res.status(404).json({ error: "Contato não encontrado" });

  db.prepare("DELETE FROM whatsapp_contacts WHERE id = ? AND user_id = ?").run(id, req.userId);
  res.json({ success: true });
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
      return res.status(502).json({ error: data.message || "Erro ao enviar mensagem", details: data });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro ao enviar WhatsApp:", err);
    res.status(500).json({ error: "Erro interno ao enviar mensagem" });
  }
});

// ─── AI Config Routes ────────────────────────────────────────

app.get("/api/ai-config", authenticate, (req, res) => {
  const row = db.prepare("SELECT * FROM ai_configs WHERE user_id = ?").get(req.userId);
  if (!row) return res.status(404).json({ error: "Configuração de IA não encontrada" });
  // Mask API key — only return last 4 characters
  const maskedKey = row.api_key.length > 4
    ? "•".repeat(row.api_key.length - 4) + row.api_key.slice(-4)
    : row.api_key;
  res.json({
    provider: row.provider,
    base_url: row.base_url,
    api_key: maskedKey,
    model: row.model,
  });
});

app.put("/api/ai-config", authenticate, (req, res) => {
  const { provider, base_url, api_key, model } = req.body;
  if (!base_url || !api_key || !model) {
    return res.status(400).json({ error: "base_url, api_key e model são obrigatórios" });
  }

  // If masked key is sent back, keep the existing key
  let finalApiKey = api_key;
  if (api_key.includes("•")) {
    const existing = db.prepare("SELECT api_key FROM ai_configs WHERE user_id = ?").get(req.userId);
    if (existing) {
      finalApiKey = existing.api_key;
    }
  }

  db.prepare(`
    INSERT INTO ai_configs (user_id, provider, base_url, api_key, model, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      provider = excluded.provider,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      model = excluded.model,
      updated_at = excluded.updated_at
  `).run(req.userId, provider || "custom", base_url, finalApiKey, model);

  res.json({ success: true });
});

app.delete("/api/ai-config", authenticate, (req, res) => {
  db.prepare("DELETE FROM ai_configs WHERE user_id = ?").run(req.userId);
  res.json({ success: true });
});

app.post("/api/ai-config/test", authenticate, async (req, res) => {
  const row = db.prepare("SELECT * FROM ai_configs WHERE user_id = ?").get(req.userId);
  if (!row) {
    return res.status(404).json({ success: false, message: "Configuração de IA não encontrada" });
  }

  try {
    const response = await fetch(`${row.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${row.api_key}`,
      },
      body: JSON.stringify({
        model: row.model,
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let msg = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        msg = errorData.error?.message || errorData.message || msg;
      } catch {
        if (text) msg = text.slice(0, 300);
      }
      if (response.status === 429) {
        msg = `Rate limit atingido (429). ${msg}. Aguarde alguns segundos e tente novamente.`;
      }
      return res.json({ success: false, message: `Erro do provedor: ${msg}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";
    res.json({ success: true, message: `Conexão bem-sucedida! Resposta: "${reply.trim()}"` });
  } catch (err) {
    res.json({ success: false, message: `Erro de conexão: ${err.message}` });
  }
});

// ─── AI Analysis Routes ──────────────────────────────────────

function stripHtmlTags(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildAnalysisPrompt(ticketData) {
  const lines = [];
  lines.push(`# Chamado #${ticketData.id}: ${ticketData.title}`);
  lines.push(`- Status: ${ticketData.status}`);
  lines.push(`- Prioridade: ${ticketData.priority}`);
  lines.push(`- Solicitante: ${ticketData.requester}`);
  lines.push(`- Técnico: ${ticketData.assignee}`);
  lines.push(`- Aberto em: ${ticketData.createdAt}`);
  lines.push(`- Última atualização: ${ticketData.updatedAt}`);
  lines.push("");
  lines.push("## Histórico cronológico:");

  // Sort updates chronologically (oldest first)
  const updates = [...(ticketData.updates || [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const u of updates) {
    const content = stripHtmlTags(u.content);
    lines.push(`[${u.date}] (${u.type}) ${u.author}: ${content}`);
  }

  // Truncate to ~15000 chars keeping start and end
  let prompt = lines.join("\n");
  if (prompt.length > 15000) {
    const head = prompt.slice(0, 7000);
    const tail = prompt.slice(-7000);
    prompt = head + "\n\n[... conteúdo truncado ...]\n\n" + tail;
  }

  return prompt;
}

const AI_SYSTEM_PROMPT = `Você é um analista de suporte técnico. Analise o chamado de TI fornecido e gere um relatório estruturado em markdown com as seguintes seções:

## 1. Resumo do Chamado
Descreva brevemente a solicitação original e a solução aplicada.

## 2. Linha do Tempo
Liste cada interação com o intervalo de tempo entre elas (ex: "2h30min entre abertura e primeira resposta").

## 3. Tempo de Resolução
Tempo total entre abertura e fechamento/resolução do chamado.

## 4. Análise de Atrasos
Se o chamado demorou mais de 2 dias úteis para ser resolvido, identifique as causas prováveis:
- Demora na atualização/resposta do técnico
- Aguardando suporte externo (fabricante, fornecedor)
- Compra de material/equipamento
- Dependências externas (aprovação, infraestrutura)
- Falta de informações do solicitante
Se não houve atraso significativo, indique que o tempo de resolução foi adequado.

## 5. Classificação
Classifique o chamado em uma ou mais categorias: Hardware, Software, Rede, Acesso/Permissões, Impressora, E-mail, Telefonia, Infraestrutura, Outro.

Responda sempre em português brasileiro. Use formatação markdown limpa e bem estruturada.`;

app.post("/api/ai/analyze", authenticate, async (req, res) => {
  const { ticket_data, force_refresh } = req.body;
  if (!ticket_data || !ticket_data.id) {
    return res.status(400).json({ error: "ticket_data é obrigatório" });
  }

  const aiConfig = db.prepare("SELECT * FROM ai_configs WHERE user_id = ?").get(req.userId);
  if (!aiConfig) {
    return res.status(400).json({ error: "Configuração de IA não encontrada. Configure em Configurações." });
  }

  // Check cache unless force_refresh
  if (!force_refresh) {
    const cached = db.prepare(
      "SELECT * FROM ai_analyses WHERE user_id = ? AND ticket_id = ?"
    ).get(req.userId, String(ticket_data.id));
    if (cached) {
      return res.json({
        id: cached.id,
        ticket_id: cached.ticket_id,
        analysis_text: cached.analysis_text,
        model_used: cached.model_used,
        created_at: cached.created_at,
        cached: true,
      });
    }
  }

  try {
    const userPrompt = buildAnalysisPrompt(ticket_data);

    const response = await fetch(`${aiConfig.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiConfig.api_key}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let msg = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        msg = errorData.error?.message || errorData.message || msg;
      } catch {
        if (text) msg = text.slice(0, 300);
      }
      if (response.status === 429) {
        msg = `Rate limit atingido (429). Aguarde alguns segundos e tente novamente. ${msg}`;
      }
      return res.status(502).json({ error: `Erro do provedor de IA: ${msg}` });
    }

    const data = await response.json();
    const analysisText = data.choices?.[0]?.message?.content;
    if (!analysisText) {
      return res.status(502).json({ error: "Resposta vazia do provedor de IA" });
    }

    // Cache result (upsert)
    db.prepare(`
      INSERT INTO ai_analyses (user_id, ticket_id, analysis_text, model_used, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, ticket_id) DO UPDATE SET
        analysis_text = excluded.analysis_text,
        model_used = excluded.model_used,
        created_at = excluded.created_at
    `).run(req.userId, String(ticket_data.id), analysisText, aiConfig.model);

    const row = db.prepare(
      "SELECT * FROM ai_analyses WHERE user_id = ? AND ticket_id = ?"
    ).get(req.userId, String(ticket_data.id));

    res.json({
      id: row.id,
      ticket_id: row.ticket_id,
      analysis_text: row.analysis_text,
      model_used: row.model_used,
      created_at: row.created_at,
      cached: false,
    });
  } catch (err) {
    console.error("Erro na análise de IA:", err);
    res.status(500).json({ error: `Erro ao processar análise: ${err.message}` });
  }
});

app.get("/api/ai/analyses/:ticketId", authenticate, (req, res) => {
  const row = db.prepare(
    "SELECT * FROM ai_analyses WHERE user_id = ? AND ticket_id = ?"
  ).get(req.userId, req.params.ticketId);
  if (!row) return res.status(404).json({ error: "Análise não encontrada" });
  res.json({
    id: row.id,
    ticket_id: row.ticket_id,
    analysis_text: row.analysis_text,
    model_used: row.model_used,
    created_at: row.created_at,
    cached: true,
  });
});

app.get("/api/ai/analyses", authenticate, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC"
  ).all(req.userId);
  res.json(rows.map((r) => ({
    id: r.id,
    ticket_id: r.ticket_id,
    analysis_text: r.analysis_text,
    model_used: r.model_used,
    created_at: r.created_at,
    cached: true,
  })));
});

app.delete("/api/ai/analyses/:ticketId", authenticate, (req, res) => {
  db.prepare(
    "DELETE FROM ai_analyses WHERE user_id = ? AND ticket_id = ?"
  ).run(req.userId, req.params.ticketId);
  res.json({ success: true });
});

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
