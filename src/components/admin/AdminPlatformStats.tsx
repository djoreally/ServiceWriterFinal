import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPlatformStats, type PlatformStats } from "@/application/queries/admin-stats.query";
import { fetchAuditLogs, type AuditLog } from "@/application/queries/admin-audit-logs.query";
import { SHOW_INCOMPLETE_FEATURES } from "@/lib/feature-flags";
import {
  Users,
  Car,
  DollarSign,
  Calendar,
  Building2,
  TrendingUp,
  Wrench
} from "lucide-react";

export function AdminPlatformStats() {
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0,
    totalVehicles: 0,
    totalServices: 0,
    totalAppointments: 0,
    totalRevenue: 0,
    activeShops: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<AuditLog[]>([]);

  useEffect(() => {
    Promise.all([fetchPlatformStats(), fetchAuditLogs()])
      .then(([platformStats, auditLogs]) => {
        setStats(platformStats);
        setActivity(auditLogs.slice(0, 8));
      })
      .catch((e) => console.error("Exception fetching platform stats/activity:", e))
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: "Active Shops",
      value: stats.activeShops,
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Registered Users",
      value: stats.totalUsers,
      icon: Users,
      color: "text-gray-600",
      bgColor: "bg-gray-500/10",
    },
    {
      title: "Total Vehicles",
      value: stats.totalVehicles,
      icon: Car,
      color: "text-cyan-600",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Services Completed",
      value: stats.totalServices,
      icon: Wrench,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Appointments",
      value: stats.totalAppointments,
      icon: Calendar,
      color: "text-cyan-600",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Platform Revenue",
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Overview</h2>
        <p className="text-muted-foreground">Real-time statistics across all users</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-1">
                    {loading ? "..." : stat.value}
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity timeline — gated: non-functional per incomplete features audit */}
      {SHOW_INCOMPLETE_FEATURES && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest platform activity across all shops</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading activity...</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity found.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.table_name || "system"}
                        {entry.user_email ? ` • ${entry.user_email}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
