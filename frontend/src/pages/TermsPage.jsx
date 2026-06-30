import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DownloadPdfButton from '../components/DownloadPdfButton'

export default function TermsPage() {
  // react-helmet-async does not reliably set document.title in React 19 — set it
  // directly to match the <Helmet> title below. See BandProfilePage.jsx.
  useEffect(() => {
    document.title = 'Terms of Service | SetTimes'
  }, [])

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Terms of Service | SetTimes</title>
        <meta
          name="description"
          content="Terms of Service for SetTimes — Waterloo region live music event scheduling tool."
        />
        <link rel="canonical" href="https://settimes.ca/terms" />
      </Helmet>

      <div className="container mx-auto px-4 max-w-2xl py-12 legal-document">
        <div className="no-print mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="text-accent-400 hover:text-accent-500 text-sm transition-colors">
            ← Back to SetTimes
          </Link>
          <DownloadPdfButton />
        </div>

        <h1 className="text-text-primary text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-text-tertiary text-sm mb-4">Last updated: June 2026</p>

        {/* Good-faith notice for a free community project (not legal advice). */}
        <div className="border border-border bg-surface rounded-lg px-4 py-3 mb-10 text-sm text-text-secondary">
          <strong className="text-text-primary">SetTimes is a free, community-run project.</strong> These terms are
          provided in good faith to be clear and fair — not legal advice. Questions?{' '}
          <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
            hello@settimes.ca
          </a>
        </div>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">1. Who we are</h2>
            <p>
              settimes.ca (&ldquo;SetTimes&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a free,
              community-run event-schedule tool for live-music events in Waterloo Region, Ontario, Canada. It is
              operated from <strong className="text-text-secondary">Waterloo Region, Ontario, Canada</strong>. You can
              reach us at{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              .
            </p>
            <p className="mt-3">
              By accessing or using settimes.ca (the &ldquo;Service&rdquo;), you agree to these Terms of Service (the
              &ldquo;Terms&rdquo;). If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">2. The Service</h2>
            <p>
              SetTimes lets visitors browse event lineups, set times, venues, and artist information, build a personal
              schedule (stored on your own device), share schedules, and optionally subscribe by email to event or
              artist updates. The Service is provided free of charge.
            </p>
            <p className="mt-3">
              We do not sell tickets, admit attendees, run venues, or organize the events listed. Ticketing, entry, age
              restrictions (events may be <strong className="text-text-secondary">19+</strong>), and the events
              themselves are the responsibility of the venues, promoters, and artists involved.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">3. Acceptable use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-outside pl-5 space-y-2">
              <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
              <li>submit email addresses you do not own or control, or sign others up without their consent;</li>
              <li>
                scrape, harvest, or bulk-extract data, or use bots, except as permitted by our{' '}
                <code className="text-accent-400 text-sm">robots.txt</code>;
              </li>
              <li>
                attempt to gain unauthorized access to any account, admin area, server, or data, or probe, scan, or test
                the security of the Service without our written permission;
              </li>
              <li>
                interfere with or disrupt the Service (including denial-of-service attempts or circumventing rate
                limiting or bot protection);
              </li>
              <li>
                upload content that is unlawful, infringing, defamatory, hateful, or that you do not have the right to
                share;
              </li>
              <li>impersonate any person, band, venue, or organization, or misrepresent your affiliation.</li>
            </ul>
            <p className="mt-3">
              We may suspend or block access (including by IP) to protect the Service or other users.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">4. User-submitted content</h2>
            <p className="mb-3">
              Some features let you or event organizers submit content — for example, band/artist information, photos,
              links, and email addresses for follows and subscriptions (&ldquo;Submissions&rdquo;).
            </p>
            <ul className="list-disc list-outside pl-5 space-y-2">
              <li>
                <strong className="text-text-primary">Your responsibility.</strong> You represent that you have the
                right to submit the content and that it does not infringe anyone&apos;s rights (including copyright,
                trademark, privacy, or publicity rights) and is accurate to the best of your knowledge.
              </li>
              <li>
                <strong className="text-text-primary">Band photos and profiles.</strong> If you submit a photo or artist
                information, you confirm you own it or have permission to use it and to allow us to display it on the
                Service.
              </li>
              <li>
                <strong className="text-text-primary">Licence to us.</strong> You grant SetTimes a non-exclusive,
                royalty-free, worldwide licence to host, store, reproduce, and display your Submissions for the purpose
                of operating and promoting the Service. You retain ownership of your content.
              </li>
              <li>
                <strong className="text-text-primary">Email addresses.</strong> When you submit an email to follow a
                band or subscribe to updates, you confirm it is your own address. We use a double opt-in confirmation
                step, and you can unsubscribe at any time (see the Privacy Policy).
              </li>
              <li>
                <strong className="text-text-primary">Takedown.</strong> If you believe content on the Service infringes
                your rights or is inaccurate, email{' '}
                <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                  hello@settimes.ca
                </a>{' '}
                and we will review and, where appropriate, remove or correct it. We may remove any Submission at our
                discretion.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">
              5. Third-party event, venue, and artist information — accuracy disclaimer
            </h2>
            <p>
              Event details on SetTimes — including{' '}
              <strong className="text-text-secondary">
                set times, venue listings, line-ups, age restrictions, and ticketing
              </strong>{' '}
              — come from organizers, venues, and artists, and{' '}
              <strong className="text-text-secondary">change frequently and on short notice</strong>. Late starts and
              last-minute changes are common.
            </p>
            <p className="mt-3">
              SetTimes provides this information &ldquo;as is&rdquo; for convenience and planning only.{' '}
              <strong className="text-text-secondary">
                We do not guarantee that any listing is accurate, complete, or current.
              </strong>{' '}
              Always confirm timing, venue, age requirements, and ticket details directly with the venue or organizer
              before relying on them. Links to third-party sites (venues, ticket sellers, social media) are provided for
              convenience; we are not responsible for third-party sites or services.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">6. No warranty</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any
              kind, whether express or implied, including implied warranties of merchantability, fitness for a
              particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted,
              error-free, or secure. Some jurisdictions do not allow the exclusion of certain warranties, so some of the
              above may not apply to you.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">7. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, SetTimes and its operator will not be liable for any indirect,
              incidental, special, consequential, or punitive damages, or for any loss arising from: (a) your use of or
              inability to use the Service; (b) reliance on any event, venue, set-time, or artist information; (c) any
              missed event, denied entry, or ticketing issue; or (d) any third-party content or website.
            </p>
            <p className="mt-3">
              To the extent any liability cannot be excluded, our total aggregate liability to you for all claims
              relating to the Service is limited to <strong className="text-text-secondary">CAD $100</strong>. Nothing
              in these Terms limits liability that cannot be limited under applicable Ontario or Canadian law (for
              example, liability for fraud or for death or personal injury caused by negligence).
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">8. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{' '}
              <Link to="/privacy" className="text-accent-400 hover:text-accent-500 transition-colors">
                Privacy Policy
              </Link>
              , which explains what personal information we collect, how we use it, and your rights under Canadian
              privacy law (PIPEDA) and Canada&apos;s Anti-Spam Legislation (CASL).
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">9. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. When we do, we will change the &ldquo;Last updated&rdquo;
              date above. Material changes take effect when posted; continuing to use the Service after changes are
              posted means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">10. Governing law and venue</h2>
            <p>
              These Terms are governed by the laws of the{' '}
              <strong className="text-text-secondary">Province of Ontario</strong> and the federal laws of{' '}
              <strong className="text-text-secondary">Canada</strong> applicable there, without regard to
              conflict-of-laws rules. You agree that the{' '}
              <strong className="text-text-secondary">courts located in Ontario, Canada</strong> have exclusive
              jurisdiction over any dispute arising out of or relating to these Terms or the Service, subject to any
              non-waivable rights you have under applicable consumer-protection law.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary text-lg font-semibold mb-3">11. Contact</h2>
            <p>
              Questions about these Terms? Email{' '}
              <a href="mailto:hello@settimes.ca" className="text-accent-400 hover:text-accent-500 transition-colors">
                hello@settimes.ca
              </a>
              .
            </p>
          </section>

          <section className="border-t border-border pt-8">
            <h2 className="text-text-primary text-lg font-semibold mb-3">Open items flagged for the lawyer</h2>
            <ol className="list-decimal list-outside pl-5 space-y-2 text-text-tertiary text-sm">
              <li>
                <strong className="text-text-secondary">Operator identity / mailing address.</strong> CASL requires a
                valid sender identity and mailing address in every commercial email; a sole-proprietor name + Ontario
                mailing address (or PO box) should be confirmed and added here and in email footers.
              </li>
              <li>
                <strong className="text-text-secondary">Minors.</strong> Events may be 19+, but the website and its
                email signup are open to all ages. Consider whether to restrict email collection to 16+/18+ and add an
                age statement (CASL/PIPEDA consent from minors is a known grey area).
              </li>
              <li>
                <strong className="text-text-secondary">&ldquo;Commercial activity&rdquo; / liability cap.</strong> A
                free, non-commercial tool may not need a damages cap or may want a different one; confirm the cap and
                indemnity posture for a hobby/community project vs. a business.
              </li>
              <li>
                <strong className="text-text-secondary">Ticketing/third-party links.</strong> If affiliate or paid
                ticket links are ever added, revisit Sections 2, 5, and 7.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
