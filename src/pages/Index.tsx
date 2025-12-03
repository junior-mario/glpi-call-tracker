import { useState, useEffect } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { fetchGLPITicket, getGLPIConfig } from "@/services/glpiService";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { ConfigPanel } from "@/components/ConfigPanel";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const STORAGE_KEY = "glpi-tracker-tickets";

const Index = () => {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiConfig, setHasApiConfig] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

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

  const handleConfigSaved = () => {
    setHasApiConfig(!!getGLPIConfig());
    toast({
      title: "Configuração salva",
      description: "As configurações da API GLPI foram salvas com sucesso.",
    });
  };

  const ticketsWithUpdates = tickets.filter((t) => t.hasNewUpdates).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="container max-w-4xl py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">GLPI Tracker</h1>
              <p className="text-sm text-muted-foreground">
                {hasApiConfig ? "Conectado à API GLPI" : "Usando dados de demonstração"}
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
            <Sheet open={isConfigOpen} onOpenChange={setIsConfigOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  className={ticketsWithUpdates > 0 ? "" : "ml-auto"}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Configurações</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <ConfigPanel onConfigSaved={handleConfigSaved} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />
        </div>
      </header>

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

      <footer className="fixed bottom-0 left-0 right-0 py-3 text-center text-xs text-muted-foreground bg-background/80 backdrop-blur-sm border-t border-border">
        {hasApiConfig 
          ? "API GLPI configurada. Adicione chamados reais para acompanhar."
          : "Dica: Configure a API GLPI nas configurações ou use os chamados 1001-1004 para demonstração"
        }
      </footer>
    </div>
  );
};

export default Index;
