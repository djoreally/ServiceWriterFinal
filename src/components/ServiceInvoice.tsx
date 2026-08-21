import { useEffect, useState, useRef } from "react";
import { fetchInvoiceData, sendInvoiceEmail, type InvoiceServiceData, type InvoiceLaborItem, type InvoiceServiceItem, type InvoiceBusinessProfile, type InvoiceCustomerData, type InvoiceVehicleData } from "@/application/queries/service-invoice.query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, X, User, Car, Phone, Mail, MapPin, Wrench, Package, Send, Bell } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { bankersRound } from '@/lib/financialMath';
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

interface ServiceData {
  id: string;
  service_number: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  tax_rate: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  shop_supplies: number | null;
  payment_status: string | null;
  paid_amount: number | null;
  technician: string | null;
  mileage: number | null;
  vin_captured: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_engine: string | null;
  license_plate: string | null;
  odometer_measure: string | null;
}

interface CustomerData {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface VehicleData {
  make: string;
  model: string;
  year: number;
  license_plate: string | null;
  vin: string | null;
  mileage: number | null;
  color: string | null;
  oil_type?: string | null;
  oil_capacity?: string | null;
  engine?: string | null;
}

interface BusinessProfile {
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  logo_url: string;
}

interface LaborItem {
  id: string;
  description: string;
  hours: number;
  rate: number;
  total_price: number;
}

interface ServiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface ServiceInvoiceProps {
  serviceId: string;
  customerId: string | null;
  vehicleId: string | null;
  onClose: () => void;
}

const ServiceInvoice = ({ serviceId, customerId, vehicleId, onClose }: ServiceInvoiceProps) => {
  const { formatCurrency, formatDate } = useRegionalSettings();
  const [service, setService] = useState<ServiceData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailType, setEmailType] = useState<"invoice" | "reminder">("invoice");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchInvoiceData(serviceId, customerId, vehicleId);
        if (data.service) setService(data.service as unknown as ServiceData);
        if (data.customer) setCustomer(data.customer as unknown as CustomerData);
        if (data.vehicle) setVehicle(data.vehicle as unknown as VehicleData);
        if (data.business) setBusiness(data.business as unknown as BusinessProfile);
        if (data.laborItems) setLaborItems(data.laborItems as unknown as LaborItem[]);
        if (data.serviceItems) setServiceItems(data.serviceItems as unknown as ServiceItem[]);
      } catch (err) {
        console.error("Failed to fetch invoice data:", err);
      }
      setLoading(false);
    };
    loadData();
  }, [serviceId, customerId, vehicleId]);

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async () => {
    if (!emailTo || !service) {
      toast.error("Please enter an email address");
      return;
    }

    setSendingEmail(true);
    try {
      const vehicleInfo = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined;
      
      await sendInvoiceEmail({
        to: emailTo,
        customerName: customer?.name || "Valued Customer",
        type: emailType,
        documentNumber: invoiceNumber,
        businessName: business?.business_name || "Mobilube Auto Shop",
        businessEmail: business?.email,
        totalAmount: formatCurrency(balance > 0 ? balance : totalDue),
        vehicleInfo,
        serviceDescription: service.service_type,
        paymentStatus: service.payment_status,
        notes: service.notes,
      });

      toast.success(`${emailType === "reminder" ? "Reminder" : "Invoice"} sent successfully!`);
      setShowEmailDialog(false);
      setEmailTo("");
    } catch (error: unknown) {
      console.error("Email error:", error);
      toast.error((error as Error).message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const getPaymentBadge = (status: string | null) => {
    if (status === "paid") return <Badge className="bg-gray-500 text-white print:border print:border-green-500">PAID IN FULL</Badge>;
    if (status === "partial") return <Badge className="bg-yellow-500 text-white print:border print:border-yellow-500">PARTIAL</Badge>;
    return <Badge variant="outline" className="print:border print:border-gray-400">UNPAID</Badge>;
  };

  // Calculate financials
  const laborTotal = laborItems.length > 0 
    ? laborItems.reduce((sum, item) => sum + item.total_price, 0) 
    : (service?.labor_cost || 0);
  const partsTotal = serviceItems.length > 0 
    ? serviceItems.reduce((sum, item) => sum + item.total_price, 0) 
    : (service?.parts_cost || 0);
  const shopSupplies = service?.shop_supplies || 0;
  // All monetary intermediates use bankersRound (round-half-to-even / GAAP).
  // Do not replace with Math.round or .toFixed for monetary values.
  const subtotal = bankersRound(laborTotal + partsTotal + shopSupplies, 2);
  const taxRate = service?.tax_rate || 0;
  const taxAmount = service?.tax_amount != null
    ? bankersRound(service.tax_amount, 2)
    : bankersRound(subtotal * (taxRate / 100), 2);
  const discount = bankersRound(service?.discount_amount || 0, 2);
  const totalDue = bankersRound(subtotal + taxAmount - discount, 2);
  const paidAmount = service?.paid_amount || 0;
  const balance = bankersRound(totalDue - paidAmount, 2);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const invoiceNumber = service?.service_number || `INV-${serviceId.slice(0, 8).toUpperCase()}`;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 overflow-auto">
      {/* Control buttons - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-50">
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2" onClick={() => { setEmailType("invoice"); setEmailTo(customer?.email || ""); }}>
              <Send className="h-4 w-4" />
              Email Invoice
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby="email-invoice-description">
            <DialogHeader>
              <DialogTitle>Send Invoice by Email</DialogTitle>
              <p id="email-invoice-description" className="text-sm text-muted-foreground">Choose the email type and recipient to send this invoice.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email Type</Label>
                <Select value={emailType} onValueChange={(v: "invoice" | "reminder") => setEmailType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="reminder">Payment Reminder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input 
                  type="email" 
                  value={emailTo} 
                  onChange={(e) => setEmailTo(e.target.value)} 
                  placeholder="customer@example.com"
                />
              </div>
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p><strong>Invoice:</strong> {invoiceNumber}</p>
                <p><strong>Amount:</strong> {formatCurrency(balance > 0 ? balance : totalDue)}</p>
                <p><strong>To:</strong> {customer?.name || "Customer"}</p>
              </div>
              <Button onClick={handleSendEmail} disabled={sendingEmail} className="w-full gap-2">
                {sendingEmail ? (
                  <>Sending...</>
                ) : (
                  <>
                    {emailType === "reminder" ? <Bell className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    Send {emailType === "reminder" ? "Reminder" : "Invoice"}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button variant="outline" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Invoice content */}
      <div 
        ref={invoiceRef}
        className="max-w-4xl mx-auto my-8 bg-white text-black p-8 shadow-lg print:shadow-none print:m-0 print:max-w-none print:p-6"
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div className="flex items-center gap-4">
            {business?.logo_url ? (
              <ProgressiveImage 
                src={business.logo_url} 
                alt="Business logo" 
                className="h-16 w-16 object-contain"
                placeholderClassName="h-16 w-16"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="h-16 w-16 bg-blue-100 rounded-lg flex items-center justify-center text-2xl font-bold text-blue-600">
                {business?.business_name?.charAt(0) || "M"}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{business?.business_name || "Service Writer Auto Shop Manager"}</h1>
              {business?.address && <p className="text-sm text-gray-500">{business.address}</p>}
              {business?.phone && <p className="text-sm text-gray-500">{business.phone}</p>}
              {business?.email && <p className="text-sm text-gray-500">{business.email}</p>}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-3 mb-2">
              <h2 className="text-3xl font-bold text-gray-900">INVOICE</h2>
              {getPaymentBadge(service?.payment_status || null)}
            </div>
            <p className="text-lg font-semibold text-blue-600">{invoiceNumber}</p>
            <p className="text-sm text-gray-500 mt-1">
              Date: {service ? formatDate(service.service_date) : ""}
            </p>
            {service?.technician && (
              <p className="text-sm text-gray-500">Technician: {service.technician}</p>
            )}
          </div>
        </div>

        {/* Customer & Vehicle Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Customer Card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bill To</h3>
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">{customer?.name || "Customer"}</p>
                {customer?.created_at && (
                  <p className="text-xs text-blue-600">Customer since {format(new Date(customer.created_at), "yyyy")}</p>
                )}
                {customer?.phone && (
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />{customer.phone}
                  </p>
                )}
                {customer?.email && (
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />{customer.email}
                  </p>
                )}
                {customer?.address && (
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />{customer.address}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Vehicle Card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Vehicle</h3>
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Car className="h-5 w-5 text-gray-600" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-gray-900">
                  {service?.vehicle_year || vehicle?.year
                    ? `${service?.vehicle_year ?? vehicle?.year} ${service?.vehicle_make ?? vehicle?.make ?? ""} ${service?.vehicle_model ?? vehicle?.model ?? ""}`.trim()
                    : "No vehicle"}
                </p>
                {(service?.vehicle_engine || vehicle?.engine) && (
                  <p className="text-xs text-gray-600 font-medium">{service?.vehicle_engine ?? vehicle?.engine}</p>
                )}
                {vehicle?.color && <p className="text-xs text-gray-500">{vehicle.color}</p>}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                  {(service?.vin_captured || vehicle?.vin) && (
                    <>
                      <div>
                        <span className="text-gray-500 font-medium block">VIN NUMBER</span>
                        <span className="text-gray-700 font-mono">{service?.vin_captured ?? vehicle?.vin}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium block">ODOMETER</span>
                        <span className="text-gray-700">
                          {service?.mileage != null ? service.mileage.toLocaleString() : "—"}{" "}
                          {service?.odometer_measure?.toLowerCase() || "mi"}
                        </span>
                      </div>
                    </>
                  )}
                  {(service?.license_plate || vehicle?.license_plate) && (
                    <div>
                      <span className="text-gray-500 font-medium block">PLATE</span>
                      <span className="text-gray-700">{service?.license_plate ?? vehicle?.license_plate}</span>
                    </div>
                  )}
                </div>
                {/* Oil Specifications */}
                {(vehicle?.oil_type || vehicle?.oil_capacity) && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {vehicle?.oil_type && (
                        <div>
                          <span className="text-amber-600 font-medium block">OIL TYPE</span>
                          <span className="text-gray-900 font-semibold">{vehicle.oil_type}</span>
                        </div>
                      )}
                      {vehicle?.oil_capacity && (
                        <div>
                          <span className="text-blue-600 font-medium block">OIL CAPACITY</span>
                          <span className="text-gray-900 font-semibold">{vehicle.oil_capacity}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Service Breakdown */}
        <div className="mb-8 space-y-6">
          {/* Labor Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Labor Performed</h3>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Hours</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Rate</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {laborItems.length > 0 ? (
                    laborItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-700">{item.description}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{item.hours}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.rate)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-700">{service?.service_type}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{service?.labor_hours || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700">—</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(service?.labor_cost || 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                <span className="text-sm text-gray-600">Labor Subtotal: <span className="font-semibold text-gray-900">{formatCurrency(laborTotal)}</span></span>
              </div>
            </div>
          </div>

          {/* Parts Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Parts Used</h3>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Item Name</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Unit Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceItems.length > 0 ? (
                    serviceItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-700">{item.description}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))
                  ) : service?.parts_used ? (
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-700">{service.parts_used}</td>
                      <td className="px-4 py-3 text-right text-gray-700">—</td>
                      <td className="px-4 py-3 text-right text-gray-700">—</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(service?.parts_cost || 0)}</td>
                    </tr>
                  ) : (
                    <tr className="border-t border-gray-100">
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">No parts recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                <span className="text-sm text-gray-600">Parts Subtotal: <span className="font-semibold text-gray-900">{formatCurrency(partsTotal)}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="flex justify-end mb-8">
          <div className="w-72 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Financial Summary</h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-600">Parts Total</span>
                <span className="text-gray-900">{formatCurrency(partsTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-600">Labor Total</span>
                <span className="text-gray-900">{formatCurrency(laborTotal)}</span>
              </div>
              {shopSupplies > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shop Supplies</span>
                  <span className="text-gray-900">{formatCurrency(shopSupplies)}</span>
                </div>
              )}
              {(taxRate > 0 || taxAmount > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-blue-600">Tax {taxRate > 0 ? `(${taxRate}%)` : ''}</span>
                  <span className="text-gray-900">{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="text-gray-600">-{formatCurrency(discount)}</span>
                </div>
              )}
              <Separator className="my-3" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Due</span>
                <span className="text-2xl font-bold text-blue-600">{formatCurrency(totalDue)}</span>
              </div>
              {paidAmount > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(paidAmount)}</span>
                </div>
              )}
              {balance > 0 && paidAmount > 0 && (
                <div className="flex justify-between text-sm font-medium">
                  <span>Balance Due</span>
                  <span className="text-red-600">{formatCurrency(balance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {service?.notes && (
          <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Mechanic Notes</h3>
            <p className="text-sm text-amber-900">{service.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-gray-600 font-medium">Thank you for your business!</p>
          {business?.business_name && (
            <p className="text-sm text-gray-500 mt-1">{business.business_name} — Quality Service You Can Trust</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceInvoice;
