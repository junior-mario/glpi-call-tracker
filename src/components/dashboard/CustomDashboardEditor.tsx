import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GLPIGroupResponse } from "@/types/glpi";
import {
  CustomDashboard,
  DashboardDisplayMode,
  ChartElementId,
  ALL_CHART_IDS,
  CHART_LABELS,
  GLPI_STATUS_OPTIONS,
} from "@/types/dashboard";

interface CustomDashboardEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: CustomDashboard | null;
  groups: GLPIGroupResponse[];
  onSave: (data: Partial<CustomDashboard>) => void;
}

export function CustomDashboardEditor({
  open,
  onOpenChange,
  dashboard,
  groups,
  onSave,
}: CustomDashboardEditorProps) {
  const [name, setName] = useState("Nova Dashboard");
  const [groupId, setGroupId] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState<number | "">(30);
  const [displayMode, setDisplayMode] = useState<DashboardDisplayMode>("charts");
  const [visibleCharts, setVisibleCharts] = useState<ChartElementId[]>([...ALL_CHART_IDS]);
  const [filterStatuses, setFilterStatuses] = useState<number[]>([]);
  const [filterTechnician, setFilterTechnician] = useState("");
  const [filterRequester, setFilterRequester] = useState("");

  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name);
      setGroupId(dashboard.group_id ? String(dashboard.group_id) : "all");
      setPeriodDays(dashboard.period_days ?? "");
      setDisplayMode(dashboard.display_mode || "charts");
      setVisibleCharts(dashboard.visible_charts);
      setFilterStatuses(dashboard.filter_statuses ?? []);
      setFilterTechnician(dashboard.filter_technician ?? "");
      setFilterRequester(dashboard.filter_requester ?? "");
    } else {
      setName("Nova Dashboard");
      setGroupId("all");
      setPeriodDays(30);
      setDisplayMode("charts");
      setVisibleCharts([...ALL_CHART_IDS]);
      setFilterStatuses([]);
      setFilterTechnician("");
      setFilterRequester("");
    }
  }, [dashboard, open]);

  const toggleChart = (id: ChartElementId) => {
    setVisibleCharts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleStatus = (status: number) => {
    setFilterStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleSave = () => {
    onSave({
      name,
      group_id: groupId && groupId !== "all" ? Number(groupId) : null,
      period_days: typeof periodDays === "number" && periodDays > 0 ? periodDays : null,
      display_mode: displayMode,
      visible_charts: visibleCharts,
      filter_statuses: filterStatuses.length > 0 ? filterStatuses : null,
      filter_technician: filterTechnician.trim() || null,
      filter_requester: filterRequester.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dashboard ? "Editar Dashboard" : "Nova Dashboard"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Group */}
          <div className="space-y-1.5">
            <Label>Grupo Técnico</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os grupos" />
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

          {/* Period — last X days */}
          <div className="space-y-2">
            <Label>Período</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Últimos</span>
              <Input
                type="number"
                min={1}
                max={365}
                className="w-20"
                value={periodDays}
                onChange={(e) => {
                  const v = e.target.value;
                  setPeriodDays(v === "" ? "" : Math.max(1, Number(v) || 1));
                }}
              />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
            <div className="flex gap-2">
              {[7, 15, 30, 60, 90].map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={periodDays === v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodDays(v)}
                >
                  {v}d
                </Button>
              ))}
            </div>
          </div>

          {/* Display mode */}
          <div className="space-y-1.5">
            <Label>Modo de exibição</Label>
            <Tabs value={displayMode} onValueChange={(v) => setDisplayMode(v as DashboardDisplayMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="charts" className="flex-1">Gráficos</TabsTrigger>
                <TabsTrigger value="columns" className="flex-1">3 Colunas</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Charts config — shown only in charts mode */}
          {displayMode === "charts" && (
            <div className="space-y-2">
              <Label>Gráficos visíveis</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_CHART_IDS.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={visibleCharts.includes(id)}
                      onCheckedChange={() => toggleChart(id)}
                    />
                    {CHART_LABELS[id]}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Filters — shown only in columns mode */}
          {displayMode === "columns" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Filtrar por status</Label>
                <p className="text-xs text-muted-foreground">
                  Deixe todos desmarcados para mostrar todos os status.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {GLPI_STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={filterStatuses.includes(opt.value)}
                        onCheckedChange={() => toggleStatus(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Filtrar por técnico</Label>
                <Input
                  placeholder="Nome do técnico (parcial)"
                  value={filterTechnician}
                  onChange={(e) => setFilterTechnician(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Filtrar por requerente</Label>
                <Input
                  placeholder="Nome do requerente (parcial)"
                  value={filterRequester}
                  onChange={(e) => setFilterRequester(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
