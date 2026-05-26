const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { analyzeTicket } = require("../../modules/ticket-monitor/rulesEngine");
const { buildConsolidatedTicketFromPayload } = require("../../modules/ticket-monitor/glpiClient");
const { ticketMonitorRepository, createTicketMonitorService } = require("../../modules/ticket-monitor");

let failed = 0;
let passed = 0;

function report(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

function reportAsync(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`[PASS] ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`[FAIL] ${name}`);
      console.error(error);
    });
}

function baseTicket(overrides = {}) {
  return {
    ticket_id: "100",
    status: "in-progress",
    priority: "medium",
    technician_name: "Tecnico 01",
    group_name: "Suporte",
    opened_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    last_interaction_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    minutes_since_last_interaction: 30,
    is_reopened: false,
    reopen_count: 0,
    waiting_third_party: false,
    history_summary: "Atualizacao em andamento",
    ...overrides,
  };
}

function ruleCodes(result) {
  return result.triggered_rules.map((rule) => rule.code);
}

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

async function main() {
  report("rule SEM_RESPONSAVEL", () => {
    const result = analyzeTicket(baseTicket({ technician_name: "Nao atribuido" }));
    assert.ok(ruleCodes(result).includes("SEM_RESPONSAVEL"));
    assert.equal(result.queue_name, "ACAO_IMEDIATA");
  });

  report("rule CHAMADO_PARADO", () => {
    const result = analyzeTicket(baseTicket({ priority: "high", minutes_since_last_interaction: 200 }));
    assert.ok(ruleCodes(result).includes("CHAMADO_PARADO"));
  });

  report("rule PENDENTE_SEM_ATUALIZACAO", () => {
    const result = analyzeTicket(baseTicket({ status: "pending", minutes_since_last_interaction: 60 * 50 }));
    assert.ok(ruleCodes(result).includes("PENDENTE_SEM_ATUALIZACAO"));
  });

  report("rule AGUARDANDO_TERCEIRO_SEM_FOLLOWUP", () => {
    const result = analyzeTicket(
      baseTicket({
        waiting_third_party: true,
        last_interaction_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        minutes_since_last_interaction: 7 * 24 * 60,
      })
    );
    assert.ok(ruleCodes(result).includes("AGUARDANDO_TERCEIRO_SEM_FOLLOWUP"));
  });

  report("rule CHAMADO_REABERTO", () => {
    const result = analyzeTicket(baseTicket({ reopen_count: 2, is_reopened: true }));
    assert.ok(ruleCodes(result).includes("CHAMADO_REABERTO"));
    assert.equal(result.queue_name, "REVISAO");
  });

  report("rule CRITICO_SEM_ACAO", () => {
    const result = analyzeTicket(baseTicket({ priority: "urgent", minutes_since_last_interaction: 80 }));
    assert.ok(ruleCodes(result).includes("CRITICO_SEM_ACAO"));
    assert.equal(result.queue_name, "ACAO_IMEDIATA");
  });

  report("rule CHAMADO_ANTIGO", () => {
    const result = analyzeTicket(
      baseTicket({
        opened_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        minutes_since_last_interaction: 60,
      })
    );
    assert.ok(ruleCodes(result).includes("CHAMADO_ANTIGO"));
  });

  report("consolidation fallback", () => {
    const consolidated = buildConsolidatedTicketFromPayload({
      candidate: {
        ticket_id: "200",
        title: "Falha de rede",
        status: "in-progress",
        priority: "high",
        category: "Rede",
        requester_name: "Alice",
        group_name: "Infra",
        technician_name: "Bob",
        opened_at: "2026-04-10 10:00:00",
        updated_at: "2026-04-10 12:00:00",
      },
      ticketData: {},
      updates: [],
      requesterNameFromTicket: "",
      assigneeNameFromTicket: "",
    });
    assert.equal(consolidated.ticket_id, "200");
    assert.equal(consolidated.technician_name, "Bob");
    assert.equal(consolidated.requester_name, "Alice");
  });

  report("consolidation heuristics", () => {
    const consolidated = buildConsolidatedTicketFromPayload({
      candidate: {
        ticket_id: "201",
        title: "Aguardando fornecedor para troca",
        status: "pending",
        priority: "medium",
        category: "Hardware",
        requester_name: "",
        group_name: "Suporte",
        technician_name: "",
        opened_at: "2026-04-05 08:00:00",
        updated_at: "2026-04-07 09:00:00",
      },
      ticketData: {
        content: "Chamado reaberto apos nova falha. aguardando fornecedor.",
        date_creation: "2026-04-05 08:00:00",
        date_mod: "2026-04-07 09:00:00",
      },
      updates: [
        { date: "2026-04-06 09:00:00", type: "followup", content: "reaberto pelo solicitante" },
        { date: "2026-04-07 09:00:00", type: "followup", content: "aguardando terceiro" },
      ],
      requesterNameFromTicket: "Carlos",
      assigneeNameFromTicket: "Tecnico 02",
    });
    assert.ok(consolidated.waiting_third_party);
    assert.ok(consolidated.reopen_count >= 1);
    assert.equal(consolidated.last_interaction_type, "followup");
  });

  await reportAsync("service processing and persistence", async () => {
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

    const detail = service.getTicketDetail(1, "300");
    assert.ok(detail);
    assert.equal(detail.latest.ticket_id, "300");
    db.close();
  });

  console.log(`\nMonitor tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

