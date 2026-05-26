const { analyzeTicket } = require("./rulesEngine");
const repository = require("./repository");
const defaultGlpiClient = require("./glpiClient");
const { RISK_ORDER } = require("./defaults");
const { includesIgnoreCase } = require("./utils");

const PRIORITY_ORDER = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function normalizeQueue(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSortBy(value) {
  const allowed = new Set(["risk", "idle", "priority", "opened_at"]);
  const sortBy = String(value || "risk").toLowerCase();
  return allowed.has(sortBy) ? sortBy : "risk";
}

function normalizeSortDir(value) {
  return String(value || "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

function parseTriggeredCodes(row) {
  if (!Array.isArray(row.triggered_rules)) return [];
  return row.triggered_rules.map((rule) => rule.code).filter(Boolean);
}

function applyTicketFilters(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.current_status !== filters.status) return false;
    if (filters.priority && filters.priority !== "all" && row.current_priority !== filters.priority) return false;
    if (filters.risk && filters.risk !== "all" && row.operational_risk !== filters.risk) return false;
    if (filters.queue && filters.queue !== "all" && normalizeQueue(row.queue_name) !== normalizeQueue(filters.queue)) return false;
    if (filters.group && filters.group !== "all" && !includesIgnoreCase(row.group_name, filters.group)) return false;
    if (filters.technician && filters.technician !== "all" && !includesIgnoreCase(row.technician_name, filters.technician)) {
      return false;
    }

    if (filters.search) {
      const search = String(filters.search || "").trim().toLowerCase();
      if (search) {
        const haystack = [
          row.ticket_id,
          row.title,
          row.description,
          row.requester_name,
          row.group_name,
          row.technician_name,
          row.operational_summary,
        ]
          .map((item) => String(item || "").toLowerCase())
          .join(" ");

        if (!haystack.includes(search)) return false;
      }
    }

    return true;
  });
}

function sortRows(rows, sortBy, sortDir) {
  const sorted = [...rows].sort((left, right) => {
    if (sortBy === "risk") {
      return (RISK_ORDER[left.operational_risk] ?? 0) - (RISK_ORDER[right.operational_risk] ?? 0);
    }
    if (sortBy === "idle") {
      return Number(left.minutes_since_last_interaction || 0) - Number(right.minutes_since_last_interaction || 0);
    }
    if (sortBy === "priority") {
      return (PRIORITY_ORDER[left.current_priority] ?? 0) - (PRIORITY_ORDER[right.current_priority] ?? 0);
    }
    const leftDate = new Date(left.opened_at || 0).getTime();
    const rightDate = new Date(right.opened_at || 0).getTime();
    return leftDate - rightDate;
  });

  return sortDir === "asc" ? sorted : sorted.reverse();
}

