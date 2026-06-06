import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { Empty } from "../components/ui/Table";

const PIE_COLORS = ["#16a34a", "#f59e0b", "#dc2626"];

export default function Analytics() {
  const dashboard = useAsync(() => endpoints.dashboard(), []);
  const reliability = useAsync(() => endpoints.reliability(), []);
  const responseTrend = useAsync(() => endpoints.responseTrend(14), []);
  const failures = useAsync(() => endpoints.failures(14), []);

  const supplyData = dashboard.data
    ? Object.entries(dashboard.data.blood_supply).map(([bg, count]) => ({
        name: bg.replace("Positive", "+").replace("Negative", "-"),
        eligible: count,
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Operational metrics over the last 14 days"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Eligible Donors by Blood Group">
          <div className="h-72">
            {dashboard.loading ? <Empty message="Loading…" /> : (
              <ResponsiveContainer>
                <BarChart data={supplyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="eligible" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        <Section title="Donor Reliability Distribution">
          <div className="h-72">
            {reliability.loading ? <Empty message="Loading…" /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={reliability.data}
                    dataKey="count"
                    nameKey="range"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {reliability.data?.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        <Section title="Outreach Response Trend (14d)" className="lg:col-span-2">
          <div className="h-72">
            {responseTrend.loading ? <Empty message="Loading…" /> : responseTrend.data?.length === 0 ? (
              <Empty message="No outreach activity in the last 14 days" />
            ) : (
              <ResponsiveContainer>
                <LineChart data={responseTrend.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="responded" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="accepted" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        <Section title="Failure Trends" subtitle="By blood group + city" className="lg:col-span-2">
          {failures.data?.length === 0 ? (
            <Empty message="No failures recorded yet — system performing nominally" />
          ) : (
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Blood Group</th>
                    <th className="text-left px-4 py-2 font-medium">City</th>
                    <th className="text-left px-4 py-2 font-medium">Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.data?.map((f, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      <td className="px-4 py-2 text-xs text-ink-600">{f.date}</td>
                      <td className="px-4 py-2">{f.blood_group}</td>
                      <td className="px-4 py-2">{f.city}</td>
                      <td className="px-4 py-2 font-mono">{f.failure_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
