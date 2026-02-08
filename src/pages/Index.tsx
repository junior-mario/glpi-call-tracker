import { useState, useEffect, useCallback, useRef } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { fetchGLPITicket, loadGLPIConfig, getGLPIConfig } from "@/services/glpiService";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
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

    const { data, error } = await supabase
      .from("tracked_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar chamados:", error);
      setIsLoadingTickets(false);
      return;
    }

    const dbTickets: Ticket[] = (data ?? []).map((row) => ({
      id: row.ticket_id,
      title: row.title,
      status: row.status as Ticket["status"],
      priority: row.priority as Ticket["priority"],
      assignee: row.assignee ?? "Não atribuído",
      requester: row.requester ?? "",
      createdAt: row.glpi_created_at ?? row.created_at,
      updatedAt: row.glpi_updated_at ?? row.updated_at,
      hasNewUpdates: row.has_new_updates ?? false,
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
          return fresh ? { ...fresh, hasNewUpdates: t.hasNewUpdates } : t;
        } catch {
          return t;
        }
      })
    );

    setTickets(refreshed);
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
          await supabase
            .from("tracked_tickets")
            .update({
              has_new_updates: true,
              status: ticket.status,
              priority: ticket.priority,
              assignee: ticket.assignee,
              glpi_updated_at: ticket.updatedAt,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id)
            .eq("ticket_id", ticket.id);
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
        const { error } = await supabase.from("tracked_tickets").upsert({
          user_id: user.id,
          ticket_id: ticket.id,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          assignee: ticket.assignee,
          requester: ticket.requester,
          has_new_updates: false,
          glpi_created_at: ticket.createdAt,
          glpi_updated_at: ticket.updatedAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,ticket_id" });

        if (error) {
          toast({
            title: "Erro ao salvar chamado",
            description: error.message,
            variant: "destructive",
          });
        } else {
          setTickets((prev) => [ticket!, ...prev]);
          toast({
            title: "Chamado adicionado",
            description: `O chamado #${ticketId} foi adicionado com sucesso.`,
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

    const { error } = await supabase
      .from("tracked_tickets")
      .delete()
      .eq("user_id", user.id)
      .eq("ticket_id", ticketId);

    if (error) {
      toast({
        title: "Erro ao remover chamado",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    toast({
      title: "Chamado removido",
      description: `O chamado #${ticketId} foi removido do acompanhamento.`,
    });
  };

  const handleMarkAsRead = async (ticketId: string) => {
    if (!user) return;

    await supabase
      .from("tracked_tickets")
      .update({ has_new_updates: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("ticket_id", ticketId);

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, hasNewUpdates: false } : t
      )
    );
  };

  if (isLoadingTickets) {
    return (
      <div className="container max-w-4xl py-6 space-y-6">
        <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          Carregando chamados...
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />

      {tickets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onRemove={handleRemoveTicket}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
