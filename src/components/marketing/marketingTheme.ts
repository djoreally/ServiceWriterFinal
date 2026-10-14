/**
 * Marketing theme constants — pure values, no imports.
 *
 * Server-safe: importable from App Router server components
 * (e.g. `ServerHomepage`) without pulling in react-router or any
 * client-only module. `MarketingLayout` re-exports these so existing
 * legacy-page imports keep working unchanged.
 */

export const PRIMARY = "#596400";
export const PRIMARY_CONTAINER = "#e5ff00";
export const SURFACE = "#fbf9f8";
export const SURFACE_DIM = "#dbdad9";

export const neoBtn =
  "inline-flex items-center gap-2 border-[4px] border-black uppercase font-bold px-6 py-3 transition-all duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
export const hardShadow = { boxShadow: "4px 4px 0px #000000" };
export const hardShadowLg = { boxShadow: "8px 8px 0px #000000" };
export const hankenStack = { fontFamily: "'Hanken Grotesk', sans-serif" };
export const interStack = { fontFamily: "'Inter', sans-serif" };
export const monoStack = { fontFamily: "'JetBrains Mono', monospace" };
