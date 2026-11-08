import { test, expect } from '@playwright/test';

const TEST_DESCRIPTION = 'הוצאת בדיקת E2E';
const TEST_VENDOR = 'ספק בדיקה';

test.describe('Expenses', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/expenses');
    const expenses = await res.json();
    for (const exp of expenses) {
      if (exp.description === TEST_DESCRIPTION) {
        await request.delete(`/api/expenses/${exp.id}`);
      }
    }
  });

  test('add expense, select it, and bulk delete', async ({ page }) => {
    await page.goto('/expenses');
    await expect(page.getByRole('heading', { name: 'הוצאות' })).toBeVisible();

    await page.getByRole('button', { name: 'הוספת הוצאה' }).click();
    await expect(page.getByText('הוצאה חדשה')).toBeVisible();

    await page.locator('label:has-text("סכום") + input').fill('150');
    await page.locator('label:has-text("תיאור") + input').fill(TEST_DESCRIPTION);
    await page.locator('label:has-text("ספק") + input').fill(TEST_VENDOR);

    await page.getByRole('button', { name: 'שמירה' }).click();

    const row = page.locator('tr').filter({ hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible();
    await expect(row).toContainText('₪150');
    await expect(row).toContainText(TEST_VENDOR);

    // Select via checkbox and bulk delete
    await row.locator('input[type="checkbox"]').check();
    await expect(page.getByText('1 פריטים נבחרו')).toBeVisible();

    await page.getByRole('button', { name: 'מחיקת נבחרים' }).click();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(row).not.toBeVisible();
  });
});
