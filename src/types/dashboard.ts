export type DashboardDisplayMode = 'charts' | 'columns';

export interface CustomDashboard {
  id: number;
  name: string;
  group_id: number | null;
  period_days: number | null;
  visible_charts: ChartElementId[];
  display_mode: DashboardDisplayMode;
  filter_statuses: number[] | null;
  filter_technician: string | null;
  filter_requester: string | null;
  position: number;
}

export type ChartElementId = 'kpis' | 'status' | 'priority' | 'technician' | 'tags' | 'timeline';

export const ALL_CHART_IDS: ChartElementId[] = ['kpis', 'status', 'priority', 'technician', 'tags', 'timeline'];

export const CHART_LABELS: Record<ChartElementId, string> = {
  kpis: 'KPIs',
  status: 'Status',
  priority: 'Prioridade',
  technician: 'Técnico',
  tags: 'Tags',
  timeline: 'Linha do tempo',
};

export const GLPI_STATUS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Novo' },
  { value: 2, label: 'Em andamento' },
  { value: 3, label: 'Pendente' },
  { value: 5, label: 'Resolvido' },
  { value: 6, label: 'Fechado' },
];

export interface TrackedTicketRow {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  requester: string;
  glpi_created_at: string | null;
  glpi_updated_at: string | null;
  tags: string;
}
