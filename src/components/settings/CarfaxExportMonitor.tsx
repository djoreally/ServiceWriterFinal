import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  fetchCarfaxExportHistory,
  fetchCarfaxExportStats,
  fetchTodaysExports,
  type CarfaxExportRecord,
  type CarfaxExportStats,
} from "@/application/queries/carfax-exports.query";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Download,
} from "lucide-react";
import { toast } from "sonner";

export function CarfaxExportMonitor() {
  const [exportHistory, setExportHistory] = useState<CarfaxExportRecord[]>([]);
  const [todaysExports, setTodaysExports] = useState<CarfaxExportRecord[]>([]);
  const [stats, setStats] = useState<CarfaxExportStats>({
    totalExports: 0,
    successfulExports: 0,
    failedExports: 0,
    totalRecordsExported: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [history, todayExports, exportStats] = await Promise.all([
        fetchCarfaxExportHistory(10),
        fetchTodaysExports(),
        fetchCarfaxExportStats(),
      ]);

      setExportHistory(history);
      setTodaysExports(todayExports);
      setStats(exportStats);
    } catch (error) {
      console.error("Error loading export data:", error);
      toast.error("Failed to load export history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success("Export history refreshed");
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      completed: {
        bg: "bg-gray-500/10",
        text: "text-gray-600",
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      uploaded: {
        bg: "bg-green-500/10",
        text: "text-green-600",
        icon: <CheckCircle2 className="h-3 w-3" />,
      },
      pending: {
        bg: "bg-blue-500/10",
        text: "text-blue-600",
        icon: <Clock className="h-3 w-3" />,
      },
      failed: {
        bg: "bg-red-500/10",
        text: "text-red-600",
        icon: <AlertCircle className="h-3 w-3" />,
      },
    };

    const style = styles[status] || styles.pending;
    return (
      <Badge className={`${style.bg} ${style.text} gap-1`}>
        {style.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const successRate =
    stats.totalExports > 0
      ? Math.round((stats.successfulExports / stats.totalExports) * 100)
      : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <div className="animate-pulse space-y-4 w-full">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Exports</p>
                <p className="text-2xl font-bold">{stats.totalExports}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{successRate}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Records Exported</p>
                <p className="text-2xl font-bold">{stats.totalRecordsExported.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Exports</p>
                <p className="text-2xl font-bold text-red-600">{stats.failedExports}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Exports */}
      {todaysExports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Exports</CardTitle>
            <CardDescription>
              {todaysExports.length} export{todaysExports.length !== 1 ? "s" : ""} generated today
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaysExports.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{exp.file_name}</p>
                    <p className="text-xs text-muted-foreground">{exp.record_count} records</p>
                  </div>
                </div>
                {getStatusBadge(exp.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Export History */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Export History</CardTitle>
            <CardDescription>Recent CARFAX data exports</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {exportHistory.length > 0 ? (
              exportHistory.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{exp.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {exp.record_count} records • {new Date(exp.created_at).toLocaleDateString()} at{" "}
                        {new Date(exp.created_at).toLocaleTimeString()}
                      </p>
                      {exp.error_message && (
                        <p className="text-xs text-red-600 mt-1">{exp.error_message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(exp.status)}
                    {exp.status === "completed" && (
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No exports yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Automation Info */}
      <Card className="border-blue-200/50 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Automated Daily Feed</p>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                Your CARFAX data is automatically exported every day at 11:00 PM UTC. Today's completed services will be included in the next scheduled export.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
