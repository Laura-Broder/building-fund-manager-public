import { test, expect } from '@playwright/test';

const TEST_NUMBER = '991';
const TEST_NAME = 'דייר בדיקת E2E';
const TEST_NAME_UPDATED = 'דייר בדיקה מעודכן';

test.describe('Residents', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/apartments');
    const apartments = await res.json();
    for (const apt of apartments) {
      if (apt.number === TEST_NUMBER) {
        await request.delete(`/api/apartments/${apt.id}`);
      }
    }
  });

  test('full CRUD: add, edit, delete apartment', async ({ page }) => {
    await page.goto('/residents');
    await expect(page.getByRole('heading', { name: 'דיירים' })).toBeVisible();

    // --- Add ---
    await page.getByRole('button', { name: 'הוספת דירה' }).click();
    await expect(page.getByText('דירה חדשה')).toBeVisible();

    await page.locator('label:has-text("מספר דירה") + input').fill(TEST_NUMBER);
    await page.locator('label:has-text("שם בעלים") + input').fill(TEST_NAME);
    await page.getByRole('button', { name: 'הוספה' }).click();

    const row = page.locator('tr').filter({ hasText: TEST_NUMBER });
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_NAME);

    // --- Edit ---
    await row.getByRole('button', { name: 'עריכה' }).click();
    await expect(page.getByText('עריכת דירה')).toBeVisible();

    await page.locator('label:has-text("שם בעלים") + input').fill(TEST_NAME_UPDATED);
    await page.getByRole('button', { name: 'עדכון' }).click();

    await expect(row).toContainText(TEST_NAME_UPDATED);

    // --- Delete ---
    await row.getByRole('button', { name: 'מחיקה' }).click();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(row).not.toBeVisible();
  });
});
