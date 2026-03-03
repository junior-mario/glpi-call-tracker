import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface TechnicianChartProps {
  data: { name: string; value: number }[];
  config: ChartConfig;
}

export function TechnicianChart({ data, config }: TechnicianChartProps) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chamados por Técnico</CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ChartContainer
          config={config}
          className="!aspect-auto max-h-[350px] w-full"
          style={{ height: Math.max(200, data.length * 40) }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={110}
              fontSize={11}
              tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "\u2026" : v)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
