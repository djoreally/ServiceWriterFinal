/**
 * CARFAX feed transfer — SFTP upload of one generated feed file.
 *
 * The SFTP client is loaded dynamically so that importing the generator
 * (tests, dry runs, generation-only runs) never loads the SSH stack, and so
 * a missing configuration is reported before any network code runs. The
 * upload carries only the feed file: its name and bytes. Configuration
 * values (host, credentials) are never written to logs or error messages.
 */
import { readFile } from "node:fs/promises";
import type { CarfaxSftpConfig } from "./sftp-config";

export type CarfaxUploader = (
  config: CarfaxSftpConfig,
  fileName: string,
  content: string,
) => Promise<void>;

function remotePath(remoteDir: string, fileName: string): string {
  return remoteDir.endsWith("/") ? `${remoteDir}${fileName}` : `${remoteDir}/${fileName}`;
}

/** Default uploader: a real SFTP session via ssh2-sftp-client. */
export const uploadCarfaxFeedViaSftp: CarfaxUploader = async (config, fileName, content) => {
  const { default: SftpClient } = await import("ssh2-sftp-client");
  const client = new SftpClient();
  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      ...(config.password ? { password: config.password } : {}),
      ...(config.privateKeyPath
        ? { privateKey: await readFile(config.privateKeyPath) }
        : {}),
    });
    if (config.remoteDir !== "/") {
      await client.mkdir(config.remoteDir, true);
    }
    await client.put(Buffer.from(content, "utf8"), remotePath(config.remoteDir, fileName));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`SFTP upload to ${config.host} failed: ${message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
};
