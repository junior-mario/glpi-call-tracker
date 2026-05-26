export type OperationalRisk = "NORMAL" | "ATENCAO" | "ALTO" | "CRITICO";
export type QueueName = "SAUDAVEL" | "ACAO_IMEDIATA" | "COBRANCA" | "REVISAO";

export interface MonitorRuleResult {
  code: string;
  triggered: boolean;
  severity: OperationalRisk;
  reason: string;
  suggested_queue: QueueName;
  recommended_action: string;
}

export interface MonitorTicketAnalysis {
  id: number;
  ticket_id: string;
  title: string;
  description: string;
  category: string;
  opened_at: string | null;
  updated_at: string | null;
  analysis_timestamp: string;
  current_status: string;
  current_priority: string;
  technician_name: string;
  requester_name: string;
  group_name: string;
  last_interaction_type: string;
  minutes_since_last_interaction: number;
  is_reopened: boolean;
  reopen_count: number;
  waiting_third_party: boolean;
  operational_risk: OperationalRisk;
  health_status: string;
  triggered_rules: MonitorRuleResult[];
  risk_reasons: string[];
  recommended_action: string;
  queue_name: QueueName;
  needs_alert: boolean;
  alert_type: string | null;
  analysis_confidence: "ALTA" | "MEDIA";
  operational_summary: string;
  history_summary: string;
}

export interface MonitorStateRow {
  user_id: number;
  ticket_id: string;
  last_analysis_timestamp: string | null;
  last_operational_risk: OperationalRisk | null;
  last_alert_type: string | null;
  last_alert_sent_at: string | null;
  last_queue_name: QueueName | null;
  last_triggered_rules: string[];
  is_currently_in_risk: boolean;
  updated_at: string | null;
}

export interface MonitorSummary {
  total_monitorado: number;
  em_risco: number;
  criticos: number;
  sem_responsavel: number;
  parados: number;
  reabertos: number;
  filas: Record<QueueName, number>;
  last_analysis_timestamp: string | null;
}

export interface TicketMonitorConfig {
  scheduler_enabled: boolean;
  monitor_interval_minutes: number;
  monitored_status_codes: number[];
  monitored_group_ids: number[];
  include_unassigned_tickets: boolean;
  max_tickets_per_cycle: number;
  max_results_per_status: number;
  idle_thresholds_minutes: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  pending_thresholds_hours: {
    attention: number;
    high: number;
    critical: number;
  };
  third_party_thresholds_business_days: {
    high: number;
    critical: number;
  };
  critical_no_action_thresholds_minutes: {
    high: number;
    critical: number;
  };
  old_ticket_thresholds_days: {
    attention: number;
    high: number;
    critical: number;
  };
  stale_in_progress_hours: number;
  stale_pending_no_reason_hours: number;
  ticket_lookback_days: number;
}

export interface MonitorRunResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  user_id: number;
  trigger?: string;
  processed_tickets?: number;
  scanned_tickets?: number;
  found_active_tickets?: number;
  errors?: Array<{ ticket_id: string; message: string }>;
  duration_ms?: number;
}

export interface MonitorTicketDetail {
  latest: MonitorTicketAnalysis;
  state: MonitorStateRow | null;
  history: MonitorTicketAnalysis[];
}
