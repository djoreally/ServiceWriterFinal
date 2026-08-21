import * as React from "react";
import { cn } from "@/lib/utils";
import { Phone, Mail } from "lucide-react";

interface ClickablePhoneProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  phone: string;
  showIcon?: boolean;
  iconClassName?: string;
}

interface ClickableEmailProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  email: string;
  showIcon?: boolean;
  iconClassName?: string;
}

/**
 * Formats a phone number for the tel: protocol
 * Strips non-numeric characters except leading +
 */
const formatPhoneForTel = (phone: string): string => {
  // Keep leading + if present, otherwise strip all non-numeric
  if (phone.startsWith("+")) {
    return "+" + phone.slice(1).replace(/\D/g, "");
  }
  return phone.replace(/\D/g, "");
};

/**
 * ClickablePhone - Renders a phone number as a clickable tel: link
 * Opens the device's default phone/calling app
 */
export const ClickablePhone = React.forwardRef<HTMLAnchorElement, ClickablePhoneProps>(
  ({ phone, showIcon = true, iconClassName, className, children, ...props }, ref) => {
    const telHref = `tel:${formatPhoneForTel(phone)}`;
    
    return (
      <a
        ref={ref}
        href={telHref}
        className={cn(
          "inline-flex items-center gap-1.5 text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer",
          className
        )}
        {...props}
      >
        {showIcon && <Phone className={cn("h-4 w-4 flex-shrink-0", iconClassName)} />}
        {children || phone}
      </a>
    );
  }
);
ClickablePhone.displayName = "ClickablePhone";

/**
 * ClickableEmail - Renders an email as a clickable mailto: link
 * Opens the device's default email client
 */
export const ClickableEmail = React.forwardRef<HTMLAnchorElement, ClickableEmailProps>(
  ({ email, showIcon = true, iconClassName, className, children, ...props }, ref) => {
    const mailtoHref = `mailto:${encodeURIComponent(email)}`;
    
    return (
      <a
        ref={ref}
        href={mailtoHref}
        className={cn(
          "inline-flex items-center gap-1.5 text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer",
          className
        )}
        {...props}
      >
        {showIcon && <Mail className={cn("h-4 w-4 flex-shrink-0", iconClassName)} />}
        {children || email}
      </a>
    );
  }
);
ClickableEmail.displayName = "ClickableEmail";
