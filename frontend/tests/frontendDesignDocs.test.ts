import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const constraints = readFileSync(
  resolve(process.cwd(), '../docs/frontend/FRONTEND_CONSTRAINTS.md'),
  'utf8',
)
const designHtml = readFileSync(
  resolve(process.cwd(), '../docs/design/mockups/design-system.html'),
  'utf8',
)
const designDocument = new DOMParser().parseFromString(designHtml, 'text/html')

describe('frontend design references', () => {
  it('keeps the login example aligned with the English-only decision', () => {
    expect(constraints).toContain('active interface is English-only')
    expect(constraints).toContain('Do not add a language switch')

    const loginExample = designDocument.getElementById('login-example')
    expect(loginExample).not.toBeNull()
    expect(loginExample?.textContent).not.toContain('中')
    expect(loginExample?.textContent).not.toMatch(/\bEN\b/)
  })

  it('keeps the anonymous receipt free of candidate identity', () => {
    const receiptExample = designDocument.getElementById('receipt-example')
    expect(receiptExample).not.toBeNull()
    expect(receiptExample?.textContent).toContain('Anonymous ballot')
    const candidateNames = [
      ...designDocument.querySelectorAll(
        '.candidate-profiles h3, .candidate-grid h3, .candidate-directory h3',
      ),
    ]
      .map((heading) => heading.textContent?.trim())
      .filter((name): name is string => Boolean(name))
    expect(candidateNames.length).toBeGreaterThan(1)
    for (const name of candidateNames) {
      expect(receiptExample?.textContent).not.toContain(name)
    }
    // Allow only submission acknowledgement and election context, never a choice field.
    expect(receiptExample?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      [
        'Ballot cast.',
        'VOTING RECEIPT · ANONYMOUS',
        'Community Representative Election',
        'Anonymous ballot · recorded',
        'RECEIVED',
        'Your ballot is stored separately from your identity — no one, including administrators, can link the two.',
      ].join(' '),
    )
    const attributes = [...receiptExample!.querySelectorAll('*')]
      .flatMap((element) =>
        [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`),
      )
      .join(' ')
    expect(attributes).not.toMatch(/candidate|choice|selected/i)
  })
})
