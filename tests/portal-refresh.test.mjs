import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

test("home uses the observed October portal stories and local new imagery rather than August fixtures", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /Uuring kogu Eesti toidutarneahelas tekkivate toidujäätmete ja toidukao kohta/u);
  assert.match(app, /Kaardirakendusse lisandus hüvitusalade ja maapõue info/u);
  assert.match(app, /Oktoober kutsub märkama Euroopa Liidu ökomärgist/u);
  assert.match(app, /Loomaaia loenguõhtu\. Hendrik Relve/u);
  assert.match(app, /href=\{event\.href\}/u);
  assert.doesNotMatch(app, /RING 2026|Väätsa prügila laienduse|Uuendatud ülevaade tuuleenergia planeeringutest/u);
  assert.match(app, /label: "Metsastatistika"/u);
  for (const name of ["portal-hero-2026.jpg", "portal-forest-statistics.jpg", "portal-food-waste.jpg", "portal-minerals.png", "portal-ecolabel.png"]) {
    await access(new URL(`../public/assets/${name}`, import.meta.url));
  }
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /portal-hero-2026\.jpg/u);
  assert.doesNotMatch(css, /\.hero__practice\s*\{\s*display:\s*none/u);
  // An old event must not silently send every card to an unrelated KMH list.
  assert.doesNotMatch(app, /href="https:\/\/kotkas\.envir\.ee\/kmh\/index\?tab=PUBLICATION"/u);
});
