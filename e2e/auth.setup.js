import fs from "fs";
import { test, expect } from "@playwright/test";
import { submitAdminLogin } from "./utils/session";

const storageStatePath = "e2e/.auth/admin.json";

test("authenticate admin and save storage state", async ({ page }) => {
  fs.mkdirSync("e2e/.auth", { recursive: true });

  await page.goto("/admin/login");
  await submitAdminLogin(page);
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: storageStatePath });
});
