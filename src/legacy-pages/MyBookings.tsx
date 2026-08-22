import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAuthUser,
  fetchCustomerAccount,
  createCustomerAccountRpc,
  fetchCustomerAccountById,
  fetchCustomerBookings,
  signOut,
  onAuthStateChange,
} from "@/application/queries/customer-booking.query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format, parseISO, isPast, isFuture, isToday } from "date-fns";
import {
  Loader2,
  Calendar,
  Clock,
  LogOut,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  XCircle,
} from "lucide-react";
import { CustomerServiceHistoryTab } from "@/components/customer/CustomerServiceHistoryTab";
import { CancelDialog } from "@/components/customer/CancelDialog";
import { bankersRound, formatMoney } from "@/lib/financialMath";

interface CustomerBooking {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  estimated_cost: number | null;
  guest_name: string | null;
  management_token: string | null;
  service_catalog?: {
    name: string;
  } | null;
}

interface CustomerAccount {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse",
  confirmed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export default function MyBookings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "service-history">("upcoming");
  const [cancelBooking, setCancelBooking] = useState<CustomerBooking | null>(null);

  const fetchData = useCallback(async () => {
    const user = await getAuthUser();
    
    if (!user) {
      navigate("/customer/auth");
      return;
    }

    // Get customer account
    const { data: customerAccount, error: accountError } = await fetchCustomerAccount(user.id);
    let resolvedAccountId = customerAccount?.id ?? null;

    if (accountError || !customerAccount) {
      // Try to create account if it doesn't exist
      const { data: newAccount } = await createCustomerAccountRpc(
        user.id,
        user.email || "",
        user.user_metadata?.full_name || null,
        user.user_metadata?.phone || null,
      );
      
      if (!newAccount) {
        toast.error("Failed to load account");
        setLoading(false);
        return;
      }
      
      // Fetch the created account
      const { data: createdAccount } = await fetchCustomerAccountById(newAccount as string);
      
      if (createdAccount) {
        setAccount(createdAccount);
        resolvedAccountId = createdAccount.id;
      }
    } else {
      setAccount(customerAccount);
      resolvedAccountId = customerAccount.id;
    }

    // Fetch bookings - RLS + explicit filter for customer's bookings
    // This filters appointments where the customer is linked via customer_account_id or guest_email
    const { data: appointmentsData, error: appointmentsError } = await fetchCustomerBookings(
      resolvedAccountId || '',
      user.email || '',
    );

    if (appointmentsError) {
      console.error("Failed to fetch bookings:", appointmentsError);
    } else {
      setBookings(appointmentsData || []);
    }

    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          navigate("/customer/auth");
        }
      }
    );

    fetchData();

    return () => subscription.unsubscribe();
  }, [fetchData, navigate]);

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/customer/auth");
  };

  const upcomingBookings = bookings.filter(b => 
    isFuture(parseISO(b.scheduled_date)) || isToday(parseISO(b.scheduled_date))
  ).filter(b => b.status !== "cancelled" && b.status !== "completed");

  const pastBookings = bookings.filter(b => 
    isPast(parseISO(b.scheduled_date)) && !isToday(parseISO(b.scheduled_date))
    || b.status === "completed" || b.status === "cancelled"
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderBookingCard = (booking: CustomerBooking) => {
    const bookingDate = parseISO(booking.scheduled_date);
    const isUpcoming = isFuture(bookingDate) || isToday(bookingDate);
    
    return (
      <Card 
        key={booking.id} 
        className="border-border/50 hover:border-primary/30 transition-all cursor-pointer group"
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_STYLES[booking.status] || STATUS_STYLES.confirmed}>
                  {booking.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                  {booking.status === "cancelled" && <AlertCircle className="h-3 w-3 mr-1" />}
                  {booking.status.replace("_", " ")}
                </Badge>
                {isUpcoming && booking.status !== "cancelled" && (
                  <span className="text-xs text-muted-foreground">
                    {isToday(bookingDate) ? "Today" : format(bookingDate, "MMM d")}
                  </span>
                )}
              </div>
              
              <h3 className="font-semibold text-lg">
                {booking.service_catalog?.name || booking.title}
              </h3>
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{format(bookingDate, "EEEE, MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(parseISO(`${booking.scheduled_date}T${booking.scheduled_time}`), "h:mm a")}
                  </span>
                </div>
              </div>
              
            </div>
            
            <div className="text-right flex flex-col items-end gap-2">
              {booking.estimated_cost && (
                <span className="font-semibold text-lg">
                  ${formatMoney(booking.estimated_cost)}
                </span>
              )}
              {isUpcoming && booking.management_token && booking.status !== "cancelled" && booking.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelBooking(booking)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary">
                {account?.full_name?.charAt(0) || account?.email?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{account?.full_name || "Customer"}</p>
              <p className="text-sm text-muted-foreground">{account?.email}</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Appointments</h1>
          <p className="text-muted-foreground">
            This portal also includes your full profile, service history, and payments.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{upcomingBookings.length}</p>
              <p className="text-sm text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{pastBookings.filter(b => b.status === "completed").length}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{bookings.length}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-500">
                ${formatMoney(bankersRound(
                  bookings
                    .filter(b => b.status === "completed")
                    .reduce((sum, b) => sum + (b.estimated_cost || 0), 0),
                  2,
                ))}
              </p>
              <p className="text-sm text-muted-foreground">Total Spent</p>
            </CardContent>
          </Card>
        </div>

        {/* Bookings Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "past" | "service-history")}>
          <TabsList className="mb-6">
            <TabsTrigger value="upcoming" className="gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Past ({pastBookings.length})
            </TabsTrigger>
            <TabsTrigger value="service-history" className="gap-2">
              <FileText className="h-4 w-4" />
              Service History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingBookings.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="p-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No upcoming appointments</h3>
                  <p className="text-muted-foreground mb-4">
                    Book a service to get started
                  </p>
                </CardContent>
              </Card>
            ) : (
              upcomingBookings.map(renderBookingCard)
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastBookings.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="p-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No past appointments</h3>
                  <p className="text-muted-foreground">
                    Your completed appointments will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map(renderBookingCard)
            )}
          </TabsContent>

          <TabsContent value="service-history" className="space-y-4">
            {account && (
              <CustomerServiceHistoryTab
                account={{
                  id: account.id,
                  email: account.email,
                  full_name: account.full_name,
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {cancelBooking && (
        <CancelDialog
          appointment={cancelBooking}
          open={!!cancelBooking}
          onClose={() => setCancelBooking(null)}
          onSuccess={() => {
            setCancelBooking(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
