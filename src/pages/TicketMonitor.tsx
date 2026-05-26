import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Play, Filter, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  getMonitorConfig,
  getMonitorSummary,
  listMonitorTickets,
  listMonitorTicketsByQueue,
  runMonitorNow,
  updateMonitorConfig,
  type MonitorTicketQuery,
} from "@/services/ticketMonitorService";
import {
  MonitorSummary,
  MonitorTicketAnalysis,
  TicketMonitorConfig,
} from "@/types/ticketMonitor";
import { MonitorSummaryCards } from "@/components/ticket-monitor/MonitorSummaryCards";
import { MonitorTicketsTable } from "@/components/ticket-monitor/MonitorTicketsTable";
import { MonitorConfigTab } from "@/components/ticket-monitor/MonitorConfigTab";
import { TicketDetailSheet } from "@/components/dashboard/TicketDetailSheet";
import { fetchGLPITicket, loadGLPIConfig } from "@/services/glpiService";
import { buildMonitorReportHtml, openMonitorReportInNewTab } from "@/services/monitorReportService";
import { format } from "date-fns";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "dd/MM/yyyy HH:mm");
}

const queueFromTab: Record<string, "ACAO_IMEDIATA" | "COBRANCA" | "REVISAO"> = {
  immediate: "ACAO_IMEDIATA",
  cobranca: "COBRANCA",
  revisao: "REVISAO",
};

