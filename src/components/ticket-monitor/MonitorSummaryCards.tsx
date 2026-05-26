import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ClipboardCheck, Flame, UserX, PauseCircle, RotateCcw } from "lucide-react";
import { MonitorSummary } from "@/types/ticketMonitor";

interface MonitorSummaryCardsProps {
  summary: MonitorSummary | null;
}

const cardItems = [
  { key: "total_monitorado", title: "Total monitorado", icon: ClipboardCheck },
  { key: "em_risco", title: "Em risco", icon: AlertTriangle },
  { key: "criticos", title: "Criticos", icon: Flame },
  { key: "sem_responsavel", title: "Sem responsavel", icon: UserX },
  { key: "parados", title: "Parados", icon: PauseCircle },
  { key: "reabertos", title: "Reabertos", icon: RotateCcw },
] as const;

export function MonitorSummaryCards({ summary }: MonitorSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cardItems.map((item) => {
        const value = summary ? Number(summary[item.key]) || 0 : 0;
        const Icon = item.icon;
        return (
          <Card key={item.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>{item.title}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

