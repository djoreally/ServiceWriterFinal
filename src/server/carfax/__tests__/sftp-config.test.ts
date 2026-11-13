import { readCarfaxSftpConfig } from "../sftp-config";

describe("readCarfaxSftpConfig", () => {
  it("reports every missing piece by variable name, with no values", () => {
    const result = readCarfaxSftpConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a missing-config result");
    expect(result.missing).toEqual([
      "CARFAX_SFTP_HOST",
      "CARFAX_SFTP_USER",
      "CARFAX_SFTP_PASSWORD or CARFAX_SFTP_KEY_PATH",
    ]);
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("accepts password auth and defaults port and remote dir", () => {
    const result = readCarfaxSftpConfig({
      CARFAX_SFTP_HOST: "data.carfax.com",
      CARFAX_SFTP_USER: "sw-feed",
      CARFAX_SFTP_PASSWORD: "secret",
    });
    expect(result).toEqual({
      ok: true,
      config: {
        host: "data.carfax.com",
        port: 22,
        username: "sw-feed",
        password: "secret",
        remoteDir: "/",
      },
    });
  });

  it("accepts key auth and an explicit port and remote dir", () => {
    const result = readCarfaxSftpConfig({
      CARFAX_SFTP_HOST: "data.carfax.com",
      CARFAX_SFTP_PORT: "2222",
      CARFAX_SFTP_USER: "sw-feed",
      CARFAX_SFTP_KEY_PATH: "/run/secrets/carfax_sftp_key",
      CARFAX_SFTP_REMOTE_DIR: "/incoming",
    });
    expect(result).toEqual({
      ok: true,
      config: {
        host: "data.carfax.com",
        port: 2222,
        username: "sw-feed",
        privateKeyPath: "/run/secrets/carfax_sftp_key",
        remoteDir: "/incoming",
      },
    });
  });

  it("rejects a non-numeric port as a configuration error", () => {
    const result = readCarfaxSftpConfig({
      CARFAX_SFTP_HOST: "data.carfax.com",
      CARFAX_SFTP_PORT: "ssh",
      CARFAX_SFTP_USER: "sw-feed",
      CARFAX_SFTP_PASSWORD: "secret",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a missing-config result");
    expect(result.missing.join(" ")).toContain("CARFAX_SFTP_PORT");
  });
});
