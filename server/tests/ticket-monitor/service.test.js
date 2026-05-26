const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { ticketMonitorRepository, createTicketMonitorService } = require("../../modules/ticket-monitor");

function setupDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE glpi_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      base_url TEXT NOT NULL,
      app_token TEXT NOT NULL,
      user_token TEXT NOT NULL
    );
  `);
  ticketMonitorRepository.ensureSchema(db);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'user@acme.com', 'hash')").run();
  db.prepare(
    "INSERT INTO glpi_configs (user_id, base_url, app_token, user_token) VALUES (?, ?, ?, ?)"
  ).run(1, "https://glpi.local", "app", "user");
  return db;
}

test("config do monitor deve persistir grupos e filtro de chamados sem responsavel", () => {
  const db = setupDb();

  const initial = ticketMonitorRepository.getMonitorConfig(db, 1);
  assert.equal(initial.include_unassigned_tickets, false);

  const updated = ticketMonitorRepository.upsertMonitorConfig(db, 1, {
    monitored_group_ids: [8, 12],
    include_unassigned_tickets: true,
  });
  assert.deepEqual(updated.monitored_group_ids, [8, 12]);
  assert.equal(updated.include_unassigned_tickets, true);

  const reloaded = ticketMonitorRepository.getMonitorConfig(db, 1);
  assert.deepEqual(reloaded.monitored_group_ids, [8, 12]);
  assert.equal(reloaded.include_unassigned_tickets, true);

  db.close();
});

test("service deve processar tickets, salvar analises e retornar resumo", async () => {
  const db = setupDb();
  const glpiClient = {
    async collectActiveTickets() {
      return [
        {
          ticket_id: "300",
          title: "Servidor sem espaco",
          status: "in-progress",
          priority: "urgent",
          requester_name: "Ana",
          technician_name: "Nao atribuido",
          group_name: "Infra",
          opened_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        },
      ];
    },
    async consolidateTicket(_config, candidate) {
      return {
        ticket_id: candidate.ticket_id,
        title: candidate.title,
        description: "Sem espaco em disco no servidor principal.",
        status: "in-progress",
        priority: "urgent",
        category: "Infra",
        requester_name: candidate.requester_name,
        group_name: candidate.group_name,
        technician_name: candidate.technician_name,
        opened_at: candidate.opened_at,
        updated_at: candidate.updated_at,
        last_interaction_type: "followup",
        last_interaction_at: candidate.updated_at,
        minutes_since_last_interaction: 120,
        is_reopened: false,
        reopen_count: 0,
        waiting_third_party: false,
        history_summary: "Sem atualizacao recente.",
      };
    },
  };

  const service = createTicketMonitorService({ db, glpiClient, logger: console });
  const run = await service.runMonitorForUser(1, { trigger: "manual" });
  assert.equal(run.success, true);
  assert.equal(run.processed_tickets, 1);

  const summary = service.getSummary(1);
  assert.equal(summary.total_monitorado, 1);
  assert.equal(summary.em_risco, 1);
  assert.equal(summary.sem_responsavel, 1);

  const rows = service.getLatestTickets(1, {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticket_id, "300");

  const detail = service.getTicketDetail(1, "300");
  assert.ok(detail);
  assert.equal(detail.latest.ticket_id, "300");
  assert.ok(Array.isArray(detail.history));

  db.close();
});
