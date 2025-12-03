import { useState } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { ClipboardList } from "lucide-react";

const Index = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddTicket = async (ticketId: string) => {
    // Check if already tracking
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
      const ticket = await getTicketById(ticketId);
      if (ticket) {
        setTickets((prev) => [ticket, ...prev]);
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

  const ticketsWithUpdates = tickets.filter((t) => t.hasNewUpdates).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="container max-w-4xl py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                GLPI Tracker
              </h1>
              <p className="text-sm text-muted-foreground">
                Acompanhamento de chamados
              </p>
            </div>
            {ticketsWithUpdates > 0 && (
              <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-update-indicator/10 text-update-indicator">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-update-indicator opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-update-indicator"></span>
                </span>
                <span className="text-sm font-medium">
                  {ticketsWithUpdates} {ticketsWithUpdates === 1 ? "atualização" : "atualizações"}
                </span>
              </div>
            )}
          </div>
          <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />
        </div>
      </header>

      {/* Main content */}
      <main className="container max-w-4xl py-6">
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
      </main>

      {/* Footer hint */}
      <footer className="fixed bottom-0 left-0 right-0 py-3 text-center text-xs text-muted-foreground bg-background/80 backdrop-blur-sm border-t border-border">
        Dica: Experimente adicionar os chamados 1001, 1002, 1003 ou 1004 para ver exemplos
      </footer>
    </div>
  );
};

export default Index;
