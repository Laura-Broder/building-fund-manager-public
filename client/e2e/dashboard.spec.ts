import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('displays page heading and summary cards', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
    await expect(page.getByText('סה״כ דירות')).toBeVisible();
    await expect(page.getByText('דמי ועד חודשיים')).toBeVisible();
    await expect(page.getByText('סה״כ נגבה')).toBeVisible();
    await expect(page.getByText('סה״כ הוצאות')).toBeVisible();
    await expect(page.getByText('יתרה בקופה')).toBeVisible();
  });

  test('navigates months with back and forward buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('סה״כ דירות')).toBeVisible();

    await page.getByRole('button', { name: '<' }).click();
    await expect(page.getByText('סה״כ דירות')).toBeVisible();

    await page.getByRole('button', { name: '>' }).click();
    await expect(page.getByText('סה״כ דירות')).toBeVisible();
  });

  test('toggles between monthly and yearly view', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('שילמו החודש', { exact: true })).toBeVisible();

    await page.getByTitle('הצג שנה שלמה').click();
    await expect(page.getByText('שילמו השנה', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'חודשי' }).click();
    await expect(page.getByText('שילמו החודש', { exact: true })).toBeVisible();
  });

  test('navigates to other pages via sidebar', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'דיירים' }).click();
    await expect(page.getByRole('heading', { name: 'דיירים' })).toBeVisible();

    await page.getByRole('link', { name: 'תשלומים' }).click();
    await expect(page.getByRole('heading', { name: 'תשלומים' })).toBeVisible();

    await page.getByRole('link', { name: 'הוצאות' }).click();
    await expect(page.getByRole('heading', { name: 'הוצאות' })).toBeVisible();

    await page.getByRole('link', { name: 'לוח בקרה' }).click();
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();
  });
});
