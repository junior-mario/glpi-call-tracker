import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonitorTicketAnalysis } from "@/types/ticketMonitor";

interface MonitorTicketsTableProps {
  rows: MonitorTicketAnalysis[];
  onOpenDetail: (ticketId: string) => void;
}

function riskClass(risk: string): string {
  switch (risk) {
    case "CRITICO":
      return "bg-red-500/15 text-red-700";
    case "ALTO":
      return "bg-orange-500/15 text-orange-700";
    case "ATENCAO":
      return "bg-yellow-500/15 text-yellow-700";
    default:
      return "bg-emerald-500/15 text-emerald-700";
  }
}

function queueClass(queue: string): string {
  switch (queue) {
    case "ACAO_IMEDIATA":
      return "bg-red-500/15 text-red-700";
    case "COBRANCA":
      return "bg-amber-500/15 text-amber-700";
    case "REVISAO":
      return "bg-violet-500/15 text-violet-700";
    default:
      return "bg-emerald-500/15 text-emerald-700";
  }
}

function formatPriority(priority: string): string {
  const p = String(priority || "").toLowerCase();
  if (p === "urgent") return "Critica";
  if (p === "high") return "Alta";
  if (p === "medium") return "Media";
  return "Baixa";
}

function formatStatus(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "in-progress") return "Em andamento";
  if (s === "pending") return "Pendente";
  if (s === "new") return "Novo";
  if (s === "resolved") return "Resolvido";
  if (s === "closed") return "Fechado";
  if (s === "reopened") return "Reaberto";
  return status || "-";
}

function formatIdle(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return "<1min";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

export function MonitorTicketsTable({ rows, onOpenDetail }: MonitorTicketsTableProps) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Nenhum ticket monitorado.</div>;
  }

  return (
    <div className="rounded-md border bg-card">
      <Table className="min-w-[1560px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[96px] whitespace-nowrap">ID</TableHead>
            <TableHead className="min-w-[360px]">Titulo</TableHead>
            <TableHead className="w-[150px]">Status</TableHead>
            <TableHead className="w-[120px]">Prioridade</TableHead>
            <TableHead className="min-w-[220px]">Responsavel</TableHead>
            <TableHead className="min-w-[220px]">Grupo</TableHead>
            <TableHead className="w-[150px]">Sem atualizacao</TableHead>
            <TableHead className="w-[120px]">Risco</TableHead>
            <TableHead className="w-[160px]">Fila</TableHead>
            <TableHead className="min-w-[300px]">Acao recomendada</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.ticket_id}-${row.analysis_timestamp}`}>
              <TableCell className="font-medium whitespace-nowrap">#{row.ticket_id}</TableCell>
              <TableCell className="min-w-[360px] max-w-[620px] whitespace-normal break-words leading-snug" title={row.title}>
                {row.title || "(Sem titulo)"}
              </TableCell>
              <TableCell>{formatStatus(row.current_status)}</TableCell>
              <TableCell>{formatPriority(row.current_priority)}</TableCell>
              <TableCell className="whitespace-normal break-words leading-snug" title={row.technician_name}>
                {row.technician_name || "-"}
              </TableCell>
              <TableCell className="whitespace-normal break-words leading-snug" title={row.group_name}>
                {row.group_name || "-"}
              </TableCell>
              <TableCell>{formatIdle(Number(row.minutes_since_last_interaction || 0))}</TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${riskClass(row.operational_risk)}`}>
                  {row.operational_risk}
                </span>
              </TableCell>
              <TableCell>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${queueClass(row.queue_name)}`}>
                  {row.queue_name}
                </span>
              </TableCell>
              <TableCell className="min-w-[300px] max-w-[520px] whitespace-normal break-words leading-snug" title={row.recommended_action}>
                {row.recommended_action || "-"}
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => onOpenDetail(row.ticket_id)}>
                  Detalhe
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
