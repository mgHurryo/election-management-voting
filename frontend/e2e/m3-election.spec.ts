import { expect, test } from '@playwright/test'
import type { Candidate, Election, User } from '../src/api/types'

const admin: User = {
  id: '1',
  username: 'admin',
  display_name: 'System Administrator',
  role: 'ADMIN',
  status: 'ACTIVE',
  created_at: '2026-10-17T00:00:00Z',
  updated_at: '2026-10-17T00:00:00Z',
}

const election: Election = {
  id: '41',
  title: 'Community Representative Election',
  position_title: 'Community Representative',
  description: 'Choose the next representative for the community.',
  created_by: admin.id,
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T09:00:00Z',
  ends_at: '2026-10-20T17:00:00Z',
  results_published_at: null,
  created_at: '2026-10-17T00:00:00Z',
  updated_at: '2026-10-17T00:00:00Z',
}

function candidate(id: string, values: Partial<Candidate> = {}): Candidate {
  return {
    id,
    election_id: election.id,
    name: 'Lin Zhixia',
    position_title: election.position_title,
    description: 'Improves shared spaces and publishes progress openly.',
    photo_url: null,
    display_order: 1,
    created_at: '2026-10-17T00:00:00Z',
    updated_at: '2026-10-17T00:00:00Z',
    ...values,
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('election.access_token', 'e2e-admin-token'))
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: admin } }))
})

test('login errors do not resize the form on desktop or mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('election.access_token'))
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'INVALID_CREDENTIALS' } },
    }),
  )

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    const form = page.locator('.lgbox')
    const initialHeight = (await form.boundingBox())!.height
    await page.getByLabel('Username').fill('voter')
    await page.getByLabel('Password').fill('incorrect')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect username or password')
    expect((await form.boundingBox())!.height).toBe(initialHeight)
  }
})

test('admin creates an election and manages draft candidates through the API', async ({
  page,
}, testInfo) => {
  const roster: Candidate[] = []
  let nextCandidateId = 700
  let createElectionBody: Record<string, unknown> | null = null

  await page.route('**/api/v1/elections', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    createElectionBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 201, json: { data: election } })
  })
  await page.route('**/api/v1/elections/41', (route) => route.fulfill({ json: { data: election } }))
  await page.route('**/api/v1/elections/41/candidates**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        json: { data: roster, meta: { page: 1, page_size: 20, total: roster.length } },
      })
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Partial<Candidate>
      const added = candidate(String(nextCandidateId++), body)
      roster.push(added)
      return route.fulfill({ status: 201, json: { data: added } })
    }
    if (request.method() === 'PATCH') {
      const id = request.url().split('/').at(-1) ?? ''
      const index = roster.findIndex((item) => item.id === id)
      if (index < 0)
        return route.fulfill({ status: 404, json: { error: { code: 'CANDIDATE_NOT_FOUND' } } })
      roster[index] = { ...roster[index], ...(request.postDataJSON() as Partial<Candidate>) }
      return route.fulfill({ json: { data: roster[index] } })
    }
    if (request.method() === 'DELETE') {
      const id = request.url().split('/').at(-1) ?? ''
      const index = roster.findIndex((item) => item.id === id)
      if (index >= 0) roster.splice(index, 1)
      return route.fulfill({ status: 204 })
    }
    return route.continue()
  })

  await page.goto('/elections/new')
  await expect(page.getByRole('heading', { name: 'Create election' })).toBeVisible()
  const createFieldPositions = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }
    return {
      name: bounds('.election-create-name'),
      opens: bounds('[name="starts_at"]'),
      closes: bounds('[name="ends_at"]'),
      description: bounds('.election-create-description'),
      voters: bounds('.election-create-voters'),
    }
  })
  expect(createFieldPositions.closes.y).toBeGreaterThan(createFieldPositions.opens.y)
  expect(createFieldPositions.description.x).toBeGreaterThan(createFieldPositions.name.x)
  expect(createFieldPositions.voters.x).toBeGreaterThan(createFieldPositions.name.x)
  await page.getByLabel('Election name *').fill('Community Representative Election')
  await page.getByLabel('Position *').fill('Community Representative')
  await page.getByLabel('Opens at *').fill('2026-10-20T09:00')
  await page.getByLabel('Closes at *').fill('2026-10-20T17:00')
  await page.getByLabel('Voter IDs *').fill('42')
  await page.getByRole('button', { name: 'Create draft' }).click()

  await expect(
    page.getByRole('heading', { name: 'Community Representative Election' }),
  ).toBeVisible()
  expect(createElectionBody).toMatchObject({
    title: 'Community Representative Election',
    position_title: 'Community Representative',
    voter_ids: ['42'],
  })
  await page.getByRole('link', { name: 'Candidate management' }).click()
  await expect(
    page.getByRole('heading', { name: 'Community Representative Election' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add candidate' }).first().click()
  await page.getByLabel('Name *').fill('Lin Zhixia')
  await page
    .getByLabel('Description *')
    .fill('Improves shared spaces and publishes progress openly.')
  await page.getByLabel('Photo URL (https)').fill('http://example.org/photo.jpg')
  await page.getByRole('button', { name: 'Add candidate' }).last().click()
  await expect(page.getByRole('alert')).toContainText('HTTPS')
  expect(roster).toHaveLength(0)

  await page.getByLabel('Photo URL (https)').fill('https://example.org/photo.jpg')
  await page.getByRole('button', { name: 'Add candidate' }).last().click()
  const row = page.getByRole('row', { name: /Lin Zhixia/ })
  await expect(row).toContainText('Improves shared spaces')
  await expect(row.getByRole('link', { name: 'View photo' })).toHaveAttribute(
    'href',
    'https://example.org/photo.jpg',
  )

  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Name *').fill('Lin Zhixia (updated)')
  await page.getByRole('button', { name: 'Save' }).click()
  const updatedRow = page.getByRole('row', { name: /Lin Zhixia \(updated\)/ })
  await expect(updatedRow).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('candidate-management.png'), fullPage: true })

  await updatedRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await updatedRow.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByRole('status')).toContainText('No candidates yet')
  expect(roster).toHaveLength(0)
})

