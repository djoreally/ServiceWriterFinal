import { useState, useEffect } from "react";
import { fetchCustomerAccount, signOut } from "@/application/queries/customer-booking.query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import CustomerAuth from "@/pages/CustomerAuth";
import { useAuth } from "@packages/auth";

interface CustomerLoginButtonProps {
  providerId: string;
  providerName?: string;
}

interface CustomerAccount {
  id: string;
  email: string;
  full_name: string | null;
}

export function CustomerLoginButton({ providerId, providerName }: CustomerLoginButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Fetch customer account when user changes
  useEffect(() => {
    const loadCustomerAccount = async () => {
      if (!user) {
        setCustomer(null);
        return;
      }
      
      const { data: customerAccount } = await fetchCustomerAccount(user.id);
      
      setCustomer(customerAccount);
    };

    loadCustomerAccount();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    setCustomer(null);
    toast.success("Logged out successfully");
  };

  if (authLoading) {
    return null;
  }

  if (customer) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {customer.full_name?.charAt(0) || customer.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-sm">
              {customer.full_name || customer.email.split("@")[0]}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <a href="/customer/dashboard" className="flex items-center gap-2 cursor-pointer">
              <LayoutDashboard className="h-4 w-4" />
              Customer Dashboard
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setShowAuthDialog(true)}
        className="gap-2"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Sign In</span>
      </Button>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Customer Sign In</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto">
            <CustomerAuth 
              providerId={providerId}
              providerName={providerName}
              onSuccess={() => setShowAuthDialog(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}