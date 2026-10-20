import { expect, test } from '@playwright/test'
import type { Election, Result, User, Voter } from '../src/api/types'

// Intercepted fixtures only: these tests never call the live backend or cast a vote.
const admin: User = {
  id: '1',
  username: 'admin',
  display_name: 'Election Administrator',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}
const election: Election = {
  id: '9007199254740993',
  title: 'Community Representative Election',
  position_title: 'Community Representative',
  description: null,
  created_by: admin.id,
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}
const result: Result = {
  election_id: election.id,
  position_title: election.position_title,
  results_published_at: null,
  total_votes: 12,
  candidates: [
    { candidate_id: '9007199254740994', name: 'Avery Chen', vote_count: 8 },
    { candidate_id: '9007199254740995', name: 'Sam Lee', vote_count: 4 },
    { candidate_id: '9007199254740996', name: 'Jordan Morgan', vote_count: 0 },
  ],
  winner_candidate_id: '9007199254740994',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('election.access_token', 'workflow-test-token'),
  )
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: admin } }))
})

for (const width of [1280, 768, 390, 320]) {
  test(`voter roll and results at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    let currentElection = { ...election }
    let currentResult = { ...result }
    let voters: Voter[] = [
      {
        election_id: election.id,
        user_id: '9007199254740997',
        display_name: 'Alexandra Morgan-Robertson',
        vote_quota: 1,
        created_at: '',
        updated_at: '',
      },
      {
        election_id: election.id,
        user_id: '18446744073709551615',
        display_name: 'Taylor Chen',
        vote_quota: 1,
        created_at: '',
        updated_at: '',
      },
    ]
    let additions = 0
    let removals = 0
    let publications = 0
    await page.route(`**/api/v1/elections/${election.id}`, (route) =>
      route.fulfill({ json: { data: currentElection } }),
    )
    await page.route(`**/api/v1/elections/${election.id}/voters**`, (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        additions++
        const body = request.postDataJSON() as { user_id: string }
        expect(body).toEqual({ user_id: '9007199254740998' })
        const added: Voter = { ...voters[0], user_id: body.user_id, display_name: 'Casey Park' }
        voters = [...voters, added]
        return route.fulfill({ status: 201, json: { data: added } })
      }
      if (request.method() === 'DELETE') {
        removals++
        voters = voters.filter((voter) => voter.user_id !== request.url().split('/').at(-1))
        return route.fulfill({ status: 204 })
      }
      return route.fulfill({
        json: { data: voters, meta: { page: 1, page_size: 20, total: voters.length } },
      })
    })
    await page.route(`**/api/v1/elections/${election.id}/results**`, (route) => {
      if (route.request().method() === 'POST') {
        publications++
        expect(route.request().postData()).toBeNull()
        currentResult = { ...currentResult, results_published_at: '2026-10-20T10:00:00Z' }
        currentElection = {
          ...currentElection,
          results_published_at: currentResult.results_published_at,
        }
      }
      return route.fulfill({ json: { data: currentResult } })
    })

    const noOverflow = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.goto(`/elections/${election.id}/voters`)
    await expect(page.getByText('18446744073709551615', { exact: true })).toBeVisible()
    await noOverflow()
    await page.screenshot({ path: testInfo.outputPath(`roster-${width}.png`), fullPage: true })
    await page.getByLabel('Voter ID', { exact: true }).fill('9007199254740998')
    await page.getByRole('button', { name: 'Add voter', exact: true }).click()
    await expect(page.getByRole('rowheader', { name: 'Casey Park' })).toBeVisible()
    expect(additions).toBe(1)
    const remove = page.getByRole('button', { name: 'Remove Casey Park (ID 9007199254740998)' })
    await remove.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Remove voter?' })).toBeFocused()
    await noOverflow()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(remove).toBeFocused()
    expect(removals).toBe(0)
    await remove.click()
    await page.getByRole('button', { name: 'Confirm removal' }).click()
    await expect(page.getByRole('rowheader', { name: 'Casey Park' })).toHaveCount(0)
    expect(removals).toBe(1)

    currentElection = { ...currentElection, status: 'CLOSED' }
    await page.goto(`/elections/${election.id}/results`)
    await expect(page.getByRole('heading', { name: 'Unpublished count' })).toBeVisible()
    await expect(page.getByRole('row', { name: 'Jordan Morgan 0 —' })).toBeVisible()
    await noOverflow()
    await page.screenshot({ path: testInfo.outputPath(`results-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Publish results' }).click()
    await expect(page.getByRole('heading', { name: 'Publish this result?' })).toBeFocused()
    await noOverflow()
    await page.getByRole('button', { name: 'Confirm publication' }).click()
    await expect(page.getByRole('heading', { name: 'Published result' })).toBeVisible()
    expect(publications).toBe(1)
    await expect(page.getByRole('button', { name: 'Publish results' })).toHaveCount(0)

    // A non-member active voter can read published aggregate results without roster access.
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ json: { data: { ...admin, id: '23', role: 'USER' } } }),
    )
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Published result' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish results' })).toHaveCount(0)
    await noOverflow()
    await page.goto(`/elections/${election.id}/voters`)
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible()
  })
}

test('empty, locked and unavailable states remain actionable on mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(`**/api/v1/elections/${election.id}`, (route) =>
    route.fulfill({ json: { data: { ...election, status: 'CLOSED' } } }),
  )
  await page.route(`**/api/v1/elections/${election.id}/voters**`, (route) =>
    route.fulfill({ json: { data: [], meta: { page: 1, page_size: 20, total: 0 } } }),
  )
  await page.goto(`/elections/${election.id}/voters`)
  await expect(page.getByText('No voters on this roll.')).toBeVisible()
  await expect(page.getByLabel('Voter ID', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('empty-locked-mobile.png'), fullPage: true })
  await page.route(`**/api/v1/elections/${election.id}/results`, (route) =>
    route.fulfill({ status: 404, json: { error: { code: 'ROUTE_NOT_FOUND' } } }),
  )
  await page.goto(`/elections/${election.id}/results`)
  await expect(page.getByRole('alert')).toContainText('not available on the current backend')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('unavailable-mobile.png'), fullPage: true })
})
