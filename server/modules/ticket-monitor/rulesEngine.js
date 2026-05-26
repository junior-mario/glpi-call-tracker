const { DEFAULT_MONITOR_CONFIG, RISK_ORDER, QUEUE_ORDER, RISK_LABELS } = require("./defaults");
const { parseDate, businessDaysBetween, daysBetween } = require("./utils");

const HEURISTIC_RULE_CODES = new Set([
  "AGUARDANDO_TERCEIRO_SEM_FOLLOWUP",
  "HISTORICO_INCONSISTENTE",
]);

function compareRisk(left, right) {
  return (RISK_ORDER[left] ?? 0) - (RISK_ORDER[right] ?? 0);
}

function maxRisk(risks) {
  let best = "NORMAL";
  for (const risk of risks) {
    if (compareRisk(risk, best) > 0) {
      best = risk;
    }
  }
  return best;
}

function normalizePriority(priority) {
  const value = String(priority || "").toLowerCase();
  if (value === "urgent" || value === "critical" || value === "critica") return "urgent";
  if (value === "high" || value === "alta") return "high";
  if (value === "medium" || value === "media") return "medium";
  return "low";
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("pending") || value.includes("pendente")) return "pending";
  if (value.includes("in-progress") || value.includes("andamento")) return "in-progress";
  if (value.includes("new") || value.includes("novo")) return "new";
  if (value.includes("resolved") || value.includes("resolvido")) return "resolved";
  if (value.includes("closed") || value.includes("fechado")) return "closed";
  if (value.includes("reopen") || value.includes("reaberto")) return "reopened";
  return value || "new";
}

function isUnassignedTechnician(technicianName) {
  const value = String(technicianName || "").trim().toLowerCase();
  if (!value) return true;
  return (
    value === "nao atribuido" ||
    value === "não atribuído" ||
    value === "nao atribuído" ||
    value === "não atribuido" ||
    value === "sem tecnico" ||
    value === "sem técnico"
  );
}

function buildRuleResult(code, triggered, severity, reason, suggestedQueue, recommendedAction) {
  return {
    code,
    triggered: Boolean(triggered),
    severity: triggered ? severity : "NORMAL",
    reason: triggered ? reason : "",
    suggested_queue: triggered ? suggestedQueue : "SAUDAVEL",
    recommended_action: triggered ? recommendedAction : "",
  };
}

function queueRank(queueName) {
  return QUEUE_ORDER[queueName] ?? 0;
}

function chooseDominantQueue(triggeredRules, finalRisk) {
  if (!triggeredRules.length || finalRisk === "NORMAL") return "SAUDAVEL";

  const criticalRules = triggeredRules.filter((rule) => rule.severity === finalRisk);
  if (criticalRules.length === 0) return "SAUDAVEL";

  let queueName = criticalRules[0].suggested_queue || "REVISAO";
  for (const rule of criticalRules) {
    if (queueRank(rule.suggested_queue) > queueRank(queueName)) {
      queueName = rule.suggested_queue;
    }
  }
  return queueName;
}

function summarizeOperationalRisk(triggeredRules) {
  if (!triggeredRules.length) {
    return "Ticket sem risco operacional relevante no momento.";
  }
  const top = triggeredRules.slice(0, 2).map((rule) => rule.reason).filter(Boolean);
  if (!top.length) {
    return "Ticket em risco operacional e requer acompanhamento.";
  }
  return top.join(" ");
}

function riskFromIdleMinutes(idleMinutes, threshold) {
  if (idleMinutes > threshold * 3) return "CRITICO";
  if (idleMinutes > threshold * 2) return "ALTO";
  if (idleMinutes > threshold) return "ATENCAO";
  return "NORMAL";
}

