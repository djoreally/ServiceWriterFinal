import fs from "fs";
import path from "path";

const REPORTING_QUERY_FILES = [
  "src/application/queries/dynamic-custom-reports.query.ts",
  "src/application/queries/reports.query.ts",
  "src/application/queries/reports-canonical.query.ts",
  "src/application/queries/inventory-usage.query.ts",
];

/**
 * `services` and `appointments` are joined by two foreign keys
 * (services.appointment_id and appointments.service_record_id), so a bare
 * embed between them fails with PGRST201. Any embed of one inside a select
 * that starts from the other must carry an explicit relationship hint.
 */
function findAmbiguousEmbeds(source: string): string[] {
  const lines = source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, ""));
  const offenders: string[] = [];
  let currentTable: string | null = null;

  lines.forEach((line, index) => {
    const fromMatch = line.match(/\.from\(\s*["'`](\w+)["'`]/);
    if (fromMatch) currentTable = fromMatch[1];
    if (currentTable === "services" && /(^|[\s,(])appointments\s*\(/.test(line)) {
      offenders.push(`line ${index + 1}: bare appointments embed from services`);
    }
    if (currentTable === "appointments" && /(^|[\s,(])services\s*\(/.test(line)) {
      offenders.push(`line ${index + 1}: bare services embed from appointments`);
    }
  });

  return offenders;
}

describe("reporting queries disambiguate services <-> appointments embeds", () => {
  it.each(REPORTING_QUERY_FILES)("%s uses explicit relationship hints", (file) => {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) return;
    expect(findAmbiguousEmbeds(fs.readFileSync(full, "utf8"))).toEqual([]);
  });
});
