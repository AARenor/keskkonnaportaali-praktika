// The build id Vite compiled into this bundle; "development" outside a build.
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "development";

export const APP_BUILD_MISMATCH_EVENT = "app-build-mismatch";

export function serverBuildDiffers(response, clientBuild = APP_BUILD) {
  const serverBuild = String(response?.headers?.get?.("x-app-build") || "").trim();
  if (!serverBuild || serverBuild === "development" || clientBuild === "development") return false;
  return serverBuild !== clientBuild;
}

// Called after every API response: announces once per response that the
// server is a newer build than the page, so the page can offer a reload.
export function noteServerBuild(response, clientBuild = APP_BUILD, target = globalThis) {
  if (!serverBuildDiffers(response, clientBuild)) return false;
  target.dispatchEvent?.(new Event(APP_BUILD_MISMATCH_EVENT));
  return true;
}
