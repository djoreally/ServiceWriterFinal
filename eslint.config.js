import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

// UX copy guardrail — shared across config blocks that set no-restricted-syntax.
const FORBIDDEN_PHRASE_RULE = {
  selector:
    "Literal[value=/.*(we automatically handled that for you|the system decided|ai fixed this|don\\'t worry about it).*/i]",
  message: "Prohibited phrase in UX copy. Use transparent, accountable language.",
};

// F0 financial guardrail — ban raw `number` for money-typed fields. Use `Cents`
// or `Dollars` from `@/lib/money` instead. Branded types are intersection types
// (`number & { __brand }`), so these selectors only fire on unbranded `number`.
const MONEY_FIELD_RULES = [
  {
    selector:
      "TSPropertySignature[key.name=/^(amount|amount_cents|amountCents|amountDollars|total|subtotal|price|cost|fee|tax|discount|refund|refunded|balance|balance_due|balanceDue|total_cost|totalCost|total_due|totalDue|balance_due_cents|balanceDueCents|line_total|lineTotal|unit_price|unitPrice|labor_cost|parts_cost|estimated_cost|sell_price|unit_cost|default_price)$/] > TSTypeAnnotation > TSNumberKeyword",
    message:
      "Money-typed field must use `Cents` or `Dollars` from `@/lib/money` — raw `number` is banned by F0 financial guardrails.",
  },
  {
    selector:
      "TSPropertySignature[key.name=/^(amount|amount_cents|amountCents|total|subtotal|price|cost|fee|tax|discount|refund|balance|total_cost|total_due|balance_due|balance_due_cents|labor_cost|parts_cost)$/] > TSTypeAnnotation > TSUnionType > TSNumberKeyword",
    message:
      "Money-typed field must use `Cents` or `Dollars` from `@/lib/money` — raw `number` (even in a union) is banned by F0 financial guardrails.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".next/**",
      "next-env.d.ts",
      "coverage/**",
      "e2e/playwright-report/**",
      "test-results/**",
      "apps/web-next/.next/**",
      "apps/web-next/next-env.d.ts",
      "supabase/functions/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "coverage/**",
      "e2e/playwright-report/**",
      "test-results/**",
      "apps/web-next/.next/**",
      "apps/web-next/next-env.d.ts",
      "supabase/functions/**",
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      react,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", {
        allowConstantExport: true,
        // Audited framework exports, provider hooks, and colocated public helpers.
        // Keeping this list explicit preserves enforcement for every future export.
        allowExportNames: [
          "metadata", "viewport", "calculateCouponDiscount", "getDateRangeFromPreset", "VAN_COLORS",
          "hardShadow", "hardShadowLg", "hankenStack", "interStack", "monoStack", "useMarketingFonts",
          "subscribeOnOptIn", "statusBadge", "getPaymentMethodLabel", "PLANS", "resolveTechPresenceAction",
          "badgeVariants", "buttonVariants", "useFormField", "PAGE_SIZE_OPTIONS", "paginate", "usePageSlice",
          "navigationMenuTriggerStyle", "useSidebar", "getToastHistory", "notify", "toast", "toggleVariants",
          "useKeyboardShortcuts", "CURRENCIES", "TIMEZONES", "useRegionalSettings", "isSuperAdmin",
          "useSubscription", "useFeatureGate", "useTenant", "useRequiredTenant", "useTerminology",
          "useInlineSearchPreview", "highlightSearchMatch", "useTechContext", "useAuth", "useRBAC",
          "useSessionSecurity", "hasRole", "isAdmin", "isResourceOwner", "canAccessTenant",
          "canModifyResource", "withPermission", "useFeatures",
        ],
      }],
      // JSX structural safety — supplementary to tsc, catches related issues at lint time.
      "react/jsx-no-undef": "error",
      "react/jsx-key": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "@typescript-eslint/no-unused-vars": "off",
      // Keep compatibility debt visible, but never allow an automated fix to
      // replace `any` with `unknown` across untyped external boundaries.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": "warn",
      // Prevent Stripe SDK imports in frontend code, and enforce charting + architecture rules
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["stripe", "stripe/*", "@stripe/*"],
              message: "Stripe SDK must only be used in edge functions, not frontend code. Use supabase.functions.invoke() to call payment endpoints.",
            },
            {
              group: ["chart.js", "chart.js/*", "d3", "d3/*", "@d3/*", "nivo", "@nivo/*", "victory", "victory/*"],
              message: "Charting: use Recharts only. chart.js, d3, nivo, and victory are forbidden in this codebase.",
            },
            {
              group: ["@/domains/*"],
              message: "src/domains/ is deprecated. Use src/application/queries/ or src/application/commands/ instead.",
            },
          ],
          paths: [
            {
              name: "@/application/queries",
              importNames: ["*"],
              message: "Use the application layer for all data fetching. Do not fetch data directly in components.",
            },
          ],
        },
      ],
      // Forbid forbidden terminology in codebase
      "no-restricted-syntax": ["error", FORBIDDEN_PHRASE_RULE],

    },
  },
  {
    files: ["src/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      // Test harness modules are not part of the browser HMR graph.
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // F0 financial guardrail — enforced as an error inside the financial
    // domain (where money types are authored). Legacy transport/DTO types
    // elsewhere are migrated in the F4 column migration phase.
    files: [
      "src/lib/money.ts",
      "src/domain/financials/**/*.{ts,tsx}",
      "src/domain/pricing/**/*.{ts,tsx}",
      "src/application/presenters/fleet-invoice-*.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", FORBIDDEN_PHRASE_RULE, ...MONEY_FIELD_RULES],
    },
  },

  {
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/supabase-js", "@supabase/supabase-js/*"],
              message: "Direct Supabase usage is not allowed in components/pages. Use the application layer (src/application/queries or commands) for data access.",
            },
          ],
          paths: [
            {
              name: "@/integrations/supabase/client",
              message: "Import data access from src/application/queries or src/application/commands instead of using the Supabase client directly in components/pages.",
            },
          ],
        },
      ],
      // Close the dynamic-import loophole: static rule above only catches
      // `import ... from`; components previously bypassed it via
      // `await import("@/integrations/supabase/client")`. Block that too.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/@\\/integrations\\/supabase\\/client|@supabase\\/supabase-js/]",
          message: "Dynamic import of the Supabase client is not allowed in components/pages. Add or use a helper in src/application/queries or src/application/commands.",
        },
      ],
    },
  },

  {
    // Auth/session/consent surfaces legitimately talk to the auth client
    // directly (sign-in, MFA, session revocation, invite acceptance,
    // unsubscribe). The application layer intentionally does not wrap
    // `supabase.auth`, so these files are exempt from the data-access ban.
    files: [
      "src/components/admin/AdminTrainingRewards.tsx",
      "src/components/ai/AIAssistant.tsx",
      "src/components/pricing/CatalogBenchmarkDialog.tsx",
      "src/components/security/RequireMfa.tsx",
      "src/components/settings/GDPRDataManagement.tsx",
      "src/pages/MfaRequired.tsx",
      "src/pages/SessionManagement.tsx",
      "src/pages/TeamJoin.tsx",
      "src/pages/Unsubscribe.tsx",
      "src/pages/WorkforceAuth.tsx",
      "src/pages/FleetManagerPortal.tsx",
      "src/pages/fleet-os/FleetHelpPage.tsx",
      "src/pages/fleet-os/work-orders/create/FleetWorkOrderCreatePage.tsx",
      "src/pages/tech-app/TechToday.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": ["error", FORBIDDEN_PHRASE_RULE],
    },
  },



  {
    files: [
      "src/lib/livePresence.ts",
      "src/application/commands/campaigns.command.ts",
      "src/application/queries/campaigns.query.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Enable typed linting for this scoped block. projectService lets
        // typescript-eslint locate the correct tsconfig per file without
        // requiring an explicit project path list.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
    },
  },
  // ── Hook policy ─────────────────────────────────────────────────────────
  // src/hooks/** may use the Supabase client directly ONLY for:
  //   1. Realtime channel subscriptions (supabase.channel/.on/.subscribe) —
  //      subscription lifecycle cannot be abstracted without over-engineering.
  //   2. Auth session operations (supabase.auth.*) where the hook owns the
  //      auth state lifecycle (e.g. useTechIdentity).
  //   3. Orchestration hooks must delegate ALL data mutations to
  //      src/application/commands and reads to src/application/queries.
  //      No raw calls in orchestration hooks (useBookingSubmit pattern).
  // Hooks that perform plain CRUD without realtime/auth lifecycle concerns
  // should route through the application layer, same as components/pages.
  {
    files: ["src/hooks/**/*.{ts,tsx}"],
    rules: {
      // No no-restricted-imports restriction on supabase/client for hooks.
      // Realtime subscription and auth lifecycle hooks require direct access.
      // See hook policy comment above for enforcement boundaries.
    },
  },
);
