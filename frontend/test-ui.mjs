import { chromium } from 'playwright';

async function testUI() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Testing landing page...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/landing.png', fullPage: true });
  console.log('✓ Landing page loaded');

  console.log('\nTesting interview page...');
  await page.goto('http://localhost:3000/interview/demo');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/interview.png', fullPage: true });
  console.log('✓ Interview page loaded');

  console.log('\nTesting dashboard page...');
  await page.goto('http://localhost:3000/dashboard/abc123');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });
  console.log('✓ Dashboard page loaded');

  console.log('\n✅ All pages tested successfully!');

  await browser.close();
}

testUI().catch(console.error);