test('election creation form stacks its sections on a mobile viewport', async ({ page }) => {
  await page.goto('/elections/new')
  await expect(page.getByRole('heading', { name: 'Create election' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })

  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }
    return {
      details: bounds('.election-create-details'),
      eligibility: bounds('.election-create-eligibility'),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })

  expect(layout.eligibility.y).toBeGreaterThan(layout.details.y)
  expect(layout.eligibility.x).toBe(layout.details.x)
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
})

test('closed elections remain discoverable after closure, publication, navigation and reload', async ({
  page,
}, testInfo) => {
  let current: Election = { ...election, status: 'OPEN' }
  let closeRequests = 0
  await page.route('**/api/v1/elections?**', (route) => {
    const status = new URL(route.request().url()).searchParams.get('status')
    const rows = !status || status === current.status ? [current] : []
    return route.fulfill({
      json: { data: rows, meta: { page: 1, page_size: 20, total: rows.length } },
    })
  })
  await page.route('**/api/v1/elections/41', (route) => route.fulfill({ json: { data: current } }))
  await page.route('**/api/v1/elections/41/candidates**', (route) =>
    route.fulfill({
      json: { data: [], meta: { page: 1, page_size: 20, total: 0 } },
    }),
  )
  await page.route('**/api/v1/elections/41/close', (route) => {
    closeRequests++
    current = { ...current, status: 'CLOSED' }
    return route.fulfill({ json: { data: current } })
  })
  await page.goto('/elections')
  await page.getByRole('link', { name: 'Vote', exact: true }).click()
  await page.getByRole('button', { name: 'Close voting', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm close', exact: true }).click()
  await expect(page.getByText('Voting is closed.', { exact: true })).toBeVisible()
  expect(closeRequests).toBe(1)
  // Publication UI is still a placeholder; model a subsequent server-side publication.
  current = { ...current, results_published_at: '2026-10-20T18:00:00Z' }
  const voter: User = { ...admin, id: '2', username: 'voter', role: 'USER' }
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: voter } }))
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 320, height: 812 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/elections')
    await expect(page.getByRole('heading', { name: election.title })).toBeVisible()
    await page.getByRole('button', { name: 'Closed', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Closed (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('link', { name: 'Details', exact: true }).click()
    await expect(page.getByRole('link', { name: 'View results' })).toBeVisible()
    await page.getByRole('link', { name: 'All elections' }).click()
    await page.reload()
    await expect(page.getByRole('heading', { name: election.title })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`closed-elections-${viewport.width}.png`),
      fullPage: true,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  }
})

