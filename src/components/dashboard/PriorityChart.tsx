import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid } from "recharts";

interface PriorityChartProps {
  data: { name: string; value: number; fill: string }[];
  config: ChartConfig;
}

export function PriorityChart({ data, config }: PriorityChartProps) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribuição por Prioridade</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="max-h-[300px]">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
