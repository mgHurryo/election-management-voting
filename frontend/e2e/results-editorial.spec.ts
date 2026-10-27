import { expect, test } from '@playwright/test'
import type { Election, Result, User } from '../src/api/types'

// Synthetic, intercepted fixtures. No requests reach an election backend.
const user: User = {
  id: '23',
  username: 'voter',
  display_name: 'Alex Morgan',
  role: 'USER',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}
const election: Election = {
  id: '42',
  title: 'Staff Council 2026',
  position_title: 'Council Seat',
  description: null,
  created_by: '1',
  status: 'CLOSED',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: '2026-10-20T10:00:00Z',
  created_at: '',
  updated_at: '',
}
const result: Result = {
  election_id: election.id,
  position_title: election.position_title,
  results_published_at: election.results_published_at,
  total_votes: 1260,
  candidates: [
    { candidate_id: '1', name: 'Avery Chen', vote_count: 840 },
    { candidate_id: '2', name: 'Sam Lee', vote_count: 315 },
    { candidate_id: '3', name: 'Jordan Morgan', vote_count: 105 },
  ],
  winner_candidate_id: '1',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('election.access_token', 'results-test-token'),
  )
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: user } }))
  await page.route('**/api/v1/elections/42', (route) => route.fulfill({ json: { data: election } }))
  await page.route('**/api/v1/elections/42/results', (route) =>
    route.fulfill({ json: { data: result } }),
  )
})

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`published result bulletin at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/elections/42/results')
    const announcement = page.getByRole('region', { name: 'Avery Chen' })
    await expect(announcement.getByText('840', { exact: true })).toBeVisible()
    await expect(announcement.getByText('66.7%', { exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: 'Sam Lee 315 25.0% Not elected' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Published result' })).toBeVisible()
    await expect(page.locator('time')).toHaveAttribute('datetime', election.results_published_at!)
    await expect(page.getByRole('button', { name: 'Publish results' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`results-editorial-${width}.png`),
      fullPage: true,
    })
    await expect(page.getByRole('button', { name: 'Refresh results' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Result actions' })).toHaveCount(0)
    const back = page.getByRole('link', { name: 'All elections', exact: true })
    await back.focus()
    await expect(back).toBeFocused()
  })

  test(`three-way tie bulletin at ${width}px`, async ({ page }, testInfo) => {
    await page.route('**/api/v1/elections/42/results', (route) =>
      route.fulfill({
        json: {
          data: {
            ...result,
            total_votes: 3,
            winner_candidate_id: null,
            candidates: result.candidates.map((candidate) => ({ ...candidate, vote_count: 1 })),
          },
        },
      }),
    )
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/elections/42/results')
    const announcement = page.getByRole('region', { name: 'Three-way tie' })
    await expect(announcement).toBeVisible()
    await expect(
      announcement.getByText(
        'All three candidates received one vote. No winner has been declared.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(4)
    await expect(page.getByRole('cell', { name: '1 33.3%' })).toHaveCount(3)
    await expect(page.getByText('Tied for first')).toHaveCount(3)
    await expect(page.locator('.results-main--tie')).toBeVisible()
    await expect(page.locator('.results-victory-summary')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Refresh results' })).toHaveCount(0)
    await expect(page.locator('.results-large-count')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`results-tie-${width}.png`), fullPage: true })
  })
}

test('long names and a long candidate list stay readable on mobile', async ({ page }) => {
  const longName = 'Alexandra Morgan-Robertson 陳芷晴'.repeat(3)
  const candidates = Array.from({ length: 18 }, (_, index) => ({
    candidate_id: String(index + 1),
    name: `${index + 1}. ${longName}`,
    vote_count: index === 0 ? 1 : 0,
  }))
  await page.route('**/api/v1/elections/42/results', (route) =>
    route.fulfill({
      json: { data: { ...result, total_votes: 1, candidates } },
    }),
  )
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/elections/42/results')
  await expect(page.getByRole('row')).toHaveCount(19)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByText('Only aggregate counts are shown.', { exact: false })).toBeVisible()
})

test('print media keeps a tie result as a readable table', async ({ page }) => {
  const candidates = Array.from({ length: 10 }, (_, index) => ({
    candidate_id: String(index + 1),
    name: `Candidate ${index + 1}`,
    vote_count: 1,
  }))
  await page.route('**/api/v1/elections/42/results', (route) =>
    route.fulfill({
      json: { data: { ...result, total_votes: 10, candidates, winner_candidate_id: null } },
    }),
  )
  await page.goto('/elections/42/results')
  await expect(page.getByRole('heading', { name: '10-way tie', exact: true })).toBeVisible()
  await page.emulateMedia({ media: 'print' })

  await expect(page.locator('.results-count--tie thead')).toHaveCSS('position', 'static')
  await expect(page.locator('.results-count--tie tbody tr').first()).toHaveCSS(
    'display',
    'table-row',
  )
  await expect(page.getByText('OFFICIAL PUBLISHED RESULT')).toBeVisible()
})

test('result print styles do not affect another route', async ({ page }) => {
  await page.goto('/elections/42/results')
  await expect(page.getByRole('heading', { name: 'Published result', exact: true })).toBeVisible()
  await page.goto('/forbidden')
  await page.emulateMedia({ media: 'print' })

  await expect(page.locator('.top')).not.toHaveCSS('display', 'none')
  await page.emulateMedia({ media: 'screen' })
})

for (const width of [1440, 390]) {
  test(`ten tied candidates use the actual tie size and vote shares at ${width}px`, async ({
    page,
  }, testInfo) => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      candidate_id: String(index + 1),
      name: `Candidate ${index + 1}`,
      vote_count: 1,
    }))
    await page.route('**/api/v1/elections/42/results', (route) =>
      route.fulfill({
        json: { data: { ...result, total_votes: 10, candidates, winner_candidate_id: null } },
      }),
    )
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/elections/42/results')
    const outcome = page.getByRole('region', { name: '10-way tie', exact: true })
    await expect(outcome).toBeVisible()
    await expect(
      outcome.getByText('Each candidate received one vote. No winner has been declared.'),
    ).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(11)
    await expect(page.getByRole('cell', { name: '1 10.0%' })).toHaveCount(10)
    await expect(page.getByText('Tied for first', { exact: true })).toHaveCount(10)
    await expect(page.getByRole('rowheader', { name: 'Candidate 10', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Three-way tie' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`results-ten-tie-${width}.png`),
      fullPage: true,
    })
  })
}

for (const width of [1440, 390]) {
  test(`list, detail redirect and results share the same shell at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.route('**/api/v1/elections?**', (route) =>
      route.fulfill({
        json: { data: [election], meta: { page: 1, page_size: 20, total: 1 } },
      }),
    )
    await page.route('**/api/v1/elections/42/candidates?**', (route) =>
      route.fulfill({
        json: { data: [], meta: { page: 1, page_size: 20, total: 0 } },
      }),
    )
    const shellMetrics = async () => {
      // Compare the same loaded typefaces across separate document navigations.
      await page.evaluate(() => document.fonts.ready)
      return page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        return { top: box('.top'), brand: box('.brand'), identity: box('.who') }
      })
    }
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Elections', exact: true })).toBeVisible()
    const listShell = await shellMetrics()
    const listLeft = (await page.locator('.hero').boundingBox())!.x
    await page.screenshot({
      path: testInfo.outputPath(`reference-list-${width}.png`),
      fullPage: true,
    })
    // Compare the established routes independently of the list's result-link rollout.
    await page.goto('/elections/42/results')
    await expect(page.getByRole('heading', { name: 'Avery Chen', exact: true })).toBeVisible()
    expect(await shellMetrics()).toEqual(listShell)
    expect((await page.locator('.results-page .election-detail-header').boundingBox())!.x).toBe(
      listLeft,
    )
    await page.getByRole('link', { name: 'All elections', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Elections', exact: true })).toBeVisible()

    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ json: { data: { ...user, role: 'ADMIN' } } }),
    )
    await page.goto('/elections/42')
    await expect(page.getByRole('heading', { name: election.title, exact: true })).toBeVisible()
    const redirectedResultsShell = await shellMetrics()
    const redirectedResultsLeft = (await page
      .locator('.results-page .election-detail-header')
      .boundingBox())!.x
    await page.screenshot({
      path: testInfo.outputPath(`reference-redirected-results-${width}.png`),
      fullPage: true,
    })
    await expect(page.getByRole('heading', { name: 'Published result', exact: true })).toBeVisible()
    expect(redirectedResultsShell.top).toMatchObject({
      x: listShell.top.x,
      width: listShell.top.width,
    })
    expect(redirectedResultsShell.brand).toEqual(listShell.brand)
    expect((await page.locator('.results-page .election-detail-header').boundingBox())!.x).toBe(
      redirectedResultsLeft,
    )
    await page.getByRole('link', { name: 'All elections', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Elections', exact: true })).toBeVisible()
  })
}
