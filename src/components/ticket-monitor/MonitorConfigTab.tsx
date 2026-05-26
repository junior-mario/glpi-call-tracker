import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchGLPIGroups } from "@/services/glpiService";
import { GLPIGroupResponse } from "@/types/glpi";
import { TicketMonitorConfig } from "@/types/ticketMonitor";

interface MonitorConfigTabProps {
  config: TicketMonitorConfig | null;
  saving?: boolean;
  onSave: (payload: Partial<TicketMonitorConfig>) => Promise<void> | void;
}

function listToText(values: number[]): string {
  return Array.isArray(values) ? values.join(",") : "";
}

function textToNumberList(text: string): number[] {
  return String(text || "")
    .split(",")
    .map((piece) => Number(piece.trim()))
    .filter((n) => Number.isFinite(n));
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function MonitorConfigTab({ config, saving, onSave }: MonitorConfigTabProps) {
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [monitorIntervalMinutes, setMonitorIntervalMinutes] = useState("5");
  const [statusCodes, setStatusCodes] = useState("1,2,3,4");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [includeUnassignedTickets, setIncludeUnassignedTickets] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [availableGroups, setAvailableGroups] = useState<GLPIGroupResponse[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [maxTickets, setMaxTickets] = useState("200");
  const [lookbackDays, setLookbackDays] = useState("120");
  const [idleUrgent, setIdleUrgent] = useState("30");
  const [idleHigh, setIdleHigh] = useState("60");
  const [idleMedium, setIdleMedium] = useState("240");
  const [idleLow, setIdleLow] = useState("480");
  const [pendingAttention, setPendingAttention] = useState("24");
  const [pendingHigh, setPendingHigh] = useState("48");
  const [pendingCritical, setPendingCritical] = useState("72");

  useEffect(() => {
    let active = true;
    setLoadingGroups(true);
    fetchGLPIGroups()
      .then((groups) => {
        if (!active) return;
        setAvailableGroups(groups);
      })
      .catch(() => {
        if (!active) return;
        setAvailableGroups([]);
      })
      .finally(() => {
        if (active) setLoadingGroups(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    setSchedulerEnabled(Boolean(config.scheduler_enabled));
    setMonitorIntervalMinutes(String(config.monitor_interval_minutes));
    setStatusCodes(listToText(config.monitored_status_codes));
    setSelectedGroupIds(Array.isArray(config.monitored_group_ids) ? config.monitored_group_ids : []);
    setIncludeUnassignedTickets(Boolean(config.include_unassigned_tickets));
    setMaxTickets(String(config.max_tickets_per_cycle));
    setLookbackDays(String(config.ticket_lookback_days));
    setIdleUrgent(String(config.idle_thresholds_minutes.urgent));
    setIdleHigh(String(config.idle_thresholds_minutes.high));
    setIdleMedium(String(config.idle_thresholds_minutes.medium));
    setIdleLow(String(config.idle_thresholds_minutes.low));
    setPendingAttention(String(config.pending_thresholds_hours.attention));
    setPendingHigh(String(config.pending_thresholds_hours.high));
    setPendingCritical(String(config.pending_thresholds_hours.critical));
  }, [config]);

  const filteredGroups = useMemo(() => {
    const query = normalizeText(groupSearch).trim();
    if (!query) return availableGroups;

    return availableGroups.filter((group) => {
      const source = normalizeText(`${group.name} ${group.completename} ${group.id}`);
      return source.includes(query);
    });
  }, [availableGroups, groupSearch]);

  const payload = useMemo<Partial<TicketMonitorConfig>>(
    () => ({
      scheduler_enabled: schedulerEnabled,
      monitor_interval_minutes: Math.max(1, Number(monitorIntervalMinutes || 5)),
      monitored_status_codes: textToNumberList(statusCodes),
      monitored_group_ids: Array.from(new Set(selectedGroupIds)).sort((a, b) => a - b),
      include_unassigned_tickets: includeUnassignedTickets,
      max_tickets_per_cycle: Math.max(1, Number(maxTickets || 200)),
      ticket_lookback_days: Math.max(1, Number(lookbackDays || 120)),
      idle_thresholds_minutes: {
        urgent: Math.max(1, Number(idleUrgent || 30)),
        high: Math.max(1, Number(idleHigh || 60)),
        medium: Math.max(1, Number(idleMedium || 240)),
        low: Math.max(1, Number(idleLow || 480)),
      },
      pending_thresholds_hours: {
        attention: Math.max(1, Number(pendingAttention || 24)),
        high: Math.max(1, Number(pendingHigh || 48)),
        critical: Math.max(1, Number(pendingCritical || 72)),
      },
    }),
    [
      schedulerEnabled,
      monitorIntervalMinutes,
      statusCodes,
      selectedGroupIds,
      includeUnassignedTickets,
      maxTickets,
      lookbackDays,
      idleUrgent,
      idleHigh,
      idleMedium,
      idleLow,
      pendingAttention,
      pendingHigh,
      pendingCritical,
    ]
  );

  const toggleGroupSelection = (groupId: number) => {
    setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const selectTiAndNagGroups = () => {
    const selected = availableGroups
      .filter((group) => {
        const text = normalizeText(`${group.name} ${group.completename}`);
        return /\bti\b/.test(text) || text.includes("nag");
      })
      .map((group) => Number(group.id))
      .filter((id) => Number.isFinite(id));
    setSelectedGroupIds(Array.from(new Set(selected)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuracoes do Monitor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Scheduler ativo</Label>
            <div className="flex items-center gap-3">
              <Switch checked={schedulerEnabled} onCheckedChange={setSchedulerEnabled} />
              <span className="text-sm text-muted-foreground">{schedulerEnabled ? "Ativo" : "Pausado"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Intervalo (minutos)</Label>
            <Input
              type="number"
              min={1}
              value={monitorIntervalMinutes}
              onChange={(e) => setMonitorIntervalMinutes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Status monitorados (codigos GLPI)</Label>
            <Input value={statusCodes} onChange={(e) => setStatusCodes(e.target.value)} placeholder="1,2,3,4" />
          </div>

          <div className="space-y-2">
            <Label>Maximo de tickets por ciclo</Label>
            <Input type="number" min={1} value={maxTickets} onChange={(e) => setMaxTickets(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Janela de busca em dias</Label>
            <Input type="number" min={1} value={lookbackDays} onChange={(e) => setLookbackDays(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <h4 className="text-sm font-semibold">Criterios da consulta GLPI</h4>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Incluir chamados sem responsavel</p>
              <p className="text-xs text-muted-foreground">Desative para ignorar chamados nao atribuidos.</p>
            </div>
            <Switch checked={includeUnassignedTickets} onCheckedChange={setIncludeUnassignedTickets} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectTiAndNagGroups}>
              Selecionar TI + NAG
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedGroupIds([])}>
              Limpar grupos
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Grupos monitorados</Label>
            <Input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Buscar grupo por nome..."
            />
            <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-2">
              {loadingGroups && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando grupos...
                </div>
              )}

              {!loadingGroups && filteredGroups.length === 0 && (
                <p className="text-sm text-muted-foreground py-1">Nenhum grupo encontrado.</p>
              )}

              {!loadingGroups &&
                filteredGroups.map((group) => {
                  const isChecked = selectedGroupIds.includes(Number(group.id));
                  return (
                    <label key={group.id} className="flex items-start gap-2 rounded p-1.5 hover:bg-muted/60 cursor-pointer">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleGroupSelection(Number(group.id))} />
                      <div className="text-sm leading-tight">
                        <div className="font-medium">{group.completename || group.name}</div>
                        <div className="text-xs text-muted-foreground">ID {group.id}</div>
                      </div>
                    </label>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
              Nenhum grupo selecionado = nenhuma coleta. Para seu cenario, selecione TI e NAG.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Tempo parado por prioridade (min)</h4>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Critica</Label>
              <Input type="number" min={1} value={idleUrgent} onChange={(e) => setIdleUrgent(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Alta</Label>
              <Input type="number" min={1} value={idleHigh} onChange={(e) => setIdleHigh(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Media</Label>
              <Input type="number" min={1} value={idleMedium} onChange={(e) => setIdleMedium(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Baixa</Label>
              <Input type="number" min={1} value={idleLow} onChange={(e) => setIdleLow(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Pendencia sem atualizacao (horas)</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Atencao</Label>
              <Input type="number" min={1} value={pendingAttention} onChange={(e) => setPendingAttention(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Alto</Label>
              <Input type="number" min={1} value={pendingHigh} onChange={(e) => setPendingHigh(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Critico</Label>
              <Input type="number" min={1} value={pendingCritical} onChange={(e) => setPendingCritical(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onSave(payload)} disabled={saving}>
            {saving ? "Salvando..." : "Salvar configuracoes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
