import assert from "node:assert/strict";
import test from "node:test";

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
