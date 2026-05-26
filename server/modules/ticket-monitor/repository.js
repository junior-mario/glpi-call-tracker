const { DEFAULT_MONITOR_CONFIG } = require("./defaults");
const { safeJsonParse, normalizeArrayOfNumbers, toBooleanInt } = require("./utils");

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_monitor_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scheduler_enabled INTEGER NOT NULL DEFAULT 1,
      monitor_interval_minutes INTEGER NOT NULL DEFAULT 5,
      monitored_status_codes TEXT NOT NULL DEFAULT '[1,2,3,4]',
      monitored_group_ids TEXT NOT NULL DEFAULT '[]',
      include_unassigned_tickets INTEGER NOT NULL DEFAULT 0,
      max_tickets_per_cycle INTEGER NOT NULL DEFAULT 200,
      max_results_per_status INTEGER NOT NULL DEFAULT 2000,
      idle_thresholds_minutes TEXT NOT NULL DEFAULT '{"urgent":30,"high":60,"medium":240,"low":480}',
      pending_thresholds_hours TEXT NOT NULL DEFAULT '{"attention":24,"high":48,"critical":72}',
      third_party_thresholds_business_days TEXT NOT NULL DEFAULT '{"high":2,"critical":3}',
      critical_no_action_thresholds_minutes TEXT NOT NULL DEFAULT '{"high":30,"critical":60}',
      old_ticket_thresholds_days TEXT NOT NULL DEFAULT '{"attention":7,"high":15,"critical":30}',
      stale_in_progress_hours INTEGER NOT NULL DEFAULT 48,
      stale_pending_no_reason_hours INTEGER NOT NULL DEFAULT 24,
      ticket_lookback_days INTEGER NOT NULL DEFAULT 120,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_monitor_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      category TEXT,
      opened_at TEXT,
      updated_at TEXT,
      analysis_timestamp TEXT NOT NULL,
      current_status TEXT,
      current_priority TEXT,
      technician_name TEXT,
      requester_name TEXT,
      group_name TEXT,
      last_interaction_type TEXT,
      minutes_since_last_interaction INTEGER,
      is_reopened INTEGER DEFAULT 0,
      reopen_count INTEGER DEFAULT 0,
      waiting_third_party INTEGER DEFAULT 0,
      operational_risk TEXT NOT NULL,
      health_status TEXT,
      triggered_rules TEXT,
      risk_reasons TEXT,
      recommended_action TEXT,
      queue_name TEXT,
      needs_alert INTEGER DEFAULT 0,
      alert_type TEXT,
      analysis_confidence TEXT,
      operational_summary TEXT,
      history_summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_monitor_state (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL,
      last_analysis_timestamp TEXT,
      last_operational_risk TEXT,
      last_alert_type TEXT,
      last_alert_sent_at TEXT,
      last_queue_name TEXT,
      last_triggered_rules TEXT,
      is_currently_in_risk INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, ticket_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_monitor_analysis_user_ticket
      ON ticket_monitor_analysis(user_id, ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_monitor_analysis_risk
      ON ticket_monitor_analysis(operational_risk);
    CREATE INDEX IF NOT EXISTS idx_ticket_monitor_analysis_timestamp
      ON ticket_monitor_analysis(analysis_timestamp);
    CREATE INDEX IF NOT EXISTS idx_ticket_monitor_state_user_risk
      ON ticket_monitor_state(user_id, is_currently_in_risk);
  `);

  // Migration: add include_unassigned_tickets to existing installs (idempotent)
  try {
    db.exec("ALTER TABLE ticket_monitor_configs ADD COLUMN include_unassigned_tickets INTEGER NOT NULL DEFAULT 0");
  } catch (_) {}

  // Migration: add requester_name to analysis table (idempotent)
  try {
    db.exec("ALTER TABLE ticket_monitor_analysis ADD COLUMN requester_name TEXT");
  } catch (_) {}
}

function parseConfigRow(row) {
  if (!row) return { ...DEFAULT_MONITOR_CONFIG };
  return {
    scheduler_enabled: Boolean(row.scheduler_enabled),
    monitor_interval_minutes: Number(row.monitor_interval_minutes || DEFAULT_MONITOR_CONFIG.monitor_interval_minutes),
    monitored_status_codes: normalizeArrayOfNumbers(safeJsonParse(row.monitored_status_codes, DEFAULT_MONITOR_CONFIG.monitored_status_codes)),
    monitored_group_ids: normalizeArrayOfNumbers(safeJsonParse(row.monitored_group_ids, DEFAULT_MONITOR_CONFIG.monitored_group_ids)),
    include_unassigned_tickets:
      row.include_unassigned_tickets === null || row.include_unassigned_tickets === undefined
        ? Boolean(DEFAULT_MONITOR_CONFIG.include_unassigned_tickets)
        : Boolean(row.include_unassigned_tickets),
    max_tickets_per_cycle: Number(row.max_tickets_per_cycle || DEFAULT_MONITOR_CONFIG.max_tickets_per_cycle),
    max_results_per_status: Number(row.max_results_per_status || DEFAULT_MONITOR_CONFIG.max_results_per_status),
    idle_thresholds_minutes: {
      ...DEFAULT_MONITOR_CONFIG.idle_thresholds_minutes,
      ...safeJsonParse(row.idle_thresholds_minutes, {}),
    },
    pending_thresholds_hours: {
      ...DEFAULT_MONITOR_CONFIG.pending_thresholds_hours,
      ...safeJsonParse(row.pending_thresholds_hours, {}),
    },
    third_party_thresholds_business_days: {
      ...DEFAULT_MONITOR_CONFIG.third_party_thresholds_business_days,
      ...safeJsonParse(row.third_party_thresholds_business_days, {}),
    },
    critical_no_action_thresholds_minutes: {
      ...DEFAULT_MONITOR_CONFIG.critical_no_action_thresholds_minutes,
      ...safeJsonParse(row.critical_no_action_thresholds_minutes, {}),
    },
    old_ticket_thresholds_days: {
      ...DEFAULT_MONITOR_CONFIG.old_ticket_thresholds_days,
      ...safeJsonParse(row.old_ticket_thresholds_days, {}),
    },
    stale_in_progress_hours: Number(row.stale_in_progress_hours || DEFAULT_MONITOR_CONFIG.stale_in_progress_hours),
    stale_pending_no_reason_hours: Number(
      row.stale_pending_no_reason_hours || DEFAULT_MONITOR_CONFIG.stale_pending_no_reason_hours
    ),
    ticket_lookback_days: Number(row.ticket_lookback_days || DEFAULT_MONITOR_CONFIG.ticket_lookback_days),
  };
}

function normalizeConfigPayload(payload = {}) {
  const base = { ...DEFAULT_MONITOR_CONFIG };
  const merged = { ...base, ...payload };

  return {
    scheduler_enabled: payload.scheduler_enabled !== undefined ? Boolean(payload.scheduler_enabled) : base.scheduler_enabled,
    monitor_interval_minutes: Math.max(1, Number(merged.monitor_interval_minutes || base.monitor_interval_minutes)),
    monitored_status_codes: normalizeArrayOfNumbers(merged.monitored_status_codes),
    monitored_group_ids: normalizeArrayOfNumbers(merged.monitored_group_ids),
    include_unassigned_tickets:
      payload.include_unassigned_tickets !== undefined
        ? Boolean(payload.include_unassigned_tickets)
        : Boolean(base.include_unassigned_tickets),
    max_tickets_per_cycle: Math.max(1, Number(merged.max_tickets_per_cycle || base.max_tickets_per_cycle)),
    max_results_per_status: Math.max(100, Number(merged.max_results_per_status || base.max_results_per_status)),
    idle_thresholds_minutes: { ...base.idle_thresholds_minutes, ...(merged.idle_thresholds_minutes || {}) },
    pending_thresholds_hours: { ...base.pending_thresholds_hours, ...(merged.pending_thresholds_hours || {}) },
    third_party_thresholds_business_days: {
      ...base.third_party_thresholds_business_days,
      ...(merged.third_party_thresholds_business_days || {}),
    },
    critical_no_action_thresholds_minutes: {
      ...base.critical_no_action_thresholds_minutes,
      ...(merged.critical_no_action_thresholds_minutes || {}),
    },
    old_ticket_thresholds_days: { ...base.old_ticket_thresholds_days, ...(merged.old_ticket_thresholds_days || {}) },
    stale_in_progress_hours: Math.max(1, Number(merged.stale_in_progress_hours || base.stale_in_progress_hours)),
    stale_pending_no_reason_hours: Math.max(
      1,
      Number(merged.stale_pending_no_reason_hours || base.stale_pending_no_reason_hours)
    ),
    ticket_lookback_days: Math.max(1, Number(merged.ticket_lookback_days || base.ticket_lookback_days)),
  };
}

function getGlpiConfigForUser(db, userId) {
  const row = db.prepare("SELECT * FROM glpi_configs WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    user_id: userId,
    base_url: row.base_url,
    app_token: row.app_token,
    user_token: row.user_token,
  };
}

function getUsersWithGlpiConfig(db) {
  return db
    .prepare("SELECT DISTINCT user_id FROM glpi_configs ORDER BY user_id")
    .all()
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isFinite(userId));
}

function getMonitorConfig(db, userId) {
  const row = db.prepare("SELECT * FROM ticket_monitor_configs WHERE user_id = ?").get(userId);
  return parseConfigRow(row);
}

function upsertMonitorConfig(db, userId, payload) {
  const normalized = normalizeConfigPayload(payload);
  db.prepare(`
    INSERT INTO ticket_monitor_configs (
      user_id,
      scheduler_enabled,
      monitor_interval_minutes,
      monitored_status_codes,
      monitored_group_ids,
      include_unassigned_tickets,
      max_tickets_per_cycle,
      max_results_per_status,
      idle_thresholds_minutes,
      pending_thresholds_hours,
      third_party_thresholds_business_days,
      critical_no_action_thresholds_minutes,
      old_ticket_thresholds_days,
      stale_in_progress_hours,
      stale_pending_no_reason_hours,
      ticket_lookback_days,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      scheduler_enabled = excluded.scheduler_enabled,
      monitor_interval_minutes = excluded.monitor_interval_minutes,
      monitored_status_codes = excluded.monitored_status_codes,
      monitored_group_ids = excluded.monitored_group_ids,
      include_unassigned_tickets = excluded.include_unassigned_tickets,
      max_tickets_per_cycle = excluded.max_tickets_per_cycle,
      max_results_per_status = excluded.max_results_per_status,
      idle_thresholds_minutes = excluded.idle_thresholds_minutes,
      pending_thresholds_hours = excluded.pending_thresholds_hours,
      third_party_thresholds_business_days = excluded.third_party_thresholds_business_days,
      critical_no_action_thresholds_minutes = excluded.critical_no_action_thresholds_minutes,
      old_ticket_thresholds_days = excluded.old_ticket_thresholds_days,
      stale_in_progress_hours = excluded.stale_in_progress_hours,
      stale_pending_no_reason_hours = excluded.stale_pending_no_reason_hours,
      ticket_lookback_days = excluded.ticket_lookback_days,
      updated_at = excluded.updated_at
  `).run(
    userId,
    toBooleanInt(normalized.scheduler_enabled),
    normalized.monitor_interval_minutes,
    JSON.stringify(normalized.monitored_status_codes),
    JSON.stringify(normalized.monitored_group_ids),
    toBooleanInt(normalized.include_unassigned_tickets),
    normalized.max_tickets_per_cycle,
    normalized.max_results_per_status,
    JSON.stringify(normalized.idle_thresholds_minutes),
    JSON.stringify(normalized.pending_thresholds_hours),
    JSON.stringify(normalized.third_party_thresholds_business_days),
    JSON.stringify(normalized.critical_no_action_thresholds_minutes),
    JSON.stringify(normalized.old_ticket_thresholds_days),
    normalized.stale_in_progress_hours,
    normalized.stale_pending_no_reason_hours,
    normalized.ticket_lookback_days
  );
  return normalized;
}

function insertAnalysis(db, userId, consolidated, analysis, analysisTimestamp) {
  db.prepare(`
    INSERT INTO ticket_monitor_analysis (
      user_id,
      ticket_id,
      title,
      description,
      category,
      opened_at,
      updated_at,
      analysis_timestamp,
      current_status,
      current_priority,
      technician_name,
      requester_name,
      group_name,
      last_interaction_type,
      minutes_since_last_interaction,
      is_reopened,
      reopen_count,
      waiting_third_party,
      operational_risk,
      health_status,
      triggered_rules,
      risk_reasons,
      recommended_action,
      queue_name,
      needs_alert,
      alert_type,
      analysis_confidence,
      operational_summary,
      history_summary,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    String(consolidated.ticket_id),
    consolidated.title || "",
    consolidated.description || "",
    consolidated.category || "",
    consolidated.opened_at || null,
    consolidated.updated_at || null,
    analysisTimestamp,
    analysis.current_status || "",
    analysis.current_priority || "",
    analysis.technician_name || "",
    consolidated.requester_name || "",
    analysis.group_name || "",
    consolidated.last_interaction_type || "",
    Number(analysis.minutes_since_last_interaction || 0),
    toBooleanInt(analysis.is_reopened),
    Number(analysis.reopen_count || 0),
    toBooleanInt(analysis.waiting_third_party),
    analysis.operational_risk || "NORMAL",
    analysis.health_status || "Saudavel",
    JSON.stringify(analysis.triggered_rules || []),
    JSON.stringify(analysis.risk_reasons || []),
    analysis.recommended_action || "",
    analysis.queue_name || "SAUDAVEL",
    toBooleanInt(analysis.needs_alert),
    analysis.alert_type || null,
    analysis.analysis_confidence || "ALTA",
    analysis.operational_summary || "",
    consolidated.history_summary || ""
  );
}

function upsertState(db, userId, analysis, analysisTimestamp) {
  const triggerCodes = (analysis.triggered_rules || []).map((rule) => rule.code);
  db.prepare(`
    INSERT INTO ticket_monitor_state (
      user_id,
      ticket_id,
      last_analysis_timestamp,
      last_operational_risk,
      last_alert_type,
      last_alert_sent_at,
      last_queue_name,
      last_triggered_rules,
      is_currently_in_risk,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, ticket_id) DO UPDATE SET
      last_analysis_timestamp = excluded.last_analysis_timestamp,
      last_operational_risk = excluded.last_operational_risk,
      last_alert_type = excluded.last_alert_type,
      last_alert_sent_at = excluded.last_alert_sent_at,
      last_queue_name = excluded.last_queue_name,
      last_triggered_rules = excluded.last_triggered_rules,
      is_currently_in_risk = excluded.is_currently_in_risk,
      updated_at = excluded.updated_at
  `).run(
    userId,
    String(analysis.ticket_id),
    analysisTimestamp,
    analysis.operational_risk || "NORMAL",
    analysis.alert_type || null,
    analysis.needs_alert ? analysisTimestamp : null,
    analysis.queue_name || "SAUDAVEL",
    JSON.stringify(triggerCodes),
    toBooleanInt(analysis.operational_risk !== "NORMAL")
  );
}

function parseAnalysisRow(row) {
  return {
    ...row,
    is_reopened: Boolean(row.is_reopened),
    waiting_third_party: Boolean(row.waiting_third_party),
    needs_alert: Boolean(row.needs_alert),
    triggered_rules: safeJsonParse(row.triggered_rules, []),
    risk_reasons: safeJsonParse(row.risk_reasons, []),
  };
}

function getLatestAnalyses(db, userId) {
  const rows = db.prepare(`
    SELECT a.*
    FROM ticket_monitor_analysis a
    INNER JOIN (
      SELECT ticket_id, MAX(analysis_timestamp) AS max_ts
      FROM ticket_monitor_analysis
      WHERE user_id = ?
      GROUP BY ticket_id
    ) latest ON latest.ticket_id = a.ticket_id AND latest.max_ts = a.analysis_timestamp
    WHERE a.user_id = ?
    ORDER BY a.analysis_timestamp DESC
  `).all(userId, userId);
  return rows.map(parseAnalysisRow);
}

function getLatestAnalysisForTicket(db, userId, ticketId) {
  const row = db.prepare(`
    SELECT a.*
    FROM ticket_monitor_analysis a
    WHERE a.user_id = ? AND a.ticket_id = ?
    ORDER BY a.analysis_timestamp DESC
    LIMIT 1
  `).get(userId, String(ticketId));
  return row ? parseAnalysisRow(row) : null;
}

function getTicketHistory(db, userId, ticketId, limit = 30) {
  const rows = db.prepare(`
    SELECT *
    FROM ticket_monitor_analysis
    WHERE user_id = ? AND ticket_id = ?
    ORDER BY analysis_timestamp DESC
    LIMIT ?
  `).all(userId, String(ticketId), Number(limit));
  return rows.map(parseAnalysisRow);
}

function getTicketState(db, userId, ticketId) {
  const row = db.prepare(
    "SELECT * FROM ticket_monitor_state WHERE user_id = ? AND ticket_id = ?"
  ).get(userId, String(ticketId));
  if (!row) return null;
  return {
    ...row,
    is_currently_in_risk: Boolean(row.is_currently_in_risk),
    last_triggered_rules: safeJsonParse(row.last_triggered_rules, []),
  };
}

module.exports = {
  ensureSchema,
  getGlpiConfigForUser,
  getUsersWithGlpiConfig,
  getMonitorConfig,
  upsertMonitorConfig,
  insertAnalysis,
  upsertState,
  getLatestAnalyses,
  getLatestAnalysisForTicket,
  getTicketHistory,
  getTicketState,
};
