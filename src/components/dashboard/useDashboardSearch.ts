import { useState, useMemo } from "react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { searchTicketsByGroup } from "@/services/glpiService";
import { MonitorTicket } from "@/types/glpi";
import { type ChartConfig } from "@/components/ui/chart";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "./dashboardConstants";

export function useDashboardSearch() {
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (
    overrideGroupId?: number | null,
    overrideDateFrom?: string,
    overrideDateTo?: string
  ) => {
    const from = overrideDateFrom || (dateFrom ? format(dateFrom, "yyyy-MM-dd") : "");
    const to = overrideDateTo || (dateTo ? format(dateTo, "yyyy-MM-dd") : "");

    if (!from || !to) {
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
      const groupId =
        overrideGroupId !== undefined
          ? overrideGroupId
          : selectedGroup && selectedGroup !== "all"
          ? Number(selectedGroup)
          : null;
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

  // Aggregations
  const kpis = useMemo(() => {
    const total = tickets.length;
    const abertos = tickets.filter((t) => t.status === 1 || t.status === 2).length;
    const pendentes = tickets.filter((t) => t.status === 3 || t.status === 4).length;
    const resolvidos = tickets.filter((t) => t.status === 5 || t.status === 6).length;
    return { total, abertos, pendentes, resolvidos };
  }, [tickets]);

  const statusData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of tickets) {
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
      if (day in counts) counts[day]++;
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

  return {
    selectedGroup,
    setSelectedGroup,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    tickets,
    isSearching,
    hasSearched,
    handleSearch,
    kpis,
    statusData,
    statusChartConfig,
    priorityData,
    priorityChartConfig,
    techData,
    techChartConfig,
    tagData,
    tagChartConfig,
    dailyData,
    dailyChartConfig,
  };
}
