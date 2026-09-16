import { expect, test } from "@playwright/test";

test("completes the exact-match journey and issues a passport", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /start a comparison/i }).click();
  await expect(page.getByRole("heading", { name: /compare two offers/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product I want" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lower price I found" })).toBeVisible();
  await page.getByRole("button", { name: /review both offers/i }).click();

  await expect(page.getByRole("heading", { name: /check what we found/i })).toBeVisible();
  const comparisonPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: /back to offers/i }).click();
  await expect(page.getByText(/editing the same comparison/i)).toBeVisible();
  await page.getByRole("button", { name: /review both offers/i }).click();
  await expect(page).toHaveURL(new RegExp(`${comparisonPath}$`));
  await page.getByRole("button", { name: /confirm this offer/i }).click();
  await expect(page.getByRole("button", { name: /product i want/i }).first()).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /confirm this offer/i }).click();
  await expect(page.getByText(/2 of 2 checked/i)).toBeVisible();
  await page.getByRole("button", { name: /compare product identity/i }).click();

  await expect(page.getByRole("heading", { name: /same product/i })).toBeVisible();
  await expect(page.getByText(/commercial identity evidence lines up/i)).toBeVisible();
  await expect(page.getByText(/^verified$/i).first()).toBeVisible();
  await page.getByRole("link", { name: /create live passport/i }).click();

  await expect(page.getByRole("heading", { name: /ready to show the retailer/i })).toBeVisible();
  await page.getByText(/technical integrity details/i).click();
  await expect(page.getByText(/SHA-256 [a-f0-9]{64}/)).toBeVisible();
  await expect(page.getByText(/final approval remains/i).first()).toBeVisible();
});

test("explains a delivery blocker before offering pickup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One full near-miss journey is sufficient");
  await page.goto("/offer-dock");
  await page.getByText(/try a prepared demonstration scenario/i).click();
  await page.getByRole("button", { name: /delivery reversal/i }).click();
  await page.getByRole("button", { name: /review both offers/i }).click();
  await page.getByRole("button", { name: /confirm this offer/i }).click();
  await page.getByRole("button", { name: /confirm this offer/i }).click();
  await page.getByRole("button", { name: /compare product identity/i }).click();
  await page.getByRole("link", { name: /see the smallest safe change/i }).click();

  await expect(page.getByText(/this is the first rule to fix/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /collect it instead of delivering it/i })).toBeVisible();
  await expect(page.getByText(/must-haves preserved/i).first()).toBeVisible();
});

test("keeps mobile input controls within the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-specific assertion");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/offer-dock");
  const bodyWidth = await page.locator("body").evaluate((body) => body.scrollWidth);
  const viewport = page.viewportSize();
  expect(bodyWidth).toBeLessThanOrEqual(viewport?.width ?? 0);
  const selectedOfferLabel = page.locator("#target-listing > span").first();
  await expect(selectedOfferLabel).toBeVisible();
  const labelFitsWidth = await selectedOfferLabel.evaluate(
    (label) => label.scrollWidth <= label.clientWidth,
  );
  expect(labelFitsWidth).toBe(true);
  const primaryAction = page.getByRole("button", { name: /review both offers/i });
  const actionBox = await primaryAction.boundingBox();
  expect(actionBox?.y ?? Infinity).toBeLessThan(viewport?.height ?? 0);
  await page.getByText(/add or change offer evidence/i).click();
  await expect(page.getByRole("button", { name: /scan or photo/i })).toBeVisible();
});