test('election list fits a mobile viewport without horizontal page overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.route('**/api/v1/elections**', (route) => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    return route.fulfill({
      json: {
        data: !status || status === 'OPEN' ? [{ ...election, status: 'OPEN' }] : [],
        meta: {
          page: Number(url.searchParams.get('page') ?? 1),
          page_size: 20,
          total: status === 'DRAFT' ? 0 : 1,
        },
      },
    })
  })
  await page.goto('/elections')
  await expect(page.getByRole('heading', { name: 'Elections' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('elections-mobile.png'), fullPage: true })
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
})

test('election details prioritize candidates and group election actions responsively', async ({
  page,
}, testInfo) => {
  await page.route('**/api/v1/elections/41', (route) => route.fulfill({ json: { data: election } }))
  await page.route('**/api/v1/elections/41/candidates**', (route) =>
    route.fulfill({
      json: {
        data: [candidate('701'), candidate('702', { name: 'Morgan Lee' })],
        meta: { page: 1, page_size: 20, total: 2 },
      },
    }),
  )

  await page.goto('/elections/41')
  await expect(page.getByRole('heading', { name: election.title })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Candidates' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Election details' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Candidate management' })).toBeVisible()

  const desktop = await page.evaluate(() => {
    const candidates = document.querySelector('.election-candidates')!.getBoundingClientRect()
    const aside = document.querySelector('.election-detail-aside')!.getBoundingClientRect()
    const brandX = document.querySelector('.toprow .brand')!.getBoundingClientRect().x
    const contentX = document.querySelector('.election-back-link')!.getBoundingClientRect().x
    return {
      candidatesX: candidates.x,
      candidatesWidth: candidates.width,
      asideX: aside.x,
      brandX,
      contentX,
    }
  })
  expect(desktop.asideX).toBeGreaterThan(desktop.candidatesX + desktop.candidatesWidth)
  expect(Math.abs(desktop.brandX - desktop.contentX)).toBeLessThan(1)
  await page.screenshot({
    path: testInfo.outputPath('election-detail-desktop.png'),
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.evaluate(() => {
    const candidates = document.querySelector('.election-candidates')!.getBoundingClientRect()
    const aside = document.querySelector('.election-detail-aside')!.getBoundingClientRect()
    return {
      candidatesY: candidates.y,
      asideY: aside.y,
      brandX: document.querySelector('.toprow .brand')!.getBoundingClientRect().x,
      contentX: document.querySelector('.election-back-link')!.getBoundingClientRect().x,
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }
  })
  expect(mobile.asideY).toBeGreaterThan(mobile.candidatesY)
  expect(Math.abs(mobile.brandX - mobile.contentX)).toBeLessThan(1)
  expect(mobile.content).toBeLessThanOrEqual(mobile.viewport)
  await page.screenshot({ path: testInfo.outputPath('election-detail-mobile.png'), fullPage: true })
})

test('voter candidate modes match the editorial layouts and page sizes', async ({
  page,
}, testInfo) => {
  const openElection = { ...election, status: 'OPEN' as const }
  const voter: User = {
    ...admin,
    id: '42',
    username: 'voter',
    display_name: 'Eligible voter',
    role: 'USER',
  }
  const options = Array.from({ length: 9 }, (_, index) =>
    candidate(String(701 + index), {
      name: `Candidate ${index + 1}`,
      display_order: index === 1 ? 0 : index,
    }),
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: voter } }))
  await page.route('**/api/v1/elections/41', (route) =>
    route.fulfill({ json: { data: openElection } }),
  )
  await page.route('**/api/v1/elections/41/candidates**', (route) =>
    route.fulfill({
      json: { data: options, meta: { page: 1, page_size: 20, total: options.length } },
    }),
  )
  await page.route('**/api/v1/elections/41/ballot', (route) =>
    route.fulfill({
      json: {
        data: {
          election: openElection,
          candidates: options,
          participation: {
            election_id: '41',
            eligible: true,
            vote_quota: 1,
            used_votes: 0,
            remaining_votes: 1,
          },
        },
      },
    }),
  )

  await page.goto('/elections/41')
  await expect(page.getByRole('heading', { name: 'Candidate List' })).toBeVisible()
  await expect(page.locator('.election-detail-aside')).toHaveCount(0)
  const ballotContent = await page.locator('.election-detail-grid-ballot').evaluate((element) => {
    const parent = element.parentElement!
    const style = getComputedStyle(parent)
    const parentWidth =
      parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    return Math.abs(parentWidth - element.getBoundingClientRect().width)
  })
  expect(ballotContent).toBeLessThan(1)
  const profiles = page.locator('.candidate-list')
  await expect(profiles.locator('.cand-prof')).toHaveCount(4)
  await expect(profiles.getByRole('heading', { name: 'Candidate 1' })).toContainText('01')
  await expect(profiles.getByRole('heading', { name: 'Candidate 2' })).toContainText('02')
  await expect(profiles.locator('.cand-prof .cpos').first()).toHaveText(election.position_title)
  expect(
    await profiles.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    ),
  ).toBe(2)
  await page.screenshot({
    path: testInfo.outputPath('candidate-modes-desktop.png'),
    fullPage: true,
  })

  await page.getByRole('button', { name: 'Compact grid' }).click()
  await expect(page.locator('.cand-grid .piece')).toHaveCount(8)
  expect(
    await page
      .locator('.cand-grid')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
  ).toBe(4)

  await page.getByRole('button', { name: 'Directory' }).click()
  await expect(page.locator('.cand-dir .drow')).toHaveCount(8)
  await expect(page.locator('.cand-dir .dno').first()).toHaveText('01')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('.cand-dir .drow')).toHaveCount(1)
  await expect(page.getByRole('radio', { name: 'Candidate 9' })).toBeVisible()

  await page.getByRole('button', { name: 'Profiles' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await profiles.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    ),
  ).toBe(1)
  expect(
    await page
      .locator('.cand-prof .pic')
      .first()
      .evaluate((element) => getComputedStyle(element).width),
  ).toBe('116px')
  expect(
    await page.locator('.bbar .bs').evaluate((element) => getComputedStyle(element).display),
  ).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('candidate-modes-mobile.png'), fullPage: true })
})

