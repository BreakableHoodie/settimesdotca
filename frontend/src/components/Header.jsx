import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTicket } from '@fortawesome/free-solid-svg-icons'
import { faInstagram, faFacebook } from '@fortawesome/free-brands-svg-icons'

function Header({ view, setView }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 border-b-2 border-band-orange/30 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        scrolled
          ? 'py-2 shadow-lg backdrop-blur-sm bg-band-navy/85'
          : 'py-4 bg-gradient-to-b from-band-navy to-band-purple backdrop-blur-sm'
      }`}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div
          className={`flex transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            scrolled ? 'flex-row items-center justify-between gap-4 min-h-[44px]' : 'flex-col items-center gap-3'
          }`}
        >
          <h1
            className={`font-bold text-white font-mono tracking-wider transition-all duration-300 ease-in-out ${
              scrolled
                ? 'text-sm sm:text-base md:text-lg text-left leading-tight w-full'
                : 'text-2xl md:text-3xl text-center'
            }`}
          >
            LONG WEEKEND BAND CRAWL
          </h1>

          <a
            href="https://ticketscene.ca/events/55263/"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-band-orange text-band-navy font-semibold uppercase tracking-wide text-[11px] shadow-md transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
              scrolled ? 'px-2.5 py-1 text-xs sm:text-sm ml-auto min-h-[44px]' : 'px-4 py-2 text-sm sm:text-base mt-2'
            }`}
            aria-label="Buy tickets for Long Weekend Band Crawl"
          >
            <FontAwesomeIcon icon={faTicket} aria-hidden="true" />
            <span>Tickets</span>
          </a>
        </div>

        <p
          className={`text-band-orange text-sm md:text-base font-medium mt-2 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            scrolled ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0 text-center'
          }`}
        >
          Sunday October 12th 2025 · Mobile Schedule
        </p>
        <div
          className={`flex justify-center items-center gap-6 sm:gap-8 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            scrolled ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0 mt-3'
          }`}
        >
          <a
            href="https://www.instagram.com/longweekendbandcrawl?igsh=eGN4ZW5sNjl4cnVr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-band-orange/80 hover:text-band-orange transition-transform duration-150 hover:brightness-110 active:scale-95 flex items-center justify-center text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange w-11 h-11 sm:w-12 sm:h-12 rounded-full"
            aria-label="Visit our Instagram"
            title="Visit our Instagram"
          >
            <FontAwesomeIcon icon={faInstagram} aria-hidden="true" />
          </a>
          <a
            href="https://www.facebook.com/events/2539604946400304"
            target="_blank"
            rel="noopener noreferrer"
            className="text-band-orange/80 hover:text-band-orange transition-transform duration-150 hover:brightness-110 active:scale-95 flex items-center justify-center text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange w-11 h-11 sm:w-12 sm:h-12 rounded-full"
            aria-label="Visit our Facebook"
            title="Visit our Facebook"
          >
            <FontAwesomeIcon icon={faFacebook} aria-hidden="true" />
          </a>
        </div>

        <div
          className={`flex justify-center gap-2 ${
            scrolled ? 'mt-1' : 'mt-3'
          } transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`}
        >
          <button
            onClick={() => setView('all')}
            className={`px-6 py-2 rounded-lg font-semibold transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#ffbe57] ${
              view === 'all'
                ? 'bg-[#ffbe57] text-band-navy shadow-lg'
                : 'bg-band-purple/50 text-white hover:bg-band-purple'
            }`}
            title="View all bands"
            aria-pressed={view === 'all'}
          >
            All Bands
          </button>
          <button
            onClick={() => setView('mine')}
            className={`px-6 py-2 rounded-lg font-semibold transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#ffbe57] ${
              view === 'mine'
                ? 'bg-[#ffbe57] text-band-navy shadow-lg'
                : 'bg-band-purple/50 text-white hover:bg-band-purple'
            }`}
            title="View my schedule"
            aria-pressed={view === 'mine'}
          >
            My Schedule
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
