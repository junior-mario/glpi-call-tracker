import { format, differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Hourglass, User, Wrench, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TrackedTicketRow } from "@/types/dashboard";
import { STATUS_BORDER_COLOR, getSLASolutionHours } from "./dashboardConstants";

interface OverviewTicketCardProps {
  ticket: TrackedTicketRow;
  dateLabel: string;
  onTicketClick: (ticketId: string) => void;
  hideIdleInfo?: boolean;
}

function getIdleBadge(updatedAt: string | null) {
  if (!updatedAt) return null;
  const days = differenceInDays(new Date(), new Date(updatedAt));
  if (days <= 0) return null;
  const color =
    days >= 7
      ? "text-red-500 bg-red-500/10"
      : days >= 3
      ? "text-amber-500 bg-amber-500/10"
      : "text-muted-foreground bg-muted";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded ${color}`}>
      <Hourglass className="h-3 w-3" />
      {days}d
    </span>
  );
}

function getSLABadge(ticket: TrackedTicketRow) {
  if (!ticket.glpi_created_at) return null;
  const slaHours = getSLASolutionHours(ticket.priority, ticket.tags);
  const created = new Date(ticket.glpi_created_at);
  const isClosed = ticket.status === "resolved" || ticket.status === "closed";
  const endDate = isClosed && ticket.glpi_updated_at ? new Date(ticket.glpi_updated_at) : new Date();
  const elapsedHours = differenceInHours(endDate, created);
  const exceeded = elapsedHours >= slaHours;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        exceeded ? "text-red-600 bg-red-500/10" : "text-green-600 bg-green-500/10"
      }`}
    >
      {exceeded ? "SLA Estourado" : "SLA OK"}
    </span>
  );
}

function formatTimeSinceUpdate(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const now = new Date();
  const updated = new Date(updatedAt);
  const mins = differenceInMinutes(now, updated);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = differenceInHours(now, updated);
  if (hours < 24) return `${hours}h`;
  const days = differenceInDays(now, updated);
  return `${days}d`;
}

export function OverviewTicketCard({ ticket: t, dateLabel, onTicketClick, hideIdleInfo }: OverviewTicketCardProps) {
  const borderClass = STATUS_BORDER_COLOR[t.status] || "border-l-gray-300";
  const idleBadge = hideIdleInfo ? null : getIdleBadge(t.glpi_updated_at);
  const timeSince = hideIdleInfo ? null : formatTimeSinceUpdate(t.glpi_updated_at);
  const slaBadge = getSLABadge(t);

  return (
    <div
      onClick={() => onTicketClick(t.ticket_id)}
      className={`block rounded-lg border border-l-4 ${borderClass} bg-card p-4 hover:shadow-md transition-shadow cursor-pointer`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          #{t.ticket_id}
        </span>
        <StatusBadge status={t.status as any} />
        <PriorityBadge priority={t.priority as any} />
        {slaBadge}
        {idleBadge}
        <a
          href={`https://helpdesk.quintadabaroneza.com.br/front/ticket.form.php?id=${t.ticket_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-muted-foreground hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="text-sm font-medium leading-snug text-foreground mb-2 line-clamp-2">{t.title}</p>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.requester || "Sem solicitante"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.assignee || "Não atribuído"}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span>
            {t.glpi_created_at
              ? `Aberto: ${format(new Date(t.glpi_created_at), "dd/MM/yy", { locale: ptBR })}`
              : ""}
          </span>
          <span className="shrink-0 ml-2 flex items-center gap-1.5">
            {timeSince && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeSince}
              </span>
            )}
            {dateLabel && <span>{dateLabel}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
