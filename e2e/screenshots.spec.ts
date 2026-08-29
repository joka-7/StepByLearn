import { test, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../docs/screenshots");

function isoDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function makeStep(overrides: Record<string, unknown> & { id: string; orderIndex: number }) {
  return {
    title: "Untitled step",
    duration: "45 minutes",
    type: "text",
    description: "",
    keyConcepts: [],
    materialTitle: "",
    materialUrl: "",
    resources: [],
    status: "not_started",
    doneAt: null,
    scheduledDate: null,
    isMilestone: false,
    ...overrides,
  };
}

const SAMPLE_PATH = {
  id: "path-ml-fundamentals",
  title: "Machine Learning Fundamentals",
  topic: "Machine Learning Fundamentals",
  description:
    "A practical introduction to supervised learning — from linear regression through neural networks — for someone comfortable with Python.",
  difficulty: "intermediate",
  estimatedHours: 12,
  modelName: "claude-sonnet-4-5",
  stepDuration: "45 minutes",
  contentType: "all",
  currentKnowledge: "Comfortable with Python and basic statistics.",
  createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  updatedAt: new Date().toISOString(),
  steps: [
    makeStep({
      id: "step-1",
      orderIndex: 0,
      title: "What Is Machine Learning?",
      type: "video",
      description: "A gentle overview of supervised vs. unsupervised learning and where each fits.",
      keyConcepts: ["Supervised learning", "Unsupervised learning", "Training data"],
      materialTitle: "Machine Learning Explained",
      materialUrl: "https://example.com/ml-intro",
      status: "done",
      doneAt: isoDaysFromNow(-5) + "T10:00:00.000Z",
      scheduledDate: isoDaysFromNow(-2),
      isMilestone: true,
    }),
    makeStep({
      id: "step-2",
      orderIndex: 1,
      title: "Linear Regression from Scratch",
      type: "text",
      description: "Derive and implement ordinary least squares in plain NumPy.",
      keyConcepts: ["Cost function", "Gradient descent", "Overfitting"],
      materialTitle: "Linear Regression, Step by Step",
      materialUrl: "https://example.com/linreg",
      status: "done",
      doneAt: isoDaysFromNow(-1) + "T10:00:00.000Z",
      scheduledDate: isoDaysFromNow(-1),
    }),
    makeStep({
      id: "step-3",
      orderIndex: 2,
      title: "Classification with Logistic Regression",
      type: "video",
      description: "Move from predicting numbers to predicting categories.",
      keyConcepts: ["Sigmoid function", "Decision boundary", "Precision & recall"],
      materialTitle: "Logistic Regression Visually Explained",
      materialUrl: "https://example.com/logreg",
      status: "in_progress",
      scheduledDate: isoDaysFromNow(0),
    }),
    makeStep({
      id: "step-4",
      orderIndex: 3,
      title: "Decision Trees & Random Forests",
      type: "podcast",
      description:
        "How tree-based models split data, and why forests generalize better than one tree.",
      keyConcepts: ["Entropy", "Bagging", "Feature importance"],
      materialTitle: "Trees and Forests",
      materialUrl: "https://example.com/trees",
      status: "not_started",
      scheduledDate: isoDaysFromNow(1),
    }),
    makeStep({
      id: "step-5",
      orderIndex: 4,
      title: "Neural Networks Basics",
      type: "video",
      description: "Perceptrons, activation functions, and backpropagation at a conceptual level.",
      keyConcepts: ["Perceptron", "Activation function", "Backpropagation"],
      materialTitle: "Neural Networks Demystified",
      materialUrl: "https://example.com/nn",
      status: "not_started",
      scheduledDate: isoDaysFromNow(2),
      isMilestone: true,
    }),
    makeStep({
      id: "step-6",
      orderIndex: 5,
      title: "Capstone: Build a Classifier",
      type: "text",
      description: "Put it together: train and evaluate a classifier on a real dataset.",
      keyConcepts: ["Train/test split", "Cross-validation", "Confusion matrix"],
      materialTitle: "End-to-End Classifier Walkthrough",
      materialUrl: "https://example.com/capstone",
      status: "not_started",
      scheduledDate: isoDaysFromNow(4),
      isMilestone: true,
    }),
  ],
};

/**
 * Seed one learning path directly into IndexedDB (Dexie's "stepbylearn" DB).
 * Navigating first lets the app's own Dexie instance create the database and
 * object stores; the raw indexedDB write after that just needs to match the
 * schema in src/db/database.ts.
 */
async function seedPath(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "indexedDB" in window);
  await page.evaluate((learningPath) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("stepbylearn");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("paths", "readwrite");
        tx.objectStore("paths").put(learningPath);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, SAMPLE_PATH);
  await page.reload();
}

test.describe("capture README screenshots", () => {
  test.skip(!!process.env.CI, "Run locally to regenerate README screenshots");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  async function snap(page: Page, filename: string) {
    await page.screenshot({
      path: path.join(OUT_DIR, filename),
      fullPage: true,
      animations: "disabled",
    });
  }

  test("dashboard — workspace planner", async ({ page }) => {
    await seedPath(page);
    await page.getByText("Machine Learning Fundamentals").first().waitFor();

    await snap(page, "dashboard.png");
  });

  test("active study desk", async ({ page }) => {
    await seedPath(page);
    await page.locator("#nav_btn_study").click();
    await page.getByText("Classification with Logistic Regression").first().waitFor();

    await snap(page, "study-desk.png");
  });

  test("study calendar", async ({ page }) => {
    await seedPath(page);
    await page.getByRole("button", { name: "Study Calendar" }).click();
    await page.getByText("In-App Study Calendar").waitFor();

    await snap(page, "calendar.png");
  });

  test("my analytics", async ({ page }) => {
    await seedPath(page);
    await page.getByRole("button", { name: "My Analytics" }).click();
    await page.getByText("My Learning Insights").waitFor();

    await snap(page, "analytics.png");
  });

  test("manual course architect", async ({ page }) => {
    await seedPath(page);
    await page.getByRole("button", { name: "Manual Course Architect" }).click();
    await page.getByText("Course Basics").waitFor();

    await snap(page, "manual-builder.png");
  });

  test("settings — provider and API key", async ({ page }) => {
    await seedPath(page);
    await page.getByRole("button", { name: "Provider Settings" }).click();
    await page.getByText("Settings", { exact: true }).waitFor();

    await snap(page, "settings.png");
  });
});
