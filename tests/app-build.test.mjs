import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readAppBuild } from "../server/app-build.mjs";
import { noteServerBuild, serverBuildDiffers } from "../src/app-build.js";

test("the server reads the build id written next to the client bundle, or reports development", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "terrap-build-"));
  assert.equal(readAppBuild(dir), "development");
  await writeFile(path.join(dir, "build.json"), JSON.stringify({ build: "abc123" }));
  assert.equal(readAppBuild(dir), "abc123");
  await writeFile(path.join(dir, "build.json"), "not json");
  assert.equal(readAppBuild(dir), "development");
  await writeFile(path.join(dir, "build.json"), JSON.stringify({ build: "x".repeat(200) }));
  assert.equal(readAppBuild(dir), "development", "an oversized id is not trusted");
});

test("the client flags a response from a newer build and ignores development builds", () => {
  const response = (build) => new Response("", { headers: build ? { "x-app-build": build } : {} });
  assert.equal(serverBuildDiffers(response("abc123"), "abc123"), false);
  assert.equal(serverBuildDiffers(response("def456"), "abc123"), true);
  assert.equal(serverBuildDiffers(response("development"), "abc123"), false);
  assert.equal(serverBuildDiffers(response("def456"), "development"), false);
  assert.equal(serverBuildDiffers(response(null), "abc123"), false);
  assert.equal(serverBuildDiffers(null, "abc123"), false);
  let events = 0;
  const target = { dispatchEvent: () => { events += 1; return true; } };
  noteServerBuild(response("def456"), "abc123", target);
  noteServerBuild(response("abc123"), "abc123", target);
  assert.equal(events, 1);
});
