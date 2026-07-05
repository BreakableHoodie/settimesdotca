import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export default function ContactPage() {
  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'Contact | SetTimes'
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Contact | SetTimes</title>
        <meta
          name="description"
          content="Contact SetTimes — get your band or event listed, request a correction or takedown, or reach out for press and general inquiries."
        />
        <link rel="canonical" href="https://settimes.ca/contact" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            name: 'Contact SetTimes',
            url: 'https://settimes.ca/contact',
          })}
        </script>
      </Helmet>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 max-w-2xl py-12">
        <div className="mb-8">
          <Link to="/" className="text-accent-400 hover:text-accent-500 text-sm transition-colors">
            ← Back to SetTimes
          </Link>
        </div>

        <h1 className="text-text-primary text-3xl font-bold mb-10">Contact</h1>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Get in touch</h2>
            <p>
              The best way to reach SetTimes is by email:{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              . We&apos;re a small, community-run team based in Waterloo Region, and we read every message.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Get your band or event listed</h2>
            <p>
              Running a show, booking a lineup, or organizing a multi-venue event in Waterloo Region? We&apos;d love to
              add you to SetTimes. Email us your event details — dates, venues, and lineup — and we&apos;ll get you set
              up.
            </p>
            <p className="mt-3">
              <a
                href="mailto:hello@settimes.ca?subject=Get%20listed"
                className="text-accent-400 hover:text-accent-500 transition-colors"
              >
                Email us to get listed →
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Corrections &amp; takedowns</h2>
            <p>
              If something on SetTimes is inaccurate, out of date, or you believe it infringes your rights, let us know
              and we&apos;ll review it promptly — correcting or removing content where appropriate (see our{' '}
              <Link to="/terms" className="text-accent-400 hover:text-accent-500 transition-colors">
                Terms of Service
              </Link>
              , §4).
            </p>
            <p className="mt-3">
              <a
                href="mailto:hello@settimes.ca?subject=Takedown%2Fcorrection"
                className="text-accent-400 hover:text-accent-500 transition-colors"
              >
                Email a correction or takedown request →
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Press &amp; general</h2>
            <p>
              For press inquiries, partnership ideas, or anything else, reach out at{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
