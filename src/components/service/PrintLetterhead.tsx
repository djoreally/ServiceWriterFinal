/**
 * PrintLetterhead — print-only header that turns a screen view into a
 * professional, legally-compliant service record when printed/saved to PDF.
 * Hidden on screen; revealed by the `.print-only` rule in index.css.
 */
import { format } from "date-fns";
import { useWorkspaceBrand } from "@/hooks/useWorkspaceBrand";

interface PrintLetterheadProps {
  service: {
    id: string;
    service_number?: string | null;
    service_date?: string | null;
    created_at: string;
    status: string;
    mileage?: number | null;
    technician?: string | null;
  };
  customer?: { name?: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    vin?: string | null;
    license_plate?: string | null;
  } | null;
  guestInfo?: { name?: string | null; email?: string | null; phone?: string | null } | null;
}

export function PrintLetterhead({ service, customer, vehicle, guestInfo }: PrintLetterheadProps) {
  const brand = useWorkspaceBrand();

  const customerName = customer?.name || guestInfo?.name || "—";
  const customerEmail = customer?.email || guestInfo?.email;
  const customerPhone = customer?.phone || guestInfo?.phone;

  const vehicleLine = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : "";

  const serviceDate = service.service_date || service.created_at;
  const cityState = [brand.city, brand.state].filter(Boolean).join(", ");

  return (
    <div className="print-only" data-print-letterhead>
      <div style={{ borderBottom: "2px solid #000", paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div>
            {brand.logoUrl && (
              <img
                src={brand.logoUrl}
                alt={brand.name}
                style={{ maxHeight: 56, marginBottom: 6 }}
              />
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: "#000" }}>{brand.name}</div>
            <div style={{ fontSize: 11, color: "#000", lineHeight: 1.4 }}>
              {brand.address && <div>{brand.address}</div>}
              {cityState && <div>{cityState}</div>}
              {brand.phone && <div>Phone: {brand.phone}</div>}
              {brand.email && <div>{brand.email}</div>}
              {brand.website && <div>{brand.website}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#000" }}>
            <div style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase" }}>
              Service Record
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Record #:</strong>{" "}
              {service.service_number || service.id.slice(0, 8).toUpperCase()}
            </div>
            <div>
              <strong>Date:</strong> {format(new Date(serviceDate), "PPP")}
            </div>
            <div>
              <strong>Status:</strong> {service.status.toUpperCase()}
            </div>
            {service.technician && (
              <div>
                <strong>Technician:</strong> {service.technician}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 12,
            fontSize: 11,
            color: "#000",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, marginBottom: 2 }}>
              Customer
            </div>
            <div>{customerName}</div>
            {customer?.address && <div>{customer.address}</div>}
            {customerPhone && <div>{customerPhone}</div>}
            {customerEmail && <div>{customerEmail}</div>}
          </div>
          <div>
            <div style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10, marginBottom: 2 }}>
              Vehicle
            </div>
            {vehicleLine && <div>{vehicleLine}</div>}
            {vehicle?.vin && <div>VIN: {vehicle.vin}</div>}
            {vehicle?.license_plate && <div>Plate: {vehicle.license_plate}</div>}
            {typeof service.mileage === "number" && (
              <div>Odometer: {service.mileage.toLocaleString()} mi</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
