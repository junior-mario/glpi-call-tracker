import { Badge } from "@/components/ui/badge";
import { TicketStatus } from "@/types/ticket";

const statusLabels: Record<TicketStatus, string> = {
  new: "Novo",
  pending: "Pendente",
  "in-progress": "Em Andamento",
  resolved: "Resolvido",
  closed: "Fechado",
};

interface StatusBadgeProps {
  status: TicketStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={status}>
      {statusLabels[status]}
    </Badge>
  );
}
