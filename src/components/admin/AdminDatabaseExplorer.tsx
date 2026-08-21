import { useMemo, useState } from "react";
import {
  fetchTableRows,
  executeSelectQuery,
} from "@/application/queries/admin-database-explorer.query";
import {
  executeInsertQuery,
  executeUpdateQuery,
  executeDeleteQuery,
  logAdminQuery,
  runAdminAiAssistant,
  type AdminAiMessage,
  type AdminAiProposal,
} from "@/application/commands/admin-database-explorer.command";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Database, 
  Play, 
  Table as TableIcon,
  AlertTriangle,
  Clock,
  Copy,
  Download,
  Loader2,
  Shield,
  Trash2,
  Edit,
  Plus,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  Wand2,
  Send,
  Bot,
  User,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_TABLES = [
  "appointments",
  "audit_logs",
  "blocked_dates",
  "business_profiles",
  "carfax_exports",
  "customer_preferences",
  "customers",
  "email_marketing_campaigns",
  "email_queue",
  "inventory_items",
  "labor_items",
  "payment_records",
  "platform_settings",
  "quote_items",
  "quotes",
  "review_requests",
  "service_catalog",
  "service_categories",
  "service_items",
  "service_reminders",
  "service_template_dependencies",
  "service_templates",
  "service_timeline",
  "services",
  "testimonials",
  "user_roles",
  "vehicles",
];

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
  rowCount: number;
  executionTime: number;
  affectedRows?: number;
}

type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "OTHER";

