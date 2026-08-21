/**
 * GDPR deletion coverage — proves the remediated tables are wired into both
 * the soft-delete list (used by the request-deletion flow) AND the hard-delete
 * list (used by the grace-period cron), so a Right-to-Erasure request can
 * actually purge them.
 *
 * Reads the edge-function source files as text and asserts membership; that
 * way the assertions stay honest even without a Deno test runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SOFT_DELETE_TABLES } from '../soft-delete';

const REMEDIATED_TABLES = [
  'payment_records',
  'invoices',
  'invoice_line_items',
  'services',
  'work_orders',
  'business_profiles',
  'email_settings',
  'customer_preferences',
] as const;

const repoRoot = path.resolve(__dirname, '../../..');
const gdprSoftDeleteSrc = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/gdpr-account-deletion/index.ts'),
  'utf8',
);
const hardDeleteSrc = fs.readFileSync(
  path.join(repoRoot, 'supabase/functions/account-hard-delete/index.ts'),
  'utf8',
);

function extractArray(src: string, name: string): string[] {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${name} in edge function source`);
  return Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
}

const edgeSoftDeleteTables = extractArray(gdprSoftDeleteSrc, 'SOFT_DELETE_TABLES');
const edgeHardDeleteTables = extractArray(hardDeleteSrc, 'USER_DATA_TABLES');

describe('GDPR deletion coverage — remediated tables', () => {
  describe.each(REMEDIATED_TABLES)('%s', (table) => {
    it('is in the client-side SOFT_DELETE_TABLES list', () => {
      expect(SOFT_DELETE_TABLES as readonly string[]).toContain(table);
    });

    it('is in the gdpr-account-deletion edge function soft-delete list', () => {
      expect(edgeSoftDeleteTables).toContain(table);
    });

    it('is in the account-hard-delete edge function purge list', () => {
      expect(edgeHardDeleteTables).toContain(table);
    });
  });

  it('client soft-delete list and edge soft-delete list agree on the remediated set', () => {
    for (const t of REMEDIATED_TABLES) {
      expect(SOFT_DELETE_TABLES as readonly string[]).toContain(t);
      expect(edgeSoftDeleteTables).toContain(t);
    }
  });

  it('every soft-deletable table is covered by hard-delete', () => {
    const missing = (SOFT_DELETE_TABLES as readonly string[]).filter(
      (t) => !edgeHardDeleteTables.includes(t),
    );
    expect(missing).toEqual([]);
  });
});
