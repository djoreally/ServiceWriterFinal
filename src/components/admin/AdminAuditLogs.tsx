import { useState, useEffect, useCallback, memo } from "react";
import { fetchAuditLogs, type AuditLog } from "@/application/queries/admin-audit-logs.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Search, 
  RefreshCw, 
  Eye, 
  Clock,
  User,
  FileText,
  Filter
} from "lucide-react";
import { format } from "date-fns";
import * as ReactWindow from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import 'use-sync-external-store/shim';


export function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs(actionFilter);
      setLogs(data);
    } catch {
      // silent
    }
    setLoading(false);
  }, [actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadge = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes("create") || actionLower.includes("insert")) {
      return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Create</Badge>;
    }
    if (actionLower.includes("update") || actionLower.includes("edit")) {
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Update</Badge>;
    }
    if (actionLower.includes("delete") || actionLower.includes("remove")) {
      return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Delete</Badge>;
    }
    if (actionLower.includes("login") || actionLower.includes("auth")) {
      return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">Auth</Badge>;
    }
    return <Badge variant="outline">{action}</Badge>;
  };

  const filteredLogs = logs.filter(log => 
    (log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
     log.table_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ⚡ Performance: Memoized row renderer for virtualized list
  const AuditLogRow = memo(function AuditLogRow({ log }: { log: AuditLog }) {
    return (
      <TableRow>
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="truncate max-w-[150px]">
              {log.user_email || "System"}
            </span>
          </div>
        </TableCell>
        <TableCell>{getActionBadge(log.action)}</TableCell>
        <TableCell>
          <code className="text-xs bg-muted px-2 py-1 rounded">
            {log.table_name || "-"}
          </code>
        </TableCell>
        <TableCell>
          <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
            {log.record_id || "-"}
          </span>
        </TableCell>
        <TableCell className="text-right">
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedLog(log)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Audit Log Details</DialogTitle>
              </DialogHeader>
              {selectedLog && selectedLog.id === log.id && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Timestamp</label>
                      <p className="font-medium">
                        {format(new Date(selectedLog.created_at), "PPpp")}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">User</label>
                      <p className="font-medium">{selectedLog.user_email || "System"}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Action</label>
                      <p>{getActionBadge(selectedLog.action)}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Table</label>
                      <p className="font-medium">{selectedLog.table_name || "-"}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">IP Address</label>
                      <p className="font-medium">{selectedLog.ip_address || "-"}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Record ID</label>
                      <p className="font-mono text-sm">{selectedLog.record_id || "-"}</p>
                    </div>
                  </div>
                  {selectedLog.old_data && (
                    <div>
                      <label className="text-sm text-muted-foreground">Previous Data</label>
                      <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[150px]">
                        {JSON.stringify(selectedLog.old_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedLog.new_data && (
                    <div>
                      <label className="text-sm text-muted-foreground">New Data</label>
                      <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[150px]">
                        {JSON.stringify(selectedLog.new_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TableCell>
      </TableRow>
    );
  });

  // Fix for AutoSizer TypeScript issues
  const AnyAutoSizer = AutoSizer as unknown as React.ComponentType<{
    children: (size: { height: number; width: number }) => React.ReactNode;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <p className="text-muted-foreground">Track all platform activity and changes</p>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by user, action, or table..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Activity Log
          </CardTitle>
          <CardDescription>
            {filteredLogs.length} {filteredLogs.length === 1 ? "entry" : "entries"} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium text-lg">No audit logs yet</h3>
              <p className="text-muted-foreground">
                Activity will be logged here as users interact with the platform
              </p>
            </div>
          ) : (
            <div className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
              {/* ⚡ Performance: Virtualized list for large audit logs */}
              <AnyAutoSizer>
                {({ height, width }: { height: number; width: number }) => (
                  <ReactWindow.FixedSizeList
                    height={height || 450}
                    itemCount={filteredLogs.length}
                    itemSize={56}
                    width={width || 800}
                  >
                    {({ index, style }) => (
                      // NOTE: cast to avoid CSSProperties type mismatch between toolchain typings.
                      <div style={style as any}>
                        <Table>
                          <TableBody>
                            <AuditLogRow log={filteredLogs[index]} />
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </ReactWindow.FixedSizeList>
                )}
              </AnyAutoSizer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
