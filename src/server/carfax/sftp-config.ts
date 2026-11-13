/**
 * CARFAX SFTP connection configuration — environment only.
 *
 * CARFAX issues the feed credentials during onboarding (after sample
 * approval and the agreement). They live in the deployment environment,
 * never in code, settings rows, fixtures, or logs:
 *
 *   CARFAX_SFTP_HOST        e.g. data.carfax.com
 *   CARFAX_SFTP_PORT        optional, default 22
 *   CARFAX_SFTP_USER        CARFAX-issued username
 *   CARFAX_SFTP_PASSWORD    password auth — or —
 *   CARFAX_SFTP_KEY_PATH    path to a private key file on the server
 *   CARFAX_SFTP_REMOTE_DIR  optional, default "/"
 *
 * readCarfaxSftpConfig never throws and never includes a secret value in
 * its result: a missing/invalid setup comes back as the list of variable
 * NAMES that are absent, which is what gets recorded on the run record.
 */

export interface CarfaxSftpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  remoteDir: string;
}

export type CarfaxSftpConfigResult =
  | { ok: true; config: CarfaxSftpConfig }
  | { ok: false; missing: string[] };

/** Type guard for the missing-configuration variant (the repo compiles
 *  without strict mode, so callers narrow through this rather than
 *  truthiness on the discriminant). */
export function isCarfaxSftpConfigMissing(
  result: CarfaxSftpConfigResult,
): result is Extract<CarfaxSftpConfigResult, { ok: false }> {
  return result.ok === false;
}

export function readCarfaxSftpConfig(
  env: Record<string, string | undefined> = process.env,
): CarfaxSftpConfigResult {
  const missing: string[] = [];

  const host = env.CARFAX_SFTP_HOST?.trim() ?? "";
  if (!host) missing.push("CARFAX_SFTP_HOST");

  const username = env.CARFAX_SFTP_USER?.trim() ?? "";
  if (!username) missing.push("CARFAX_SFTP_USER");

  const password = env.CARFAX_SFTP_PASSWORD ?? "";
  const privateKeyPath = env.CARFAX_SFTP_KEY_PATH?.trim() ?? "";
  if (!password && !privateKeyPath) missing.push("CARFAX_SFTP_PASSWORD or CARFAX_SFTP_KEY_PATH");

  let port = 22;
  const rawPort = env.CARFAX_SFTP_PORT?.trim() ?? "";
  if (rawPort) {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      missing.push("CARFAX_SFTP_PORT (must be an integer between 1 and 65535)");
    } else {
      port = parsed;
    }
  }

  if (missing.length > 0) return { ok: false, missing };

  const remoteDirRaw = env.CARFAX_SFTP_REMOTE_DIR?.trim() ?? "";
  return {
    ok: true,
    config: {
      host,
      port,
      username,
      ...(password ? { password } : {}),
      ...(privateKeyPath ? { privateKeyPath } : {}),
      remoteDir: remoteDirRaw || "/",
    },
  };
}
