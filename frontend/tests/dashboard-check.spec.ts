import { test, expect } from '@playwright/test'

test('check dashboard content', async ({ page }) => {
  await page.goto('/dashboard/demo')
  await page.waitForTimeout(2000)
  
  // Log visible headings
  const headings = await page.locator('h1, h2, h3, h4').allTextContents()
  console.log('=== DASHBOARD HEADINGS ===')
  console.log(headings)
  
  // Log page content
  const content = await page.locator('body').innerText()
  console.log('=== PAGE CONTENT ===')
  console.log(content.substring(0, 1500))
})
