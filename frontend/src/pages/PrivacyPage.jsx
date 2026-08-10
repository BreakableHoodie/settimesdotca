import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DownloadPdfButton from '../components/DownloadPdfButton'

export default function PrivacyPage() {
  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'Privacy Policy | SetTimes'
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      {/* description/canonical are SSR-owned for this route --
          functions/utils/staticPageMeta.js's STATIC_PAGES["/privacy"] entry
          injects them server-side; declaring them here too would duplicate
          them on mount instead of replacing them. */}
      <Helmet>
        <title>Privacy Policy | SetTimes</title>
      </Helmet>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 max-w-2xl py-12 legal-document">
        <div className="no-print mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="text-accent-400 hover:text-accent-500 text-sm transition-colors">
            ← Back to SetTimes
          </Link>
          <DownloadPdfButton />
        </div>

        <h1 className="text-text-primary text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-text-tertiary text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">What SetTimes is</h2>
            <p>
              SetTimes (settimes.ca) is a free, community-run schedule tool for Waterloo region music festivals. It
              helps festival-goers plan their evening. This site is operated by a single developer in the Waterloo
              region.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">What we collect</h2>

            <h3 className="text-text-secondary font-medium mb-2 mt-4">If you just browse</h3>
            <p>
              We count anonymous page views and artist profile visits (including social link clicks, ticket link clicks,
              event views, and schedule builds) to understand which features are useful. These metrics are aggregated
              and do not identify individual visitors. We use Cloudflare Analytics Engine — a privacy-safe, aggregate,
              first-party metrics sink on our infrastructure provider (Cloudflare) — rather than third-party tracking
              scripts or tracking pixels. Limited request metadata may be processed briefly by Cloudflare for security
              and abuse prevention, but public browsing is not tied to a persistent account or profiling identifier in
              our application data.
            </p>

            <h3 className="text-text-secondary font-medium mb-2 mt-4">
              If you subscribe to email updates or follow a band
            </h3>
            <p>
              We store your email address, your city/genre preferences (for subscribers), and a verification timestamp.
              As a record of your CASL express consent, we also store the IP address from which you subscribed or
              confirmed your follow, and the consent method (<code className="text-accent-400 text-sm">web_form</code>).
              This consent record is held for as long as your subscription or follow is active and deleted when you
              unsubscribe. Limited request metadata may be processed transiently for abuse prevention and rate limiting.
              Your email is only used to send the updates you subscribed to, and the one-click unsubscribe in every
              email removes the active subscription immediately.
            </p>

            <h3 className="text-text-secondary font-medium mb-2 mt-4">If you are an organiser with admin access</h3>
            <p>
              We store your email address, hashed password (PBKDF2-SHA256, 100,000 iterations), and session tokens.
              Login attempts and admin actions may include security metadata such as IP address and user agent for
              account protection, abuse investigation, and session management. These records are retained for limited
              periods and deleted automatically according to our retention rules (see below).
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Data retention</h2>
            <p className="mb-3">
              We apply the following automatic retention windows. Records are deleted on the schedule below; no manual
              request is needed.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-text-primary font-medium py-2 pr-4">Data type</th>
                    <th className="text-left text-text-primary font-medium py-2">Retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4">
                      Sessions, MFA challenges, OTP codes, password-reset tokens, trusted devices
                    </td>
                    <td className="py-2">Deleted at expiry</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Rate-limit counters</td>
                    <td className="py-2">~30 minutes</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Login attempt log (IPs, emails)</td>
                    <td className="py-2">30 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Security audit log (IPs, events)</td>
                    <td className="py-2">90 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Admin action log</td>
                    <td className="py-2">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Email subscribers / band followers (incl. consent IP)</td>
                    <td className="py-2">Until unsubscribe / unfollow</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Your browser storage</h2>
            <p className="mb-3">
              We use <code className="text-accent-400 text-sm">localStorage</code> on your device for:
            </p>
            <ul className="list-disc list-outside pl-5 space-y-1">
              <li>
                <code className="text-accent-400 text-sm">selectedBandsByEvent</code> — bands you have added to your
                personal schedule (never sent to our servers)
              </li>
              <li>
                <code className="text-accent-400 text-sm">theme</code> — your preferred colour theme
              </li>
              <li>
                <code className="text-accent-400 text-sm">scheduleSessionId</code> — an anonymous session identifier
                used to associate your schedule share links
              </li>
              <li>Saved route state used for navigation continuity</li>
              <li>Privacy banner acknowledgement</li>
            </ul>
            <p className="mt-3">This data is stored only on your device and is not transmitted to our servers.</p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Cookies</h2>
            <p>
              Admin accounts use a secure, HTTP-only session cookie. Public pages use a{' '}
              <code className="text-accent-400 text-sm">csrf_token</code> cookie for cross-site request forgery
              protection when you interact with forms. Cloudflare (our hosting provider) and Turnstile (our bot
              protection service) may also set security and anti-abuse cookies as part of their infrastructure and
              challenge flow. The privacy banner acknowledgement is stored in{' '}
              <code className="text-accent-400 text-sm">localStorage</code>, not a cookie.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Infrastructure and processors</h2>
            <p>
              SetTimes runs on <strong className="text-text-secondary">Cloudflare Pages</strong> (hosting and edge
              functions) and <strong className="text-text-secondary">Cloudflare D1</strong> (database). Data is
              processed on Cloudflare infrastructure, which may include data centres outside Canada. Email notifications
              (if enabled) are sent via a third-party transactional email provider.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">CASL and commercial email</h2>
            <p>
              All email communications require your express consent (double opt-in). Every email includes a one-click
              unsubscribe link and identifies the sender as <strong className="text-text-secondary">SetTimes</strong>.
              You can reach us at{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Your rights</h2>
            <p className="mb-3">
              If you are an email subscriber or band follower, the unsubscribe link in every email deletes your
              subscription immediately.
            </p>
            <p>
              For all other requests — access, correction, erasure, or questions — email{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Changes</h2>
            <p>
              If we make material changes to this policy, we will update the date at the top of this page. We will not
              retroactively weaken privacy protections for data already collected.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Terms of Service</h2>
            <p>
              Your use of the Service is also governed by our{' '}
              <Link to="/terms" className="text-accent-400 hover:text-accent-500 transition-colors">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
