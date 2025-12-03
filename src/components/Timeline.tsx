import { TicketUpdate } from "@/types/ticket";
import { MessageSquare, RefreshCw, UserCheck, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const updateTypeIcons = {
  comment: MessageSquare,
  status_change: RefreshCw,
  assignment: UserCheck,
  solution: CheckCircle,
};

const updateTypeLabels = {
  comment: "Comentário",
  status_change: "Mudança de Status",
  assignment: "Atribuição",
  solution: "Solução",
};

interface TimelineProps {
  updates: TicketUpdate[];
}

export function Timeline({ updates }: TimelineProps) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhuma atualização ainda
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {updates.map((update, index) => {
        const Icon = updateTypeIcons[update.type];
        const isLast = index === updates.length - 1;

        return (
          <div key={update.id} className="relative flex gap-4 animate-fade-in">
            {/* Timeline line */}
            {!isLast && (
              <div className="absolute left-[15px] top-8 h-full w-[2px] bg-timeline-line" />
            )}
            
            {/* Icon */}
            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {updateTypeLabels[update.type]}
                </span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(update.date), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {update.author}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {update.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
