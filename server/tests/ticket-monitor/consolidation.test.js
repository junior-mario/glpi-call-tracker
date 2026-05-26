const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConsolidatedTicketFromPayload, isAssignedTicket } = require("../../modules/ticket-monitor/glpiClient");

test("consolidacao deve usar fallbacks de candidate quando ticketData estiver incompleto", () => {
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
  assert.equal(consolidated.title, "Falha de rede");
  assert.equal(consolidated.technician_name, "Bob");
  assert.equal(consolidated.requester_name, "Alice");
  assert.equal(consolidated.group_name, "Infra");
  assert.equal(consolidated.last_interaction_type, "ticket");
});

test("consolidacao deve identificar terceiro e reabertura por heuristica textual", () => {
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

  assert.equal(consolidated.requester_name, "Carlos");
  assert.equal(consolidated.technician_name, "Tecnico 02");
  assert.ok(consolidated.waiting_third_party);
  assert.ok(consolidated.reopen_count >= 1);
  assert.ok(consolidated.is_reopened);
  assert.equal(consolidated.last_interaction_type, "followup");
});

test("isAssignedTicket deve identificar tecnico atribuido por id", () => {
  const assigned = isAssignedTicket({
    technician_raw: 123,
    technician_name: "Tecnico 01",
  });
  assert.equal(assigned, true);
});

test("isAssignedTicket deve identificar chamado sem responsavel", () => {
  const assigned = isAssignedTicket({
    technician_raw: "",
    technician_name: "Nao atribuido",
  });
  assert.equal(assigned, false);
});
