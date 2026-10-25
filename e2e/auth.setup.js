import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./utils/paths";
import { submitAdminLogin } from "./utils/session";

const storageStatePath = ADMIN_STORAGE_STATE;

test("authenticate admin and save storage state", async ({ page }) => {
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  await page.goto("/admin/login");
  await submitAdminLogin(page);
  await expect(page).toHaveURL(/\/admin$/);

  await page.context().storageState({ path: storageStatePath });
});
