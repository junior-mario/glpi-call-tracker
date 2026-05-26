import { api } from "@/lib/api";
import {
  MonitorRunResult,
  MonitorSummary,
  MonitorTicketAnalysis,
  MonitorTicketDetail,
  TicketMonitorConfig,
} from "@/types/ticketMonitor";

export interface MonitorTicketQuery {
  status?: string;
  priority?: string;
  risk?: string;
  queue?: string;
  group?: string;
  technician?: string;
  search?: string;
  sort_by?: "risk" | "idle" | "priority" | "opened_at";
  sort_dir?: "asc" | "desc";
}

function toQueryString(query: MonitorTicketQuery = {}): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function getMonitorSummary(): Promise<MonitorSummary> {
  return api.get<MonitorSummary>("/api/ticket-monitor/summary");
}

export async function listMonitorTickets(query: MonitorTicketQuery = {}): Promise<MonitorTicketAnalysis[]> {
  return api.get<MonitorTicketAnalysis[]>(`/api/ticket-monitor/tickets${toQueryString(query)}`);
}

export async function listMonitorTicketsByQueue(
  queueName: string,
  query: MonitorTicketQuery = {}
): Promise<MonitorTicketAnalysis[]> {
  return api.get<MonitorTicketAnalysis[]>(
    `/api/ticket-monitor/queues/${encodeURIComponent(queueName)}${toQueryString(query)}`
  );
}

export async function getMonitorTicketDetail(ticketId: string): Promise<MonitorTicketDetail> {
  return api.get<MonitorTicketDetail>(`/api/ticket-monitor/tickets/${encodeURIComponent(ticketId)}`);
}

export async function getMonitorTicketHistory(ticketId: string, limit = 50): Promise<MonitorTicketAnalysis[]> {
  return api.get<MonitorTicketAnalysis[]>(
    `/api/ticket-monitor/tickets/${encodeURIComponent(ticketId)}/history?limit=${limit}`
  );
}

export async function getMonitorConfig(): Promise<TicketMonitorConfig> {
  return api.get<TicketMonitorConfig>("/api/ticket-monitor/config");
}

export async function updateMonitorConfig(payload: Partial<TicketMonitorConfig>): Promise<TicketMonitorConfig> {
  return api.put<TicketMonitorConfig>("/api/ticket-monitor/config", payload);
}

export async function runMonitorNow(): Promise<MonitorRunResult> {
  return api.post<MonitorRunResult>("/api/ticket-monitor/run", {});
}

