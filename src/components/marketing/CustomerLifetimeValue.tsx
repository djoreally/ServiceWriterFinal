/**
 * CustomerLifetimeValue - LTV analytics and customer value dashboard
 * 
 * Features:
 * - LTV overview with key metrics
 * - Top customers by value
 * - Revenue trends over time
 * - Cohort analysis
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchLTVData, type LTVCustomer, type MonthlyRevenuePoint } from "@/application/queries/marketing.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  ShoppingCart,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Crown,
  Star,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Customer = LTVCustomer;

// LTVMetrics is computed client-side from the customer data

type MonthlyRevenue = MonthlyRevenuePoint;

const SEGMENT_COLORS: Record<string, string> = {
  VIP: "#f59e0b",
  Regular: "#10b981",
  Occasional: "#3b82f6",
  New: "#8b5cf6",
  "At Risk": "#ef4444",
  Dormant: "#6b7280",
};

const CHURN_RISK_CONFIG = {
  low: { color: "bg-gray-100 text-gray-700", icon: CheckCircle2 },
  medium: { color: "bg-yellow-100 text-yellow-700", icon: Clock },
  high: { color: "bg-red-100 text-red-700", icon: AlertTriangle },
};

export function CustomerLifetimeValue() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [metrics, setMetrics] = useState<{
    totalLTV: number; averageLTV: number; topCustomerLTV: number;
    totalCustomers: number; activeCustomers: number; atRiskCustomers: number;
    avgOrderValue: number; avgServicesPerCustomer: number;
  } | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"ltv" | "recent" | "frequency">("ltv");
  
  const { formatCurrency } = useRegionalSettings();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const { customers: typedCustomers, monthlyRevenue: revenue } = await fetchLTVData();
      setCustomers(typedCustomers);
      setMonthlyRevenue(revenue);

      // Calculate metrics client-side
      if (typedCustomers.length > 0) {
        const totalLTV = typedCustomers.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
        const activeCustomers = typedCustomers.filter(c =>
          (c.days_since_last_service || 999) < 180
        ).length;
        const atRiskCustomers = typedCustomers.filter(c => c.churn_risk === "high").length;
        const avgServices = typedCustomers.reduce((sum, c) => sum + (c.total_services || 0), 0) / typedCustomers.length;
        const avgOrder = typedCustomers.reduce((sum, c) => sum + (c.average_order_value || 0), 0) / typedCustomers.length;

        setMetrics({
          totalLTV,
          averageLTV: totalLTV / typedCustomers.length,
          topCustomerLTV: typedCustomers[0]?.lifetime_value || 0,
          totalCustomers: typedCustomers.length,
          activeCustomers,
          atRiskCustomers,
          avgOrderValue: avgOrder,
          avgServicesPerCustomer: avgServices,
        });
      }
    } catch (error) {
      console.error("Error fetching LTV data:", error);
      if (!silent) toast.error("Failed to load customer data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const matchesSearch = 
          c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSegment = segmentFilter === "all" || c.customer_segment === segmentFilter;
        return matchesSearch && matchesSegment;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "ltv":
            return (b.lifetime_value || 0) - (a.lifetime_value || 0);
          case "recent":
            return (a.days_since_last_service || 999) - (b.days_since_last_service || 999);
          case "frequency":
            return (a.visit_frequency_days || 999) - (b.visit_frequency_days || 999);
          default:
            return 0;
        }
      });
  }, [customers, searchQuery, segmentFilter, sortBy]);

  const segmentDistribution = useMemo(() => {
    const dist = customers.reduce((acc, c) => {
      const seg = c.customer_segment || "Unknown";
      acc[seg] = (acc[seg] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(dist).map(([name, value]) => ({
      name,
      value,
      color: SEGMENT_COLORS[name] || "#94a3b8",
    }));
  }, [customers]);

  const getSegmentBadge = (segment: string) => {
    const color = SEGMENT_COLORS[segment] || "#94a3b8";
    return (
      <Badge
        variant="outline"
        style={{ borderColor: color, color: color, backgroundColor: `${color}10` }}
      >
        {segment === "VIP" && <Crown className="h-3 w-3 mr-1" />}
        {segment}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customer Lifetime Value</h2>
          <p className="text-muted-foreground">Track and analyze customer value over time</p>
        </div>
        <Button variant="outline" onClick={() => fetchData(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total LTV</p>
                  <p className="text-2xl font-bold">{formatCurrency(metrics.totalLTV)}</p>
                </div>
                <div className="p-3 bg-gray-100 rounded-full">
                  <DollarSign className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Customer Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(metrics.averageLTV)}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(metrics.avgOrderValue)}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <ShoppingCart className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">At Risk</p>
                  <p className="text-2xl font-bold">{metrics.atRiskCustomers}</p>
                  <p className="text-xs text-muted-foreground">of {metrics.totalCustomers} customers</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Revenue Trend
            </CardTitle>
            <CardDescription>Monthly revenue from services</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No revenue data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Segment Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Segment Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {segmentDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={segmentDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                    >
                      {segmentDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4">
                  {segmentDistribution.map((seg) => (
                    <div key={seg.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: seg.color }}
                        />
                        <span>{seg.name}</span>
                      </div>
                      <span className="font-medium">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No segment data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Customers by Value</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  {Object.keys(SEGMENT_COLORS).map((seg) => (
                    <SelectItem key={seg} value={seg}>{seg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltv">Highest Value</SelectItem>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="frequency">Most Frequent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Lifetime Value</TableHead>
                  <TableHead className="text-right">Services</TableHead>
                  <TableHead className="text-right">Avg. Order</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Churn Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.slice(0, 50).map((customer, idx) => {
                  const churnConfig = CHURN_RISK_CONFIG[customer.churn_risk as keyof typeof CHURN_RISK_CONFIG] || CHURN_RISK_CONFIG.low;
                  const ChurnIcon = churnConfig.icon;
                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={idx < 3 ? "bg-amber-100 text-amber-700" : ""}>
                              {idx === 0 ? <Crown className="h-4 w-4" /> : 
                               customer.name?.charAt(0)?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getSegmentBadge(customer.customer_segment || "New")}</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(customer.lifetime_value || 0)}
                      </TableCell>
                      <TableCell className="text-right">{customer.total_services || 0}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(customer.average_order_value || 0)}
                      </TableCell>
                      <TableCell>
                        {customer.last_service_date ? (
                          <span className="text-sm">
                            {formatDistanceToNow(parseISO(customer.last_service_date), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1", churnConfig.color)}>
                          <ChurnIcon className="h-3 w-3" />
                          {customer.churn_risk || "low"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No customers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default CustomerLifetimeValue;
