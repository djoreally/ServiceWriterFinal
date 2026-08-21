import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { searchCommandPalette } from "@/application/queries/command-palette.query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type QuickResult = {
  id: string;
  label: string;
  sublabel?: string;
  path: string;
};

const PAGE_SHORTCUTS: QuickResult[] = [
  { id: "page-dashboard", label: "Dashboard", path: "/dashboard" },
  { id: "page-customers", label: "Customers", path: "/customers" },
  { id: "page-appointments", label: "Appointments", path: "/appointments" },
  { id: "page-command-center", label: "Today — operations center", path: "/command-center" },
  { id: "page-team-os", label: "Team OS", path: "/team-os" },
  { id: "page-financials", label: "Financials", path: "/financials" },
  { id: "page-settings", label: "Settings", path: "/settings" },
];

export function GlobalCommandPalette() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<QuickResult[]>([]);
  const [appointmentResults, setAppointmentResults] = useState<QuickResult[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open || !userId || query.trim().length < 2) {
      setCustomerResults([]);
      setAppointmentResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const q = query.trim();

      const { customers, appointments } = await searchCommandPalette(userId, q);

      setCustomerResults(
        customers.map((c: any) => ({
          id: `customer-${c.id}`,
          label: c.name || "Customer",
          sublabel: c.email || c.phone || "",
          path: `/customers/${c.id}`,
        })),
      );

      setAppointmentResults(
        appointments.map((a: any) => ({
          id: `appointment-${a.id}`,
          label: a.title || "Appointment",
          sublabel: `${a.scheduled_date || ""} ${a.scheduled_time || ""}`.trim(),
          path: `/appointments/${a.id}`,
        })),
      );
    }, 180);

    return () => clearTimeout(timer);
  }, [open, query, userId]);

  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGE_SHORTCUTS;
    return PAGE_SHORTCUTS.filter((p) => p.label.toLowerCase().includes(q));
  }, [query]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to page, customer, appointment..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Pages">
          {filteredPages.map((item) => (
            <CommandItem key={item.id} onSelect={() => handleSelect(item.path)}>
              <span>{item.label}</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {(customerResults.length > 0 || appointmentResults.length > 0) && <CommandSeparator />}

        {customerResults.length > 0 && (
          <CommandGroup heading="Customers">
            {customerResults.map((item) => (
              <CommandItem key={item.id} onSelect={() => handleSelect(item.path)}>
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {appointmentResults.length > 0 && (
          <CommandGroup heading="Appointments">
            {appointmentResults.map((item) => (
              <CommandItem key={item.id} onSelect={() => handleSelect(item.path)}>
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
