/**
 * SW-86: route registration proof for the CARFAX settings screen.
 *
 * Audit gap G7: CarfaxSettings existed but nothing imported or mounted
 * it, so /settings/carfax (and every other path) 404'd and the Settings
 * search returned "No settings match" for "Carfax". This source-pin test
 * follows the repo's route-gate convention (cf. plate-lookup-route):
 * the screen's registration in the Settings shell — import, section
 * registry entry (which drives sidebar nav, the in-tab contents list,
 * and cross-tab search), the anchored mount inside the Integrations tab,
 * and the deep-link alias — must all be present for the screen to be
 * reachable in the app.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../../..");
const settingsSource = readFileSync(
  resolve(repoRoot, "src/legacy-pages/Settings.tsx"),
  "utf8"
);
const settingsRouteSource = readFileSync(
  resolve(repoRoot, "app/(app)/settings/page.tsx"),
  "utf8"
);

describe("CARFAX settings screen registration (SW-86)", () => {
  it("Settings imports the CarfaxSettings screen", () => {
    expect(settingsSource).toContain(
      'import { CarfaxSettings } from "@/components/settings/CarfaxSettings";'
    );
  });

  it("registers a CARFAX section in the Integrations tab registry, findable by Settings search", () => {
    const integrationsStart = settingsSource.indexOf('id: "integrations"');
    const advancedStart = settingsSource.indexOf('id: "advanced"');
    expect(integrationsStart).toBeGreaterThan(-1);
    expect(advancedStart).toBeGreaterThan(integrationsStart);

    const integrationsBlock = settingsSource.slice(integrationsStart, advancedStart);
    expect(integrationsBlock).toContain('id: "carfax"');
    expect(integrationsBlock).toContain('label: "CARFAX"');
    // The search index matches on keywords — "carfax" must be one of them.
    expect(integrationsBlock).toMatch(/id: "carfax"[^}]*keywords: \[[^\]]*"carfax"/);
  });

  it("mounts the screen inside the Integrations tab under its section anchor", () => {
    const integrationsTab = settingsSource.indexOf('<TabsContent value="integrations"');
    const anchor = settingsSource.indexOf('<SectionAnchor id="carfax" label="CARFAX">');
    const advancedTab = settingsSource.indexOf('<TabsContent value="advanced"');
    expect(integrationsTab).toBeGreaterThan(-1);
    expect(anchor).toBeGreaterThan(integrationsTab);
    expect(advancedTab).toBeGreaterThan(anchor);

    const mounted = settingsSource.slice(anchor, advancedTab);
    expect(mounted).toContain("<CarfaxSettings />");
  });

  it("deep-links ?tab=carfax to the Integrations tab", () => {
    expect(settingsRouteSource).toContain('carfax: "integrations"');
  });
});
