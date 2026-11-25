import { expect, test } from '@playwright/test'

// Requires a configured .env pointing at a Supabase project with the migrations applied.
test('guest can browse and is redirected from protected pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /SoundFont Hub home/i })).toBeVisible()
  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: 'Explore Sounds' })).toBeVisible()
  await page.goto('/library')
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login/)
})

test('registration form validates password strength', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Test User')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Use at least 10 characters')).toBeVisible()
})
