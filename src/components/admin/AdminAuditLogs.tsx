import { useState, useEffect, useCallback } from "react";
import { fetchAuditLogs, type AuditLog } from "@/application/queries/admin-audit-logs.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

function getActionBadge(action: string) {
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
}

interface AuditLogRowData {
  logs: AuditLog[];
  onSelect: (log: AuditLog) => void;
}

function AuditLogRow({
  ariaAttributes,
  index,
  style,
  logs,
  onSelect,
}: RowComponentProps<AuditLogRowData>) {
  const log = logs[index];
  return (
    <div {...ariaAttributes} style={style}>
      <Table>
        <TableBody>
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
                <span className="truncate max-w-[150px]">{log.user_email || "System"}</span>
              </div>
            </TableCell>
            <TableCell>{getActionBadge(log.action)}</TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-2 py-1 rounded">{log.table_name || "-"}</code>
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
                {log.record_id || "-"}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onSelect(log)} aria-label="View audit log details">
                <Eye className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

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
    void Promise.resolve().then(() => fetchLogs());
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => 
    (log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
     log.table_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
              <AutoSizer
                renderProp={({ height, width }) => (
                  <List
                    defaultHeight={450}
                    rowComponent={AuditLogRow}
                    rowCount={filteredLogs.length}
                    rowHeight={56}
                    rowProps={{ logs: filteredLogs, onSelect: setSelectedLog }}
                    style={{ height: height ?? 450, width: width ?? 800 }}
                  />
                )}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-muted-foreground">Timestamp</p>
                  <p>{format(new Date(selectedLog.created_at), "PPpp")}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">User</p>
                  <p>{selectedLog.user_email || "System"}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Action</p>
                  <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Table</p>
                  <p>{selectedLog.table_name || "-"}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Record ID</p>
                <code className="block rounded bg-muted p-2">{selectedLog.record_id || "-"}</code>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Details</p>
                <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
