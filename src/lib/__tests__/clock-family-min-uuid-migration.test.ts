import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the 2026-11-10 clock-family min(uuid) repair migration
// (20261110180000) against the Step 4 family migration (20261110124500)
// it corrects. Production bodies were verified byte-identical to the
// Step 4 file on 2026-11-10 by in-DB fingerprints:
//   clock_in                      len 2034 md5 852765ea56c7d4924d294aa37dc96bf1
//   create_team_os_technician_v1  len 2798 md5 d1b3b32cefb1780c29cb7cc95ae841af
// and a rolled-back production probe of clock_in threw
// 42883 "function min(uuid) does not exist" at the technicians select.

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const STEP4 = readFileSync(
  join(MIGRATIONS, "20261110124500_step4_dispatch_team_family.sql"),
  "utf8",
);
const FIX = readFileSync(
  join(MIGRATIONS, "20261110180000_clock_family_min_uuid_fix.sql"),
  "utf8",
);

function bodyOf(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  if (start < 0) throw new Error(`function ${fn} not found`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("$$;", open);
  if (open < 0 || close < 0) throw new Error(`body of ${fn} not delimited`);
  return sql.slice(open + "as $$".length, close);
}

const CLOCK_A_OLD =
  "  select count(*), min(t.workspace_id), min(t.id)\n" +
  "    into v_tech_rows, v_workspace_id, v_technician_id\n" +
  "  from public.technicians t\n" +
  "  where t.auth_user_id = v_user;";
const CLOCK_A_NEW =
  "  select count(*) into v_tech_rows\n" +
  "  from public.technicians t\n" +
  "  where t.auth_user_id = v_user;\n" +
  "  if v_tech_rows = 1 then\n" +
  "    select t.workspace_id, t.id into v_workspace_id, v_technician_id\n" +
  "    from public.technicians t\n" +
  "    where t.auth_user_id = v_user;\n" +
  "  end if;";

const CLOCK_B_OLD =
  "    select count(*), min(wm.workspace_id)\n" +
  "      into v_memberships, v_workspace_id\n" +
  "    from public.workspace_members wm\n" +
  "    where wm.user_id = v_user and wm.is_active;";
const CLOCK_B_NEW =
  "    select count(*) into v_memberships\n" +
  "    from public.workspace_members wm\n" +
  "    where wm.user_id = v_user and wm.is_active;\n" +
  "    if v_memberships = 1 then\n" +
  "      select wm.workspace_id into v_workspace_id\n" +
  "      from public.workspace_members wm\n" +
  "      where wm.user_id = v_user and wm.is_active;\n" +
  "    end if;";

const TEAM_C_OLD =
  "  select count(*), min(wm.workspace_id)\n" +
  "    into v_memberships, v_workspace_id\n" +
  "  from public.workspace_members wm\n" +
  "  where wm.user_id = v_user and wm.is_active;";
const TEAM_C_NEW =
  "  select count(*) into v_memberships\n" +
  "  from public.workspace_members wm\n" +
  "  where wm.user_id = v_user and wm.is_active;\n" +
  "  if v_memberships = 1 then\n" +
  "    select wm.workspace_id into v_workspace_id\n" +
  "    from public.workspace_members wm\n" +
  "    where wm.user_id = v_user and wm.is_active;\n" +
  "  end if;";

describe("clock family min(uuid) repair migration", () => {
  const oldClock = bodyOf(STEP4, "clock_in");
  const newClock = bodyOf(FIX, "clock_in");
  const oldTeam = bodyOf(STEP4, "create_team_os_technician_v1");
  const newTeam = bodyOf(FIX, "create_team_os_technician_v1");

  it("sanity: the Step 4 bodies contain the defective selects", () => {
    expect(oldClock).toContain(CLOCK_A_OLD);
    expect(oldClock).toContain(CLOCK_B_OLD);
    expect(oldTeam).toContain(TEAM_C_OLD);
  });

  it("clock_in: the repaired body is the production body with exactly the two selects replaced", () => {
    const expected = oldClock.replace(CLOCK_A_OLD, CLOCK_A_NEW).replace(CLOCK_B_OLD, CLOCK_B_NEW);
    expect(newClock).toBe(expected);
  });

  it("create_team_os_technician_v1: the repaired body is the production body with exactly the one select replaced", () => {
    const expected = oldTeam.replace(TEAM_C_OLD, TEAM_C_NEW);
    expect(newTeam).toBe(expected);
  });

  it("no min( aggregate remains in either repaired body", () => {
    expect(newClock).not.toContain("min(");
    expect(newTeam).not.toContain("min(");
  });

  it("negative control: without the substitutions the bodies differ", () => {
    expect(newClock).not.toBe(oldClock);
    expect(newTeam).not.toBe(oldTeam);
  });
});
