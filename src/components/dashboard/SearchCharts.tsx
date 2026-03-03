import { type ChartConfig } from "@/components/ui/chart";
import { type ChartElementId } from "@/types/dashboard";
import { KpiCards } from "./KpiCards";
import { StatusChart } from "./StatusChart";
import { PriorityChart } from "./PriorityChart";
import { TechnicianChart } from "./TechnicianChart";
import { TagChart } from "./TagChart";
import { TimelineChart } from "./TimelineChart";

interface SearchChartsProps {
  kpis: { total: number; abertos: number; pendentes: number; resolvidos: number };
  statusData: { name: string; value: number; fill: string }[];
  statusChartConfig: ChartConfig;
  priorityData: { name: string; value: number; fill: string }[];
  priorityChartConfig: ChartConfig;
  techData: { name: string; value: number }[];
  techChartConfig: ChartConfig;
  tagData: { name: string; value: number }[];
  tagChartConfig: ChartConfig;
  dailyData: { date: string; label: string; value: number }[];
  dailyChartConfig: ChartConfig;
  visibleCharts?: ChartElementId[];
}

export function SearchCharts({
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
  visibleCharts,
}: SearchChartsProps) {
  const show = (id: ChartElementId) => !visibleCharts || visibleCharts.includes(id);

  return (
    <div className="space-y-4">
      {show("kpis") && <KpiCards {...kpis} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {show("status") && <StatusChart data={statusData} config={statusChartConfig} />}
        {show("priority") && <PriorityChart data={priorityData} config={priorityChartConfig} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {show("technician") && <TechnicianChart data={techData} config={techChartConfig} />}
        {show("tags") && <TagChart data={tagData} config={tagChartConfig} />}
      </div>

      {show("timeline") && <TimelineChart data={dailyData} config={dailyChartConfig} />}
    </div>
  );
}
