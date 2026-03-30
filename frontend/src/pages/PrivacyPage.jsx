import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Privacy Policy | SetTimes</title>
        <meta name="description" content="Privacy policy for SetTimes — Waterloo region music festival scheduling." />
        <link rel="canonical" href="https://settimes.ca/privacy" />
      </Helmet>

      <div className="container mx-auto px-4 max-w-2xl py-12">
        <Link to="/" className="text-accent-400 hover:text-accent-500 text-sm mb-8 inline-block transition-colors">
          ← Back to SetTimes
        </Link>

        <h1 className="text-white text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-text-tertiary text-sm mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-white text-lg font-semibold mb-3">What SetTimes is</h2>
            <p>
              SetTimes (settimes.ca) is a free, community-run schedule tool for Waterloo region music festivals. It
              helps festival-goers plan their evening. There is no advertising, no tracking pixels, and no third-party
              analytics. This site is operated by a single developer in the Waterloo region.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-3">What we collect</h2>

            <h3 className="text-white/80 font-medium mb-2 mt-4">If you just browse</h3>
            <p>
              Nothing personally identifiable. We count anonymous page views and artist profile visits to understand
              which features are useful. These counts are not linked to your IP address or any persistent identifier.
            </p>

            <h3 className="text-white/80 font-medium mb-2 mt-4">If you subscribe to email updates</h3>
            <p>
              We store your email address, your city/genre preferences, and a verification timestamp. We do not store
              your IP address. Your email is only used to send the updates you subscribed to, and the one-click
              unsubscribe in every email immediately removes all your data.
            </p>

            <h3 className="text-white/80 font-medium mb-2 mt-4">If you are an organiser with admin access</h3>
            <p>
              We store your email address, hashed password (PBKDF2-SHA256, 100,000 iterations), and session tokens.
              Login attempts and admin actions are logged with your IP address for security purposes. These logs are
              automatically deleted after 90 days (login logs) and 1 year (admin action logs).
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-3">Your browser storage</h2>
            <p>
              We use <code className="text-accent-400 text-sm">localStorage</code> to remember the bands you have added
              to your personal schedule. This data never leaves your device and is not sent to our servers.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-3">Cookies</h2>
            <p>
              Admin accounts use a secure, HTTP-only session cookie. Public visitors receive no cookies. The privacy
              banner acknowledgement is stored in <code className="text-accent-400 text-sm">localStorage</code>, not a
              cookie.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-3">Infrastructure and processors</h2>
            <p>
              SetTimes runs on <strong className="text-white/90">Cloudflare Pages</strong> (hosting and edge functions)
              and <strong className="text-white/90">Cloudflare D1</strong> (database). Data is processed on Cloudflare
              infrastructure, which may include data centres outside Canada. Email notifications (if enabled) are sent
              via a third-party transactional email provider.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-3">Your rights</h2>
            <p className="mb-3">
              If you are an email subscriber, the unsubscribe link in every email deletes your subscription immediately.
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
            <h2 className="text-white text-lg font-semibold mb-3">Changes</h2>
            <p>
              If we make material changes to this policy, we will update the date at the top of this page. We will not
              retroactively weaken privacy protections for data already collected.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
