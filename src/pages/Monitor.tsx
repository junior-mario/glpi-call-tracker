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
  getGLPIConfig,
  mapGLPIStatus,
  mapGLPIPriority,
} from "@/services/glpiService";
import { Ticket } from "@/types/ticket";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "glpi-tracker-tickets";

const Monitor = () => {
  const [groups, setGroups] = useState<GLPIGroupResponse[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [tickets, setTickets] = useState<MonitorTicket[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingTicketId, setAddingTicketId] = useState<number | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return new Set();
    const list: Ticket[] = JSON.parse(saved);
    return new Set(list.map((t) => t.id));
  });

  useEffect(() => {
    if (!getGLPIConfig()) return;

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
  }, []);

  const handleSearch = async () => {
    if (!selectedGroup || !dateFrom || !dateTo) {
      toast({
        title: "Preencha todos os filtros",
        description: "Selecione um grupo e o período de datas.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const from = format(dateFrom, "yyyy-MM-dd");
      const to = format(dateTo, "yyyy-MM-dd");
      const result = await searchTicketsByGroup(Number(selectedGroup), from, to);
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

      const saved = localStorage.getItem(STORAGE_KEY);
      const current: Ticket[] = saved ? JSON.parse(saved) : [];
      if (current.some((t) => t.id === id)) {
        setTrackedIds((prev) => new Set(prev).add(id));
        return;
      }

      current.unshift(ticket);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
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

  if (!getGLPIConfig()) {
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

      {!isSearching && hasSearched && tickets.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum chamado encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      )}

      {!isSearching && tickets.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {tickets.length} chamado{tickets.length !== 1 ? "s" : ""} encontrado{tickets.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[110px]">Prioridade</TableHead>
                    <TableHead className="w-[120px]">Abertura</TableHead>
                    <TableHead className="w-[120px]">Atualização</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.id}</TableCell>
                      <TableCell>{ticket.name}</TableCell>
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
