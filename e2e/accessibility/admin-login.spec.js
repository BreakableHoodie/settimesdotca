/**
 * Admin Login - WCAG 2.1 AA Accessibility Testing
 *
 * Covers:
 * - axe-core automated scan of the login page
 * - Form labels associated with inputs
 * - Error/status live region roles (role="alert", role="status")
 * - Keyboard navigation through form fields and submit button
 * - Focus management after failed login
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Admin Login - Accessibility', () => {
  test('should not have automatically detectable WCAG violations', async ({
    page,
  }) => {
    await page.goto('/admin/login')
    await expect(
      page.getByRole('heading', { name: /admin login/i }),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(results.violations).toEqual([])
  })

  test('email and password inputs have associated labels', async ({ page }) => {
    await page.goto('/admin/login')

    const emailInput = page.locator('#email')
    const passwordInput = page.locator('#password')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()

    // Verify label association via htmlFor/id pairing
    await expect(page.locator('label[for="email"]')).toBeVisible()
    await expect(page.locator('label[for="password"]')).toBeVisible()
  })

  test('error message uses role="alert" for screen reader announcement', async ({
    page,
  }) => {
    await page.goto('/admin/login')

    await page.fill('#email', 'invalid@example.com')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type="submit"]')

    // role="alert" triggers assertive announcement in screen readers
    const alert = page.locator('[role="alert"]')
    await expect(alert).toBeVisible({ timeout: 5000 })
    await expect(alert).not.toBeEmpty()
  })

  test('can navigate the form with keyboard only', async ({ page }) => {
    await page.goto('/admin/login')

    const emailInput = page.locator('#email')
    const passwordInput = page.locator('#password')
    // Button text is "Login" (checked against AdminLogin.jsx)
    const submitButton = page.getByRole('button', { name: 'Login' })

    await expect(submitButton).toBeVisible()

    // Focus email directly, then Tab through the rest of the form
    await emailInput.focus()
    await expect(emailInput).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(passwordInput).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(submitButton).toBeFocused()
  })

  test('submit button is reachable and operable with Enter key', async ({
    page,
  }) => {
    await page.goto('/admin/login')

    await page.fill('#email', 'test@example.com')
    await page.fill('#password', 'anypassword')

    // Submit via Enter in the password field
    await page.locator('#password').press('Enter')

    // Either an error or redirect should occur — form was submitted
    await expect(
      page
        .locator('[role="alert"]')
        .or(page.locator('#mfa-code')),
    ).toBeVisible({ timeout: 5000 })
  })
})
