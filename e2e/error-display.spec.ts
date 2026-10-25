import { test, expect } from "@playwright/test";

// Verifies the error UX when the MTHDS API isn't reachable: the SDK raises the
// `client.unreachable` problem, and <ErrorDisplay> renders it from that
// problem. Runs against whatever MTHDS_BASE_URL the dev server is using;
// `.env.example` points at http://127.0.0.1:8081 with no API there, which is
// the "I just cloned the starter" failure mode this UX is designed for.
//
// Skip the whole suite if the API responds — we'd hit the live happy path
// instead, which is already covered by extract.spec.ts.
test.describe("offline-API error display", () => {
  test.beforeAll(async () => {
    const apiUrl = process.env.MTHDS_BASE_URL ?? "http://127.0.0.1:8081";
    let reachable = false;
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    test.skip(
      reachable,
      `MTHDS API at ${apiUrl} is reachable; offline test would hit the live API`,
    );
  });

  test("renders the unreachable problem with its next step, hint, and code", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Input text").fill("Apple announced new products today.");
    await page.getByRole("button", { name: /extract entities/i }).click();

    // Next.js renders its own role="alert" route announcer, so scope to ours
    // by filtering for the problem's title, which ErrorDisplay always renders.
    const alert = page.getByRole("alert").filter({ hasText: "The runtime could not be reached" });
    await expect(alert).toBeVisible({ timeout: 30_000 });

    // Who must act comes from the problem's domain.
    await expect(alert).toHaveAttribute("data-domain", "runtime");

    // The problem's own next step, then this app's hint: start the API.
    await expect(alert).toContainText("Next step:");
    await expect(alert).toContainText(/Start the MTHDS API at http:\/\/(127\.0\.0\.1|localhost)/);
    await expect(alert).toContainText("pipelex/pipelex-api");

    // The code sits under the collapsible technical details, present in the DOM.
    await expect(alert.getByText("Technical details")).toBeVisible();
    await alert.getByText("Technical details").click();
    await expect(alert.getByText("client.unreachable")).toBeVisible();
  });
});
