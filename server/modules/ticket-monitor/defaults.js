const DEFAULT_MONITOR_CONFIG = {
  scheduler_enabled: true,
  monitor_interval_minutes: 5,
  monitored_status_codes: [1, 2, 3, 4],
  monitored_group_ids: [],
  include_unassigned_tickets: false,
  max_tickets_per_cycle: 200,
  max_results_per_status: 2000,
  idle_thresholds_minutes: {
    urgent: 30,
    high: 60,
    medium: 240,
    low: 480,
  },
  pending_thresholds_hours: {
    attention: 24,
    high: 48,
    critical: 72,
  },
  third_party_thresholds_business_days: {
    high: 2,
    critical: 3,
  },
  critical_no_action_thresholds_minutes: {
    high: 30,
    critical: 60,
  },
  old_ticket_thresholds_days: {
    attention: 7,
    high: 15,
    critical: 30,
  },
  stale_in_progress_hours: 48,
  stale_pending_no_reason_hours: 24,
  ticket_lookback_days: 120,
};

const RISK_ORDER = {
  NORMAL: 0,
  ATENCAO: 1,
  ALTO: 2,
  CRITICO: 3,
};

const RISK_LABELS = ["NORMAL", "ATENCAO", "ALTO", "CRITICO"];

const QUEUE_ORDER = {
  SAUDAVEL: 0,
  REVISAO: 1,
  COBRANCA: 2,
  ACAO_IMEDIATA: 3,
};

const ACTIVE_STATUS_NAMES = new Set(["new", "in-progress", "pending", "reopened", "open"]);

module.exports = {
  DEFAULT_MONITOR_CONFIG,
  RISK_ORDER,
  RISK_LABELS,
  QUEUE_ORDER,
  ACTIVE_STATUS_NAMES,
};
