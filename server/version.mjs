export function publicDeploymentRevision(value = process.env.SOURCE_COMMIT || process.env.APP_REVISION) {
  const revision = String(value || "").trim().toLocaleLowerCase("en");
  return /^[0-9a-f]{40}$/u.test(revision) ? revision : "development";
}
