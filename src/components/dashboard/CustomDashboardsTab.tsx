import { useState, useEffect, useMemo } from "react";
import { format, subDays, parseISO, eachDayOfInterval } from "date-fns";
import { Loader2, Plus, Pencil, Trash2, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { GLPIGroupResponse, MonitorTicket } from "@/types/glpi";
import { CustomDashboard, TrackedTicketRow } from "@/types/dashboard";
import {
  fetchGLPIGroups,
  searchTicketsByGroup,
  mapGLPIStatus,
  mapGLPIPriority,
} from "@/services/glpiService";
import { type ChartConfig } from "@/components/ui/chart";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "./dashboardConstants";
import { useCustomDashboards } from "./useCustomDashboards";
import { CustomDashboardEditor } from "./CustomDashboardEditor";
import { SearchCharts } from "./SearchCharts";
import { OverviewColumns } from "./OverviewColumns";

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

/** Compute date range from period_days (relative to today) */
function computeDateRange(days: number | null): { dateFrom: string; dateTo: string } | null {
  if (!days || days <= 0) return null;
  const now = new Date();
  return {
    dateFrom: format(subDays(now, days), "yyyy-MM-dd"),
    dateTo: format(now, "yyyy-MM-dd"),
  };
}

interface CustomDashboardsTabProps {
  onTicketClick?: (ticketId: string) => void;
}

export function CustomDashboardsTab({ onTicketClick }: CustomDashboardsTabProps) {
  const { dashboards, isLoading, load, create, update, remove } = useCustomDashboards();
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingDash, setEditingDash] = useState<CustomDashboard | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Data for the selected dashboard
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    load();
    fetchGLPIGroups().then(setGroups).catch(() => {});
  }, [load]);

  // Select first dashboard once loaded
  useEffect(() => {
    if (dashboards.length > 0 && selectedId === null) {
      setSelectedId(dashboards[0].id);
    }
  }, [dashboards, selectedId]);

  const selected = dashboards.find((d) => d.id === selectedId) ?? null;
  const dateRange = selected ? computeDateRange(selected.period_days) : null;

  // Run search when a dashboard is selected
  useEffect(() => {
    if (!selected || !dateRange) {
      setTickets([]);
      return;
    }

    setIsSearching(true);
    searchTicketsByGroup(selected.group_id, dateRange.dateFrom, dateRange.dateTo)
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
  }, [selected?.id, selected?.group_id, selected?.period_days]);

  // ─── Charts mode aggregations ────────────────────────────────
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
    for (const d of statusData) config[d.name] = { label: d.name, color: d.fill };
    return config;
  }, [statusData]);

  const priorityData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of tickets) counts[t.priority] = (counts[t.priority] || 0) + 1;
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
    for (const d of priorityData) config[d.name] = { label: d.name, color: d.fill };
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
      const tags = t.tags.split(/,\s*|;\s*|\$\$/).map((s) => s.trim()).filter(Boolean);
      for (const tag of tags) counts[tag] = (counts[tag] || 0) + 1;
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
    if (!dateRange || tickets.length === 0) return [];
    const start = new Date(dateRange.dateFrom + "T00:00:00");
    const end = new Date(dateRange.dateTo + "T00:00:00");
    const days = eachDayOfInterval({ start, end });
    const counts: Record<string, number> = {};
    for (const d of days) counts[format(d, "yyyy-MM-dd")] = 0;
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
  }, [tickets, dateRange]);

  const dailyChartConfig = useMemo<ChartConfig>(
    () => ({ value: { label: "Chamados", color: "hsl(var(--primary))" } }),
    []
  );

  // ─── Columns mode: map + filter + split ──────────────────────
  const filteredForColumns = useMemo(() => {
    if (!selected || selected.display_mode !== "columns") return [];

    let filtered = tickets;

    // Filter by statuses
    if (selected.filter_statuses && selected.filter_statuses.length > 0) {
      filtered = filtered.filter((t) => selected.filter_statuses!.includes(t.status));
    }

    return filtered.map(toTrackedRow);
  }, [tickets, selected]);

  const technicianSearch = (selected?.filter_technician || "").toLowerCase().trim();

  const recentOpened = useMemo(() => {
    let rows = filteredForColumns
      .filter((t) => t.status !== "resolved" && t.status !== "closed")
      .filter((t) => t.glpi_created_at);

    // In "opened", interpret selected technician as requester (solicitante).
    if (technicianSearch) {
      rows = rows.filter((t) => (t.requester || "").toLowerCase().includes(technicianSearch));
    }

    return rows;
  }, [filteredForColumns, technicianSearch]);

  const recentClosed = useMemo(() => {
    let rows = filteredForColumns
      .filter((t) => t.status === "resolved" || t.status === "closed")
      .filter((t) => t.glpi_updated_at);

    if (technicianSearch) {
      rows = rows.filter((t) => (t.assignee || "").toLowerCase().includes(technicianSearch));
    }

    return rows;
  }, [filteredForColumns, technicianSearch]);

  const recentUpdated = useMemo(() => {
    let rows = filteredForColumns
      .filter((t) => t.status !== "resolved" && t.status !== "closed")
      .filter((t) => t.glpi_updated_at);

    if (technicianSearch) {
      rows = rows.filter((t) => (t.assignee || "").toLowerCase().includes(technicianSearch));
    }

    return rows;
  }, [filteredForColumns, technicianSearch]);

  const handleSave = async (data: Partial<CustomDashboard>) => {
    try {
      if (editingDash) {
        await update(editingDash.id, data);
        toast({ title: "Dashboard atualizada" });
      } else {
        const created = await create(data);
        setSelectedId(created.id);
        toast({ title: "Dashboard criada" });
      }
    } catch (err) {
      toast({
        title: "Erro ao salvar dashboard",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await remove(id);
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Dashboard excluída" });
    } catch (err) {
      toast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleTicketClick = onTicketClick ?? (() => {});

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando dashboards...
        </CardContent>
      </Card>
    );
  }

  const isColumnsMode = selected?.display_mode === "columns";

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Sidebar: list of saved dashboards */}
      <div className="w-[240px] shrink-0 space-y-2">
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            setEditingDash(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nova Dashboard
        </Button>

        {dashboards.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma dashboard salva.
          </p>
        )}

        {dashboards.map((d) => (
          <div
            key={d.id}
            onClick={() => setSelectedId(d.id)}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer border transition-colors ${
              selectedId === d.id
                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                : "bg-card border-transparent hover:bg-muted"
            }`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1">{d.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingDash(d);
                setEditorOpen(true);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(d.id);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0">
        {!selected && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Selecione ou crie uma dashboard.
            </CardContent>
          </Card>
        )}

        {selected && !dateRange && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Esta dashboard não possui período definido. Edite para configurar os dias.
            </CardContent>
          </Card>
        )}

        {selected && dateRange && isSearching && (
          <Card>
            <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Buscando chamados...
            </CardContent>
          </Card>
        )}

        {selected && dateRange && !isSearching && tickets.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nenhum chamado encontrado para os filtros desta dashboard.
            </CardContent>
          </Card>
        )}

        {selected && !isSearching && tickets.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              {tickets.length} chamado{tickets.length !== 1 ? "s" : ""} (últimos {selected.period_days} dias)
              {isColumnsMode && filteredForColumns.length !== tickets.length && (
                <> &middot; {filteredForColumns.length} após filtros</>
              )}
            </p>

            {isColumnsMode ? (
              <OverviewColumns
                recentOpened={recentOpened}
                recentClosed={recentClosed}
                recentUpdated={recentUpdated}
                onTicketClick={handleTicketClick}
              />
            ) : (
              <SearchCharts
                kpis={kpis}
                statusData={statusData}
                statusChartConfig={statusChartConfig}
                priorityData={priorityData}
                priorityChartConfig={priorityChartConfig}
                techData={techData}
                techChartConfig={techChartConfig}
                tagData={tagData}
                tagChartConfig={tagChartConfig}
                dailyData={dailyData}
                dailyChartConfig={dailyChartConfig}
                visibleCharts={selected.visible_charts}
              />
            )}
          </>
        )}
      </div>

      <CustomDashboardEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        dashboard={editingDash}
        groups={groups}
        onSave={handleSave}
      />
    </div>
  );
}
