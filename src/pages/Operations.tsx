import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp,
  Download,
  Calendar,
  Clock,
  Users,
  Car,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Timer,
  Activity,
  BarChart3,
  Target,
  ArrowRight,
} from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

interface ServiceProgressProps {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

interface AppointmentRowProps {
  time: string;
  customer: string;
  vehicle: string;
  service: string;
  status: "scheduled" | "in-progress" | "completed" | "delayed";
  duration: string;
}

const ServiceProgress: React.FC<ServiceProgressProps> = ({ name, count, percentage, color }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-sm">
      <span className="font-medium">{name}</span>
      <span className="font-bold">{count} ({percentage}%)</span>
    </div>
    <div className="h-2 bg-muted rounded-md overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
    </div>
  </div>
);

const getStatusBadge = (status: AppointmentRowProps["status"]) => {
  const styles = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "in-progress": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    delayed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels = {
    scheduled: "Scheduled",
    "in-progress": "In Progress",
    completed: "Completed",
    delayed: "Delayed",
  };
  return (
    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

const Operations: React.FC = () => {
  const { formatCurrency } = useRegionalSettings();
  const [dateRange, setDateRange] = useState("Today");

  // Mock data
  const todayStats = {
    totalAppointments: 18,
    completed: 12,
    inProgress: 3,
    scheduled: 3,
    avgServiceTime: "47 min",
    utilizationRate: 84,
  };

  const serviceBreakdown = [
    { name: "Oil Change & Filter", count: 8, percentage: 42, color: "bg-primary" },
    { name: "Full Service", count: 5, percentage: 28, color: "bg-indigo-400" },
    { name: "Brake Inspection", count: 3, percentage: 15, color: "bg-emerald-400" },
    { name: "Tire Rotation", count: 2, percentage: 10, color: "bg-orange-400" },
    { name: "Other Services", count: 1, percentage: 5, color: "bg-gray-400" },
  ];

  const todayAppointments: AppointmentRowProps[] = [
    { time: "9:00 AM", customer: "John Dorsey", vehicle: "Tesla Model S", service: "Oil Change", status: "completed", duration: "35 min" },
    { time: "9:30 AM", customer: "Maria Lopez", vehicle: "BMW M4", service: "Full Service", status: "completed", duration: "52 min" },
    { time: "10:15 AM", customer: "Ryan Kross", vehicle: "Honda Civic", service: "Brake Inspection", status: "completed", duration: "28 min" },
    { time: "11:00 AM", customer: "Sarah Chen", vehicle: "Toyota Camry", service: "Oil Change", status: "in-progress", duration: "-- min" },
    { time: "11:30 AM", customer: "Mike Johnson", vehicle: "Ford F-150", service: "Tire Rotation", status: "scheduled", duration: "Est. 30 min" },
    { time: "12:00 PM", customer: "Emily Davis", vehicle: "Chevrolet Tahoe", service: "Full Service", status: "scheduled", duration: "Est. 60 min" },
  ];

  const efficiencyMetrics = [
    { label: "On-Time Rate", value: "92%", status: "good" },
    { label: "First-Visit Fix", value: "97%", status: "excellent" },
    { label: "Customer Wait Time", value: "8 min", status: "good" },
    { label: "Parts Availability", value: "94%", status: "good" },
  ];

  return (
    <AppLayout title="Operations">
      <div className="p-8 space-y-8 max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Operations Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor daily operations, service efficiency, and appointment flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{dateRange}</span>
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Today's Overview */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-black">{todayStats.totalAppointments}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Total Appts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-600">{todayStats.completed}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-2">
                <Activity className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl font-black text-orange-600">{todayStats.inProgress}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mx-auto mb-2">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl font-black text-blue-600">{todayStats.scheduled}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Scheduled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-2">
                <Timer className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl font-black">{todayStats.avgServiceTime}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Avg Time</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-black">{todayStats.utilizationRate}%</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase">Utilization</p>
            </CardContent>
          </Card>
        </section>

        {/* Appointments Table & Service Breakdown */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Appointments */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Today's Appointments</CardTitle>
                <Button variant="link" className="text-primary text-xs font-bold p-0 h-auto">
                  View All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground">Time</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground">Service</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-muted-foreground">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayAppointments.map((apt, i) => (
                    <TableRow key={i} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="text-xs font-bold">{apt.time}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-bold">{apt.customer}</p>
                          <p className="text-[10px] text-muted-foreground">{apt.vehicle}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{apt.service}</TableCell>
                      <TableCell>{getStatusBadge(apt.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{apt.duration}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Service Breakdown */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Service Breakdown</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {serviceBreakdown.map((service) => (
                <ServiceProgress key={service.name} {...service} />
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Efficiency Metrics */}
        <section>
          <Card>
            <CardHeader className="pb-4 border-b">
              <CardTitle className="text-base font-bold">Efficiency Metrics</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {efficiencyMetrics.map((metric) => (
                  <div key={metric.label} className="text-center">
                    <div className={`size-16 rounded-md mx-auto mb-3 flex items-center justify-center ${
                      metric.status === "excellent" 
                        ? "bg-emerald-100 dark:bg-emerald-900/20" 
                        : "bg-blue-100 dark:bg-blue-900/20"
                    }`}>
                      <span className={`text-xl font-black ${
                        metric.status === "excellent" 
                          ? "text-emerald-600" 
                          : "text-blue-600"
                      }`}>
                        {metric.value}
                      </span>
                    </div>
                    <p className="text-sm font-bold">{metric.label}</p>
                    <Badge 
                      variant="outline" 
                      className={`mt-1 text-[10px] ${
                        metric.status === "excellent" 
                          ? "border-emerald-500 text-emerald-600" 
                          : "border-blue-500 text-blue-600"
                      }`}
                    >
                      {metric.status === "excellent" ? "Excellent" : "Good"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Staff Utilization */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Bay Utilization</CardTitle>
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {["Bay 1", "Bay 2", "Bay 3"].map((bay, i) => (
                  <div key={bay} className="flex items-center gap-4">
                    <div className="w-16 text-sm font-bold">{bay}</div>
                    <div className="flex-1">
                      <Progress value={[92, 78, 65][i]} className="h-3" />
                    </div>
                    <div className="w-12 text-right text-sm font-bold">{[92, 78, 65][i]}%</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">Peak Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {[3, 5, 7, 8, 6, 4, 5, 7, 4, 3, 2, 1].map((value, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm transition-all ${
                      value >= 7 ? "bg-primary" : "bg-primary/30"
                    }`}
                    style={{ height: `${(value / 8) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground pt-2 uppercase">
                <span>8am</span>
                <span>12pm</span>
                <span>4pm</span>
                <span>8pm</span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
};

export default Operations;