function analyzeTicket(ticket, config = {}) {
  const merged = { ...DEFAULT_MONITOR_CONFIG, ...config };
  const now = parseDate(ticket.analysis_reference_time) || new Date();
  const status = normalizeStatus(ticket.status);
  const priority = normalizePriority(ticket.priority);
  const idleMinutes = Number(ticket.minutes_since_last_interaction || 0);
  const reopenCount = Number(ticket.reopen_count || 0);
  const waitingThirdParty = Boolean(ticket.waiting_third_party);
  const openedAt = parseDate(ticket.opened_at);
  const daysOpen = openedAt ? daysBetween(openedAt, now) : 0;
  const businessDaysIdle = businessDaysBetween(parseDate(ticket.last_interaction_at), now);

  const rules = [];

  const noAssignee = isUnassignedTechnician(ticket.technician_name);
  rules.push(
    buildRuleResult(
      "SEM_RESPONSAVEL",
      noAssignee,
      priority === "urgent" ? "CRITICO" : "ALTO",
      "Chamado ativo sem tecnico responsavel definido.",
      "ACAO_IMEDIATA",
      "Atribuir tecnico responsavel imediatamente."
    )
  );

  const idleThreshold = merged.idle_thresholds_minutes[priority] ?? merged.idle_thresholds_minutes.low;
  const idleRisk = riskFromIdleMinutes(idleMinutes, idleThreshold);
  rules.push(
    buildRuleResult(
      "CHAMADO_PARADO",
      idleRisk !== "NORMAL",
      idleRisk,
      `Chamado sem interacao ha ${idleMinutes} minutos, acima do limite esperado para prioridade ${priority}.`,
      idleRisk === "ATENCAO" ? "COBRANCA" : "ACAO_IMEDIATA",
      "Cobrar atualizacao do responsavel e registrar proxima acao."
    )
  );

  const pendingHours = idleMinutes / 60;
  let pendingRisk = "NORMAL";
  if (status === "pending") {
    if (pendingHours > merged.pending_thresholds_hours.critical) pendingRisk = "CRITICO";
    else if (pendingHours > merged.pending_thresholds_hours.high) pendingRisk = "ALTO";
    else if (pendingHours > merged.pending_thresholds_hours.attention) pendingRisk = "ATENCAO";
  }
  rules.push(
    buildRuleResult(
      "PENDENTE_SEM_ATUALIZACAO",
      pendingRisk !== "NORMAL",
      pendingRisk,
      `Status pendente sem atualizacao recente (${Math.floor(pendingHours)}h).`,
      "COBRANCA",
      "Executar cobranca ativa e atualizar justificativa de pendencia."
    )
  );

  let thirdPartyRisk = "NORMAL";
  if (waitingThirdParty) {
    if (businessDaysIdle > merged.third_party_thresholds_business_days.critical) thirdPartyRisk = "CRITICO";
    else if (businessDaysIdle > merged.third_party_thresholds_business_days.high) thirdPartyRisk = "ALTO";
  }
  rules.push(
    buildRuleResult(
      "AGUARDANDO_TERCEIRO_SEM_FOLLOWUP",
      thirdPartyRisk !== "NORMAL",
      thirdPartyRisk,
      `Dependencia de terceiro sem follow-up ha ${businessDaysIdle} dias uteis.`,
      "COBRANCA",
      "Registrar follow-up com terceiro e data de retorno prevista."
    )
  );

  let reopenRisk = "NORMAL";
  if (reopenCount >= 3) reopenRisk = "CRITICO";
  else if (reopenCount === 2) reopenRisk = "ALTO";
  else if (reopenCount === 1) reopenRisk = "ATENCAO";

  rules.push(
    buildRuleResult(
      "CHAMADO_REABERTO",
      reopenRisk !== "NORMAL",
      reopenRisk,
      `Chamado reaberto ${reopenCount} vez(es).`,
      "REVISAO",
      "Revisar causa raiz e plano corretivo para evitar nova reabertura."
    )
  );

  let criticalNoActionRisk = "NORMAL";
  if (priority === "urgent") {
    if (idleMinutes > merged.critical_no_action_thresholds_minutes.critical) criticalNoActionRisk = "CRITICO";
    else if (idleMinutes > merged.critical_no_action_thresholds_minutes.high) criticalNoActionRisk = "ALTO";
  }
  rules.push(
    buildRuleResult(
      "CRITICO_SEM_ACAO",
      criticalNoActionRisk !== "NORMAL",
      criticalNoActionRisk,
      `Prioridade critica sem acao recente (${idleMinutes} minutos).`,
      "ACAO_IMEDIATA",
      "Acionar atendimento imediato e escalar responsavel."
    )
  );

  let oldTicketRisk = "NORMAL";
  if (daysOpen > merged.old_ticket_thresholds_days.critical) oldTicketRisk = "CRITICO";
  else if (daysOpen > merged.old_ticket_thresholds_days.high) oldTicketRisk = "ALTO";
  else if (daysOpen > merged.old_ticket_thresholds_days.attention) oldTicketRisk = "ATENCAO";

  rules.push(
    buildRuleResult(
      "CHAMADO_ANTIGO",
      oldTicketRisk !== "NORMAL",
      oldTicketRisk,
      `Chamado aberto ha ${daysOpen} dia(s) sem conclusao clara.`,
      oldTicketRisk === "ATENCAO" ? "REVISAO" : "COBRANCA",
      "Revisar bloqueios e definir plano de resolucao com prazo."
    )
  );

  let inconsistencyRisk = "NORMAL";
  const historySummary = String(ticket.history_summary || "");
  const lowHistoryEvidence = historySummary.length < 30;
  if (status === "in-progress" && idleMinutes > merged.stale_in_progress_hours * 60) {
    inconsistencyRisk = "ALTO";
  } else if (status === "pending" && !waitingThirdParty && idleMinutes > merged.stale_pending_no_reason_hours * 60) {
    inconsistencyRisk = "ATENCAO";
  } else if (status === "in-progress" && lowHistoryEvidence && idleMinutes > 12 * 60) {
    inconsistencyRisk = "ATENCAO";
  }

  rules.push(
    buildRuleResult(
      "HISTORICO_INCONSISTENTE",
      inconsistencyRisk !== "NORMAL",
      inconsistencyRisk,
      "Historico sugere incoerencia entre status e movimentacao real do chamado.",
      "REVISAO",
      "Revisar historico e padronizar registros de andamento."
    )
  );

  const triggeredRules = rules.filter((rule) => rule.triggered);
  const finalRisk = maxRisk(triggeredRules.map((rule) => rule.severity));
  const queueName = chooseDominantQueue(triggeredRules, finalRisk);
  const riskReasons = triggeredRules.map((rule) => rule.reason);
  const recommendedAction = triggeredRules[0]?.recommended_action || "Manter acompanhamento padrao.";
  const needsAlert = compareRisk(finalRisk, "ALTO") >= 0;
  const alertType = finalRisk === "CRITICO" ? "RISCO_CRITICO" : finalRisk === "ALTO" ? "RISCO_ALTO" : null;
  const analysisConfidence = triggeredRules.some((rule) => HEURISTIC_RULE_CODES.has(rule.code)) ? "MEDIA" : "ALTA";
  const healthStatus = finalRisk === "NORMAL" ? "Saudavel" : "Em risco";
  const operationalSummary = summarizeOperationalRisk(triggeredRules);

  return {
    ticket_id: ticket.ticket_id,
    current_status: status,
    current_priority: priority,
    technician_name: ticket.technician_name || "",
    group_name: ticket.group_name || "",
    minutes_since_last_interaction: idleMinutes,
    is_reopened: reopenCount > 0 || Boolean(ticket.is_reopened),
    reopen_count: reopenCount,
    waiting_third_party: waitingThirdParty,
    operational_risk: finalRisk,
    health_status: healthStatus,
    triggered_rules: triggeredRules,
    risk_reasons: riskReasons,
    recommended_action: recommendedAction,
    queue_name: queueName,
    needs_alert: needsAlert,
    alert_type: alertType,
    analysis_confidence: analysisConfidence,
    operational_summary: operationalSummary,
    _all_rules: rules,
    _severity_order: RISK_LABELS,
  };
}

module.exports = {
  analyzeTicket,
  compareRisk,
  chooseDominantQueue,
  isUnassignedTechnician,
  HEURISTIC_RULE_CODES,
};

