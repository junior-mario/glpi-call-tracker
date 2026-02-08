import { useState, useEffect } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { fetchGLPITicket, getGLPIConfig } from "@/services/glpiService";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";

const STORAGE_KEY = "glpi-tracker-tickets";

const Index = () => {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiConfig, setHasApiConfig] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    setHasApiConfig(!!getGLPIConfig());
  }, []);

  const handleAddTicket = async (ticketId: string) => {
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
        setTickets((prev) => [ticket!, ...prev]);
        toast({
          title: "Chamado adicionado",
          description: `O chamado #${ticketId} foi adicionado com sucesso.`,
        });
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

  const handleRemoveTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    toast({
      title: "Chamado removido",
      description: `O chamado #${ticketId} foi removido do acompanhamento.`,
    });
  };

  const handleMarkAsRead = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, hasNewUpdates: false } : t
      )
    );
  };

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
