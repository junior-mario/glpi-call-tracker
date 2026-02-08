import { Ticket } from "@/types/ticket";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { Timeline } from "./Timeline";
import { Bell, Clock, User, Users, X, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TicketCardProps {
  ticket: Ticket;
  onRemove: (id: string) => void;
  onMarkAsRead: (id: string) => void;
}

export function TicketCard({ ticket, onRemove, onMarkAsRead }: TicketCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (ticket.hasNewUpdates) {
      onMarkAsRead(ticket.id);
    }
  };

  return (
    <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-lg animate-slide-up">
      {/* Update indicator */}
      {ticket.hasNewUpdates && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 to-red-400" />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                #{ticket.id}
              </span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.hasNewUpdates && (
                <div className="flex items-center gap-1 text-red-500 animate-pulse-slow">
                  <Bell className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Nova atualização</span>
                </div>
              )}
            </div>
            <h3 className="font-semibold text-foreground leading-tight truncate">
              {ticket.title}
            </h3>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(ticket.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-3">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span>Solicitante: {ticket.requester}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>Atribuído: {ticket.assignee}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Atualizado: {format(new Date(ticket.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
      </CardHeader>

      {/* Expand/Collapse toggle */}
      <div className="px-6 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={handleToggle}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-2" />
              Ocultar histórico
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-2" />
              Ver histórico ({ticket.updates.length} atualizações)
            </>
          )}
        </Button>
      </div>

      {/* Timeline */}
      {isExpanded && (
        <CardContent className="pt-0 animate-fade-in">
          <div className="border-t border-border pt-4">
            <Timeline updates={ticket.updates} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
