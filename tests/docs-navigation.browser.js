// Run with Playwright MCP browser_run_code_unsafe({ filename: "tests/docs-navigation.browser.js" }).
// Start the production-style local server at 127.0.0.1:4387 first.
(async (page) => {
  const checks = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, id, title] of [
      ["/docs/kasutajale", "privaatsus", "Kasutusjuhend"],
      ["/docs/arendajale", "andmed-ja-privaatsus", "Integratsioonijuhend arendajale"],
    ]) {
      // A real new document, not same-document fragment navigation.
      await page.goto("about:blank");
      await page.goto(`http://127.0.0.1:4387${path}#${id}`);
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      await page.waitForLoadState("networkidle");
      const position = await page.locator(`#${id}`).evaluate((element) => ({
        top: element.getBoundingClientRect().top,
        scrollY: window.scrollY,
      }));
      if (position.scrollY === 0 || Math.abs(position.top - 24) > 3) {
        throw new Error(`Fresh chapter link did not scroll: ${path}#${id}, ${width}px, ${JSON.stringify(position)}`);
      }
      checks.push({ path, id, width, ...position });
    }
  }
  await page.goto("about:blank");
  await page.goto("http://127.0.0.1:4387/docs/arendajale#not-a-section");
  await page.getByRole("heading", { name: "Integratsioonijuhend arendajale", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  if (await page.evaluate(() => window.scrollY) !== 0) throw new Error("An unknown fragment must not jump to a different section.");
  return { passed: checks.length + 1, checks, unknownFragment: "no jump" };
})
