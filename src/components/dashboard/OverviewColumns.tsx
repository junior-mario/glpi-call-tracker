import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, XCircle, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { TrackedTicketRow } from "@/types/dashboard";
import { OverviewTicketCard } from "./OverviewTicketCard";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

type SortField = "date" | "priority" | "status" | "technician";
type SortDir = "asc" | "desc";
interface SortState { field: SortField; dir: SortDir; }

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 5, very_high: 5, high: 4, medium: 3, low: 2, very_low: 1,
};
const STATUS_ORDER: Record<string, number> = {
  new: 1, "in-progress": 2, pending: 3, resolved: 4, closed: 5,
};

const SORT_LABELS: Record<SortField, string> = {
  date: "Data",
  priority: "Prior.",
  status: "Status",
  technician: "Téc.",
};

function sortTickets(
  tickets: TrackedTicketRow[],
  field: SortField,
  dir: SortDir,
  dateKey: "glpi_created_at" | "glpi_updated_at"
): TrackedTicketRow[] {
  const sorted = [...tickets].sort((a, b) => {
    switch (field) {
      case "date":
        return (a[dateKey] ?? "").localeCompare(b[dateKey] ?? "");
      case "priority":
        return (PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0);
      case "status":
        return (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
      case "technician":
        return (a.assignee ?? "").localeCompare(b.assignee ?? "");
    }
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

function SortButtons({ sort, onSort }: { sort: SortState; onSort: (field: SortField) => void }) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {(Object.keys(SORT_LABELS) as SortField[]).map((field) => {
        const isActive = sort.field === field;
        return (
          <button
            key={field}
            className={`inline-flex items-center h-5 px-1.5 rounded text-[10px] transition-colors ${
              isActive
                ? "text-foreground/70 font-medium"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
            onClick={() => onSort(field)}
          >
            {SORT_LABELS[field]}
            {isActive && (sort.dir === "desc" ? <ArrowDown className="h-2.5 w-2.5 ml-0.5" /> : <ArrowUp className="h-2.5 w-2.5 ml-0.5" />)}
          </button>
        );
      })}
    </div>
  );
}

interface OverviewColumnsProps {
  recentOpened: TrackedTicketRow[];
  recentClosed: TrackedTicketRow[];
  recentUpdated: TrackedTicketRow[];
  onTicketClick: (ticketId: string) => void;
}

function OpenedCards({ tickets, onTicketClick }: { tickets: TrackedTicketRow[]; onTicketClick: (id: string) => void }) {
  return tickets.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">Nenhum chamado</p>
  ) : (
    <div className="space-y-2">
      {tickets.map((t) => (
        <OverviewTicketCard
          key={t.ticket_id}
          ticket={t}
          dateLabel={t.glpi_created_at ? format(new Date(t.glpi_created_at), "dd/MM/yy", { locale: ptBR }) : ""}
          onTicketClick={onTicketClick}
        />
      ))}
    </div>
  );
}

function ClosedCards({ tickets, onTicketClick }: { tickets: TrackedTicketRow[]; onTicketClick: (id: string) => void }) {
  return tickets.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">Nenhum chamado fechado</p>
  ) : (
    <div className="space-y-2">
      {tickets.map((t) => (
        <OverviewTicketCard
          key={t.ticket_id}
          ticket={t}
          dateLabel={t.glpi_updated_at ? format(new Date(t.glpi_updated_at), "dd/MM/yy", { locale: ptBR }) : ""}
          onTicketClick={onTicketClick}
        />
      ))}
    </div>
  );
}

function UpdatedCards({ tickets, onTicketClick }: { tickets: TrackedTicketRow[]; onTicketClick: (id: string) => void }) {
  return tickets.length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">Nenhum chamado</p>
  ) : (
    <div className="space-y-2">
      {tickets.map((t) => {
        const days = t.glpi_updated_at ? differenceInDays(new Date(), new Date(t.glpi_updated_at)) : 0;
        const label = days === 0 ? "Hoje" : days === 1 ? "1 dia" : `${days}d`;
        return (
          <OverviewTicketCard
            key={t.ticket_id}
            ticket={t}
            dateLabel={label}
            onTicketClick={onTicketClick}
          />
        );
      })}
    </div>
  );
}

export function OverviewColumns({ recentOpened, recentClosed, recentUpdated, onTicketClick }: OverviewColumnsProps) {
  const isMobile = useIsMobile();

  const [openedSort, setOpenedSort] = useState<SortState>({ field: "date", dir: "desc" });
  const [updatedSort, setUpdatedSort] = useState<SortState>({ field: "date", dir: "desc" });
  const [closedSort, setClosedSort] = useState<SortState>({ field: "date", dir: "desc" });

  const handleSort = (setter: React.Dispatch<React.SetStateAction<SortState>>) => (field: SortField) => {
    setter((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { field, dir: "desc" }
    );
  };

  const sortedOpened = useMemo(
    () => sortTickets(recentOpened, openedSort.field, openedSort.dir, "glpi_created_at").slice(0, 15),
    [recentOpened, openedSort]
  );
  const sortedUpdated = useMemo(
    () => sortTickets(recentUpdated, updatedSort.field, updatedSort.dir, "glpi_updated_at").slice(0, 15),
    [recentUpdated, updatedSort]
  );
  const sortedClosed = useMemo(
    () => sortTickets(recentClosed, closedSort.field, closedSort.dir, "glpi_updated_at").slice(0, 15),
    [recentClosed, closedSort]
  );

  if (isMobile) {
    return (
      <Tabs defaultValue="opened">
        <TabsList className="w-full">
          <TabsTrigger value="opened" className="flex-1">Abertos</TabsTrigger>
          <TabsTrigger value="updated" className="flex-1">Atualizados</TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">Fechados</TabsTrigger>
        </TabsList>
        <TabsContent value="opened" className="space-y-2">
          <SortButtons sort={openedSort} onSort={handleSort(setOpenedSort)} />
          <OpenedCards tickets={sortedOpened} onTicketClick={onTicketClick} />
        </TabsContent>
        <TabsContent value="updated" className="space-y-2">
          <SortButtons sort={updatedSort} onSort={handleSort(setUpdatedSort)} />
          <UpdatedCards tickets={sortedUpdated} onTicketClick={onTicketClick} />
        </TabsContent>
        <TabsContent value="closed" className="space-y-2">
          <SortButtons sort={closedSort} onSort={handleSort(setClosedSort)} />
          <ClosedCards tickets={sortedClosed} onTicketClick={onTicketClick} />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-500" />
            Últimos abertos
          </CardTitle>
          <SortButtons sort={openedSort} onSort={handleSort(setOpenedSort)} />
        </CardHeader>
        <CardContent className="pt-0">
          <OpenedCards tickets={sortedOpened} onTicketClick={onTicketClick} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-500" />
            Últimos atualizados
          </CardTitle>
          <SortButtons sort={updatedSort} onSort={handleSort(setUpdatedSort)} />
        </CardHeader>
        <CardContent className="pt-0">
          <UpdatedCards tickets={sortedUpdated} onTicketClick={onTicketClick} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4 text-gray-500" />
            Últimos fechados
          </CardTitle>
          <SortButtons sort={closedSort} onSort={handleSort(setClosedSort)} />
        </CardHeader>
        <CardContent className="pt-0">
          <ClosedCards tickets={sortedClosed} onTicketClick={onTicketClick} />
        </CardContent>
      </Card>
    </div>
  );
}