export function AdminDatabaseExplorer() {
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [customQuery, setCustomQuery] = useState<string>("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string>("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<AdminAiMessage[]>([
    {
      role: "assistant",
      content: "Ask me to inspect data, explain a table, draft a safe query, or prepare a write for confirmation.",
    },
  ]);
  const [aiProposal, setAiProposal] = useState<AdminAiProposal | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiPreviewRows, setAiPreviewRows] = useState<Record<string, unknown>[]>([]);

  const detectQueryType = (query: string): QueryType => {
    const trimmed = query.trim().toUpperCase();
    if (trimmed.startsWith("SELECT") || trimmed.startsWith("WITH")) return "SELECT";
    if (trimmed.startsWith("INSERT")) return "INSERT";
    if (trimmed.startsWith("UPDATE")) return "UPDATE";
    if (trimmed.startsWith("DELETE")) return "DELETE";
    return "OTHER";
  };

  const isWriteOperation = (query: string): boolean => {
    const type = detectQueryType(query);
    return type !== "SELECT";
  };

  const getQueryTypeColor = (type: QueryType): string => {
    switch (type) {
      case "SELECT": return "border-primary/20 bg-primary/10 text-primary";
      case "INSERT": return "border-border bg-secondary text-secondary-foreground";
      case "UPDATE": return "border-accent/30 bg-accent text-accent-foreground";
      case "DELETE": return "border-destructive/20 bg-destructive/10 text-destructive";
      default: return "border-border bg-secondary text-secondary-foreground";
    }
  };

  const getQueryTypeIcon = (type: QueryType) => {
    switch (type) {
      case "INSERT": return <Plus className="h-3 w-3" />;
      case "UPDATE": return <Edit className="h-3 w-3" />;
      case "DELETE": return <Trash2 className="h-3 w-3" />;
      default: return null;
    }
  };

  const fetchTableData = async (tableName: string) => {
    setTableLoading(true);
    setTableData([]);
    try {
      const data = await fetchTableRows(tableName);
      setTableData(data);
    } catch (err) {
      toast.error(`Error fetching ${tableName}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setTableLoading(false);
  };

  const handleTableSelect = (table: string) => {
    setSelectedTable(table);
    setCustomQuery(`SELECT * FROM ${table} LIMIT 50`);
    fetchTableData(table);
  };

  const executeReadQuery = async (query: string) => {
    const startTime = Date.now();
    try {
      const tableMatch = query.toLowerCase().match(/from\s+(\w+)/);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const result = await executeSelectQuery(tableName);
        setQueryResult({
          data: result.data,
          error: null,
          rowCount: result.data.length,
          executionTime: result.executionTime,
        });
        toast.success(`Query executed: ${result.data.length} rows returned`);
      }
    } catch (err) {
      setQueryResult({
        data: null,
        error: err instanceof Error ? err.message : "Unknown error",
        rowCount: 0,
        executionTime: Date.now() - startTime,
      });
    }
  };

  const executeWriteQuery = async (query: string) => {
    const startTime = Date.now();
    const queryType = detectQueryType(query);
    
    try {
      const tableMatch = query.toLowerCase().match(/(?:insert\s+into|update|delete\s+from)\s+(\w+)/);
      if (!tableMatch) throw new Error("Could not parse table name from query");
      
      const tableName = tableMatch[1];
      let affectedRows = 0;

      if (queryType === "INSERT") {
        const valuesMatch = query.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (valuesMatch) {
          const columns = valuesMatch[1].split(',').map(c => c.trim());
          const values = valuesMatch[2].split(',').map(v => {
            const trimmed = v.trim();
            if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || 
                (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
              return trimmed.slice(1, -1);
            }
            return trimmed;
          });
          const insertData: Record<string, string> = {};
          columns.forEach((col, idx) => { insertData[col] = values[idx]; });
          await executeInsertQuery(tableName, insertData);
          affectedRows = 1;
        }
      } else if (queryType === "UPDATE") {
        const setMatch = query.match(/SET\s+(.+?)\s+WHERE\s+(.+)/i);
        if (setMatch) {
          const updates: Record<string, unknown> = {};
          setMatch[1].split(',').forEach(part => {
            const [col, val] = part.split('=').map(s => s.trim());
            let parsedVal: unknown = val;
            if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
              parsedVal = val.slice(1, -1);
            } else if (val.startsWith('{') || val.startsWith('[')) {
              try { parsedVal = JSON.parse(val.replace(/'/g, '"')); } catch { parsedVal = val; }
            }
            updates[col] = parsedVal;
          });
          const whereMatch = setMatch[2].match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/);
          if (whereMatch) {
            await executeUpdateQuery(tableName, updates, whereMatch[1], whereMatch[2]);
            affectedRows = 1;
          }
        }
      } else if (queryType === "DELETE") {
        const whereMatch = query.match(/WHERE\s+(\w+)\s*=\s*['"]?([^'"]+)['"]?/i);
        if (whereMatch) {
          await executeDeleteQuery(tableName, whereMatch[1], whereMatch[2]);
          affectedRows = 1;
        }
      }

      setQueryResult({ data: null, error: null, rowCount: 0, executionTime: Date.now() - startTime, affectedRows });
      toast.success(`${queryType} executed: ${affectedRows} row(s) affected`);
      
      if (selectedTable === tableName) fetchTableData(tableName);
      await logAdminQuery(queryType, tableName, query);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setQueryResult({ data: null, error: errorMessage, rowCount: 0, executionTime: Date.now() - startTime });
      toast.error(`Query failed: ${errorMessage}`);
    }
  };

  const runQuery = async (query: string) => {
    if (!query.trim()) {
      toast.error("Please enter a query");
      return;
    }

    const isWrite = isWriteOperation(query);

    if (isWrite && !writeEnabled) {
      toast.error("Write operations are disabled. Enable write mode first.");
      return;
    }

    if (isWrite) {
      setPendingQuery(query);
      setShowConfirmDialog(true);
      return;
    }

    setLoading(true);
    await executeReadQuery(query);
    setLoading(false);
  };

  const executeQuery = async () => {
    await runQuery(customQuery);
  };

  const sendAiPrompt = async () => {
    const nextPrompt = aiInput.trim();
    if (!nextPrompt) {
      toast.error("Enter a request for the AI assistant");
      return;
    }

    const nextMessages: AdminAiMessage[] = [...aiMessages, { role: "user", content: nextPrompt }];
    setAiMessages(nextMessages);
    setAiInput("");
    setAiLoading(true);
    setAiProposal(null);
    setAiWarnings([]);
    setAiPreviewRows([]);

    try {
      const response = await runAdminAiAssistant(nextMessages, writeEnabled);
      setAiMessages((current) => [...current, { role: "assistant", content: response.answer }]);
      setAiProposal(response.proposal);
      setAiWarnings(response.warnings);
      setAiPreviewRows(response.previewRows ?? []);

      if (response.proposal?.sql) {
        setCustomQuery(response.proposal.sql);
        if (response.proposal.tableName && AVAILABLE_TABLES.includes(response.proposal.tableName)) {
          setSelectedTable(response.proposal.tableName);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`AI request failed: ${message}`);
      setAiMessages((current) => [
        ...current,
        { role: "assistant", content: `I hit an error while processing that request: ${message}` },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiProposal = async () => {
    if (!aiProposal?.sql) return;
    setCustomQuery(aiProposal.sql);
    await runQuery(aiProposal.sql);
  };

  const aiPreviewColumns = useMemo(
    () => (aiPreviewRows.length > 0 ? Object.keys(aiPreviewRows[0]) : []),
    [aiPreviewRows],
  );

  const handleConfirmWrite = async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    await executeWriteQuery(pendingQuery);
    setLoading(false);
    setPendingQuery("");
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } else {
      toast.error("Clipboard not available in this environment");
    }
  };

  const exportAsJson = () => {
    const dataToExport = queryResult?.data || tableData;
    if (!dataToExport?.length) {
      toast.error("No data to export");
      return;
    }
    // Guard browser-only APIs (support SSR / non-browser envs)
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') {
      // Try to copy JSON to clipboard as a fallback
      const json = JSON.stringify(dataToExport, null, 2);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(json).then(() => {
          toast.success('Data copied to clipboard (JSON)');
        }).catch(() => {
          toast.error('Export not available in this environment');
        });
      } else {
        toast.error('Export not available in this environment');
      }
      return;
    }

    try {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedTable || "query-result"}-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch (err) {
      toast.error("Failed to export data");
    }
  };

  const displayData = queryResult?.data || tableData;
  const columns = displayData.length > 0 ? Object.keys(displayData[0]) : [];
  const currentQueryType = customQuery.trim() ? detectQueryType(customQuery) : null;

  const sampleWriteQueries = [
    { 
      label: "Insert Role", 
      type: "INSERT" as QueryType,
      query: "INSERT INTO user_roles (user_id, role) VALUES ('user-uuid-here', 'admin')" 
    },
    { 
      label: "Update Setting", 
      type: "UPDATE" as QueryType,
      query: "UPDATE platform_settings SET value = '{\"enabled\": true}' WHERE key = 'feature_name'" 
    },
    { 
      label: "Delete Old Logs", 
      type: "DELETE" as QueryType,
      query: "DELETE FROM audit_logs WHERE id = 'log-uuid-here'" 
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Database Explorer</h2>
          <p className="text-muted-foreground">Browse and query platform data</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="write-mode"
              checked={writeEnabled}
              onCheckedChange={setWriteEnabled}
            />
            <Label 
              htmlFor="write-mode" 
              className={`flex items-center gap-2 ${writeEnabled ? 'text-primary' : ''}`}
            >
              {writeEnabled ? <ShieldAlert className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
              Write Mode
            </Label>
          </div>
        </div>
      </div>

      {writeEnabled ? (
        <Alert className="border-primary/30 bg-primary/5">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <AlertDescription className="text-foreground">
            <strong>Write mode enabled.</strong> INSERT, UPDATE, and DELETE operations are now permitted. 
            All write operations require confirmation and are logged to audit_logs.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Read-only mode. Only SELECT queries are permitted. Enable write mode to make changes.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Database Copilot
          </CardTitle>
          <CardDescription>
            Use plain English to inspect data, draft safe queries, and prepare confirmed writes inside Database Explorer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              <ScrollArea className="h-[280px] rounded-md border border-border">
                <div className="space-y-3 p-4">
                  {aiMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
                      {message.role === "assistant" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      <div className={`max-w-[85%] rounded-md border px-3 py-2 text-sm ${message.role === "assistant" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>
                        {message.content}
                      </div>
                      {message.role === "user" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendAiPrompt();
                    }
                  }}
                  placeholder="Ask something like: show failed review request emails from the last 7 days"
                />
                <Button onClick={sendAiPrompt} disabled={aiLoading} className="gap-2 sm:w-auto">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Ask AI
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Wand2 className="h-4 w-4 text-primary" />
                    Proposed action
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The AI can stage a query here; writes still go through your existing confirmation gate.
                  </p>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {writeEnabled ? "Write enabled" : "Read only"}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      {writeEnabled ? "Writes may be proposed and will still require confirmation." : "Only read queries will be proposed until write mode is enabled."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <Separator className="my-4" />

              {aiProposal ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getQueryTypeColor(aiProposal.queryType)}>
                      {getQueryTypeIcon(aiProposal.queryType)}
                      <span className="ml-1">{aiProposal.queryType}</span>
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {aiProposal.tableName}
                    </Badge>
                    {aiProposal.requiresConfirmation && (
                      <Badge variant="outline" className="gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        Confirmation required
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Summary</p>
                    <p className="text-sm text-muted-foreground">{aiProposal.summary}</p>
                  </div>

                  {(aiProposal.affectedRowsEstimate !== null && aiProposal.affectedRowsEstimate !== undefined) && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Estimated rows affected: <strong>{aiProposal.affectedRowsEstimate}</strong>
                      </AlertDescription>
                    </Alert>
                  )}

                  {aiProposal.previewSql && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Dry-run preview</p>
                      <div className="rounded-md border border-border bg-background p-3">
                        <code className="whitespace-pre-wrap break-all font-mono text-xs">{aiProposal.previewSql}</code>
                      </div>
                    </div>
                  )}

                  <div className="rounded-md border border-border bg-background p-3">
                    <code className="whitespace-pre-wrap break-all font-mono text-xs">{aiProposal.sql}</code>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={applyAiProposal} disabled={loading || aiLoading} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {aiProposal.requiresConfirmation ? "Stage & confirm write" : "Run proposal"}
                    </Button>
                    <Button variant="outline" onClick={() => copyToClipboard(aiProposal.sql)}>
                      Copy SQL
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-60" />
                  Ask for a query, summary, investigation, or data change and the proposal will appear here.
                </div>
              )}

              {aiWarnings.length > 0 && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="space-y-1 text-sm">
                      {aiWarnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {aiPreviewRows.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Preview rows</p>
                <p className="text-sm text-muted-foreground">A small sample from the proposed SELECT target to help validate intent.</p>
              </div>
              <ScrollArea className="h-[220px] rounded-md border border-border">
                <div className="min-w-max p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {aiPreviewColumns.map((column) => (
                          <TableHead key={column} className="whitespace-nowrap font-mono text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aiPreviewRows.map((row, rowIndex) => (
                        <TableRow key={`preview-${rowIndex}`}>
                          {aiPreviewColumns.map((column) => (
                            <TableCell key={column} className="max-w-[220px] truncate font-mono text-xs">
                              {row[column] === null
                                ? "null"
                                : typeof row[column] === "object"
                                  ? JSON.stringify(row[column]).slice(0, 60)
                                  : String(row[column])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TableIcon className="h-4 w-4" />
              Tables
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <div className="p-2 space-y-1">
                {AVAILABLE_TABLES.map((table) => (
                  <Button
                    key={table}
                    variant={selectedTable === table ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start text-xs font-mono"
                    onClick={() => handleTableSelect(table)}
                  >
                    {table}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Query Editor & Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Query Editor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Query Editor
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(customQuery)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportAsJson}
                    disabled={!displayData.length}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {writeEnabled && (
                <div className="flex flex-wrap gap-2 pb-2 border-b">
                  <span className="text-sm text-muted-foreground mr-2">Sample writes:</span>
                  {sampleWriteQueries.map((sample) => (
                    <Button
                      key={sample.label}
                      variant="outline"
                      size="sm"
                      className={getQueryTypeColor(sample.type)}
                      onClick={() => setCustomQuery(sample.query)}
                    >
                      {getQueryTypeIcon(sample.type)}
                      <span className="ml-1">{sample.label}</span>
                    </Button>
                  ))}
                </div>
              )}
              
              <Textarea
                placeholder={writeEnabled 
                  ? "Enter SQL query (SELECT, INSERT, UPDATE, DELETE)..."
                  : "SELECT * FROM table_name LIMIT 50"
                }
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                className="font-mono text-sm min-h-[120px]"
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {currentQueryType && (
                    <Badge className={getQueryTypeColor(currentQueryType)}>
                      {getQueryTypeIcon(currentQueryType)}
                      <span className="ml-1">{currentQueryType}</span>
                    </Badge>
                  )}
                  {queryResult && (
                    <>
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {queryResult.executionTime}ms
                      </Badge>
                      {queryResult.affectedRows !== undefined ? (
                        <Badge variant="outline">
                          {queryResult.affectedRows} affected
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {queryResult.rowCount} rows
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <Button 
                  onClick={executeQuery} 
                  disabled={loading}
                  variant={isWriteOperation(customQuery) ? "destructive" : "default"}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isWriteOperation(customQuery) ? "Execute Write" : "Execute"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>
                {queryResult?.affectedRows !== undefined 
                  ? `${queryResult.affectedRows} row(s) affected`
                  : `${displayData.length} rows returned`}
                {selectedTable && ` from ${selectedTable}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queryResult?.error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{queryResult.error}</AlertDescription>
                </Alert>
              ) : tableLoading || loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : displayData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a table or run a query to see results</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map((col) => (
                            <TableHead key={col} className="whitespace-nowrap font-mono text-xs">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayData.map((row, idx) => (
                          <TableRow key={idx}>
                            {columns.map((col) => (
                              <TableCell key={col} className="font-mono text-xs max-w-[200px] truncate">
                                {row[col] === null ? (
                                  <span className="text-muted-foreground italic">null</span>
                                ) : typeof row[col] === "object" ? (
                                  <code className="bg-muted px-1 rounded">
                                    {JSON.stringify(row[col]).substring(0, 50)}...
                                  </code>
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-primary">
              <AlertTriangle className="h-5 w-5" />
              Confirm {detectQueryType(pendingQuery)} Operation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to execute a <strong>{detectQueryType(pendingQuery)}</strong> operation on the database.</p>
                <div className="bg-muted p-3 rounded-lg overflow-auto max-h-[200px]">
                  <code className="text-xs font-mono whitespace-pre-wrap break-all">
                    {pendingQuery}
                  </code>
                </div>
                <p className="text-destructive font-medium">
                  This action will modify data and will be logged. Are you sure?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmWrite}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Execute {detectQueryType(pendingQuery)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