function createTicketMonitorService({ db, logger = console, glpiClient = defaultGlpiClient }) {
  const runningUsers = new Set();
  const lastRunByUser = new Map();
  let schedulerTimer = null;
  let schedulerCycleRunning = false;

  async function runMonitorForUser(userId, options = {}) {
    const trigger = options.trigger || "manual";
    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId)) {
      throw new Error("userId invalido");
    }

    if (runningUsers.has(numericUserId)) {
      return {
        success: false,
        skipped: true,
        reason: "already_running",
        user_id: numericUserId,
      };
    }

    runningUsers.add(numericUserId);
    const startedAt = Date.now();

    try {
      const glpiConfig = repository.getGlpiConfigForUser(db, numericUserId);
      if (!glpiConfig) {
        return {
          success: false,
          skipped: true,
          reason: "missing_glpi_config",
          user_id: numericUserId,
        };
      }

      const monitorConfig = repository.getMonitorConfig(db, numericUserId);
      if (trigger === "scheduler" && !monitorConfig.scheduler_enabled) {
        return {
          success: false,
          skipped: true,
          reason: "scheduler_disabled",
          user_id: numericUserId,
        };
      }

      const candidates = await glpiClient.collectActiveTickets(glpiConfig, monitorConfig);
      const limitedCandidates = candidates.slice(0, monitorConfig.max_tickets_per_cycle);
      const errors = [];
      let processed = 0;

      for (const candidate of limitedCandidates) {
        try {
          const consolidated = await glpiClient.consolidateTicket(glpiConfig, candidate);
          const analysisTimestamp = new Date().toISOString();
          const analysis = analyzeTicket(
            {
              ...consolidated,
              analysis_reference_time: analysisTimestamp,
            },
            monitorConfig
          );

          repository.insertAnalysis(db, numericUserId, consolidated, analysis, analysisTimestamp);
          repository.upsertState(db, numericUserId, analysis, analysisTimestamp);
          processed += 1;
        } catch (error) {
          errors.push({
            ticket_id: candidate.ticket_id,
            message: error instanceof Error ? error.message : "Erro desconhecido",
          });
          logger.warn(
            `[ticket-monitor] user=${numericUserId} ticket=${candidate.ticket_id} erro de processamento: ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }

      lastRunByUser.set(numericUserId, Date.now());

      const durationMs = Date.now() - startedAt;
      logger.info(
        `[ticket-monitor] user=${numericUserId} trigger=${trigger} processados=${processed}/${limitedCandidates.length} erros=${errors.length} em ${durationMs}ms`
      );

      return {
        success: true,
        user_id: numericUserId,
        trigger,
        processed_tickets: processed,
        scanned_tickets: limitedCandidates.length,
        found_active_tickets: candidates.length,
        errors,
        duration_ms: durationMs,
      };
    } finally {
      runningUsers.delete(numericUserId);
    }
  }

  function getLatestTickets(userId, query = {}) {
    const numericUserId = Number(userId);
    const sortBy = normalizeSortBy(query.sort_by);
    const sortDir = normalizeSortDir(query.sort_dir);

    const rows = repository.getLatestAnalyses(db, numericUserId);
    const filtered = applyTicketFilters(rows, {
      status: query.status,
      priority: query.priority,
      risk: query.risk,
      queue: query.queue,
      group: query.group,
      technician: query.technician,
      search: query.search,
    });

    return sortRows(filtered, sortBy, sortDir);
  }

  function getQueueTickets(userId, queueName, query = {}) {
    const tickets = getLatestTickets(userId, { ...query, queue: queueName });
    return tickets;
  }

  function getSummary(userId) {
    const rows = getLatestTickets(userId, { sort_by: "risk", sort_dir: "desc" });

    const summary = {
      total_monitorado: rows.length,
      em_risco: 0,
      criticos: 0,
      sem_responsavel: 0,
      parados: 0,
      reabertos: 0,
      filas: {
        SAUDAVEL: 0,
        ACAO_IMEDIATA: 0,
        COBRANCA: 0,
        REVISAO: 0,
      },
      last_analysis_timestamp: rows.length ? rows[0].analysis_timestamp : null,
    };

    for (const row of rows) {
      const ruleCodes = parseTriggeredCodes(row);
      const queue = normalizeQueue(row.queue_name) || "SAUDAVEL";
      if (summary.filas[queue] !== undefined) summary.filas[queue] += 1;

      if (row.operational_risk !== "NORMAL") summary.em_risco += 1;
      if (row.operational_risk === "CRITICO") summary.criticos += 1;
      if (ruleCodes.includes("SEM_RESPONSAVEL")) summary.sem_responsavel += 1;
      if (ruleCodes.includes("CHAMADO_PARADO") || ruleCodes.includes("CRITICO_SEM_ACAO")) summary.parados += 1;
      if (row.is_reopened || ruleCodes.includes("CHAMADO_REABERTO")) summary.reabertos += 1;
    }

    return summary;
  }

  function getTicketDetail(userId, ticketId) {
    const latest = repository.getLatestAnalysisForTicket(db, Number(userId), String(ticketId));
    if (!latest) return null;
    const state = repository.getTicketState(db, Number(userId), String(ticketId));
    const history = repository.getTicketHistory(db, Number(userId), String(ticketId), 30);
    return { latest, state, history };
  }

  function getTicketHistory(userId, ticketId, limit = 50) {
    return repository.getTicketHistory(db, Number(userId), String(ticketId), Number(limit));
  }

  function getConfig(userId) {
    return repository.getMonitorConfig(db, Number(userId));
  }

  function updateConfig(userId, payload) {
    const normalized = repository.upsertMonitorConfig(db, Number(userId), payload);
    // force immediate eligibility check on next scheduler cycle
    lastRunByUser.set(Number(userId), 0);
    return normalized;
  }

  async function runDueUsersForScheduler() {
    if (schedulerCycleRunning) return;
    schedulerCycleRunning = true;

    try {
      const users = repository.getUsersWithGlpiConfig(db);
      const now = Date.now();

      for (const userId of users) {
        const config = repository.getMonitorConfig(db, userId);
        if (!config.scheduler_enabled) continue;

        const lastRunAt = lastRunByUser.get(userId) || 0;
        const intervalMs = Math.max(1, Number(config.monitor_interval_minutes || 5)) * 60 * 1000;

        if (now - lastRunAt < intervalMs) continue;

        try {
          await runMonitorForUser(userId, { trigger: "scheduler" });
        } catch (error) {
          logger.error(
            `[ticket-monitor] erro no scheduler para user=${userId}: ${
              error instanceof Error ? error.message : error
            }`
          );
        }
      }
    } finally {
      schedulerCycleRunning = false;
    }
  }

  function startScheduler() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => {
      runDueUsersForScheduler().catch((error) => {
        logger.error(`[ticket-monitor] erro no ciclo do scheduler: ${error instanceof Error ? error.message : error}`);
      });
    }, 60 * 1000);

    // fire initial cycle quickly after boot
    setTimeout(() => {
      runDueUsersForScheduler().catch((error) => {
        logger.error(
          `[ticket-monitor] erro no ciclo inicial do scheduler: ${error instanceof Error ? error.message : error}`
        );
      });
    }, 10 * 1000);

    if (typeof schedulerTimer.unref === "function") {
      schedulerTimer.unref();
    }
  }

  function stopScheduler() {
    if (!schedulerTimer) return;
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  return {
    runMonitorForUser,
    runDueUsersForScheduler,
    startScheduler,
    stopScheduler,
    getLatestTickets,
    getQueueTickets,
    getSummary,
    getTicketDetail,
    getTicketHistory,
    getConfig,
    updateConfig,
  };
}

module.exports = {
  createTicketMonitorService,
};
