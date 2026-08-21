import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useDataTablePreferences } from "@/hooks/useDataTablePreferences";
import { FilterChipList, highlightSearchMatch, useInlineSearchPreview } from "@/hooks/useInlineSearchPreview";
import { DataTableEnhancementToolbar } from "@/components/data-table/DataTableEnhancementToolbar";
import { useMemo, useState } from "react";

interface Service {
  id: string;
  vehicle: string;
  customer: string;
  serviceType: string;
}

interface ActiveServicesTableProps {
  services: Service[];
}

export const ActiveServicesTable = ({ services }: ActiveServicesTableProps) => {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [query, setQuery] = useState("");
  const columns = useMemo(() => ["vehicle", "customer", "service"], []);
  const tablePrefs = useDataTablePreferences("dashboard-active-services-table", columns);
  const filteredServices = useInlineSearchPreview(services, query, [
    (service) => service.vehicle,
    (service) => service.customer,
    (service) => service.serviceType,
  ]);
  const chips = query ? [{ id: "search", label: "Search", value: query }] : [];
  const densityClass = tablePrefs.preferences.density === "compact" ? "py-2" : tablePrefs.preferences.density === "comfortable" ? "py-5" : "py-4";

  const handleRowClick = (serviceId: string) => {
    navigate(`/services/${serviceId}`);
  };

  if (isMobile) {
    return (
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="px-4 flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-semibold">Active Work</CardTitle>
          <Button
            variant="link"
            className="gap-1 text-primary p-0 h-auto"
            onClick={() => navigate("/services")}
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-2">
          <div className="space-y-3">
            {filteredServices.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No active work orders
              </div>
            ) : (
              filteredServices.map((service) => (
                <Card
                  key={service.id}
                  className="border border-border/50 rounded-xl shadow-sm hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleRowClick(service.id)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="grid gap-1">
                      <p className="font-semibold text-foreground">{service.vehicle}</p>
                      <p className="text-sm text-muted-foreground">{service.customer}</p>
                      <p className="text-sm text-muted-foreground">{service.serviceType}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-semibold">Active Work Orders</CardTitle>
        <Button
          variant="link"
          className="gap-1 text-primary p-0 h-auto"
          onClick={() => navigate("/services")}
        >
          View All
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Preview filter active work..."
            className="sm:max-w-xs"
            aria-label="Filter active work orders"
          />
          <Button variant="outline" size="sm" onClick={() => tablePrefs.clearSelection()} disabled={tablePrefs.selectedRows.size === 0}>
            Clear selection
          </Button>
        </div>
        <FilterChipList chips={chips} onRemove={() => setQuery("")} />
        <DataTableEnhancementToolbar
          columns={columns}
          density={tablePrefs.preferences.density}
          hiddenColumns={tablePrefs.preferences.hiddenColumns}
          selectedCount={tablePrefs.selectedRows.size}
          onDensityChange={tablePrefs.setDensity}
          onToggleColumn={tablePrefs.toggleColumn}
          onBulkAction={() => navigate("/services")}
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="w-10" aria-label="Select rows" />
                {tablePrefs.visibleColumns.includes("vehicle") && <TableHead className="text-muted-foreground font-medium">Vehicle</TableHead>}
                {tablePrefs.visibleColumns.includes("customer") && <TableHead className="text-muted-foreground font-medium">Customer</TableHead>}
                {tablePrefs.visibleColumns.includes("service") && <TableHead className="text-muted-foreground font-medium">Service</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tablePrefs.visibleColumns.length + 1} className="text-center text-muted-foreground py-8">
                    No active work orders
                  </TableCell>
                </TableRow>
              ) : (
                filteredServices.map((service) => (
                  <TableRow
                    key={service.id}
                    className="border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleRowClick(service.id)}
                  >
                    <TableCell className={densityClass} onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={tablePrefs.selectedRows.has(service.id)}
                        onCheckedChange={() => tablePrefs.toggleRow(service.id)}
                        aria-label={`Select ${service.vehicle}`}
                      />
                    </TableCell>
                    {tablePrefs.visibleColumns.includes("vehicle") && (
                      <TableCell className={`font-medium text-foreground ${densityClass}`}>
                        {highlightSearchMatch(service.vehicle, query)}
                      </TableCell>
                    )}
                    {tablePrefs.visibleColumns.includes("customer") && (
                      <TableCell className={densityClass}>{highlightSearchMatch(service.customer, query)}</TableCell>
                    )}
                    {tablePrefs.visibleColumns.includes("service") && (
                      <TableCell className={`text-foreground ${densityClass}`}>{highlightSearchMatch(service.serviceType, query)}</TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
