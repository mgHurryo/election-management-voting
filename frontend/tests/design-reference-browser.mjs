import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort())
  const reference = pathToFileURL(resolve('../docs/design/mockups/design-system.html')).href
  const output = resolve('test-results/design-reference')
  await mkdir(output, { recursive: true })
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(reference)
    const layout = await page.evaluate(() => {
      const row = document.querySelector('.election-row')
      const positions = [...row.children].map((element) => element.getBoundingClientRect().top)
      return {
        contentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        rowPositions: positions,
      }
    })
    assert.ok(layout.contentWidth <= layout.viewportWidth, `Reference overflows at ${width}px`)
    if (width <= 900) {
      assert.ok(layout.rowPositions[1] > layout.rowPositions[0], 'Time must follow the title')
      assert.ok(layout.rowPositions[2] > layout.rowPositions[1], 'Actions must follow the time')
    } else {
      assert.ok(Math.max(...layout.rowPositions) - Math.min(...layout.rowPositions) < 10)
    }
    await page.screenshot({ path: resolve(output, `reference-${width}.png`), fullPage: true })
    await page
      .locator('.election-row')
      .first()
      .screenshot({ path: resolve(output, `election-row-${width}.png`) })
    await page.locator('#login-example').screenshot({ path: resolve(output, `login-${width}.png`) })
    console.log(`Design reference ${width}px: no overflow, expected reading order`)
  }
} finally {
  await browser.close()
}
