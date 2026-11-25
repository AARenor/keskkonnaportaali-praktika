import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runtimeDatabaseUrlModule = new URL("../scripts/coolify_runtime_database_url.mjs", import.meta.url);
const moduleUrl = new URL("../scripts/coolify_private_database_host.mjs", import.meta.url);

async function validator() {
  const loaded = await import(moduleUrl.href);
  return loaded.privateDatabaseHost;
}

test("accepts the Coolify container service name without exposing credentials", async () => {
  const privateDatabaseHost = await validator();
  assert.equal(
    privateDatabaseHost("postgres://user:secret@s33cu0iqbu0dao7lzolnxyz0:5432/praktika"),
    "s33cu0iqbu0dao7lzolnxyz0",
  );
});

test("accepts loopback and private IPv4 database hosts", async () => {
  const privateDatabaseHost = await validator();
  for (const host of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.1"]) {
    assert.equal(privateDatabaseHost(`postgresql://user:secret@${host}:5432/db`), host);
  }
});

test("accepts loopback and unique local IPv6 database hosts", async () => {
  const privateDatabaseHost = await validator();
  assert.equal(privateDatabaseHost("postgres://user:secret@[::1]:5432/db"), "::1");
  assert.equal(privateDatabaseHost("postgres://user:secret@[fd00::1]:5432/db"), "fd00::1");
});

test("rejects public DNS database hosts", async () => {
  const privateDatabaseHost = await validator();
  assert.throws(
    () => privateDatabaseHost("postgres://user:secret@db.public.example.com:5432/db"),
    /private database host/u,
  );
});

test("rejects public IPv4 and global IPv6 database hosts", async () => {
  const privateDatabaseHost = await validator();
  assert.throws(() => privateDatabaseHost("postgres://user:secret@8.8.8.8:5432/db"), /private database host/u);
  assert.throws(
    () => privateDatabaseHost("postgres://user:secret@[2001:4860:4860::8888]:5432/db"),
    /private database host/u,
  );
});

test("rejects non PostgreSQL URLs and never echoes the URL or password", async () => {
  const privateDatabaseHost = await validator();
  for (const value of ["https://db.internal.example/praktika", "not a url"]) {
    assert.throws(() => privateDatabaseHost(value), (error) => {
      assert.match(error.message, /DATABASE_URL/u);
      assert.doesNotMatch(error.message, /secret|db\.internal\.example/u);
      return true;
    });
  }

});
test("CLI host output is accepted by the runtime TLS guard for IPv4 and IPv6", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/coolify_private_database_host.mjs", import.meta.url));
  const projectRoot = new URL("..", import.meta.url);
  for (const host of ["127.0.0.1", "fd00::1"]) {
    const urlHost = host.includes(":") ? `[${host}]` : host;
    const databaseUrl = `postgresql://user:pass@${urlHost}:5432/practice`;
    const validator = spawnSync(process.execPath, [scriptPath], {
      input: databaseUrl,
      encoding: "utf8",
    });
    assert.equal(validator.status, 0, validator.stderr);
    assert.equal(validator.stdout, host);

    const runtime = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      "import { resolveDatabaseTls } from './server/database.mjs'; console.log(resolveDatabaseTls({ mode: 'disable' }) === undefined ? 'ok' : 'bad');",
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_SSL_MODE: "disable",
        DATABASE_PLAINTEXT_HOSTS: validator.stdout,
        SEARCH_HASH_SECRET: randomBytes(32).toString("base64"),
      },
    });
    assert.equal(runtime.status, 0, runtime.stderr);
    assert.equal(runtime.stdout.trim(), "ok");
  }

});
test("selects the single runtime database row even when a preview row comes first", async () => {
  const { runtimeDatabaseUrl } = await import(runtimeDatabaseUrlModule.href);
  const runtimeUrl = "postgresql://user:pass@runtime.internal:5432/practice";
  const previewUrl = "postgresql://user:pass@preview.internal:5432/practice";
  assert.equal(runtimeDatabaseUrl([
    { key: "DATABASE_URL", is_preview: true, is_runtime: true, value: previewUrl },
    { key: "DATABASE_URL", is_preview: false, is_runtime: true, value: runtimeUrl },
  ]), runtimeUrl);
  assert.equal(runtimeDatabaseUrl([
    { key: "DATABASE_URL", is_preview: false, is_runtime: true, value: "", real_value: runtimeUrl },
  ]), runtimeUrl);
});

test("rejects missing or duplicate runtime database rows without echoing values", async () => {
  const { runtimeDatabaseUrl } = await import(runtimeDatabaseUrlModule.href);
  const value = "postgresql://user:private-value@runtime.internal:5432/practice";
  for (const entries of [
    [],
    [{ key: "DATABASE_URL", is_preview: true, is_runtime: true, value }],
    [
      { key: "DATABASE_URL", is_preview: false, is_runtime: true, value },
      { key: "DATABASE_URL", is_preview: false, is_runtime: true, value },
    ],
  ]) {
    assert.throws(() => runtimeDatabaseUrl(entries), (error) => {
      assert.match(error.message, /exactly one runtime DATABASE_URL/u);
      assert.doesNotMatch(error.message, /private-value/u);
      return true;
    });
  }
});
