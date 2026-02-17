import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Ticket } from "@/types/ticket";
import { getTicketById } from "@/data/mockTickets";
import { fetchGLPITicket, loadGLPIConfig, getGLPIConfig } from "@/services/glpiService";
import { AddTicketForm } from "@/components/AddTicketForm";
import { TicketCard } from "@/components/TicketCard";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, X, GripVertical } from "lucide-react";

const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes

interface KanbanColumn {
  id: number;
  user_id: number;
  title: string;
  position: number;
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

const Index = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [hasApiConfig, setHasApiConfig] = useState(false);
  const ticketsRef = useRef<Ticket[]>([]);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Keep ref in sync for polling comparisons
  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const loadColumns = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.get<KanbanColumn[]>("/api/kanban-columns");
      setColumns(data ?? []);
    } catch (error) {
      console.error("Erro ao carregar colunas:", error);
    }
  }, [user]);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setIsLoadingTickets(true);

    try {
      const data = await api.get<Array<Record<string, unknown>>>("/api/tracked-tickets");

      const dbTickets: Ticket[] = (data ?? []).map((row) => ({
        id: String(row.ticket_id),
        title: String(row.title || ""),
        status: String(row.status || "new") as Ticket["status"],
        priority: String(row.priority || "medium") as Ticket["priority"],
        assignee: String(row.assignee ?? "Não atribuído"),
        requester: String(row.requester ?? ""),
        createdAt: String(row.glpi_created_at ?? row.created_at),
        updatedAt: String(row.glpi_updated_at ?? row.updated_at),
        hasNewUpdates: Boolean(row.has_new_updates),
        displayColumn: Number(row.display_column) || 0,
        updates: [],
      }));

      setTickets(dbTickets);
      setIsLoadingTickets(false);

      // Re-fetch full data from GLPI API in background to get updates/timeline
      if (!getGLPIConfig() || dbTickets.length === 0) return;

      const refreshed = await Promise.all(
        dbTickets.map(async (t) => {
          try {
            const fresh = await fetchGLPITicket(t.id);
            return fresh ? { ...fresh, hasNewUpdates: t.hasNewUpdates, displayColumn: t.displayColumn } : t;
          } catch {
            return t;
          }
        })
      );

      setTickets(refreshed);
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      setIsLoadingTickets(false);
    }
  }, [user]);

  // Poll tickets every 10 minutes to detect new updates
  const pollTickets = useCallback(async () => {
    if (!user || !getGLPIConfig()) return;
    const current = ticketsRef.current;
    if (current.length === 0) return;

    const updatedTickets: Ticket[] = [];
    const notifyList: Ticket[] = [];

    for (const t of current) {
      try {
        const fresh = await fetchGLPITicket(t.id);
        if (!fresh) {
          updatedTickets.push(t);
          continue;
        }

        const hasNew = fresh.updatedAt !== t.updatedAt;
        const ticket = { ...fresh, hasNewUpdates: hasNew || t.hasNewUpdates };
        updatedTickets.push(ticket);

        if (hasNew) {
          notifyList.push(ticket);
          // Persist has_new_updates in DB
          await api.patch(`/api/tracked-tickets/${ticket.id}`, {
            has_new_updates: true,
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assignee,
            glpi_updated_at: ticket.updatedAt,
          });
        }
      } catch {
        updatedTickets.push(t);
      }
    }

    setTickets(updatedTickets);

    // Browser notifications
    if (notifyList.length === 1) {
      const t = notifyList[0];
      showNotification(
        `Chamado #${t.id} atualizado`,
        t.title
      );
    } else if (notifyList.length > 1) {
      showNotification(
        `${notifyList.length} chamados atualizados`,
        notifyList.map((t) => `#${t.id}`).join(", ")
      );
    }
  }, [user]);

  useEffect(() => {
    // Load columns first, then tickets
    loadColumns().then(() => loadTickets());
  }, [loadColumns, loadTickets]);

  // Start polling interval
  useEffect(() => {
    const interval = setInterval(pollTickets, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pollTickets]);

  useEffect(() => {
    loadGLPIConfig().then((config) => setHasApiConfig(!!config));
  }, []);

  const handleAddTicket = async (ticketId: string) => {
    if (!user) return;

    if (tickets.some((t) => t.id === ticketId)) {
      toast({
        title: "Chamado já adicionado",
        description: `O chamado #${ticketId} já está sendo acompanhado.`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      let ticket: Ticket | null = null;

      if (hasApiConfig) {
        try {
          ticket = await fetchGLPITicket(ticketId);
        } catch (error) {
          console.error("Erro na API GLPI:", error);
          toast({
            title: "Erro na API GLPI",
            description: error instanceof Error ? error.message : "Erro ao conectar com a API",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      } else {
        ticket = await getTicketById(ticketId);
      }

      if (ticket) {
        // Place in first column by default
        const firstCol = columns[0];
        const displayColumn = firstCol ? firstCol.id : 0;

        try {
          await api.post("/api/tracked-tickets", {
            ticket_id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            priority: ticket.priority,
            assignee: ticket.assignee,
            requester: ticket.requester,
            has_new_updates: false,
            glpi_created_at: ticket.createdAt,
            glpi_updated_at: ticket.updatedAt,
            display_column: displayColumn,
          });
          setTickets((prev) => [{ ...ticket!, displayColumn }, ...prev]);
          toast({
            title: "Chamado adicionado",
            description: `O chamado #${ticketId} foi adicionado com sucesso.`,
          });
        } catch (err) {
          toast({
            title: "Erro ao salvar chamado",
            description: err instanceof Error ? err.message : "Erro desconhecido",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Chamado não encontrado",
          description: `Não foi possível encontrar o chamado #${ticketId}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar chamado",
        description: "Ocorreu um erro ao buscar o chamado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTicket = async (ticketId: string) => {
    if (!user) return;

    try {
      await api.delete(`/api/tracked-tickets/${ticketId}`);
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      toast({
        title: "Chamado removido",
        description: `O chamado #${ticketId} foi removido do acompanhamento.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao remover chamado",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetColumn: number) => {
    e.preventDefault();
    setDragOverColumn(null);
    const ticketId = e.dataTransfer.getData("text/plain");
    if (!ticketId) return;

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.displayColumn === targetColumn) return;

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, displayColumn: targetColumn } : t
      )
    );

    try {
      await api.patch(`/api/tracked-tickets/${ticketId}`, { display_column: targetColumn });
    } catch {
      // Revert on failure
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, displayColumn: ticket.displayColumn } : t
        )
      );
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleMarkAsRead = async (ticketId: string) => {
    if (!user) return;

    await api.patch(`/api/tracked-tickets/${ticketId}`, { has_new_updates: false });

    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, hasNewUpdates: false } : t
      )
    );
  };

  const handleAddColumn = async () => {
    try {
      const col = await api.post<KanbanColumn>("/api/kanban-columns", { title: "Nova coluna" });
      if (col) setColumns((prev) => [...prev, col]);
    } catch {
      toast({ title: "Erro ao criar coluna", variant: "destructive" });
    }
  };

  const handleRenameColumn = async (colId: number) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setEditingColumnId(null);
      return;
    }

    try {
      await api.patch(`/api/kanban-columns/${colId}`, { title: trimmed });
      setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, title: trimmed } : c));
    } catch {
      toast({ title: "Erro ao renomear coluna", variant: "destructive" });
    }
    setEditingColumnId(null);
  };

  const handleDeleteColumn = async (colId: number) => {
    if (columns.length <= 1) {
      toast({ title: "Não é possível remover a última coluna", variant: "destructive" });
      return;
    }

    try {
      const result = await api.delete<{ success: boolean; movedTo: number }>(`/api/kanban-columns/${colId}`);
      setColumns((prev) => prev.filter((c) => c.id !== colId));
      // Move tickets locally to the fallback column
      if (result?.movedTo) {
        setTickets((prev) =>
          prev.map((t) => t.displayColumn === colId ? { ...t, displayColumn: result.movedTo } : t)
        );
      }
    } catch {
      toast({ title: "Erro ao remover coluna", variant: "destructive" });
    }
  };

  // Column drag & drop for reordering
  const [draggedColId, setDraggedColId] = useState<number | null>(null);
  const [dragOverColId, setDragOverColId] = useState<number | null>(null);

  const handleColumnDragStart = (e: DragEvent<HTMLDivElement>, colId: number) => {
    e.dataTransfer.setData("application/kanban-column", String(colId));
    e.dataTransfer.effectAllowed = "move";
    setDraggedColId(colId);
  };

  const handleColumnDragOver = (e: DragEvent<HTMLDivElement>, colId: number) => {
    if (!e.dataTransfer.types.includes("application/kanban-column")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColId(colId);
  };

  const handleColumnDrop = async (e: DragEvent<HTMLDivElement>, targetColId: number) => {
    e.preventDefault();
    setDragOverColId(null);
    setDraggedColId(null);
    const sourceId = Number(e.dataTransfer.getData("application/kanban-column"));
    if (!sourceId || sourceId === targetColId) return;

    const oldColumns = [...columns];
    const sourceIdx = columns.findIndex((c) => c.id === sourceId);
    const targetIdx = columns.findIndex((c) => c.id === targetColId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // Reorder locally
    const reordered = [...columns];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setColumns(reordered);

    try {
      await api.put("/api/kanban-columns/reorder", { order: reordered.map((c) => c.id) });
    } catch {
      setColumns(oldColumns);
    }
  };

  if (isLoadingTickets) {
    return (
      <div className="w-full px-4 py-6 space-y-6">
        <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          Carregando chamados...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 space-y-6">
      <AddTicketForm onAddTicket={handleAddTicket} isLoading={isLoading} />

      {tickets.length === 0 && columns.length <= 2 ? (
        <EmptyState />
      ) : (
        <div className="flex overflow-x-auto gap-4 pb-4">
          {columns.map((col) => {
            const colTickets = tickets.filter((t) => t.displayColumn === col.id);
            const isDropTarget = dragOverColumn === col.id;
            const isColDragTarget = dragOverColId === col.id && draggedColId !== col.id;

            return (
              <div
                key={col.id}
                className={`flex-shrink-0 min-w-[350px] w-[350px] flex flex-col rounded-lg border bg-muted/30 transition-all ${
                  isColDragTarget ? "ring-2 ring-primary/50" : ""
                }`}
                draggable
                onDragStart={(e) => handleColumnDragStart(e, col.id)}
                onDragOver={(e) => handleColumnDragOver(e, col.id)}
                onDragLeave={() => setDragOverColId(null)}
                onDrop={(e) => {
                  if (e.dataTransfer.types.includes("application/kanban-column")) {
                    handleColumnDrop(e, col.id);
                  } else {
                    handleDrop(e, col.id);
                  }
                }}
                onDragEnd={() => { setDraggedColId(null); setDragOverColId(null); }}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                  {editingColumnId === col.id ? (
                    <input
                      className="flex-1 bg-transparent border-b border-primary text-sm font-semibold outline-none"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleRenameColumn(col.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameColumn(col.id);
                        if (e.key === "Escape") setEditingColumnId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm font-semibold cursor-pointer truncate"
                      onDoubleClick={() => {
                        setEditingColumnId(col.id);
                        setEditingTitle(col.title);
                      }}
                      title="Clique duplo para renomear"
                    >
                      {col.title}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{colTickets.length}</span>
                  {columns.length > 1 && (
                    <button
                      onClick={() => handleDeleteColumn(col.id)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover coluna"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Column body — drop zone */}
                <div
                  className={`flex-1 space-y-3 p-3 min-h-[200px] transition-colors ${
                    isDropTarget ? "bg-accent/50 ring-2 ring-primary/30 rounded-b-lg" : ""
                  }`}
                  onDragOver={(e) => {
                    // Only highlight for ticket drags, not column drags
                    if (e.dataTransfer.types.includes("application/kanban-column")) return;
                    handleDragOver(e);
                    setDragOverColumn(col.id);
                  }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => {
                    if (e.dataTransfer.types.includes("application/kanban-column")) return;
                    handleDrop(e, col.id);
                  }}
                >
                  {colTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onRemove={handleRemoveTicket}
                      onMarkAsRead={handleMarkAsRead}
                    />
                  ))}
                  {colTickets.length === 0 && (
                    <div className="flex items-center justify-center h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg text-sm text-muted-foreground">
                      Arraste chamados para cá
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add column button */}
          <div className="flex-shrink-0 min-w-[200px] flex items-start pt-2">
            <button
              onClick={handleAddColumn}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nova coluna
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
