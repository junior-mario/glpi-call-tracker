import { Badge } from "@/components/ui/badge";
import { Ticket } from "@/types/ticket";

const priorityLabels: Record<Ticket['priority'], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface PriorityBadgeProps {
  priority: Ticket['priority'];
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge variant={priority}>
      {priorityLabels[priority]}
    </Badge>
  );
}
