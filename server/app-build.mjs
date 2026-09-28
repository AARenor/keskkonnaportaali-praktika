import { readFileSync } from "node:fs";
import path from "node:path";

// Vite writes build.json next to the client bundle with the same id it
// compiled into the bundle. The server echoes it on every response so an
// already-open page can tell that a newer client exists.
export function readAppBuild(clientRoot) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(clientRoot, "build.json"), "utf8"));
    const build = typeof parsed?.build === "string" ? parsed.build.trim() : "";
    return /^[A-Za-z0-9._-]{1,64}$/u.test(build) ? build : "development";
  } catch {
    return "development";
  }
}
