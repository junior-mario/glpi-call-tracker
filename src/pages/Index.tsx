import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { fetchGLPITicket, loadGLPIConfig, getGLPIConfig } from "@/services/glpiService";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

const Index = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [hasApiConfig, setHasApiConfig] = useState(false);
  const ticketsRef = useRef<Ticket[]>([]);

  // Keep ref in sync for polling comparisons
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setIsLoadingTickets(true);

    try {
      const data = await api.get<Array<Record<string, unknown>>>("/api/tracked-tickets");

      const dbTickets: Ticket[] = (data ?? []).map((row) => ({
        id: String(row.ticket_id),
        title: String(row.title || ""),
        status: String(row.status || "new") as Ticket["status"],
        priority: String(row.priority || "medium") as Ticket["priority"],
        assignee: String(row.assignee ?? "Não atribuído"),
        requester: String(row.requester ?? ""),
        createdAt: String(row.glpi_created_at ?? row.created_at),
        updatedAt: String(row.glpi_updated_at ?? row.updated_at),
        hasNewUpdates: Boolean(row.has_new_updates),
        displayColumn: Number(row.display_column) || 0,
        updates: [],
      }));

      setTickets(dbTickets);
      setIsLoadingTickets(false);

      // Re-fetch full data from GLPI API in background to get updates/timeline
      if (!getGLPIConfig() || dbTickets.length === 0) return;

      const refreshed = await Promise.all(
        dbTickets.map(async (t) => {
          try {
            const fresh = await fetchGLPITicket(t.id);
            return fresh ? { ...fresh, hasNewUpdates: t.hasNewUpdates, displayColumn: t.displayColumn } : t;
          } catch {
            return t;
          }
        })
      );

      setTickets(refreshed);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      setIsLoadingTickets(false);
    }
  }, [user]);

  // Poll tickets every 10 minutes to detect new updates
  const pollTickets = useCallback(async () => {
    if (!user || !getGLPIConfig()) return;
    const current = ticketsRef.current;
    if (current.length === 0) return;

    const updatedTickets: Ticket[] = [];
    const notifyList: Ticket[] = [];

    for (const t of current) {
      try {
        const fresh = await fetchGLPITicket(t.id);
        if (!fresh) {
          updatedTickets.push(t);
          continue;
        }

        const hasNew = fresh.updatedAt !== t.updatedAt;
        const ticket = { ...fresh, hasNewUpdates: hasNew || t.hasNewUpdates };
        updatedTickets.push(ticket);

        if (hasNew) {
          notifyList.push(ticket);
          // Persist has_new_updates in DB
          await api.patch(`/api/tracked-tickets/${ticket.id}`, {
            has_new_updates: true,
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assignee,
            glpi_updated_at: ticket.updatedAt,
          });
        }
      } catch {
        updatedTickets.push(t);
      }
    }

    setTickets(updatedTickets);

    // Browser notifications
    if (notifyList.length === 1) {
      const t = notifyList[0];
      showNotification(
        `Chamado #${t.id} atualizado`,
        t.title
      );
    } else if (notifyList.length > 1) {
      showNotification(
        `${notifyList.length} chamados atualizados`,
        notifyList.map((t) => `#${t.id}`).join(", ")
      );
    }
  }, [user]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Start polling interval
  useEffect(() => {
    const interval = setInterval(pollTickets, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pollTickets]);

  useEffect(() => {
    loadGLPIConfig().then((config) => setHasApiConfig(!!config));
  }, []);

  const handleAddTicket = async (ticketId: string) => {
    if (!user) return;

    if (tickets.some((t) => t.id === ticketId)) {
      toast({
        title: "Chamado já adicionado",
        description: `O chamado #${ticketId} já está sendo acompanhado.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      let ticket: Ticket | null = null;

      if (hasApiConfig) {
        try {
          ticket = await fetchGLPITicket(ticketId);
        } catch (error) {
          console.error("Erro na API GLPI:", error);
          toast({
            title: "Erro na API GLPI",
            description: error instanceof Error ? error.message : "Erro ao conectar com a API",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      } else {
        ticket = await getTicketById(ticketId);
      }

      if (ticket) {
        try {
          await api.post("/api/tracked-tickets", {
            ticket_id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assignee,
            requester: ticket.requester,
            has_new_updates: false,
            glpi_created_at: ticket.createdAt,
            glpi_updated_at: ticket.updatedAt,
          });
          setTickets((prev) => [{ ...ticket!, displayColumn: 0 }, ...prev]);
          toast({
            title: "Chamado adicionado",
            description: `O chamado #${ticketId} foi adicionado com sucesso.`,
          });
        } catch (err) {
          toast({
            title: "Erro ao salvar chamado",
            description: err instanceof Error ? err.message : "Erro desconhecido",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Chamado não encontrado",
          description: `Não foi possível encontrar o chamado #${ticketId}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar chamado",
        description: "Ocorreu um erro ao buscar o chamado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTicket = async (ticketId: string) => {
    if (!user) return;

    try {
      await api.delete(`/api/tracked-tickets/${ticketId}`);
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      toast({
        title: "Chamado removido",
        description: `O chamado #${ticketId} foi removido do acompanhamento.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao remover chamado",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetColumn: number) => {
    e.preventDefault();
    setDragOverColumn(null);
    const ticketId = e.dataTransfer.getData("text/plain");
    if (!ticketId) return;

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.displayColumn === targetColumn) return;

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, displayColumn: targetColumn } : t
      )
    );

    try {
      await api.patch(`/api/tracked-tickets/${ticketId}`, { display_column: targetColumn });
    } catch {
      // Revert on failure
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, displayColumn: ticket.displayColumn } : t
        )
      );
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleMarkAsRead = async (ticketId: string) => {
    if (!user) return;

    await api.patch(`/api/tracked-tickets/${ticketId}`, { has_new_updates: false });

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, hasNewUpdates: false } : t
      )
    );
  };

  if (isLoadingTickets) {
    return (
      <div className="container max-w-6xl py-6 space-y-6">
        <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          Carregando chamados...
        </div>
      </div>
    );
  }

  const leftTickets = tickets.filter((t) => t.displayColumn === 0);
  const rightTickets = tickets.filter((t) => t.displayColumn === 1);

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />

      {tickets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column */}
          <div
            className={`space-y-4 min-h-[200px] rounded-lg p-3 transition-colors ${dragOverColumn === 0 ? "bg-accent/50 ring-2 ring-primary/30" : ""}`}
            onDragOver={(e) => { handleDragOver(e); setDragOverColumn(0); }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, 0)}
          >
            {leftTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onRemove={handleRemoveTicket}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
            {leftTickets.length === 0 && (
              <div className="flex items-center justify-center h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg text-sm text-muted-foreground">
                Arraste chamados para cá
              </div>
            )}
          </div>

          {/* Right column */}
          <div
            className={`space-y-4 min-h-[200px] rounded-lg p-3 transition-colors ${dragOverColumn === 1 ? "bg-accent/50 ring-2 ring-primary/30" : ""}`}
            onDragOver={(e) => { handleDragOver(e); setDragOverColumn(1); }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, 1)}
          >
            {rightTickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onRemove={handleRemoveTicket}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
            {rightTickets.length === 0 && (
              <div className="flex items-center justify-center h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg text-sm text-muted-foreground">
                Arraste chamados para cá
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
