import { useState, useEffect } from "react";
import { Loader2, ExternalLink, MessageSquareText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { Timeline } from "@/components/Timeline";
import { fetchGLPITicket } from "@/services/glpiService";
import { Ticket } from "@/types/ticket";
import { CopyMessageDialog } from "@/components/CopyMessageDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TicketDetailSheetProps {
  ticketId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TicketDetailSheet({ ticketId, open, onOpenChange }: TicketDetailSheetProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  useEffect(() => {
    if (!ticketId || !open) return;

    setIsLoading(true);
    setError(null);
    setTicket(null);

    fetchGLPITicket(ticketId)
      .then((data) => {
        if (data) {
          setTicket(data);
        } else {
          setError("Chamado não encontrado");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao carregar chamado");
      })
      .finally(() => setIsLoading(false));
  }, [ticketId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {ticket ? `#${ticket.id} — ${ticket.title}` : ticketId ? `#${ticketId}` : "Chamado"}
          </SheetTitle>
          <SheetDescription className="sr-only">Detalhes do chamado</SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando...
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive py-6 text-center">{error}</p>
        )}

        {ticket && !isLoading && (
          <div className="space-y-4 mt-4">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setCopyDialogOpen(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Gerar texto de cobrança"
                >
                  <MessageSquareText className="h-4 w-4" />
                </button>
                <a
                  href={`https://helpdesk.quintadabaroneza.com.br/front/ticket.form.php?id=${ticket.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir no GLPI <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Solicitante</span>
                <p className="font-medium">{ticket.requester}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Técnico</span>
                <p className="font-medium">{ticket.assignee}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Aberto em</span>
                <p className="font-medium">
                  {format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Atualizado em</span>
                <p className="font-medium">
                  {format(new Date(ticket.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">Interações</h4>
              <Timeline updates={ticket.updates} />
            </div>
          </div>
        )}
        {ticket && (
          <CopyMessageDialog
            open={copyDialogOpen}
            onOpenChange={setCopyDialogOpen}
            tickets={[ticket]}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
