import { useEffect, useState } from "react";
import {
  fetchVehicleRecommendations,
  fetchMaintenanceIntervals,
  dismissRecommendation,
  deleteRecommendation,
  addRecommendation,
  generateRecommendationsFromHistory,
  type Recommendation,
  type MaintenanceInterval,
} from "@/application/queries/vehicle-recommendations.query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Clock, 
  Plus, 
  X, 
  RefreshCw,
  Wrench,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, isPast, isBefore, addDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Types imported from application layer

interface VehicleRecommendationsProps {
  vehicleId: string;
  currentMileage: number | null;
  onCreateQuote?: (recommendation: Recommendation) => void;
}

export const VehicleRecommendations = ({ 
  vehicleId, 
  currentMileage,
  onCreateQuote 
}: VehicleRecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [maintenanceIntervals, setMaintenanceIntervals] = useState<MaintenanceInterval[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<string>("");
  const [customForm, setCustomForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "high" | "medium" | "low",
    due_mileage: "",
    due_date: ""
  });

  useEffect(() => {
    fetchRecs();
    fetchIntervals();
  }, [vehicleId]);

  const fetchRecs = async () => {
    const data = await fetchVehicleRecommendations(vehicleId);
    setRecommendations(data);
    setLoading(false);
  };

  const fetchIntervals = async () => {
    const data = await fetchMaintenanceIntervals();
    setMaintenanceIntervals(data);
  };

  const handleGenerateFromHistory = async () => {
    setLoading(true);
    try {
      const count = await generateRecommendationsFromHistory(vehicleId, currentMileage, maintenanceIntervals);
      if (count > 0) {
        toast.success(`Generated ${count} recommendation(s)`);
        fetchRecs();
      } else {
        toast.info("No new recommendations to generate");
      }
    } catch {
      toast.error("Failed to generate recommendations");
    }
    setLoading(false);
  };

  const handleAddRecommendation = async () => {
    try {
      if (selectedInterval) {
        const interval = maintenanceIntervals.find(i => i.service_type === selectedInterval);
        if (!interval) return;

        await addRecommendation({
          vehicle_id: vehicleId,
          recommendation_type: interval.service_type,
          title: interval.title,
          description: interval.description,
          priority: interval.priority,
          due_mileage: currentMileage && interval.default_interval_miles
            ? currentMileage + interval.default_interval_miles
            : null,
          due_date: interval.default_interval_months
            ? format(addMonths(new Date(), interval.default_interval_months), "yyyy-MM-dd")
            : null,
          interval_miles: interval.default_interval_miles,
          interval_months: interval.default_interval_months,
        });
      } else {
        if (!customForm.title) {
          toast.error("Please enter a title");
          return;
        }
        await addRecommendation({
          vehicle_id: vehicleId,
          recommendation_type: "custom",
          title: customForm.title,
          description: customForm.description || null,
          priority: customForm.priority,
          due_mileage: customForm.due_mileage ? parseInt(customForm.due_mileage) : null,
          due_date: customForm.due_date || null,
        });
      }

      toast.success("Recommendation added");
      setAddDialogOpen(false);
      setSelectedInterval("");
      setCustomForm({ title: "", description: "", priority: "medium", due_mileage: "", due_date: "" });
      fetchRecs();
    } catch {
      toast.error("Failed to add recommendation");
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissRecommendation(id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast.success("Recommendation dismissed");
    } catch {
      toast.error("Failed to dismiss");
    }
  };

  const handleMarkComplete = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast.success("Marked as completed");
    } catch {
      toast.error("Failed to mark complete");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-gray-500";
      default: return "bg-muted";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high": 
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Urgent</Badge>;
      case "medium": 
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Soon</Badge>;
      case "low": 
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Upcoming</Badge>;
      default: 
        return null;
    }
  };

  const isOverdue = (rec: Recommendation) => {
    if (rec.due_date && isPast(new Date(rec.due_date))) return true;
    if (rec.due_mileage && currentMileage && currentMileage >= rec.due_mileage) return true;
    return false;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Maintenance Recommendations
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 gap-1"
              onClick={handleGenerateFromHistory}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Analyze
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Recommendation</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select from common services</Label>
                    <Select value={selectedInterval} onValueChange={setSelectedInterval}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a service type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Custom recommendation</SelectItem>
                        {maintenanceIntervals.map(interval => (
                          <SelectItem key={interval.id} value={interval.service_type}>
                            {interval.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!selectedInterval && (
                    <>
                      <div className="space-y-2">
                        <Label>Title *</Label>
                        <Input
                          value={customForm.title}
                          onChange={e => setCustomForm(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="e.g., Brake Pad Replacement"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={customForm.description}
                          onChange={e => setCustomForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Additional details..."
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <Select 
                            value={customForm.priority} 
                            onValueChange={(v: "high" | "medium" | "low") => 
                              setCustomForm(prev => ({ ...prev, priority: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">High (Urgent)</SelectItem>
                              <SelectItem value="medium">Medium (Soon)</SelectItem>
                              <SelectItem value="low">Low (Upcoming)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Due Mileage</Label>
                          <Input
                            type="number"
                            value={customForm.due_mileage}
                            onChange={e => setCustomForm(prev => ({ ...prev, due_mileage: e.target.value }))}
                            placeholder={currentMileage ? `Current: ${currentMileage.toLocaleString()}` : ""}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Due Date</Label>
                        <Input
                          type="date"
                          value={customForm.due_date}
                          onChange={e => setCustomForm(prev => ({ ...prev, due_date: e.target.value }))}
                        />
                      </div>
                    </>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddRecommendation}>
                      Add Recommendation
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading recommendations...
          </div>
        ) : recommendations.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50 text-gray-500" />
            <p className="font-medium">No pending recommendations</p>
            <p className="text-sm mt-1">Click "Analyze" to check service history</p>
          </div>
        ) : (
          recommendations.map(rec => (
            <div 
              key={rec.id} 
              className={`flex gap-3 p-3 rounded-lg border ${
                isOverdue(rec) ? "border-red-500/50 bg-red-500/5" : "border-border/50"
              }`}
            >
              <div className={`h-2 w-2 rounded-md mt-1.5 ${getPriorityColor(rec.priority)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-2">
                      {rec.title}
                      {isOverdue(rec) && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </p>
                    {rec.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {rec.description}
                      </p>
                    )}
                  </div>
                  {getPriorityBadge(rec.priority)}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  {rec.due_mileage && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Due at {rec.due_mileage.toLocaleString()} mi
                      {currentMileage && (
                        <span className={currentMileage >= rec.due_mileage ? "text-red-500" : ""}>
                          ({currentMileage >= rec.due_mileage 
                            ? `${(currentMileage - rec.due_mileage).toLocaleString()} mi overdue`
                            : `${(rec.due_mileage - currentMileage).toLocaleString()} mi left`
                          })
                        </span>
                      )}
                    </span>
                  )}
                  {rec.due_date && (
                    <span className={isPast(new Date(rec.due_date)) ? "text-red-500" : ""}>
                      Due {format(new Date(rec.due_date), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {onCreateQuote && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={() => onCreateQuote(rec)}
                    >
                      Create Estimate
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs text-gray-600 hover:text-gray-700"
                    onClick={() => handleMarkComplete(rec.id)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Complete
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => handleDismiss(rec.id)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
