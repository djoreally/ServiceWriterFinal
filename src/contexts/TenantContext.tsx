import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchTenantProfile,
  resolveTenant,
  type TenantProfileData,
  type TenantSource,
} from "@/application/queries/tenant.query";

interface TenantProviderProps {
  children: ReactNode;
  routeSlug?: string;
}

export type TenantErrorKind = "not_found" | "network" | null;

interface TenantContextValue {
  slug: string | null;
  source: TenantSource | null;
  tenant: TenantProfileData | null;
  loading: boolean;
  isValid: boolean;
  isPaymentEnabled: boolean;
  error: string | null;
  /**
   * Distinguishes "this shop does not exist" from "we could not reach the
   * backend". A network failure must NOT fall back to the marketing homepage.
   */
  errorKind: TenantErrorKind;
  retry: () => void;
}

const DEFAULT_TENANT_STATE: TenantContextValue = {
  slug: null,
  source: null,
  tenant: null,
  loading: false,
  isValid: false,
  isPaymentEnabled: false,
  error: null,
  errorKind: null,
  retry: () => {},
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

function getInitialTenantState(routeSlug?: string): TenantContextValue {
  const resolution = resolveTenant(routeSlug);
  if (!resolution.resolved || !resolution.tenant) {
    return DEFAULT_TENANT_STATE;
  }

  return {
    ...DEFAULT_TENANT_STATE,
    slug: resolution.tenant.slug,
    source: resolution.tenant.source,
    loading: true,
  };
}

export function TenantProvider({ children, routeSlug }: TenantProviderProps) {
  const [state, setState] = useState<TenantContextValue>(() => getInitialTenantState(routeSlug));
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function initTenant() {
      const resolution = resolveTenant(routeSlug);

      if (!resolution.resolved || !resolution.tenant) {
        if (isActive) {
          setState(DEFAULT_TENANT_STATE);
        }
        return;
      }

      const { slug, source } = resolution.tenant;

      setState((previous) => ({
        ...previous,
        slug,
        source,
        tenant: null,
        loading: true,
        isValid: false,
        isPaymentEnabled: false,
        error: null,
      }));

      try {
        const tenant = await fetchTenantProfile(slug);
        if (!isActive) {
          return;
        }

        if (!tenant) {
          setState({
            ...DEFAULT_TENANT_STATE,
            slug,
            source,
            loading: false,
            error: "Tenant not found",
            errorKind: "not_found",
          });
          return;
        }

        setState({
          ...DEFAULT_TENANT_STATE,
          slug,
          source,
          tenant,
          loading: false,
          isValid: true,
          isPaymentEnabled: Boolean(tenant.stripe_charges_enabled),
        });
      } catch (err) {
        console.error("[TenantContext] Error loading tenant:", err);
        if (!isActive) {
          return;
        }

        setState({
          ...DEFAULT_TENANT_STATE,
          slug,
          source,
          loading: false,
          error: "We couldn't reach the booking service. Please try again.",
          errorKind: "network",
        });
      }
    }

    void initTenant();

    return () => {
      isActive = false;
    };
  }, [routeSlug, reloadToken]);

  const contextValue = useMemo(
    () => ({ ...state, retry: () => setReloadToken((token) => token + 1) }),
    [state],
  );

  return <TenantContext.Provider value={contextValue}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }

  return context;
}

export function useRequiredTenant() {
  const context = useTenant();
  if (!context.isValid || !context.tenant || !context.slug) {
    throw new Error("Valid tenant context required but not available");
  }

  return context as TenantContextValue & {
    slug: string;
    tenant: TenantProfileData;
    isValid: true;
  };
}
