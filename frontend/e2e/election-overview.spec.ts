import { expect, test } from '@playwright/test'
import type { Election, User } from '../src/api/types'

// Local UI regression only: every API call is intercepted.
const admin: User = {
  id: '1',
  username: 'admin',
  display_name: 'Election Administrator',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}

test('admin overview actions and simultaneous confirmations fit desktop and mobile', async ({
  page,
}, testInfo) => {
  const now = Date.now()
  const election: Election = {
    id: '21',
    title: 'Community representative election with a longer title',
    position_title: 'Community representative',
    description: null,
    created_by: admin.id,
    status: 'DRAFT',
    privacy_mode: 'FORCED_ANONYMOUS',
    starts_at: new Date(now - 3_600_000).toISOString(),
    ends_at: new Date(now + 3_600_000).toISOString(),
    results_published_at: null,
    created_at: '',
    updated_at: '',
  }
  await page.addInitScript(() =>
    localStorage.setItem('election.access_token', 'overview-test-token'),
  )
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/auth/me') return route.fulfill({ json: { data: admin } })
    if (path === '/api/v1/elections')
      return route.fulfill({
        json: {
          data: [
            election,
            { ...election, id: '22', status: 'OPEN' },
            { ...election, id: '23', status: 'CLOSED' },
          ],
          meta: { page: 1, page_size: 20, total: 3 },
        },
      })
    return route.fulfill({ status: 404, json: { error: { code: 'UNEXPECTED_TEST_REQUEST' } } })
  })
  await page.goto('/elections')
  await page.getByRole('button', { name: 'Open voting', exact: true }).click()
  await page.getByRole('button', { name: 'Close voting', exact: true }).click()
  const opening = page.getByRole('region', { name: 'Open voting?' })
  const closing = page.getByRole('region', { name: 'Close voting?' })
  await expect(opening).toHaveCount(1)
  await expect(closing).toHaveCount(1)
  for (const width of [1280, 1024, 901, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await page.locator('.trow-actions').evaluateAll((actions) =>
      actions.every((action) => {
        const row = action.closest('.trow')!.getBoundingClientRect()
        return [...action.querySelectorAll('a, button')].every((control) => {
          const rect = control.getBoundingClientRect()
          return rect.left >= row.left && rect.right <= row.right + 1
        })
      }),
    )
    expect(bounds).toBe(true)
    await expect(opening.getByRole('button', { name: 'Confirm open' })).toBeVisible()
    await expect(closing.getByRole('button', { name: 'Confirm close' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true })
  }
  await closing.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close voting', exact: true })).toBeFocused()
  await expect(opening).toHaveCount(1)
  await expect(closing).toHaveCount(0)
})
