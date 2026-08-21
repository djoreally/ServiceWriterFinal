// Public Mapbox token (tiles + geocoding). Must be set in VITE_MAPBOX_PUBLIC_TOKEN.
const rawToken = (import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "").trim();

/**
 * Mapbox public tokens always start with `pk.`. Misconfigured environments have
 * shipped human labels (e.g. "Marketing Integrations") into this variable,
 * which makes every geocoding request fail with an opaque 401. Treat anything
 * that isn't a real public token as absent so callers degrade cleanly.
 */
const isValidPublicToken = (value: string): boolean => value.startsWith("pk.") && value.length > 20;

const token = isValidPublicToken(rawToken) ? rawToken : "";

if (rawToken && !token) {
  console.warn(
    "[mapbox] VITE_MAPBOX_PUBLIC_TOKEN is set but is not a valid Mapbox public token (expected a value starting with 'pk.'). Address autocomplete and maps are disabled.",
  );
}

// Expose token for existing imports; prefer requireMapboxToken() in new code.
export const MAPBOX_ACCESS_TOKEN = token;

export const MAPBOX_DEFAULT_STYLE = "mapbox://styles/mapbox/streets-v12";

/** True when a usable public token is configured. */
export const hasMapboxToken = (): boolean => token.length > 0;

/** Ensure a token exists or throw with a clear setup hint. */
export const requireMapboxToken = (): string => {
	if (!token) {
		throw new Error("Missing Mapbox public token. Set VITE_MAPBOX_PUBLIC_TOKEN in your env.");
	}
	return token;
};
