import { browser, $$ } from "@wdio/globals";

/** Wait until the fixture repository's history is available to interact with. */
export async function waitForHistory(minimumRows = 1): Promise<void> {
  await browser.waitUntil(
    async () => (await $$('[role="option"]').length) >= minimumRows,
    {
      timeout: 20_000,
      timeoutMsg: `expected at least ${String(minimumRows)} history rows`,
    },
  );
}