test('candidate management stays readable on a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.route('**/api/v1/elections/41', (route) => route.fulfill({ json: { data: election } }))
  await page.route('**/api/v1/elections/41/candidates**', (route) =>
    route.fulfill({
      json: {
        data: [candidate('700')],
        meta: { page: 1, page_size: 20, total: 1 },
      },
    }),
  )
  await page.goto('/elections/41/candidates')
  const candidateRow = page.getByRole('row', { name: /Lin Zhixia/ })
  await expect(candidateRow).toBeVisible()
  const descriptionWidth = await candidateRow
    .locator('.candidate-description-cell')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(descriptionWidth).toBeGreaterThan(250)
  const captionWidth = await page
    .locator('.candidate-table caption')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(captionWidth).toBeGreaterThan(250)
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  await page.screenshot({
    path: testInfo.outputPath('candidate-management-mobile.png'),
    fullPage: true,
  })
})

test('voter completes the in-place ballot flow without duplicate submission', async ({
  page,
}, testInfo) => {
  const openElection = { ...election, status: 'OPEN' as const }
  const voter: User = {
    ...admin,
    id: '42',
    username: 'voter',
    display_name: 'Eligible voter',
    role: 'USER',
  }
  const options = [candidate('701'), candidate('702', { name: 'Morgan Lee' })]
  let submissions = 0
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: voter } }))
  await page.route('**/api/v1/elections/41', (route) =>
    route.fulfill({ json: { data: openElection } }),
  )
  await page.route('**/api/v1/elections/41/candidates**', (route) =>
    route.fulfill({
      json: { data: options, meta: { page: 1, page_size: 20, total: options.length } },
    }),
  )
  await page.route('**/api/v1/elections/41/ballot', (route) =>
    route.fulfill({
      json: {
        data: {
          election: openElection,
          candidates: options,
          participation: {
            election_id: '41',
            eligible: true,
            vote_quota: 1,
            used_votes: 0,
            remaining_votes: 1,
          },
        },
      },
    }),
  )
  await page.route('**/api/v1/elections/41/votes', async (route) => {
    submissions += 1
    await route.fulfill({ status: 201, json: { data: { election_id: '41', accepted: true } } })
  })

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/elections/41')
  await page.locator('label.cand-prof').filter({ hasText: 'Lin Zhixia' }).click()
  await page.getByRole('button', { name: 'Compact grid' }).click()
  await expect(page.getByRole('radio', { name: 'Lin Zhixia' })).toBeChecked()
  await page.getByRole('button', { name: 'Review and submit' }).click()
  await expect(
    page.getByText('Once submitted, this ballot cannot be changed, withdrawn, or deleted.'),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('ballot-confirmation-mobile.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Submit — irrevocable' }).click()
  await expect(page.getByRole('heading', { name: 'Ballot cast.' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('ballot-receipt-mobile.png'), fullPage: true })
  expect(submissions).toBe(1)
  expect(pageErrors).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})
