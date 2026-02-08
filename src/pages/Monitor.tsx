import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Search, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GLPIGroupResponse, MonitorTicket } from "@/types/glpi";
import {
  fetchGLPIGroups,
  fetchGLPITicket,
  searchTicketsByGroup,
  loadGLPIConfig,
  mapGLPIStatus,
  mapGLPIPriority,
} from "@/services/glpiService";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const FILTERS_CACHE_KEY = "glpi-monitor-filters";

interface CachedFilters {
  group: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  priority: string;
  technician: string;
  tag: string;
}

function loadCachedFilters(): CachedFilters | null {
  try {
    const raw = sessionStorage.getItem(FILTERS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedFilters(filters: CachedFilters): void {
  sessionStorage.setItem(FILTERS_CACHE_KEY, JSON.stringify(filters));
}

const Monitor = () => {
  const { user } = useAuth();
  const cached = loadCachedFilters();
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>(cached?.group ?? "");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    cached?.dateFrom ? new Date(cached.dateFrom) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    cached?.dateTo ? new Date(cached.dateTo) : undefined
  );
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingTicketId, setAddingTicketId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(cached?.status ?? "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(cached?.priority ?? "all");
  const [technicianFilter, setTechnicianFilter] = useState<string>(cached?.technician ?? "all");
  const [tagFilter, setTagFilter] = useState<string>(cached?.tag ?? "all");
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  // Persist filter choices to sessionStorage
  useEffect(() => {
    saveCachedFilters({
      group: selectedGroup,
      dateFrom: dateFrom ? dateFrom.toISOString() : null,
      dateTo: dateTo ? dateTo.toISOString() : null,
      status: statusFilter,
      priority: priorityFilter,
      technician: technicianFilter,
      tag: tagFilter,
    });
  }, [selectedGroup, dateFrom, dateTo, statusFilter, priorityFilter, technicianFilter, tagFilter]);

  // Load tracked IDs from Supabase
  useEffect(() => {
    if (!user) return;

    supabase
      .from("tracked_tickets")
      .select("ticket_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          setTrackedIds(new Set(data.map((r) => r.ticket_id)));
        }
      });
  }, [user]);

  // Load config and groups
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
      const groupId = selectedGroup && selectedGroup !== "all" ? Number(selectedGroup) : null;
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

  const handleAddToTracker = async (ticketId: number) => {
    if (!user) return;
    const id = String(ticketId);
    if (trackedIds.has(id)) return;

    setAddingTicketId(ticketId);
    try {
      const ticket = await fetchGLPITicket(id);
      if (!ticket) {
        toast({
          title: "Chamado não encontrado",
          description: `Não foi possível carregar o chamado #${id}.`,
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("tracked_tickets").upsert({
        user_id: user.id,
        ticket_id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        assignee: ticket.assignee,
        requester: ticket.requester,
        has_new_updates: false,
        glpi_created_at: ticket.createdAt,
        glpi_updated_at: ticket.updatedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,ticket_id" });

      if (error) {
        toast({
          title: "Erro ao adicionar chamado",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setTrackedIds((prev) => new Set(prev).add(id));
      toast({
        title: "Chamado adicionado",
        description: `O chamado #${id} foi adicionado ao acompanhamento.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao adicionar chamado",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setAddingTicketId(null);
    }
  };

  // Extract unique technician names from results for the filter dropdown
  const technicianOptions = Array.from(
    new Set(tickets.map((t) => t.technician).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Extract unique tags from results for the filter dropdown
  const tagOptions = Array.from(
    new Set(
      tickets
        .flatMap((t) => t.tags.split(/,\s*|;\s*|\$\$/).map((s) => s.trim()))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter === "unsolved") {
      if (t.status === 5 || t.status === 6) return false;
    } else if (statusFilter !== "all") {
      const filterNum = Number(statusFilter);
      if (filterNum === 3 ? t.status !== 3 && t.status !== 4 : t.status !== filterNum) return false;
    }
    if (priorityFilter !== "all" && t.priority !== Number(priorityFilter)) return false;
    if (technicianFilter !== "all" && t.technician !== technicianFilter) return false;
    if (tagFilter !== "all" && !t.tags.toLowerCase().includes(tagFilter.toLowerCase())) return false;
    return true;
  });

  if (!configLoaded) {
    return (
      <div className="container max-w-5xl py-6">
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
      <div className="container max-w-5xl py-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Configure a API GLPI em <strong>Configurações</strong> para usar o monitoramento.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Group selector */}
            <div className="flex flex-col gap-1.5 min-w-[220px] flex-1">
              <Label htmlFor="group-select">Grupo Técnico</Label>
              <Select
                value={selectedGroup}
                onValueChange={setSelectedGroup}
                disabled={isLoadingGroups}
              >
                <SelectTrigger id="group-select">
                  <SelectValue
                    placeholder={isLoadingGroups ? "Carregando..." : "Selecione um grupo"}
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

            {/* Date From */}
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

            {/* Date To */}
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

            {/* Status filter */}
            <div className="flex flex-col gap-1.5 min-w-[160px]">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="unsolved">Não solucionados</SelectItem>
                  <SelectItem value="1">Novo</SelectItem>
                  <SelectItem value="2">Em andamento</SelectItem>
                  <SelectItem value="3">Pendente</SelectItem>
                  <SelectItem value="5">Resolvido</SelectItem>
                  <SelectItem value="6">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority filter */}
            <div className="flex flex-col gap-1.5 min-w-[160px]">
              <Label htmlFor="priority-filter">Prioridade</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger id="priority-filter">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="1">Muito baixa</SelectItem>
                  <SelectItem value="2">Baixa</SelectItem>
                  <SelectItem value="3">Média</SelectItem>
                  <SelectItem value="4">Alta</SelectItem>
                  <SelectItem value="5">Muito alta</SelectItem>
                  <SelectItem value="6">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Technician filter */}
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label htmlFor="technician-filter">Técnico</Label>
              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger id="technician-filter">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {technicianOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tag filter */}
            {tagOptions.length > 0 && (
              <div className="flex flex-col gap-1.5 min-w-[160px]">
                <Label htmlFor="tag-filter">Tag</Label>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger id="tag-filter">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {tagOptions.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Search button */}
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

      {/* Results */}
      {isSearching && (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Buscando chamados...
          </CardContent>
        </Card>
      )}

      {!isSearching && hasSearched && filteredTickets.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum chamado encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      )}

      {!isSearching && filteredTickets.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {filteredTickets.length} chamado{filteredTickets.length !== 1 ? "s" : ""} encontrado{filteredTickets.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-[150px]">Técnico</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[110px]">Prioridade</TableHead>
                    <TableHead className="w-[120px]">Abertura</TableHead>
                    <TableHead className="w-[120px]">Atualização</TableHead>
                    <TableHead className="w-[150px]">Tags</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.id}</TableCell>
                      <TableCell>{ticket.name}</TableCell>
                      <TableCell className="text-sm">{ticket.technician || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge status={mapGLPIStatus(ticket.status)} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={mapGLPIPriority(ticket.priority)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ticket.date
                          ? format(new Date(ticket.date), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ticket.date_mod
                          ? format(new Date(ticket.date_mod), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ticket.tags ? (
                          <div className="flex flex-wrap gap-1">
                            {ticket.tags.split(/,\s*|;\s*|\$\$/).filter(Boolean).map((tag, i) => (
                              <span
                                key={i}
                                className="inline-block bg-muted text-muted-foreground px-2 py-0.5 rounded text-xs"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {trackedIds.has(String(ticket.id)) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center h-8 w-8">
                                <Check className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>Já acompanhado</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={addingTicketId === ticket.id}
                                onClick={() => handleAddToTracker(ticket.id)}
                              >
                                {addingTicketId === ticket.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Acompanhar chamado</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Monitor;
