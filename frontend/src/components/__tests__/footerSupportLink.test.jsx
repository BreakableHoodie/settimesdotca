// --- Durable guard: the footer's Ko-fi handle must match .github/FUNDING.yml --
//
// The handle exists in two places and they serve different audiences:
//
//   .github/FUNDING.yml   drives GitHub's "Sponsor" button on the repo (developers)
//   Footer.jsx            the link fans actually see on settimes.ca
//
// Neither can be derived from the other at runtime — FUNDING.yml is read by
// GitHub, not by the app, and the app is not going to parse YAML at build time
// for one string. So the copy is deliberate, and this test is what stops the two
// diverging: rename the Ko-fi account, update one, and a fan clicking "Support
// the site" lands on a page that no longer exists while every test stays green.
//
// That is the same shape as the `bandFields.js` registry drift documented in
// CLAUDE.md — two lists of the same truth, where nothing fails when they
// disagree. One test is cheaper than remembering.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Footer from '../Footer'

// Resolved from this file, never process.cwd(): the repo root is four levels up
// and an IDE runner invoking vitest from elsewhere would otherwise read nothing.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const FUNDING_YML = join(REPO_ROOT, '.github/FUNDING.yml')

/** The ACTIVE ko_fi handle — commented lines are options, not configuration. */
function fundingKoFiHandle() {
  const yml = readFileSync(FUNDING_YML, 'utf8')
  for (const line of yml.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const match = trimmed.match(/^ko_fi:\s*(\S+)/)
    if (match) return match[1]
  }
  return undefined
}

describe('footer support link', () => {
  it('points at the same Ko-fi account as FUNDING.yml', () => {
    const handle = fundingKoFiHandle()
    expect(
      handle,
      'no active ko_fi entry in .github/FUNDING.yml — if sponsorship moved platform, this test should move with it'
    ).toBeTruthy()

    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /support the site/i })
    expect(link).toHaveAttribute('href', `https://ko-fi.com/${handle}`)
  })

  it('opens externally without leaking the referrer', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    )
    const link = screen.getByRole('link', { name: /support the site/i })
    expect(link).toHaveAttribute('target', '_blank')
    // Split into TOKENS rather than substring-matched: /noopener/ also passes
    // for rel="noopeners", which grants no such relation. The regex would have
    // reported a security attribute this link did not actually have.
    //
    // Both tokens, not just one: `noopener` closes the window.opener hole and
    // `noreferrer` is what the rest of this footer's external links already use.
    const relTokens = (link.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean)
    expect(relTokens).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  })
})
