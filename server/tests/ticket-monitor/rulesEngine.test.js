const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeTicket } = require("../../modules/ticket-monitor/rulesEngine");

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

function codes(result) {
  return result.triggered_rules.map((rule) => rule.code);
}

test("SEM_RESPONSAVEL deve ir para ACAO_IMEDIATA", () => {
  const result = analyzeTicket(baseTicket({ technician_name: "Nao atribuido" }));
  assert.ok(codes(result).includes("SEM_RESPONSAVEL"));
  assert.equal(result.queue_name, "ACAO_IMEDIATA");
  assert.ok(result.operational_risk === "ALTO" || result.operational_risk === "CRITICO");
});

test("CHAMADO_PARADO deve acionar conforme prioridade", () => {
  const result = analyzeTicket(baseTicket({ priority: "high", minutes_since_last_interaction: 200 }));
  assert.ok(codes(result).includes("CHAMADO_PARADO"));
  assert.ok(["ATENCAO", "ALTO", "CRITICO"].includes(result.operational_risk));
});

test("PENDENTE_SEM_ATUALIZACAO deve acionar por faixa de horas", () => {
  const result = analyzeTicket(baseTicket({ status: "pending", minutes_since_last_interaction: 60 * 50 }));
  assert.ok(codes(result).includes("PENDENTE_SEM_ATUALIZACAO"));
  assert.ok(["ALTO", "CRITICO"].includes(result.operational_risk));
});

test("AGUARDANDO_TERCEIRO_SEM_FOLLOWUP deve acionar por dias uteis", () => {
  const result = analyzeTicket(
    baseTicket({
      waiting_third_party: true,
      last_interaction_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      minutes_since_last_interaction: 7 * 24 * 60,
    })
  );
  assert.ok(codes(result).includes("AGUARDANDO_TERCEIRO_SEM_FOLLOWUP"));
});

test("CHAMADO_REABERTO deve acionar e ir para REVISAO", () => {
  const result = analyzeTicket(baseTicket({ reopen_count: 2, is_reopened: true }));
  assert.ok(codes(result).includes("CHAMADO_REABERTO"));
  assert.equal(result.queue_name, "REVISAO");
});

test("CRITICO_SEM_ACAO deve acionar para prioridade critica", () => {
  const result = analyzeTicket(baseTicket({ priority: "urgent", minutes_since_last_interaction: 80 }));
  assert.ok(codes(result).includes("CRITICO_SEM_ACAO"));
  assert.equal(result.queue_name, "ACAO_IMEDIATA");
});

test("CHAMADO_ANTIGO deve acionar por idade", () => {
  const result = analyzeTicket(
    baseTicket({
      opened_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      minutes_since_last_interaction: 60,
    })
  );
  assert.ok(codes(result).includes("CHAMADO_ANTIGO"));
  assert.ok(["ALTO", "CRITICO"].includes(result.operational_risk));
});

