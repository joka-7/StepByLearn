import { expect, test } from "@playwright/test";

// A functional smoke test of the real app in a real browser: it catches the
// class of failure unit tests can't see (a provider that was never mounted, a
// view that throws on first render) and proves the data survives a reload.

test("app boots, creates a course by hand, and keeps it across a reload", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");
  await expect(page.locator("#app_root")).toBeVisible();
  await expect(page.getByRole("heading", { name: "StepByLearn" })).toBeVisible();

  await page.locator("#nav_btn_manual").click();
  await page.locator("#manual_form_title_input").fill("Smoke test course");
  await page.locator("#manual_form_topic_input").fill("Testing");
  await page
    .getByPlaceholder("Step title (e.g. Setting up Vite & TS compiler)")
    .first()
    .fill("First step");
  await page.locator("#manual_form_submit_btn").click();

  // Creating a course opens it on the study desk.
  await expect(page.locator("#view_study")).toBeVisible();
  await page.locator("#toggle_step_completed_desk_btn").click();
  await expect(page.locator("#toggle_step_completed_desk_btn")).toContainText("Completed");

  await page.reload();
  await expect(page.locator("#header_course_selector")).toContainText("Smoke test course");

  expect(pageErrors).toEqual([]);
});

test("deleting a course can be undone", async ({ page }) => {
  await page.goto("/");
  await page.locator("#nav_btn_manual").click();
  await page.locator("#manual_form_title_input").fill("Undo me");
  await page.locator("#manual_form_topic_input").fill("Testing");
  await page
    .getByPlaceholder("Step title (e.g. Setting up Vite & TS compiler)")
    .first()
    .fill("Only step");
  await page.locator("#manual_form_submit_btn").click();
  await expect(page.locator("#header_course_selector")).toContainText("Undo me");

  await page.locator("#header_delete_course_btn").click();
  await expect(page.locator("#header_course_selector")).not.toContainText("Undo me");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#header_course_selector")).toContainText("Undo me");
});

test("settings opens as an accessible dialog that Escape closes", async ({ page }) => {
  await page.goto("/");
  await page.locator("#nav_btn_settings").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("without a Google client ID there is no connect button and the app stays local-only", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#google_sign_in_btn")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Local-only" })).toBeVisible();
});

test("the add-step dialog is labelled, traps focus, and closes with Escape or the close button", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#nav_btn_manual").click();
  await page.locator("#manual_form_title_input").fill("Dialog course");
  await page.locator("#manual_form_topic_input").fill("Testing");
  await page
    .getByPlaceholder("Step title (e.g. Setting up Vite & TS compiler)")
    .first()
    .fill("Step one");
  await page.locator("#manual_form_submit_btn").click();
  await expect(page.locator("#view_study")).toBeVisible();

  await page.locator("#desk_add_step_btn").click();
  const dialog = page.getByRole("dialog", { name: "Add Study Step" });
  await expect(dialog).toBeVisible();
  // Focus moved into the dialog, and Tab can't leave it.
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.locator("#desk_add_step_btn").click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
