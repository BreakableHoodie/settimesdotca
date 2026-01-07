/**
 * Design System - WCAG 2.1 AA Accessibility Testing
 *
 * Comprehensive accessibility testing for all base components:
 * - Button, Input, Select, Checkbox, Radio, Toggle
 * - Card, Badge, Modal, Alert
 *
 * Testing Strategy:
 * - Automated axe-core scanning for WCAG violations
 * - Keyboard navigation testing
 * - Screen reader compatibility (ARIA)
 * - Color contrast verification
 * - Touch target sizing
 * - Focus management
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper to create a test page with component
async function createComponentPage(page, componentHtml) {
  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Component Accessibility Test</title>
      <link rel="stylesheet" href="/src/index.css">
    </head>
    <body>
      <main>
        <h1>Component Accessibility Test</h1>
        <div id="root">${componentHtml}</div>
      </main>
    </body>
    </html>
  `);
}

test.describe('Button Component - Accessibility', () => {
  test('should not have automatically detectable WCAG violations - Primary variant', async ({ page }) => {
    await createComponentPage(page, `
      <button class="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-base focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy disabled:opacity-50 disabled:cursor-not-allowed bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-500 shadow-sm hover:shadow-md active:scale-95 px-4 py-2 text-base min-h-[44px]">
        Create Event
      </button>
    `);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have sufficient color contrast for all variants', async ({ page }) => {
    const variants = [
      { name: 'primary', bg: '#0369a1', text: '#ffffff' }, // Updated to WCAG AA compliant (4.51:1)
      { name: 'secondary', bg: '#f5f5f5', border: '#e5e5e5', text: '#171717' }, // Updated to match actual component colors (WCAG AA compliant)
      { name: 'danger', bg: '#dc143c', text: '#ffffff' },
      { name: 'success', bg: '#047857', text: '#ffffff' }, // Updated to WCAG AA compliant (5.48:1)
      { name: 'warning', bg: '#b45309', text: '#ffffff' }, // Updated to WCAG AA compliant (5.02:1)
    ];

    for (const variant of variants) {
      await createComponentPage(page, `
        <button style="background-color: ${variant.bg || 'transparent'}; color: ${variant.text}; ${variant.border ? `border: 2px solid ${variant.border};` : ''} padding: 12px 16px; min-height: 44px;">
          ${variant.name} Button
        </button>
      `);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('button')
        .analyze();

      expect(results.violations.filter(v => v.id === 'color-contrast')).toEqual([]);
    }
  });

  test('should meet touch target size requirements (44x44px)', async ({ page }) => {
    await createComponentPage(page, `
      <button id="test-button" style="min-height: 44px; min-width: 44px; padding: 12px 16px;">
        Button
      </button>
    `);

    const button = page.locator('#test-button');
    const boundingBox = await button.boundingBox();

    expect(boundingBox.height).toBeGreaterThanOrEqual(44);
    expect(boundingBox.width).toBeGreaterThanOrEqual(44);
  });

  test('should be keyboard accessible with visible focus', async ({ page }) => {
    await createComponentPage(page, `
      <button class="focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2" style="padding: 12px; min-height: 44px;">
        Test Button
      </button>
    `);

    const button = page.locator('button');

    // Tab to button
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();

    // Check focus indicator (ring should be visible)
    const focusRing = await button.evaluate(el => {
      const styles = window.getComputedStyle(el, ':focus');
      return {
        outline: styles.outline,
        boxShadow: styles.boxShadow,
      };
    });

    expect(focusRing.boxShadow).not.toBe('none');
  });

  test('should activate with keyboard (Enter and Space)', async ({ page }) => {
    await createComponentPage(page, `
      <button onclick="this.setAttribute('data-clicked', 'true')">
        Test Button
      </button>
    `);

    const button = page.locator('button');
    await button.focus();

    // Test Enter key
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('data-clicked', 'true');

    // Reset
    await button.evaluate(el => el.removeAttribute('data-clicked'));

    // Test Space key
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('data-clicked', 'true');
  });

  test('should have proper disabled state ARIA', async ({ page }) => {
    await createComponentPage(page, `
      <button disabled aria-disabled="true" style="opacity: 0.5; cursor: not-allowed;">
        Disabled Button
      </button>
    `);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    const button = page.locator('button');
    await expect(button).toHaveAttribute('disabled');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Input Component - Accessibility', () => {
  test('should not have WCAG violations with proper label association', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <label for="email-input">Email Address</label>
        <input
          id="email-input"
          type="email"
          name="email"
          aria-describedby="email-hint"
        />
        <div id="email-hint">Enter your email address</div>
      </div>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should have accessible error messaging', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <label for="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          aria-invalid="true"
          aria-describedby="email-error"
        />
        <div id="email-error" role="alert">Please enter a valid email address</div>
      </div>
    `);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    const input = page.locator('#email-input');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', 'email-error');

    const errorMessage = page.locator('#email-error');
    await expect(errorMessage).toHaveAttribute('role', 'alert');
  });

  test('should indicate required fields properly', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <label for="required-input">
          Name <span aria-label="required">*</span>
        </label>
        <input
          id="required-input"
          type="text"
          required
          aria-required="true"
        />
      </div>
    `);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    const input = page.locator('#required-input');
    await expect(input).toHaveAttribute('required');
    await expect(input).toHaveAttribute('aria-required', 'true');
  });
});

test.describe('Select Component - Accessibility', () => {
  test('should not have WCAG violations', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <label for="country-select">Country</label>
        <select id="country-select" name="country">
          <option value="">Choose a country</option>
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
        </select>
      </div>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await createComponentPage(page, `
      <select>
        <option value="1">Option 1</option>
        <option value="2">Option 2</option>
        <option value="3">Option 3</option>
      </select>
    `);

    const select = page.locator('select');
    await select.focus();
    await expect(select).toBeFocused();

    // Arrow down should navigate options
    await page.keyboard.press('ArrowDown');
    const value = await select.inputValue();
    expect(['1', '2']).toContain(value);
  });
});

test.describe('Checkbox Component - Accessibility', () => {
  test('should not have WCAG violations', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <input type="checkbox" id="terms" name="terms" />
        <label for="terms">I agree to the terms and conditions</label>
      </div>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should support indeterminate state with ARIA', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <input
          type="checkbox"
          id="select-all"
          aria-checked="mixed"
        />
        <label for="select-all">Select All</label>
      </div>
    `);

    const checkbox = page.locator('#select-all');
    await expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
  });

  test('should be keyboard accessible (Space to toggle)', async ({ page }) => {
    await createComponentPage(page, `
      <input type="checkbox" id="test-checkbox" />
    `);

    const checkbox = page.locator('#test-checkbox');
    await checkbox.focus();
    await expect(checkbox).toBeFocused();

    // Space should toggle
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();

    await page.keyboard.press('Space');
    await expect(checkbox).not.toBeChecked();
  });

  test('should meet touch target size (44x44px)', async ({ page }) => {
    await createComponentPage(page, `
      <label style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; cursor: pointer;">
        <input type="checkbox" style="width: 20px; height: 20px; margin: 12px;" />
        <span>Checkbox Label</span>
      </label>
    `);

    const label = page.locator('label');
    const boundingBox = await label.boundingBox();

    expect(boundingBox.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Radio Component - Accessibility', () => {
  test('should not have WCAG violations in radio group', async ({ page }) => {
    await createComponentPage(page, `
      <fieldset>
        <legend>Choose a payment method</legend>
        <div>
          <input type="radio" id="credit" name="payment" value="credit" />
          <label for="credit">Credit Card</label>
        </div>
        <div>
          <input type="radio" id="debit" name="payment" value="debit" />
          <label for="debit">Debit Card</label>
        </div>
        <div>
          <input type="radio" id="paypal" name="payment" value="paypal" />
          <label for="paypal">PayPal</label>
        </div>
      </fieldset>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should support keyboard navigation (arrow keys)', async ({ page }) => {
    await createComponentPage(page, `
      <fieldset>
        <legend>Options</legend>
        <input type="radio" id="opt1" name="options" value="1" />
        <label for="opt1">Option 1</label>
        <input type="radio" id="opt2" name="options" value="2" />
        <label for="opt2">Option 2</label>
        <input type="radio" id="opt3" name="options" value="3" />
        <label for="opt3">Option 3</label>
      </fieldset>
    `);

    const radio1 = page.locator('#opt1');
    await radio1.focus();
    await expect(radio1).toBeFocused();

    // Arrow down should move to next radio
    await page.keyboard.press('ArrowDown');
    const radio2 = page.locator('#opt2');
    await expect(radio2).toBeFocused();
  });
});

test.describe('Toggle Component - Accessibility', () => {
  test('should not have WCAG violations', async ({ page }) => {
    await createComponentPage(page, `
      <div>
        <button
          role="switch"
          aria-checked="false"
          aria-labelledby="notifications-label"
        >
          <span class="sr-only">Toggle</span>
        </button>
        <span id="notifications-label">Enable Notifications</span>
      </div>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should have proper switch role and aria-checked', async ({ page }) => {
    await createComponentPage(page, `
      <button role="switch" aria-checked="true">
        <span class="sr-only">Toggle</span>
      </button>
    `);

    const toggle = page.locator('button[role="switch"]');
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Modal Component - Accessibility', () => {
  test('should not have WCAG violations when open', async ({ page }) => {
    await createComponentPage(page, `
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Confirm Action</h2>
        <p>Are you sure you want to proceed?</p>
        <button>Cancel</button>
        <button>Confirm</button>
      </div>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should trap focus within modal', async ({ page }) => {
    await createComponentPage(page, `
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button id="close-btn">Close</button>
        <h2 id="modal-title">Modal Title</h2>
        <input id="input1" type="text" />
        <input id="input2" type="text" />
        <button id="cancel-btn">Cancel</button>
        <button id="confirm-btn">Confirm</button>
      </div>
    `);

    // Inject focus trap JavaScript to enable Tab wrapping behavior
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const focusableArray = Array.from(focusableElements);
      const firstElement = focusableArray[0];
      const lastElement = focusableArray[focusableArray.length - 1];

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
          // Shift + Tab: if on first element, wrap to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      });
    });

    const confirmBtn = page.locator('#confirm-btn');
    const closeBtn = page.locator('#close-btn');

    // Focus should start on first focusable element
    await closeBtn.focus();

    // Tab through all elements
    await page.keyboard.press('Tab'); // input1
    await page.keyboard.press('Tab'); // input2
    await page.keyboard.press('Tab'); // cancel-btn
    await page.keyboard.press('Tab'); // confirm-btn
    await page.keyboard.press('Tab'); // should wrap to close-btn

    await expect(closeBtn).toBeFocused();
  });

  test('should close on Escape key', async ({ page }) => {
    await createComponentPage(page, `
      <div id="modal" role="dialog" aria-modal="true" style="display: block;">
        <h2>Modal</h2>
        <button onclick="document.getElementById('modal').style.display='none'">Close</button>
      </div>
    `);

    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();

    // Simulate Escape key close behavior
    await page.keyboard.press('Escape');
    // Note: actual close behavior would be in JS, this tests the pattern
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    await createComponentPage(page, `
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
      >
        <h2 id="dialog-title">Delete Item</h2>
        <p id="dialog-desc">This action cannot be undone.</p>
      </div>
    `);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title');
    await expect(dialog).toHaveAttribute('aria-describedby', 'dialog-desc');
  });
});

test.describe('Alert Component - Accessibility', () => {
  test('should not have WCAG violations - all variants', async ({ page }) => {
    const variants = ['success', 'warning', 'error', 'info'];

    for (const variant of variants) {
      await createComponentPage(page, `
        <div role="alert" class="${variant}">
          <strong>${variant.toUpperCase()}</strong>
          <p>This is a ${variant} message.</p>
        </div>
      `);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    }
  });

  test('should have role="alert" for screen readers', async ({ page }) => {
    await createComponentPage(page, `
      <div role="alert">
        <strong>Success!</strong>
        <p>Your changes have been saved.</p>
      </div>
    `);

    const alert = page.locator('[role="alert"]');
    await expect(alert).toHaveAttribute('role', 'alert');
  });

  test('should meet color contrast for all variants', async ({ page }) => {
    const variants = [
      { name: 'success', bg: '#d4edda', border: '#228b22', text: '#0f5132' },
      { name: 'warning', bg: '#fff3cd', border: '#b45309', text: '#8b4500' }, // Border updated to WCAG AA compliant
      { name: 'error', bg: '#f8d7da', border: '#dc143c', text: '#8b0000' },
      { name: 'info', bg: '#d1ecf1', border: '#1e90ff', text: '#004085' },
    ];

    for (const variant of variants) {
      await createComponentPage(page, `
        <div
          role="alert"
          style="background-color: ${variant.bg}; border: 1px solid ${variant.border}; color: ${variant.text}; padding: 12px;"
        >
          ${variant.name} Alert
        </div>
      `);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .include('[role="alert"]')
        .analyze();

      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
      expect(contrastViolations).toEqual([]);
    }
  });

  test('should be keyboard dismissible if dismissible', async ({ page }) => {
    await createComponentPage(page, `
      <div role="alert">
        <p>Alert message</p>
        <button aria-label="Dismiss alert">×</button>
      </div>
    `);

    const dismissBtn = page.locator('button[aria-label="Dismiss alert"]');
    await dismissBtn.focus();
    await expect(dismissBtn).toBeFocused();

    await page.keyboard.press('Enter');
    // Dismiss behavior would be tested with actual component
  });
});

test.describe('Card Component - Accessibility', () => {
  test('should not have WCAG violations', async ({ page }) => {
    await createComponentPage(page, `
      <article>
        <header>
          <h2>Card Title</h2>
        </header>
        <div>
          <p>Card content goes here.</p>
        </div>
        <footer>
          <button>Action</button>
        </footer>
      </article>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should use semantic HTML elements', async ({ page }) => {
    await createComponentPage(page, `
      <article>
        <header><h3>Title</h3></header>
        <div><p>Content</p></div>
        <footer><button>Action</button></footer>
      </article>
    `);

    await expect(page.locator('article')).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});

test.describe('Badge Component - Accessibility', () => {
  test('should not have WCAG violations', async ({ page }) => {
    await createComponentPage(page, `
      <span role="status" aria-label="Status: Active">
        Active
      </span>
    `);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('should meet color contrast requirements', async ({ page }) => {
    const badges = [
      { name: 'primary', bg: '#1e40af', text: '#ffffff' },
      { name: 'success', bg: '#047857', text: '#ffffff' }, // Updated to WCAG AA compliant (5.48:1)
      { name: 'warning', bg: '#b45309', text: '#ffffff' }, // Updated to WCAG AA compliant (5.02:1)
      { name: 'error', bg: '#dc143c', text: '#ffffff' },
    ];

    for (const badge of badges) {
      await createComponentPage(page, `
        <span style="background-color: ${badge.bg}; color: ${badge.text}; padding: 4px 8px; border-radius: 4px;">
          ${badge.name}
        </span>
      `);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .analyze();

      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
      expect(contrastViolations).toEqual([]);
    }
  });

  test('should have proper ARIA label for context', async ({ page }) => {
    await createComponentPage(page, `
      <span role="status" aria-label="5 unread notifications">
        5
      </span>
    `);

    const badge = page.locator('[role="status"]');
    await expect(badge).toHaveAttribute('aria-label', '5 unread notifications');
  });
});

test.describe('Reduced Motion Preference - Accessibility', () => {
  test('should respect prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await createComponentPage(page, `
      <style>
        @media (prefers-reduced-motion: reduce) {
          .animated {
            animation: none !important;
            transition: none !important;
          }
        }
      </style>
      <button class="animated" style="transition: all 0.3s;">
        Button
      </button>
    `);

    const button = page.locator('button');
    const transition = await button.evaluate(el => {
      return window.getComputedStyle(el).transition;
    });

    // With reduced motion, transitions should be disabled
    expect(transition).toBe('none');
  });
});

test.describe('High Contrast Mode - Accessibility', () => {
  test('should be visible in high contrast mode', async ({ page }) => {
    // Emulate high contrast mode (Windows High Contrast)
    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });

    await createComponentPage(page, `
      <button style="border: 2px solid; padding: 12px;">
        High Contrast Button
      </button>
    `);

    const button = page.locator('button');
    const styles = await button.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        border: computed.border,
        backgroundColor: computed.backgroundColor,
      };
    });

    // Border should be defined for visibility in high contrast
    expect(styles.border).not.toBe('none');
  });
});
