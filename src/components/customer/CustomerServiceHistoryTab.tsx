import { useState, useEffect, useCallback } from "react";
import { fetchCustomerServiceHistory, type CustomerServiceRecord } from "@/application/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Wrench,
  Calendar,
  Clock,
  Car,
  FileText,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/financialMath";
import { Button } from "@/components/ui/button";

type ServiceRecord = CustomerServiceRecord;

interface Props {
  account: { id: string; email: string; full_name: string | null };
}

export function CustomerServiceHistoryTab({ account }: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomerServiceHistory(account.id);
      setRecords(data);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [account.id]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchRecords());
  }, [fetchRecords]);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {records.filter((r) => r.status === "completed").length}
            </p>
            <p className="text-sm text-muted-foreground">
              Completed Services
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-gray-500">
              $
              {records
                .filter((r) => r.status === "completed")
                .reduce((sum, r) => sum + (r.estimated_cost || 0), 0)
                .toFixed(0)}
            </p>
            <p className="text-sm text-muted-foreground">
              Total Service Value
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 col-span-2 md:col-span-1">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">
              {records.filter((r) => r.status === "in_progress").length}
            </p>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
      </div>

      {/* Service List */}
      {records.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-12 text-center">
            <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No service history</h3>
            <p className="text-muted-foreground">
              Completed services on your vehicles will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const date = parseISO(record.scheduled_date);
            const isExpanded = expandedId === record.id;

            return (
              <Card key={record.id} className="border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={
                            record.status === "completed"
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                              : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          }
                        >
                          {record.status === "completed" ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <Wrench className="h-3 w-3 mr-1" />
                          )}
                          {record.status === "completed"
                            ? "Completed"
                            : "In Progress"}
                        </Badge>
                      </div>

                      <h3 className="font-semibold text-lg">
                        {record.service_catalog?.name || record.title}
                      </h3>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{format(date, "MMM d, yyyy")}</span>
                        </div>
                        {record.duration_minutes > 0 && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{record.duration_minutes} min</span>
                          </div>
                        )}
                        {record.vehicles && (
                          <div className="flex items-center gap-1">
                            <Car className="h-4 w-4" />
                            <span>
                              {record.vehicles.year} {record.vehicles.make}{" "}
                              {record.vehicles.model}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-2">
                      {record.estimated_cost != null && (
                        <span className="font-semibold text-lg">
                          ${formatMoney(record.estimated_cost)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(record.id)}
                        className="text-muted-foreground"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Details
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 ml-1" />
                        ) : (
                          <ChevronDown className="h-4 w-4 ml-1" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                      {record.description && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Description
                          </p>
                          <p className="text-sm">{record.description}</p>
                        </div>
                      )}

                      {record.notes && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Notes
                          </p>
                          <p className="text-sm">{record.notes}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Service Date
                          </p>
                          <p>{format(date, "EEEE, MMMM d, yyyy")}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">
                            Time
                          </p>
                          <p>
                            {format(
                              parseISO(
                                `${record.scheduled_date}T${record.scheduled_time}`
                              ),
                              "h:mm a"
                            )}
                          </p>
                        </div>
                        {record.actual_start_time && (
                          <div>
                            <p className="font-medium text-muted-foreground">
                              Started At
                            </p>
                            <p>
                              {format(
                                parseISO(record.actual_start_time),
                                "h:mm a"
                              )}
                            </p>
                          </div>
                        )}
                        {record.actual_end_time && (
                          <div>
                            <p className="font-medium text-muted-foreground">
                              Finished At
                            </p>
                            <p>
                              {format(
                                parseISO(record.actual_end_time),
                                "h:mm a"
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {(record.estimated_cost != null ||
                        record.tax_amount != null) && (
                        <div className="bg-muted/30 rounded-lg p-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Subtotal
                            </span>
                            <span>
                              $
                              {formatMoney(
                                (record.estimated_cost || 0) -
                                (record.tax_amount || 0)
                              )}
                            </span>
                          </div>
                          {record.tax_amount != null &&
                            record.tax_amount > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Tax
                                </span>
                                <span>
                                  ${formatMoney(record.tax_amount)}
                                </span>
                              </div>
                            )}
                          <div className="flex justify-between font-semibold border-t border-border/50 pt-2 mt-2">
                            <span>Total</span>
                            <span>
                              ${formatMoney(record.estimated_cost || 0)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
