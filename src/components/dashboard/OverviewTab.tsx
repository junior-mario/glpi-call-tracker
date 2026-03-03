import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { Loader2, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { MonitorTicket } from "@/types/glpi";
import { TrackedTicketRow } from "@/types/dashboard";
import {
  getGLPIConfig,
  searchTicketsByGroup,
  mapGLPIStatus,
  mapGLPIPriority,
} from "@/services/glpiService";
import { OverviewColumns } from "./OverviewColumns";

interface OverviewTabProps {
  onTicketClick: (ticketId: string) => void;
}

function toTrackedRow(t: MonitorTicket): TrackedTicketRow {
  return {
    ticket_id: String(t.id),
    title: t.name,
    status: mapGLPIStatus(t.status),
    priority: mapGLPIPriority(t.priority),
    assignee: t.technician || "Não atribuído",
    requester: t.requester || "",
    glpi_created_at: t.date || null,
    glpi_updated_at: t.date_mod || null,
    tags: t.tags || "",
  };
}

export function OverviewTab({ onTicketClick }: OverviewTabProps) {
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const config = getGLPIConfig();
  const overviewDays = config?.overviewDays ?? null;
  const groupId = config?.overviewGroupId ?? null;

  // Auto-search on mount when config has days
  useEffect(() => {
    if (!overviewDays || overviewDays <= 0) return;

    const now = new Date();
    const dateFrom = format(subDays(now, overviewDays), "yyyy-MM-dd");
    const dateTo = format(now, "yyyy-MM-dd");

    setIsSearching(true);
    setHasSearched(true);

    searchTicketsByGroup(groupId, dateFrom, dateTo)
      .then(setTickets)
      .catch((err) => {
        toast({
          title: "Erro ao buscar chamados",
          description: err instanceof Error ? err.message : "Erro desconhecido",
          variant: "destructive",
        });
        setTickets([]);
      })
      .finally(() => setIsSearching(false));
  }, [overviewDays, groupId]);

  // Map GLPI tickets to TrackedTicketRow and split into 3 columns
  const mapped = useMemo(() => tickets.map(toTrackedRow), [tickets]);

  const recentOpened = useMemo(
    () =>
      mapped
        .filter((t) => t.status !== "resolved" && t.status !== "closed")
        .filter((t) => t.glpi_created_at),
    [mapped]
  );

  const recentClosed = useMemo(
    () =>
      mapped
        .filter((t) => t.status === "resolved" || t.status === "closed")
        .filter((t) => t.glpi_updated_at),
    [mapped]
  );

  const recentUpdated = useMemo(
    () =>
      mapped
        .filter((t) => t.status !== "resolved" && t.status !== "closed")
        .filter((t) => t.glpi_updated_at),
    [mapped]
  );

  // No days configured — prompt user to go to Settings
  if (!overviewDays) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <Settings className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Configure o período da visão geral em{" "}
          <strong>Configurações</strong> para carregar os chamados do GLPI.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info bar */}
      {!isSearching && hasSearched && tickets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {tickets.length} chamado{tickets.length !== 1 ? "s" : ""} encontrado
          {tickets.length !== 1 ? "s" : ""} (últimos {overviewDays} dias)
        </p>
      )}

      {/* Loading state */}
      {isSearching && (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Buscando chamados no GLPI...
          </CardContent>
        </Card>
      )}

      {/* Empty result */}
      {hasSearched && !isSearching && tickets.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum chamado encontrado para o período configurado.
          </CardContent>
        </Card>
      )}

      {/* Columns */}
      {!isSearching && tickets.length > 0 && (
        <OverviewColumns
          recentOpened={recentOpened}
          recentClosed={recentClosed}
          recentUpdated={recentUpdated}
          onTicketClick={onTicketClick}
        />
      )}
    </div>
  );
}
