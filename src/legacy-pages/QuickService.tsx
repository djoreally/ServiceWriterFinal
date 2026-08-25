import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUserId, fetchQuickServiceFormData } from "@/application/queries/quick-service.query";
import { insertCustomer, insertVehicle, insertServiceRecord } from "@/application/commands/quick-service.command";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Check, User, Car, ClipboardList, Plus, Wrench } from "lucide-react";
import { format } from "date-fns";
import { bankersRound } from '@/lib/financialMath';
import { useFormAutoSave } from '@/hooks/useFormAutoSave';

const CUSTOM_SERVICE_VALUE = "__custom_service__";

type CustomerMode = "new" | "existing";
type VehicleMode = "new" | "existing";

interface Customer {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  labor_rate: number | null;
}

const QuickService = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Existing data for selection
  const [existingCustomers, setExistingCustomers] = useState<Customer[]>([]);
  const [existingVehicles, setExistingVehicles] = useState<Vehicle[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [showCustomServiceType, setShowCustomServiceType] = useState(false);
  
  // Selection modes
  const [customerMode, setCustomerMode] = useState<CustomerMode>("new");
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>("new");
  
  // Form data
  const [customerData, setCustomerData] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  
  const [vehicleData, setVehicleData] = useState({
    id: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    license_plate: "",
    color: "",
    mileage: "",
    notes: "",
  });
  
  const [serviceData, setServiceData] = useState({
    service_date: format(new Date(), "yyyy-MM-dd"),
    service_type: "",
    description: "",
    parts_used: "",
    labor_hours: "",
    labor_cost: "",
    parts_cost: "",
    status: "completed",
    notes: "",
  });

  const draftValue = useMemo(() => ({
    customerData,
    customerMode,
    serviceData,
    showCustomServiceType,
    step,
    vehicleData,
    vehicleMode,
  }), [customerData, customerMode, serviceData, showCustomServiceType, step, vehicleData, vehicleMode]);

  const draft = useFormAutoSave({
    key: "quick-service:draft",
    value: draftValue,
    delayMs: 800,
  });

  const restoreDraft = () => {
    const saved = draft.restore();
    if (!saved) {
      toast.info("No quick service draft found");
      return;
    }

    setCustomerData(saved.customerData);
    setCustomerMode(saved.customerMode);
    setServiceData(saved.serviceData);
    setShowCustomServiceType(saved.showCustomServiceType);
    setStep(saved.step);
    setVehicleData(saved.vehicleData);
    setVehicleMode(saved.vehicleMode);
    toast.success("Quick service draft restored");
  };

  useEffect(() => {
    fetchExistingData();
  }, []);

  useEffect(() => {
    // Show all vehicles regardless of customer selection
    setFilteredVehicles(existingVehicles);
  }, [existingVehicles]);

  const fetchExistingData = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { customers, vehicles, catalog } = await fetchQuickServiceFormData();
    setExistingCustomers(customers);
    setExistingVehicles(vehicles);
    setServiceCatalog(catalog);
  };

  const handleServiceCatalogSelect = (value: string) => {
    if (value === CUSTOM_SERVICE_VALUE) {
      setShowCustomServiceType(true);
      setServiceData({ ...serviceData, service_type: "" });
      return;
    }
    const catalogItem = serviceCatalog.find(c => c.name === value);
    if (catalogItem) {
      setShowCustomServiceType(false);
      setServiceData({
        ...serviceData,
        service_type: catalogItem.name,
        description: catalogItem.description || serviceData.description,
        labor_cost: catalogItem.default_price?.toString() || serviceData.labor_cost,
      });
    }
  };

  const calculateTotal = () => {
    const laborCost = bankersRound(Number(serviceData.labor_cost) || 0, 2);
    const partsCost = bankersRound(Number(serviceData.parts_cost) || 0, 2);
    return bankersRound(laborCost + partsCost, 2);
  };

  const validateStep = () => {
    if (step === 1) {
      if (customerMode === "new") {
        if (!customerData.name.trim()) {
          toast.error("Please enter customer name");
          return false;
        }
      } else {
        if (!customerData.id) {
          toast.error("Please select a customer");
          return false;
        }
      }
    } else if (step === 2) {
      if (vehicleMode === "new") {
        if (!vehicleData.make.trim() || !vehicleData.model.trim() || !vehicleData.year) {
          toast.error("Please fill in required vehicle fields");
          return false;
        }
      } else {
        if (!vehicleData.id) {
          toast.error("Please select a vehicle");
          return false;
        }
      }
    } else if (step === 3) {
      if (!serviceData.service_type.trim() || !serviceData.description.trim()) {
        toast.error("Please fill in required service fields");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    
    setLoading(true);
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error("You must be logged in");
      setLoading(false);
      return;
    }

    try {
      let customerId = customerData.id;
      let vehicleId = vehicleData.id;

      // Step 1: Create or use existing customer
      if (customerMode === "new") {
        const { data: newCustomer, error: customerError } = await insertCustomer(userId, {
          name: customerData.name,
          email: customerData.email || null,
          phone: customerData.phone || null,
          address: customerData.address || null,
          notes: customerData.notes || null,
        });
        if (customerError) throw customerError;
        if (!newCustomer) throw new Error("Customer creation returned no record.");
        customerId = (newCustomer as { id: string }).id;
      }

      // Step 2: Create or use existing vehicle
      if (vehicleMode === "new") {
        const { data: newVehicle, error: vehicleError } = await insertVehicle(userId, {
          customer_id: customerId,
          make: vehicleData.make,
          model: vehicleData.model,
          year: vehicleData.year,
          vin: vehicleData.vin || null,
          license_plate: vehicleData.license_plate || null,
          color: vehicleData.color || null,
          mileage: vehicleData.mileage ? parseInt(vehicleData.mileage) : null,
          notes: vehicleData.notes || null,
        });
        if (vehicleError) throw vehicleError;
        if (!newVehicle) throw new Error("Vehicle creation returned no record.");
        vehicleId = (newVehicle as { id: string }).id;
      }

      const totalCost = calculateTotal();
      const { error: serviceError } = await insertServiceRecord(userId, {
        customer_id: customerId,
        vehicle_id: vehicleId,
        service_date: serviceData.service_date,
        service_type: serviceData.service_type,
        description: serviceData.description,
        parts_used: serviceData.parts_used || null,
        labor_hours: serviceData.labor_hours ? parseFloat(serviceData.labor_hours) : null,
        labor_cost: serviceData.labor_cost ? bankersRound(Number(serviceData.labor_cost) || 0, 2) : null,
        parts_cost: serviceData.parts_cost ? bankersRound(Number(serviceData.parts_cost) || 0, 2) : null,
        total_cost: totalCost,
        status: serviceData.status,
        notes: serviceData.notes || null,
      });

      if (serviceError) throw serviceError;

      draft.clear();
      toast.success("Complete service record created successfully!");
      navigate("/services");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create service record");
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      {[1, 2, 3].map((num) => (
        <div key={num} className="flex items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-md border-2 ${
            step >= num ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
          }`}>
            {step > num ? <Check className="h-5 w-5" /> : num}
          </div>
          {num < 3 && (
            <div className={`w-16 h-0.5 ${step > num ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary/10 text-primary rounded-lg p-3">
          <User className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-2xl font-bold">Customer Information</h3>
          <p className="text-muted-foreground">Select existing or create new customer</p>
        </div>
      </div>

      <RadioGroup value={customerMode} onValueChange={(value: CustomerMode) => setCustomerMode(value)}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="new" id="new-customer" />
          <Label htmlFor="new-customer">New Customer</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="existing" id="existing-customer" />
          <Label htmlFor="existing-customer">Existing Customer</Label>
        </div>
      </RadioGroup>

      {customerMode === "existing" ? (
        <div className="space-y-2">
          <Label htmlFor="customer-select">Select Customer *</Label>
          <Select
            value={customerData.id}
            onValueChange={(value) => {
              const customer = existingCustomers.find(c => c.id === value);
              setCustomerData({ ...customerData, id: value, name: customer?.name || "" });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a customer" />
            </SelectTrigger>
            <SelectContent>
              {existingCustomers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Customer Name *</Label>
            <Input
              id="name"
              value={customerData.name}
              onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
              placeholder="John Doe"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={customerData.email}
                onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={customerData.phone}
                onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={customerData.address}
              onChange={(e) => setCustomerData({ ...customerData, address: e.target.value })}
              placeholder="123 Main St, City, State ZIP"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea
              id="customer-notes"
              value={customerData.notes}
              onChange={(e) => setCustomerData({ ...customerData, notes: e.target.value })}
              rows={2}
              placeholder="Any additional information about the customer"
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-accent/10 text-accent rounded-lg p-3">
          <Car className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-2xl font-bold">Vehicle Information</h3>
          <p className="text-muted-foreground">Select existing or add new vehicle</p>
        </div>
      </div>

      <RadioGroup value={vehicleMode} onValueChange={(value: VehicleMode) => setVehicleMode(value)}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="new" id="new-vehicle" />
          <Label htmlFor="new-vehicle">New Vehicle</Label>
        </div>
        {filteredVehicles.length > 0 && (
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="existing" id="existing-vehicle" />
            <Label htmlFor="existing-vehicle">Existing Vehicle</Label>
          </div>
        )}
      </RadioGroup>

      {vehicleMode === "existing" ? (
        <div className="space-y-2">
          <Label htmlFor="vehicle-select">Select Vehicle *</Label>
          <Select
            value={vehicleData.id}
            onValueChange={(value) => setVehicleData({ ...vehicleData, id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a vehicle" />
            </SelectTrigger>
            <SelectContent>
              {filteredVehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="make">Make *</Label>
              <Input
                id="make"
                value={vehicleData.make}
                onChange={(e) => setVehicleData({ ...vehicleData, make: e.target.value })}
                placeholder="Toyota"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model *</Label>
              <Input
                id="model"
                value={vehicleData.model}
                onChange={(e) => setVehicleData({ ...vehicleData, model: e.target.value })}
                placeholder="Camry"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={vehicleData.year}
                onChange={(e) => setVehicleData({ ...vehicleData, year: parseInt(e.target.value) || new Date().getFullYear() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                value={vehicleData.color}
                onChange={(e) => setVehicleData({ ...vehicleData, color: e.target.value })}
                placeholder="Silver"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
              <Input
                id="mileage"
                type="number"
                value={vehicleData.mileage}
                onChange={(e) => setVehicleData({ ...vehicleData, mileage: e.target.value })}
                placeholder="50000"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                value={vehicleData.vin}
                onChange={(e) => setVehicleData({ ...vehicleData, vin: e.target.value })}
                placeholder="1HGBH41JXMN109186"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license">License Plate</Label>
              <Input
                id="license"
                value={vehicleData.license_plate}
                onChange={(e) => setVehicleData({ ...vehicleData, license_plate: e.target.value })}
                placeholder="ABC123"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-notes">Notes</Label>
            <Textarea
              id="vehicle-notes"
              value={vehicleData.notes}
              onChange={(e) => setVehicleData({ ...vehicleData, notes: e.target.value })}
              rows={2}
              placeholder="Any additional information about the vehicle"
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-success/10 text-success rounded-lg p-3">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-2xl font-bold">Service Details</h3>
          <p className="text-muted-foreground">Record the service performed</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="service-date">Service Date *</Label>
            <Input
              id="service-date"
              type="date"
              value={serviceData.service_date}
              onChange={(e) => setServiceData({ ...serviceData, service_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-type">Service Type *</Label>
            {!showCustomServiceType ? (
              <Select
                value={serviceData.service_type || undefined}
                onValueChange={handleServiceCatalogSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceCatalog.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>
                      <span className="flex items-center justify-between gap-2">
                        {cat.name}
                        <span className="text-muted-foreground text-xs">${cat.default_price}</span>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_SERVICE_VALUE}>
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-4 w-4" />
                      Custom Service
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="service-type"
                  value={serviceData.service_type}
                  onChange={(e) => setServiceData({ ...serviceData, service_type: e.target.value })}
                  placeholder="Oil Change, Brake Service, etc."
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowCustomServiceType(false)} title="Select from catalog">
                  <Wrench className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={serviceData.description}
            onChange={(e) => setServiceData({ ...serviceData, description: e.target.value })}
            rows={3}
            placeholder="Detailed description of work performed"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="parts">Parts Used</Label>
          <Textarea
            id="parts"
            value={serviceData.parts_used}
            onChange={(e) => setServiceData({ ...serviceData, parts_used: e.target.value })}
            rows={2}
            placeholder="List of parts used"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="labor-hours">Labor Hours</Label>
            <Input
              id="labor-hours"
              type="number"
              step="0.1"
              value={serviceData.labor_hours}
              onChange={(e) => setServiceData({ ...serviceData, labor_hours: e.target.value })}
              placeholder="2.5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="labor-cost">Labor Cost ($)</Label>
            <Input
              id="labor-cost"
              type="number"
              step="0.01"
              value={serviceData.labor_cost}
              onChange={(e) => setServiceData({ ...serviceData, labor_cost: e.target.value })}
              placeholder="150.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parts-cost">Parts Cost ($)</Label>
            <Input
              id="parts-cost"
              type="number"
              step="0.01"
              value={serviceData.parts_cost}
              onChange={(e) => setServiceData({ ...serviceData, parts_cost: e.target.value })}
              placeholder="75.00"
            />
          </div>
        </div>
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-lg font-semibold">Total Cost: ${bankersRound(calculateTotal(), 2).toFixed(2)}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={serviceData.status}
            onValueChange={(value) => setServiceData({ ...serviceData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-notes">Additional Notes</Label>
          <Textarea
            id="service-notes"
            value={serviceData.notes}
            onChange={(e) => setServiceData({ ...serviceData, notes: e.target.value })}
            rows={2}
            placeholder="Any additional notes"
          />
        </div>
      </div>
    </div>
  );

  return (
    <AppLayout title="Quick Service Entry">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Quick Service Entry</h2>
          <p className="text-muted-foreground">Complete workflow to create customer, vehicle, and service records</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <Badge variant="secondary">{draft.label}</Badge>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={restoreDraft}>
              Restore draft
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={draft.clear}>
              Clear draft
            </Button>
          </div>
        </div>

        {renderStepIndicator()}

        <Card>
          <CardHeader>
            <CardTitle>
              Step {step} of 3
            </CardTitle>
            <CardDescription>
              {step === 1 && "Start by adding or selecting a customer"}
              {step === 2 && "Add or select the vehicle for this service"}
              {step === 3 && "Record the service details and costs"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}

            <div className="flex justify-between mt-8 pt-6 border-t">
              <Button
                variant="outline"
                onClick={step === 1 ? () => navigate("/dashboard") : handleBack}
                disabled={loading}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {step === 1 ? "Cancel" : "Back"}
              </Button>
              
              {step < 3 ? (
                <Button onClick={handleNext}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating..." : "Complete & Save"}
                  <Check className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default QuickService;
