import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Timeline } from "@/components/Timeline";
import { fetchGLPITicket } from "@/services/glpiService";
import { MonitorTicketDetail } from "@/types/ticketMonitor";
import { Ticket, TicketStatus } from "@/types/ticket";

interface MonitorTicketDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: MonitorTicketDetail | null;
  loading?: boolean;
}

function mapMonitorStatus(status: string | null | undefined): TicketStatus {
  const value = String(status || "").toLowerCase();
  if (value === "new") return "new";
  if (value === "in-progress" || value === "open") return "in-progress";
  if (value === "pending" || value === "reopened") return "pending";
  if (value === "resolved") return "resolved";
  if (value === "closed") return "closed";
  return "new";
}

function mapMonitorPriority(priority: string | null | undefined): Ticket["priority"] {
  const value = String(priority || "").toLowerCase();
  if (value === "urgent") return "urgent";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  if (value === "low") return "low";
  return "medium";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function riskClass(risk: string): string {
  switch (risk) {
    case "CRITICO":
      return "bg-red-500/15 text-red-700";
    case "ALTO":
      return "bg-orange-500/15 text-orange-700";
    case "ATENCAO":
      return "bg-yellow-500/15 text-yellow-700";
    default:
      return "bg-emerald-500/15 text-emerald-700";
  }
}

function queueClass(queue: string): string {
  switch (queue) {
    case "ACAO_IMEDIATA":
      return "bg-red-500/15 text-red-700";
    case "COBRANCA":
      return "bg-amber-500/15 text-amber-700";
    case "REVISAO":
      return "bg-violet-500/15 text-violet-700";
    default:
      return "bg-emerald-500/15 text-emerald-700";
  }
}

export function MonitorTicketDetailSheet({
  open,
  onOpenChange,
  detail,
  loading,
}: MonitorTicketDetailSheetProps) {
  const latest = detail?.latest ?? null;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !latest?.ticket_id) return;

    let active = true;
    setTicketLoading(true);
    setTicketError(null);
    setTicket(null);

    fetchGLPITicket(String(latest.ticket_id))
      .then((data) => {
        if (!active) return;
        setTicket(data);
        if (!data) setTicketError("Chamado nao encontrado no GLPI.");
      })
      .catch((error) => {
        if (!active) return;
        setTicketError(error instanceof Error ? error.message : "Erro ao carregar detalhes no GLPI.");
      })
      .finally(() => {
        if (active) setTicketLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, latest?.ticket_id]);

  const showLoading = Boolean(loading) || Boolean(latest && ticketLoading);

  const displayTitle = useMemo(() => {
    if (ticket) return `#${ticket.id} - ${ticket.title}`;
    if (latest) return `#${latest.ticket_id} - ${latest.title || "Chamado"}`;
    return "Chamado";
  }, [ticket, latest]);

  const ticketStatus = mapMonitorStatus(ticket?.status || latest?.current_status);
  const ticketPriority = mapMonitorPriority(ticket?.priority || latest?.current_priority);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{displayTitle}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes do chamado monitorado</SheetDescription>
        </SheetHeader>

        {showLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando...
          </div>
        )}

        {!showLoading && !latest && (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma analise encontrada.</p>
        )}

        {!showLoading && latest && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={ticketStatus} />
              <PriorityBadge priority={ticketPriority} />
              <Badge className={riskClass(latest.operational_risk)}>{latest.operational_risk}</Badge>
              <Badge className={queueClass(latest.queue_name)}>{latest.queue_name}</Badge>
              <div className="flex items-center gap-2 ml-auto">
                <a
                  href={`https://helpdesk.quintadabaroneza.com.br/front/ticket.form.php?id=${latest.ticket_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir no GLPI <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Solicitante</span>
                <p className="font-medium">{ticket?.requester || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tecnico</span>
                <p className="font-medium">{ticket?.assignee || latest.technician_name || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Grupo</span>
                <p className="font-medium">{latest.group_name || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Sem atualizacao</span>
                <p className="font-medium">{latest.minutes_since_last_interaction} min</p>
              </div>
              <div>
                <span className="text-muted-foreground">Aberto em</span>
                <p className="font-medium">{formatDateTime(ticket?.createdAt || latest.opened_at)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Atualizado em</span>
                <p className="font-medium">{formatDateTime(ticket?.updatedAt || latest.updated_at)}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Interacoes</h4>
              {ticket?.updates?.length ? (
                <Timeline updates={ticket.updates} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ticketError || "Historico de interacoes indisponivel para este chamado."}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Analise do monitor</h4>
              <p className="text-sm text-muted-foreground">{latest.operational_summary || "-"}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Acao recomendada:</span>{" "}
                {latest.recommended_action || "-"}
              </p>
              {!latest.triggered_rules?.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma regra acionada.</p>
              ) : (
                <div className="space-y-2">
                  {latest.triggered_rules.map((rule) => (
                    <div key={rule.code} className="rounded border p-2">
                      <div className="text-xs font-semibold">{rule.code}</div>
                      <div className="text-xs text-muted-foreground mt-1">{rule.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
