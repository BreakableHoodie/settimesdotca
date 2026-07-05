import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export default function AboutPage() {
  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'About | SetTimes'
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>About | SetTimes</title>
        <meta
          name="description"
          content="A free, community-run live-music schedule tool for Waterloo Region, Ontario. Plan your night across venues and discover local artists with SetTimes."
        />
        <link rel="canonical" href="https://settimes.ca/about" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'SetTimes',
            url: 'https://settimes.ca',
            areaServed: 'Waterloo Region, Ontario',
            email: 'hello@settimes.ca',
          })}
        </script>
      </Helmet>

      <main id="main-content" tabIndex={-1} className="container mx-auto px-4 max-w-2xl py-12">
        <div className="mb-8">
          <Link to="/" className="text-accent-400 hover:text-accent-500 text-sm transition-colors">
            ← Back to SetTimes
          </Link>
        </div>

        <h1 className="text-text-primary text-3xl font-bold mb-10">About SetTimes</h1>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">What SetTimes is</h2>
            <p>
              SetTimes (settimes.ca) is a free, community-run live-music event-schedule tool for{' '}
              <strong className="text-text-secondary">Waterloo Region, Ontario</strong>. We bring together lineups, set
              times, and venue details from multiple stages into one place, so you don&apos;t have to piece together a
              night out from a dozen Instagram posts.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Why we exist</h2>
            <p>
              Waterloo Region has a real live-music scene — but on a night with several venues running lineups at once,
              it&apos;s easy to miss a band you&apos;d love or double-book yourself into two overlapping sets. SetTimes
              exists to make it simple to plan your night across multiple venues and discover local artists you might
              not have found otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">How it works — for fans</h2>
            <p>
              Browse the full lineup for an event, then build your own personal route by picking the bands you want to
              catch — and share that route with friends. Follow your favourite bands to get an email alert when their
              next set time is announced, so you never have to keep checking back.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">How it works — for organizers &amp; venues</h2>
            <p>
              If you&apos;re a venue, promoter, or organizer running a multi-venue event in Waterloo Region and want
              your lineup listed on SetTimes, we&apos;d love to hear from you. Get in touch on our{' '}
              <Link to="/contact" className="text-accent-400 hover:text-accent-500 transition-colors">
                Contact page
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">The flagship</h2>
            <p>
              Our flagship event is the Long Weekend Band Crawl, now in its 17th edition. Vol. 17 takes place{' '}
              <strong className="text-text-secondary">August 2, 2026</strong>, with 22 bands across 6 venues on King St
              N in Waterloo — Blue Room, Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, and Roost. Doors
              at 6:30 PM, first sets at 6:45 PM. Ages 19+.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">Community-run</h2>
            <p>
              SetTimes is built and maintained for Waterloo Region, not by a company. Questions, feedback, or want to
              get involved? Email us at{' '}
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
