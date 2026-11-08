import { test, expect } from '@playwright/test';

const TEST_APT_NUMBER = '990';
const TEST_APT_NAME = 'דירת בדיקת תשלום';

test.describe('Payments', () => {
  let apartmentId: number;

  test.beforeAll(async ({ request }) => {
    const listRes = await request.get('/api/apartments');
    const apartments = await listRes.json();
    for (const apt of apartments) {
      if (apt.number === TEST_APT_NUMBER) {
        await request.delete(`/api/apartments/${apt.id}`);
      }
    }

    const createRes = await request.post('/api/apartments', {
      data: { number: TEST_APT_NUMBER, owner_name: TEST_APT_NAME },
    });
    const data = await createRes.json();
    apartmentId = data.id;
  });

  test.afterAll(async ({ request }) => {
    if (apartmentId) {
      await request.delete(`/api/apartments/${apartmentId}`);
    }
  });

  test('add and delete a manual payment', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: 'תשלומים' })).toBeVisible();

    await page.getByRole('button', { name: 'הוספת תשלום' }).click();
    await expect(page.getByText('תשלום חדש')).toBeVisible();

    await page.locator('label:has-text("דירה") + select').selectOption(String(apartmentId));
    await page.locator('label:has-text("סכום") + input').fill('300');

    await page.getByRole('button', { name: 'שמירה' }).click();

    const row = page.locator('tr').filter({ hasText: TEST_APT_NUMBER });
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText('₪300');

    await row.first().getByRole('button', { name: 'מחיקה' }).click();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page.locator('tr').filter({ hasText: TEST_APT_NUMBER })).not.toBeVisible();
  });
});
