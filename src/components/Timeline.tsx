import { TicketUpdate } from "@/types/ticket";
import { MessageSquare, RefreshCw, UserCheck, CheckCircle, ClipboardList, ShieldCheck, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const updateTypeIcons = {
  comment: MessageSquare,
  status_change: RefreshCw,
  assignment: UserCheck,
  solution: CheckCircle,
  task: ClipboardList,
  validation: ShieldCheck,
  attachment: Paperclip,
};

const updateTypeLabels = {
  comment: "Comentário",
  status_change: "Mudança de Status",
  assignment: "Atribuição",
  solution: "Solução",
  task: "Tarefa",
  validation: "Validação",
  attachment: "Anexo",
};

const updateTypeBadgeColors = {
  comment: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  status_change: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  assignment: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  solution: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  task: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  validation: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  attachment: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${updateTypeBadgeColors[update.type]}`}>
                  <Icon className="h-3 w-3" />
                  {updateTypeLabels[update.type]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(update.date), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {update.author}
              </p>
              <div
                className="text-sm text-muted-foreground leading-relaxed [&_a]:text-primary [&_a]:underline [&_p]:mb-1 [&_p:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: update.content }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