const TicketMonitor = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [overviewRows, setOverviewRows] = useState<MonitorTicketAnalysis[]>([]);
  const [queueRows, setQueueRows] = useState<Record<string, MonitorTicketAnalysis[]>>({
    immediate: [],
    cobranca: [],
    revisao: [],
  });
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [config, setConfig] = useState<TicketMonitorConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [glpiBaseUrl, setGlpiBaseUrl] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [risk, setRisk] = useState("all");
  const [queue, setQueue] = useState("all");
  const [group, setGroup] = useState("all");
  const [technician, setTechnician] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"risk" | "idle" | "priority" | "opened_at">("risk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filters: MonitorTicketQuery = useMemo(
    () => ({
      status,
      priority,
      risk,
      queue,
      group,
      technician,
      search,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [status, priority, risk, queue, group, technician, search, sortBy, sortDir]
  );

  const groupOptions = useMemo(() => {
    const values = new Set<string>();

    const pushGroup = (value: string | null | undefined) => {
      const normalized = String(value || "").trim();
      if (!normalized || normalized === "-") return;
      values.add(normalized);
    };

    overviewRows.forEach((row) => pushGroup(row.group_name));
    Object.values(queueRows).forEach((rows) => rows.forEach((row) => pushGroup(row.group_name)));

    return Array.from(values).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [overviewRows, queueRows]);

  const loadSummary = useCallback(async () => {
    const data = await getMonitorSummary();
    setSummary(data);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const [summaryData, rows] = await Promise.all([getMonitorSummary(), listMonitorTickets(filters)]);
      setSummary(summaryData);
      setOverviewRows(rows);
    } finally {
      setLoadingOverview(false);
    }
  }, [filters]);

  const loadQueue = useCallback(
    async (tabValue: "immediate" | "cobranca" | "revisao") => {
      const queueName = queueFromTab[tabValue];
      setLoadingQueue(true);
      try {
        const rows = await listMonitorTicketsByQueue(queueName, {
          status,
          priority,
          risk,
          group,
          technician,
          search,
          sort_by: sortBy,
          sort_dir: sortDir,
        });
        setQueueRows((prev) => ({ ...prev, [tabValue]: rows }));
      } finally {
        setLoadingQueue(false);
      }
    },
    [status, priority, risk, group, technician, search, sortBy, sortDir]
  );

  const loadConfig = useCallback(async () => {
    const data = await getMonitorConfig();
    setConfig(data);
  }, []);

  useEffect(() => {
    loadOverview().catch((error) => {
      toast({
        title: "Erro ao carregar monitor",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    });
    loadConfig().catch(() => {});
    loadGLPIConfig().then((cfg) => setGlpiBaseUrl(cfg?.baseUrl || "")).catch(() => {});
  }, [loadOverview, loadConfig]);

  useEffect(() => {
    if (activeTab === "immediate" || activeTab === "cobranca" || activeTab === "revisao") {
      loadQueue(activeTab).catch((error) => {
        toast({
          title: "Erro ao carregar fila",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
      });
    }
  }, [activeTab, loadQueue]);

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const result = await runMonitorNow();
      await loadOverview();
      toast({
        title: "Monitor executado",
        description: result.skipped
          ? `Execucao ignorada: ${result.reason || "sem detalhes"}`
          : `${result.processed_tickets || 0} ticket(s) processado(s).`,
      });
    } catch (error) {
      toast({
        title: "Erro ao executar monitor",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setRunningNow(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await loadOverview();
      if (activeTab === "immediate" || activeTab === "cobranca" || activeTab === "revisao") {
        await loadQueue(activeTab);
      }
      await loadSummary();
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleOpenDetail = (ticketId: string) => {
    setSelectedTicketId(String(ticketId));
    setDetailOpen(true);
  };

  const handleSaveConfig = async (payload: Partial<TicketMonitorConfig>) => {
    setSavingConfig(true);
    try {
      const updated = await updateMonitorConfig(payload);
      setConfig(updated);
      toast({
        title: "Configuracoes salvas",
        description: "Configuracoes do monitor atualizadas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar configuracoes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const currentQueueRows =
    activeTab === "immediate" || activeTab === "cobranca" || activeTab === "revisao"
      ? queueRows[activeTab]
      : [];

  const visibleRows = useMemo(() => {
    if (activeTab === "overview") return overviewRows;
    if (activeTab === "immediate" || activeTab === "cobranca" || activeTab === "revisao") {
      return currentQueueRows;
    }
    return [];
  }, [activeTab, overviewRows, currentQueueRows]);

  const reportTabLabel =
    activeTab === "overview"
      ? "Visao Geral"
      : activeTab === "immediate"
      ? "Acao Imediata"
      : activeTab === "cobranca"
      ? "Cobranca"
      : activeTab === "revisao"
      ? "Revisao"
      : "Monitor";

  const mapStatusToCode = (statusValue: string): number => {
    const statusText = String(statusValue || "").toLowerCase();
    if (statusText === "new") return 1;
    if (statusText === "in-progress" || statusText === "open" || statusText === "reopened") return 2;
    if (statusText === "pending") return 3;
    if (statusText === "resolved") return 5;
    if (statusText === "closed") return 6;
    return 2;
  };

  const mapPriorityToCode = (priorityValue: string): number => {
    const priorityText = String(priorityValue || "").toLowerCase();
    if (priorityText === "low") return 2;
    if (priorityText === "medium") return 3;
    if (priorityText === "high") return 4;
    if (priorityText === "urgent") return 6;
    return 3;
  };

  const isMissingRequester = (value: string | null | undefined): boolean => {
    const normalized = String(value || "").trim();
    return !normalized || normalized === "-" || normalized.toLowerCase() === "nao informado";
  };

  const handleGenerateReport = async () => {
    if (activeTab === "config") {
      toast({
        title: "Aba sem consulta",
        description: "Selecione uma aba com resultados para gerar o relatorio.",
        variant: "destructive",
      });
      return;
    }

    if (!visibleRows.length) {
      toast({
        title: "Sem dados para relatorio",
        description: "Nao ha chamados na consulta atual.",
        variant: "destructive",
      });
      return;
    }

    const preparedWindow = window.open("", "_blank", "noopener,noreferrer");
    if (preparedWindow && !preparedWindow.closed) {
      try {
        preparedWindow.document.title = "Gerando relatorio...";
        preparedWindow.document.body.innerHTML = "<p style='font-family:Arial,sans-serif;padding:16px'>Gerando relatorio...</p>";
      } catch {
        // ignore
      }
    }

    setGeneratingReport(true);
    try {
      const reportTickets = await Promise.all(
        visibleRows.map(async (row) => {
          let requester = row.requester_name || "";
          let technician = row.technician_name || "";

          if (isMissingRequester(requester)) {
            try {
              const ticket = await fetchGLPITicket(String(row.ticket_id));
              if (ticket) {
                requester = ticket.requester || requester;
                technician = ticket.assignee || technician;
              }
            } catch {
              // keep current values if fallback lookup fails
            }
          }

          return {
            id: Number(row.ticket_id),
            name: row.title || "(Sem titulo)",
            technician,
            requester: requester || "Nao informado",
            group: row.group_name || "",
            status: mapStatusToCode(row.current_status),
            priority: mapPriorityToCode(row.current_priority),
            date: row.opened_at || "",
            date_mod: row.updated_at || "",
            tags: "",
          };
        })
      );

      const periodLabel = `Monitor de Chamados - ${reportTabLabel} - filtros atuais`;
      const groupLabel = group && group !== "all" ? group : "Todos os grupos";

      const reportHtml = buildMonitorReportHtml({
        tickets: reportTickets,
        groupName: groupLabel,
        periodLabel,
        generatedAt: new Date(),
        glpiBaseUrl,
      });

      const opened = openMonitorReportInNewTab(reportHtml, preparedWindow);
      toast({
        title: "Relatorio gerado",
        description: opened
          ? "Relatorio aberto em nova aba."
          : "Relatorio baixado como HTML (popup bloqueado).",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar relatorio",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      if (preparedWindow && !preparedWindow.closed) {
        preparedWindow.close();
      }
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="py-6 px-4 mx-auto w-full max-w-none space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Monitor de Chamados</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento automatico de risco operacional dos chamados ativos.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Ultima analise: {formatDateTime(summary?.last_analysis_timestamp)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Coleta programada a cada {config?.monitor_interval_minutes ?? 5} min | Janela de busca:{" "}
            {config?.ticket_lookback_days ?? 120} dias
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleGenerateReport} disabled={generatingReport}>
            <FileText className="h-4 w-4 mr-2" />
            {generatingReport ? "Gerando..." : "Gerar relatorio"}
          </Button>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button onClick={handleRunNow} disabled={runningNow}>
            <Play className="h-4 w-4 mr-2" />
            {runningNow ? "Executando..." : "Executar agora"}
          </Button>
        </div>
      </div>

      <MonitorSummaryCards summary={summary} />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros e ordenacao</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="new">Novo</SelectItem>
                  <SelectItem value="in-progress">Em andamento</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="reopened">Reaberto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="urgent">Critica</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Risco</Label>
              <Select value={risk} onValueChange={setRisk}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="NORMAL">NORMAL</SelectItem>
                  <SelectItem value="ATENCAO">ATENCAO</SelectItem>
                  <SelectItem value="ALTO">ALTO</SelectItem>
                  <SelectItem value="CRITICO">CRITICO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Fila</Label>
              <Select value={queue} onValueChange={setQueue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="SAUDAVEL">SAUDAVEL</SelectItem>
                  <SelectItem value="ACAO_IMEDIATA">ACAO_IMEDIATA</SelectItem>
                  <SelectItem value="COBRANCA">COBRANCA</SelectItem>
                  <SelectItem value="REVISAO">REVISAO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Ordenar por</Label>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as "risk" | "idle" | "priority" | "opened_at")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Risco</SelectItem>
                  <SelectItem value="idle">Tempo sem atualizacao</SelectItem>
                  <SelectItem value="priority">Prioridade</SelectItem>
                  <SelectItem value="opened_at">Data de abertura</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Grupo</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger><SelectValue placeholder="Todos os grupos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  {groupOptions.length === 0 ? (
                    <SelectItem value="__none" disabled>Nenhum grupo encontrado</SelectItem>
                  ) : (
                    groupOptions.map((groupName) => (
                      <SelectItem key={groupName} value={groupName}>
                        {groupName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Responsavel</Label>
              <Input
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Filtrar por responsavel"
              />
            </div>

            <div className="space-y-1 md:col-span-2 xl:col-span-3">
              <Label>Busca</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID, titulo, resumo..." />
            </div>

            <div className="space-y-1">
              <Label>Direcao</Label>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Desc</SelectItem>
                  <SelectItem value="asc">Asc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full max-w-fit flex-wrap">
          <TabsTrigger value="overview">Visao Geral</TabsTrigger>
          <TabsTrigger value="immediate">Acao Imediata</TabsTrigger>
          <TabsTrigger value="cobranca">Cobranca</TabsTrigger>
          <TabsTrigger value="revisao">Revisao</TabsTrigger>
          <TabsTrigger value="config">Configuracoes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {loadingOverview ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando tickets monitorados...</CardContent></Card>
          ) : (
            <MonitorTicketsTable rows={overviewRows} onOpenDetail={handleOpenDetail} />
          )}
        </TabsContent>

        <TabsContent value="immediate" className="space-y-3">
          {loadingQueue ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando fila de acao imediata...</CardContent></Card>
          ) : (
            <MonitorTicketsTable rows={currentQueueRows} onOpenDetail={handleOpenDetail} />
          )}
        </TabsContent>

        <TabsContent value="cobranca" className="space-y-3">
          {loadingQueue ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando fila de cobranca...</CardContent></Card>
          ) : (
            <MonitorTicketsTable rows={currentQueueRows} onOpenDetail={handleOpenDetail} />
          )}
        </TabsContent>

        <TabsContent value="revisao" className="space-y-3">
          {loadingQueue ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando fila de revisao...</CardContent></Card>
          ) : (
            <MonitorTicketsTable rows={currentQueueRows} onOpenDetail={handleOpenDetail} />
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-3">
          <MonitorConfigTab config={config} saving={savingConfig} onSave={handleSaveConfig} />
        </TabsContent>
      </Tabs>

      <TicketDetailSheet
        ticketId={selectedTicketId}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedTicketId(null);
          }
        }}
      />
    </div>
  );
};

export default TicketMonitor;
