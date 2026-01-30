import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const createComponentPage = async (page, componentHtml) => {
  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Visual Regression</title>
      <link rel="stylesheet" href="/src/index.css">
    </head>
    <body class="bg-bg-navy p-8">
      <main>
        <h1 class="text-white text-2xl font-bold mb-6">Visual Regression</h1>
        <div id="root">${componentHtml}</div>
      </main>
    </body>
    </html>
  `);
};

test.describe('Visual Regression', () => {
  test('admin login page', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(page).toHaveScreenshot('admin-login.png', { fullPage: true });
  });

  test('design system snapshot', async ({ page }) => {
    await createComponentPage(
      page,
      `
      <div class="space-y-4">
        <button class="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-base focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy bg-accent-500 text-white hover:bg-accent-600 px-4 py-2 text-base min-h-[44px]">
          Primary Action
        </button>
        <div class="bg-white/10 border border-white/20 rounded-lg p-4 text-white">
          <h2 class="text-lg font-semibold mb-2">Card Title</h2>
          <p class="text-sm text-gray-300">Stable snapshot content for visual regression.</p>
        </div>
      </div>
      `
    );

    await expect(page).toHaveScreenshot('design-system.png', { fullPage: true });
  });
});
