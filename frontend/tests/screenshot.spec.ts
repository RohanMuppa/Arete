import { test, expect } from '@playwright/test'

test('capture interview UI screenshot', async ({ page }) => {
  // Go to interview
  await page.goto('/interview/demo')
  
  // Fill in name and start
  await page.locator('input#name').fill('Test User')
  await page.getByRole('button', { name: 'Start Interview' }).click()
  
  // Wait for interview to load
  await expect(page.locator('text=Two Sum')).toBeVisible({ timeout: 10000 })
  
  // Wait for demo mode to initialize
  await page.waitForTimeout(3000)
  
  // Take full page screenshot
  await page.screenshot({ path: 'screenshot-interview.png', fullPage: true })
  
  // Log what's visible
  const visibleText = await page.locator('body').innerText()
  console.log('=== PAGE CONTENT ===')
  console.log(visibleText.substring(0, 2000))
})
