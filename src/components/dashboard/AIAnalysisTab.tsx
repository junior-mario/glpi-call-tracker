import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { Loader2, Settings, Bot, RefreshCw, Search, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { MonitorTicket } from "@/types/glpi";
import { AIAnalysisResult, TicketDataForAnalysis } from "@/types/ai";
import {
  getGLPIConfig,
  searchTicketsByGroup,
  fetchGLPITicket,
  mapGLPIStatus,
} from "@/services/glpiService";
import { getAIConfig, loadAIConfig, analyzeTicket } from "@/services/aiService";
import { AnalysisMarkdown } from "./AnalysisMarkdown";

interface AIAnalysisTabProps {
  onTicketClick: (ticketId: string) => void;
}

const GLPI_STATUS_LABELS: Record<number, string> = {
  1: "Novo",
  2: "Em atendimento",
  3: "Planejado",
  4: "Pendente",
  5: "Solucionado",
  6: "Fechado",
};

export function AIAnalysisTab({ onTicketClick }: AIAnalysisTabProps) {
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasAIConfig, setHasAIConfig] = useState<boolean | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const glpiConfig = getGLPIConfig();
  const overviewDays = glpiConfig?.overviewDays ?? 30;
  const groupId = glpiConfig?.overviewGroupId ?? null;

  // Load AI config on mount
  useEffect(() => {
    loadAIConfig().then((config) => {
      setHasAIConfig(!!config);
    });
  }, []);

  // Auto-search closed/resolved tickets on mount
  useEffect(() => {
    if (!glpiConfig) return;

    const now = new Date();
    const dateFrom = format(subDays(now, overviewDays), "yyyy-MM-dd");
    const dateTo = format(now, "yyyy-MM-dd");

    setIsSearching(true);
    searchTicketsByGroup(groupId, dateFrom, dateTo)
      .then((results) => {
        // Filter to only resolved/closed tickets (status 5 or 6)
        const closedTickets = results.filter((t) => t.status === 5 || t.status === 6);
        setTickets(closedTickets);
      })
      .catch((err) => {
        toast({
          title: "Erro ao buscar chamados",
          description: err instanceof Error ? err.message : "Erro desconhecido",
          variant: "destructive",
        });
      })
      .finally(() => setIsSearching(false));
  }, [overviewDays, groupId]);

  // Filtered tickets by search query
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter(
      (t) =>
        String(t.id).includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.technician.toLowerCase().includes(q) ||
        t.requester.toLowerCase().includes(q)
    );
  }, [tickets, searchQuery]);

  const handleAnalyze = async (ticketId: string, forceRefresh = false) => {
    setSelectedTicketId(ticketId);
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      // Fetch full ticket data from GLPI
      const ticket = await fetchGLPITicket(ticketId);
      if (!ticket) {
        toast({
          title: "Erro",
          description: "Chamado não encontrado no GLPI",
          variant: "destructive",
        });
        setIsAnalyzing(false);
        return;
      }

      // Strip HTML from updates for AI analysis
      const ticketData: TicketDataForAnalysis = {
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        requester: ticket.requester,
        assignee: ticket.assignee,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        updates: ticket.updates.map((u) => ({
          date: u.date,
          author: u.author,
          content: u.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          type: u.type,
        })),
      };

      const result = await analyzeTicket(ticketData, forceRefresh);
      setAnalysis(result);
    } catch (err) {
      toast({
        title: "Erro na análise",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // No AI config — prompt user to go to Settings
  if (hasAIConfig === false) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <Settings className="h-6 w-6 mx-auto mb-2 opacity-50" />
          Configure o provedor de IA em{" "}
          <strong>Configurações</strong> para usar a análise de chamados.
        </CardContent>
      </Card>
    );
  }

  // Still loading AI config
  if (hasAIConfig === null) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando configuração...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* Left sidebar — ticket list */}
      <div className="w-80 shrink-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chamado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isSearching ? (
          <Card>
            <CardContent className="py-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando chamados...
            </CardContent>
          </Card>
        ) : filteredTickets.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              Nenhum chamado fechado encontrado
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[560px]">
            <div className="space-y-2 pr-3">
              {filteredTickets.map((t) => (
                <Card
                  key={t.id}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                    selectedTicketId === String(t.id) ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => onTicketClick(String(t.id))}
                >
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        #{t.id}
                      </span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {GLPI_STATUS_LABELS[t.status] || t.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium line-clamp-2 leading-tight">
                      {t.name}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {t.technician || "Sem técnico"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAnalyze(String(t.id));
                        }}
                      >
                        <Bot className="h-3 w-3 mr-1" />
                        Analisar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {filteredTickets.length} chamado{filteredTickets.length !== 1 ? "s" : ""} fechado{filteredTickets.length !== 1 ? "s" : ""}
          {" "}(últimos {overviewDays} dias)
        </p>
      </div>

      {/* Right side — analysis result */}
      <div className="flex-1 min-w-0">
        {isAnalyzing ? (
          <Card className="h-full">
            <CardContent className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Analisando chamado #{selectedTicketId}...</p>
              <p className="text-xs">Isso pode levar alguns segundos</p>
            </CardContent>
          </Card>
        ) : analysis ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    Análise do Chamado #{analysis.ticket_id}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Modelo: {analysis.model_used}</span>
                    <span>
                      {new Date(analysis.created_at).toLocaleString("pt-BR")}
                    </span>
                    {analysis.cached && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Database className="h-3 w-3 mr-1" />
                        Cache
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAnalyze(analysis.ticket_id, true)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reanalisar
                </Button>
              </div>

              <Separator />

              {/* Analysis content */}
              <AnalysisMarkdown content={analysis.analysis_text} />
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full">
            <CardContent className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Bot className="h-10 w-10 opacity-30" />
              <p>Selecione um chamado e clique em "Analisar"</p>
              <p className="text-xs">
                A IA irá gerar um resumo, linha do tempo e análise de atrasos
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
