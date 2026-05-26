import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VitalChartProps {
  title: string;
  data: any[];
  dataKey: string;
  color: string;
  unit: string;
  minValue?: number;
  maxValue?: number;
}

export function VitalChart({ title, data, dataKey, color, unit, minValue, maxValue }: VitalChartProps) {
  return (
    <Card className="bg-card shadow-sm h-full flex flex-col">
      <CardHeader className="py-3 px-4 pb-0 shrink-0">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
            {unit}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-1 min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis 
              dataKey="recordedAt" 
              tickFormatter={(val) => {
                const date = new Date(val);
                return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
              }}
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickMargin={8}
            />
            <YAxis 
              domain={[minValue || 'auto', maxValue || 'auto']} 
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickFormatter={(val) => Math.round(val).toString()}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              itemStyle={{ color: color, fontWeight: 'bold' }}
              labelFormatter={(label) => new Date(label).toLocaleTimeString()}
              formatter={(value: number) => [`${value} ${unit}`, title]}
            />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={2} 
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
