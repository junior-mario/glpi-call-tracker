import { useState, useEffect, useMemo } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  Search,
  Loader2,
  Ticket,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GLPIGroupResponse, MonitorTicket } from "@/types/glpi";
import {
  fetchGLPIGroups,
  searchTicketsByGroup,
  loadGLPIConfig,
} from "@/services/glpiService";

const STATUS_LABELS: Record<number, string> = {
  1: "Novo",
  2: "Em andamento",
  3: "Pendente",
  4: "Pendente",
  5: "Resolvido",
  6: "Fechado",
};

const STATUS_COLORS: Record<number, string> = {
  1: "#3b82f6", // blue
  2: "#f59e0b", // amber
  3: "#ef4444", // red
  4: "#ef4444", // red
  5: "#22c55e", // green
  6: "#6b7280", // gray
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Muito baixa",
  2: "Baixa",
  3: "Média",
  4: "Alta",
  5: "Muito alta",
  6: "Crítica",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "#6b7280",
  2: "#3b82f6",
  3: "#f59e0b",
  4: "#f97316",
  5: "#ef4444",
  6: "#dc2626",
};

const Dashboard = () => {
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadGLPIConfig().then((config) => {
      setHasConfig(!!config);
      setConfigLoaded(true);

      if (!config) return;

      setIsLoadingGroups(true);
      fetchGLPIGroups()
        .then(setGroups)
        .catch((err) => {
          toast({
            title: "Erro ao carregar grupos",
            description: err instanceof Error ? err.message : "Erro desconhecido",
            variant: "destructive",
          });
        })
        .finally(() => setIsLoadingGroups(false));
    });
  }, []);

  const handleSearch = async () => {
    if (!dateFrom || !dateTo) {
      toast({
        title: "Preencha o período",
        description: "Selecione as datas de início e fim.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const from = format(dateFrom, "yyyy-MM-dd");
      const to = format(dateTo, "yyyy-MM-dd");
      const groupId =
        selectedGroup && selectedGroup !== "all" ? Number(selectedGroup) : null;
      const result = await searchTicketsByGroup(groupId, from, to);
      setTickets(result);
    } catch (err) {
      toast({
        title: "Erro ao buscar chamados",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
      setTickets([]);
    } finally {
      setIsSearching(false);
    }
  };

  // --- Aggregations ---

  const kpis = useMemo(() => {
    const total = tickets.length;
    const abertos = tickets.filter(
      (t) => t.status === 1 || t.status === 2
    ).length;
    const pendentes = tickets.filter(
      (t) => t.status === 3 || t.status === 4
    ).length;
    const resolvidos = tickets.filter(
      (t) => t.status === 5 || t.status === 6
    ).length;
    return { total, abertos, pendentes, resolvidos };
  }, [tickets]);

  const statusData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of tickets) {
      // Merge status 4 into 3 (both are "Pendente")
      const key = t.status === 4 ? 3 : t.status;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[Number(status)] || `Status ${status}`,
      value: count,
      fill: STATUS_COLORS[Number(status)] || "#94a3b8",
    }));
  }, [tickets]);

  const statusChartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const d of statusData) {
      config[d.name] = { label: d.name, color: d.fill };
    }
    return config;
  }, [statusData]);

  const priorityData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of tickets) {
      counts[t.priority] = (counts[t.priority] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([priority, count]) => ({
        name: PRIORITY_LABELS[Number(priority)] || `P${priority}`,
        value: count,
        fill: PRIORITY_COLORS[Number(priority)] || "#94a3b8",
      }))
      .sort(
        (a, b) =>
          Object.values(PRIORITY_LABELS).indexOf(a.name) -
          Object.values(PRIORITY_LABELS).indexOf(b.name)
      );
  }, [tickets]);

  const priorityChartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const d of priorityData) {
      config[d.name] = { label: d.name, color: d.fill };
    }
    return config;
  }, [priorityData]);

  const techData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      const name = t.technician || "Não atribuído";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [tickets]);

  const techChartConfig = useMemo<ChartConfig>(
    () => ({ value: { label: "Chamados", color: "hsl(var(--primary))" } }),
    []
  );

  const tagData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      if (!t.tags) continue;
      const tags = t.tags
        .split(/,\s*|;\s*|\$\$/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const tag of tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [tickets]);

  const tagChartConfig = useMemo<ChartConfig>(
    () => ({ value: { label: "Chamados", color: "hsl(var(--primary))" } }),
    []
  );

  const dailyData = useMemo(() => {
    if (!dateFrom || !dateTo || tickets.length === 0) return [];

    const days = eachDayOfInterval({ start: dateFrom, end: dateTo });
    const counts: Record<string, number> = {};
    for (const d of days) {
      counts[format(d, "yyyy-MM-dd")] = 0;
    }
    for (const t of tickets) {
      if (!t.date) continue;
      const day = format(parseISO(t.date), "yyyy-MM-dd");
      if (day in counts) {
        counts[day]++;
      }
    }
    return Object.entries(counts).map(([date, value]) => ({
      date,
      label: format(parseISO(date), "dd/MM"),
      value,
    }));
  }, [tickets, dateFrom, dateTo]);

  const dailyChartConfig = useMemo<ChartConfig>(
    () => ({ value: { label: "Chamados", color: "hsl(var(--primary))" } }),
    []
  );

  // --- Render ---

  if (!configLoaded) {
    return (
      <div className="container max-w-6xl py-6">
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando configuração...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div className="container max-w-6xl py-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Configure a API GLPI em <strong>Configurações</strong> para usar o
            dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
              <Label htmlFor="dash-group">Grupo Técnico</Label>
              <Select
                value={selectedGroup}
                onValueChange={setSelectedGroup}
                disabled={isLoadingGroups}
              >
                <SelectTrigger id="dash-group">
                  <SelectValue
                    placeholder={
                      isLoadingGroups ? "Carregando..." : "Selecione um grupo"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.completename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>De</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[160px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Até</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[160px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isSearching && (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Buscando chamados...
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isSearching && hasSearched && tickets.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum chamado encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      )}

      {/* Dashboard content */}
      {!isSearching && tickets.length > 0 && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Ticket className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{kpis.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Abertos</p>
                    <p className="text-2xl font-bold">{kpis.abertos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-500/10 p-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pendentes</p>
                    <p className="text-2xl font-bold">{kpis.pendentes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-500/10 p-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Resolvidos</p>
                    <p className="text-2xl font-bold">{kpis.resolvidos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 1: Status + Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status Donut */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Distribuição por Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={statusChartConfig} className="mx-auto aspect-square max-h-[300px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      strokeWidth={2}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Priority Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Distribuição por Prioridade
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={priorityChartConfig} className="max-h-[300px]">
                  <BarChart data={priorityData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {priorityData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2: Technician + Tag */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Technician Horizontal Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Chamados por Técnico
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-hidden">
                <ChartContainer
                  config={techChartConfig}
                  className="!aspect-auto max-h-[350px] w-full"
                  style={{ height: Math.max(200, techData.length * 40) }}
                >
                  <BarChart data={techData} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      width={110}
                      fontSize={11}
                      tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Tag Horizontal Bar */}
            {tagData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Chamados por Tag
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-hidden">
                  <ChartContainer
                    config={tagChartConfig}
                    className="!aspect-auto max-h-[350px] w-full"
                    style={{ height: Math.max(200, tagData.length * 40) }}
                  >
                    <BarChart data={tagData} layout="vertical" margin={{ left: 0, right: 12 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        width={110}
                        fontSize={11}
                        tickFormatter={(v: string) => v.length > 16 ? v.slice(0, 15) + "…" : v}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Timeline Area Chart */}
          {dailyData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Chamados ao longo do tempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={dailyChartConfig} className="max-h-[300px]">
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="fillArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="url(#fillArea)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
