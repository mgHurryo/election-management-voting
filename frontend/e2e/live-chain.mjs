import { chromium } from '@playwright/test'

const base = process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:5173'
const username = process.env.LIVE_USERNAME
const password = process.env.LIVE_PASSWORD
if (!username || !password) {
  throw new Error('Set LIVE_USERNAME and LIVE_PASSWORD to run the read-only live smoke test.')
}

const browser = await chromium.launch()
const page = await browser.newPage()
const statuses = {}
const apiResponses = []
const apiRequests = []
const failedRequests = []
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('request', (request) => {
  const pathname = new URL(request.url()).pathname
  if (pathname.startsWith('/api/')) apiRequests.push(pathname)
})
page.on('requestfailed', (request) => {
  const pathname = new URL(request.url()).pathname
  if (pathname.startsWith('/api/')) failedRequests.push({ path: pathname, reason: request.failure()?.errorText })
})
page.on('response', (response) => {
  const pathname = new URL(response.url()).pathname.replace(/\/$/, '')
  if (pathname.startsWith('/api/')) apiResponses.push({ path: pathname, status: response.status() })
  if (pathname === '/api/v1/auth/login') statuses.login = response.status()
  else if (pathname === '/api/v1/elections') statuses.list = response.status()
  else if (/^\/api\/v1\/elections\/[^/]+$/.test(pathname)) statuses.detail = response.status()
  else if (/^\/api\/v1\/elections\/[^/]+\/candidates$/.test(pathname)) statuses.candidates = response.status()
  else if (/^\/api\/v1\/elections\/[^/]+\/ballot$/.test(pathname)) statuses.ballot = response.status()
})

try {
  await page.goto(`${base}/login`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })
  await page.goto(`${base}/elections`)
  await page.getByRole('heading', { name: 'Elections' }).waitFor({ timeout: 20000 })
  await page.locator('.trow, .empty, [role="alert"]').first().waitFor({ timeout: 25000 })

  const voteLink = page.getByRole('link', { name: 'Vote' }).first()
  if (await voteLink.count()) {
    await voteLink.click()
    await page.getByRole('heading', { name: 'Candidates' }).waitFor({ timeout: 20000 })
    await page.waitForFunction(() => document.querySelector('.candidate-list') || document.querySelector('[role="alert"]'), { timeout: 25000 })
    await page.waitForTimeout(1000)
  }

  if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.length}`)
  console.log(JSON.stringify({
    result: statuses.list ? 'read-only live smoke completed' : 'incomplete: election list response not observed',
    currentPath: new URL(page.url()).pathname,
    authenticated: statuses.login === 200,
    electionListStatus: statuses.list ?? 'not observed',
    electionDetailStatus: statuses.detail ?? 'not observed',
    candidateStatus: statuses.candidates ?? 'not observed',
    ballotStatus: statuses.ballot ?? 'not observed (no open election visible)',
    apiResponses,
    apiRequests,
    failedRequests,
    browserRuntimeErrors: pageErrors.length,
  }, null, 2))
} finally {
  await browser.close()
}
