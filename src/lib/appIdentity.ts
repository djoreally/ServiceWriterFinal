export const SERVICE_WRITER_PROJECT_ID = "6e250a02-e2c6-4f56-bf35-debf576cf8be";
export const SERVICE_WRITER_APP_SLUG = "service-writer";

// This app has exactly ONE backend: the Lovable Cloud project
// hqfimxqsrwknvsuiizlg. It is the only project this workspace can migrate and
// deploy functions to, so preview and production always run the same schema.
// The retired external project (emvoddhlraalwkzswcki) must never be addressed
// again — it drifted hundreds of migrations behind and its key was revoked.
export const CANONICAL_BACKEND_PROJECT_ID = "hqfimxqsrwknvsuiizlg";


/** Back-compat alias: Live is the only backend. */
export const LIVE_BACKEND_PROJECT_ID = CANONICAL_BACKEND_PROJECT_ID;

/** Every host — local, preview, custom domain — must run the single backend. */
export function expectedBackendForHost(_hostname: string): string {
  return CANONICAL_BACKEND_PROJECT_ID;
}


// Derived from the backend the build actually resolved (see vite.config.ts).
// It must never be hardcoded to a second project: doing so shipped an invalid
// publishable key and made every auth/data request fail with 401.
export const SERVICE_WRITER_BACKEND_PROJECT_ID = __BACKEND_PROJECT_ID__;



export interface AppIdentity {
  projectId: string;
  appSlug: string;
  version: string;
  backendProjectId: string;
}

export const APP_IDENTITY: AppIdentity = Object.freeze({
  projectId: __LOVABLE_PROJECT_ID__,
  appSlug: __APP_SLUG__,
  version: __APP_VERSION__,
  backendProjectId: __BACKEND_PROJECT_ID__,
});

function previewProjectId(hostname: string): string | null {
  const match = hostname.match(
    /^(?:id-preview--|preview--)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i,
  );
  return match?.[1] ?? null;
}

export function getAppIdentityMismatch(hostname: string): string | null {
  if (APP_IDENTITY.projectId !== SERVICE_WRITER_PROJECT_ID) {
    return `compiled project ${APP_IDENTITY.projectId}`;
  }
  if (APP_IDENTITY.appSlug !== SERVICE_WRITER_APP_SLUG) {
    return `compiled app ${APP_IDENTITY.appSlug}`;
  }
  if (APP_IDENTITY.backendProjectId !== SERVICE_WRITER_BACKEND_PROJECT_ID) {
    return `compiled backend ${APP_IDENTITY.backendProjectId}`;
  }
  const expectedBackend = expectedBackendForHost(hostname);
  if (APP_IDENTITY.backendProjectId && APP_IDENTITY.backendProjectId !== expectedBackend) {
    return `backend ${APP_IDENTITY.backendProjectId} served on a host that requires ${expectedBackend}`;
  }

  const hostProjectId = previewProjectId(hostname);
  if (hostProjectId && hostProjectId !== SERVICE_WRITER_PROJECT_ID) {
    return `preview host project ${hostProjectId}`;
  }
  return null;
}

export function publishAppIdentity(documentNode: Document): void {
  documentNode.documentElement.dataset.appProjectId = APP_IDENTITY.projectId;
  documentNode.documentElement.dataset.appSlug = APP_IDENTITY.appSlug;
  documentNode.documentElement.dataset.appVersion = APP_IDENTITY.version;
  documentNode.documentElement.dataset.backendProjectId = APP_IDENTITY.backendProjectId;
  let meta = documentNode.head.querySelector<HTMLMetaElement>('meta[name="service-writer-app-identity"]');
  if (!meta) {
    meta = documentNode.createElement("meta");
    meta.name = "service-writer-app-identity";
    documentNode.head.appendChild(meta);
  }
  meta.content = `${APP_IDENTITY.projectId}:${APP_IDENTITY.appSlug}:${APP_IDENTITY.backendProjectId}:${APP_IDENTITY.version}`;
}

export function renderIdentityFailure(root: HTMLElement, mismatch: string): void {
  root.replaceChildren();
  const main = document.createElement("main");
  main.setAttribute("role", "alert");
  main.style.cssText = "min-height:100vh;display:grid;place-items:center;padding:24px;background:#000;color:#f5f5f7;font:16px/1.5 system-ui,sans-serif";
  const panel = document.createElement("section");
  panel.style.cssText = "max-width:680px;border:1px solid #444;padding:24px;border-radius:16px";
  const heading = document.createElement("h1");
  heading.textContent = "Incorrect application build blocked";
  heading.style.cssText = "margin:0 0 12px;font-size:24px";
  const body = document.createElement("p");
  body.textContent = "This preview did not receive the Service Writer build. No login or application data was loaded.";
  const detail = document.createElement("code");
  detail.textContent = `Expected ${SERVICE_WRITER_PROJECT_ID}/${SERVICE_WRITER_BACKEND_PROJECT_ID}; received ${mismatch}; build ${APP_IDENTITY.version}`;
  detail.style.cssText = "display:block;margin-top:16px;overflow-wrap:anywhere;color:#8ec5ff";
  panel.append(heading, body, detail);
  main.appendChild(panel);
  root.appendChild(main);
}