export const STATUS_LABELS: Record<number, string> = {
  1: "Novo",
  2: "Em andamento",
  3: "Pendente",
  4: "Pendente",
  5: "Resolvido",
  6: "Fechado",
};

export const STATUS_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#f59e0b",
  3: "#ef4444",
  4: "#ef4444",
  5: "#22c55e",
  6: "#6b7280",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Muito baixa",
  2: "Baixa",
  3: "Média",
  4: "Alta",
  5: "Muito alta",
  6: "Crítica",
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: "#6b7280",
  2: "#3b82f6",
  3: "#f59e0b",
  4: "#f97316",
  5: "#ef4444",
  6: "#dc2626",
};

export const SLA_SOLUTION_HOURS: Record<string, number> = {
  low: 72,
  medium: 48,
  high: 24,
  urgent: 5,
};

export function getSLASolutionHours(priority: string, tags: string): number {
  const tagList = tags.toLowerCase().split(/,\s*|;\s*|\$\$/).map((s) => s.trim());
  if (tagList.includes("associado")) return 3;
  return SLA_SOLUTION_HOURS[priority] ?? 72;
}

export const STATUS_BORDER_COLOR: Record<string, string> = {
  new: "border-l-status-new",
  "in-progress": "border-l-status-in-progress",
  pending: "border-l-status-pending",
  resolved: "border-l-status-resolved",
  closed: "border-l-status-closed",
};
