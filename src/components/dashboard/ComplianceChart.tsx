import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Aug', compliance: 94 },
  { month: 'Sep', compliance: 96 },
  { month: 'Oct', compliance: 95 },
  { month: 'Nov', compliance: 97 },
  { month: 'Dec', compliance: 96 },
  { month: 'Jan', compliance: 98 },
];

const ComplianceChart = () => {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Compliance Trend</h3>
        <p className="text-sm text-muted-foreground">Average coverage across all sites</p>
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="complianceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(32, 95%, 52%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(32, 95%, 52%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 12 }}
            />
            <YAxis 
              domain={[90, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(220, 13%, 91%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelStyle={{ color: 'hsl(222, 47%, 11%)', fontWeight: 600 }}
              formatter={(value: number) => [`${value}%`, 'Compliance']}
            />
            <Area 
              type="monotone" 
              dataKey="compliance" 
              stroke="hsl(32, 95%, 52%)" 
              strokeWidth={2}
              fill="url(#complianceGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ComplianceChart;
