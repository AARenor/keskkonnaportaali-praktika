export function documentationRoute(pathname) {
  const path = String(pathname || "").replace(/\/$/u, "");
  if (path === "/docs") return "overview";
  if (path === "/docs/kasutajale") return "user";
  if (path === "/docs/arendajale") return "developer";
  return path.startsWith("/docs/") ? "not-found" : null;
}
