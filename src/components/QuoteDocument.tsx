import { useEffect, useState, useRef } from "react";
import { fetchQuoteDocumentData, sendQuoteEmail } from "@/application/queries/quote-document.query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, X, User, Car, Phone, Mail, MapPin, Wrench, Package, Send } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";
import { toast } from "sonner";
import { getActiveFleetVehicles, readFleetQuoteStorage } from "@/lib/fleet-quote";
import type { Json } from "@/integrations/supabase/types";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

interface QuoteData {
  id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string | null;
  description: string;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  fleet_metadata: Json | null;
}

interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
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

interface QuoteDocumentProps {
  quoteId: string;
  customerId: string;
  vehicleId: string;
  onClose: () => void;
}

const QuoteDocument = ({ quoteId, customerId, vehicleId, onClose }: QuoteDocumentProps) => {
  const { formatCurrency, formatDate } = useRegionalSettings();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const quoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const result = await fetchQuoteDocumentData(quoteId, customerId, vehicleId);
      if (!result) { setLoading(false); return; }

      if (result.quote) setQuote({ ...result.quote, fleet_metadata: (result.quote as any).fleet_metadata ?? null } as QuoteData);
      if (result.quoteItems) setQuoteItems(result.quoteItems);
      if (result.customer) setCustomer(result.customer);
      if (result.vehicle) setVehicle(result.vehicle);
      if (result.business) setBusiness(result.business as unknown as BusinessProfile);
      setLoading(false);
    };

    fetchData();
  }, [quoteId, customerId, vehicleId]);

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async () => {
    if (!emailTo || !quote) {
      toast.error("Please enter an email address");
      return;
    }

    setSendingEmail(true);
    try {
      const vehicleInfo = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined;
      
      const { error } = await sendQuoteEmail({
        to: emailTo,
        customerName: customer?.name || "Valued Customer",
        type: "quote",
        documentNumber: quote.quote_number,
        businessName: business?.business_name || "Mobilube Auto Shop",
        businessEmail: business?.email,
        totalAmount: formatCurrency(totalEstimate),
        dueDate: quote.valid_until ? formatDate(quote.valid_until) : undefined,
        vehicleInfo,
        serviceDescription: quote.description,
        notes: parsedNotes.userNotes || undefined,
      });

      if (error) throw error;

      toast.success("Quote sent successfully!");
      setShowEmailDialog(false);
      setEmailTo("");
    } catch (error: unknown) {
      console.error("Email error:", error);
      toast.error((error as Error).message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
      approved: "bg-gray-500/10 text-gray-700 border-gray-500/20",
      declined: "bg-red-500/10 text-red-700 border-red-500/20",
      converted: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    };
    return <Badge className={`${styles[status] || "bg-gray-100 text-gray-700"} print:border print:border-current`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  const partsTotal = quoteItems.reduce((sum, item) => sum + item.total_price, 0) || (quote?.parts_cost || 0);
  const laborTotal = quote?.labor_cost || 0;
  const totalEstimate = partsTotal + laborTotal;
  const parsedNotes = readFleetQuoteStorage({
    notes: quote?.notes || null,
    fleet_metadata: quote?.fleet_metadata || null,
  });
  const activeFleetRows = getActiveFleetVehicles(parsedNotes.fleetVehicles);
  const fleetQuantity = activeFleetRows.reduce((sum, row) => sum + (Number(row.quantity) || 1), 0);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 overflow-auto">
      <div className="print:hidden fixed top-4 right-4 flex gap-2 z-50">
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2" onClick={() => setEmailTo(customer?.email || "")}>
              <Send className="h-4 w-4" />
              Email Quote
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby="email-quote-description">
            <DialogHeader>
              <DialogTitle>Send Quote by Email</DialogTitle>
              <p id="email-quote-description" className="text-sm text-muted-foreground">Enter the recipient's email to send this quote.</p>
            </DialogHeader>
            <div className="space-y-4">
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
                <p><strong>Quote:</strong> {quote?.quote_number}</p>
                <p><strong>Estimate:</strong> {formatCurrency(totalEstimate)}</p>
                <p><strong>To:</strong> {customer?.name || "Customer"}</p>
                {quote?.valid_until && <p><strong>Valid Until:</strong> {formatDate(quote.valid_until)}</p>}
              </div>
              <Button onClick={handleSendEmail} disabled={sendingEmail} className="w-full gap-2">
                {sendingEmail ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Quote
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

      <div 
        ref={quoteRef}
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
              <h2 className="text-3xl font-bold text-gray-900">QUOTE</h2>
              {quote && getStatusBadge(quote.status)}
            </div>
            <p className="text-lg font-semibold text-blue-600">{quote?.quote_number}</p>
            <p className="text-sm text-gray-500 mt-1">
              Date: {quote ? formatDate(quote.quote_date) : ""}
            </p>
            {quote?.valid_until && (
              <p className="text-sm text-gray-500">
                Valid Until: {formatDate(quote.valid_until)}
              </p>
            )}
          </div>
        </div>

        {/* Customer & Vehicle Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Customer Card */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Customer Information</h3>
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Vehicle Information</h3>
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Car className="h-5 w-5 text-gray-600" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">
                  {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "No vehicle"}
                </p>
                {vehicle?.engine && <p className="text-xs text-gray-600 font-medium">{vehicle.engine}</p>}
                {vehicle?.color && <p className="text-xs text-gray-500">{vehicle.color}</p>}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                  {vehicle?.vin && (
                    <>
                      <div>
                        <span className="text-gray-500 font-medium block">VIN NUMBER</span>
                        <span className="text-gray-700">{vehicle.vin.length > 12 ? vehicle.vin.slice(0, 12) + "..." : vehicle.vin}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium block">ODOMETER</span>
                        <span className="text-gray-700">{vehicle.mileage?.toLocaleString() || "—"} mi</span>
                      </div>
                    </>
                  )}
                  {vehicle?.license_plate && (
                    <div>
                      <span className="text-gray-500 font-medium block">PLATE</span>
                      <span className="text-gray-700">{vehicle.license_plate}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Proposed Work Description */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Proposed Work</h3>
          <p className="text-gray-700">{quote?.description}</p>
        </div>

        {/* Service Breakdown */}
        <div className="mb-8 space-y-6">
          {/* Labor Section */}
          {(quote?.labor_cost || quote?.labor_hours) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Labor Estimate</h3>
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
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-700">{quote?.description || "Labor"}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{quote?.labor_hours || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {quote?.labor_hours && quote?.labor_cost 
                          ? formatCurrency(quote.labor_cost / quote.labor_hours) 
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(quote?.labor_cost || 0)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Labor Subtotal: <span className="font-semibold text-gray-900">{formatCurrency(laborTotal)}</span></span>
                </div>
              </div>
            </div>
          )}

          {/* Parts Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Parts & Materials</h3>
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
                  {quoteItems.length > 0 ? (
                    quoteItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 text-gray-700">{item.description}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-gray-100">
                      <td colSpan={4} className="px-4 py-6 text-center text-gray-500">No parts specified</td>
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

        {activeFleetRows.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Fleet Vehicle Details</h3>
              <Badge className="print:border print:border-current">Total Units: {fleetQuantity}</Badge>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">VIN</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Specs</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFleetRows.map((row, index) => (
                    <tr key={`${row.vin || "fleet"}-${index}`} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {[row.year, row.make, row.model].filter(Boolean).join(" ") || "Manual entry"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-700">{row.vin || "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {[row.engine, row.fuel_type, row.drive_type, row.body_class].filter(Boolean).join(" • ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">{Number(row.quantity) || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
              <Separator className="my-3" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Estimate</span>
                <span className="text-2xl font-bold text-blue-600">{formatCurrency(totalEstimate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {parsedNotes.userNotes && (
          <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Notes</h3>
            <p className="text-sm text-amber-900">{parsedNotes.userNotes}</p>
          </div>
        )}

        {/* Terms */}
        <div className="mb-8 p-4 border border-gray-200 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Terms & Conditions</h3>
          <ul className="text-sm text-gray-600 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">•</span>
              This quote is valid for 30 days from the date issued
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">•</span>
              Prices may vary based on actual parts availability
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">•</span>
              Additional repairs discovered during service will be quoted separately
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">•</span>
              Payment is due upon completion of service
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-gray-600 font-medium">Thank you for considering our services!</p>
          {business?.business_name && (
            <p className="text-sm text-gray-500 mt-1">{business.business_name} — Quality Service You Can Trust</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteDocument;
