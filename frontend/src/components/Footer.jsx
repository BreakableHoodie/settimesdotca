import { faInstagram } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="py-8 sm:py-10 mt-12 border-t border-accent-500/20 bg-bg-navy/50 min-h-[120px] sm:min-h-[140px]">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center space-y-4">
          <div className="flex justify-center gap-6 text-sm flex-wrap">
            <Link to="/" className="text-accent-400 hover:text-accent-500 transition-colors font-medium">
              All Events
            </Link>
          </div>

          <p className="text-text-tertiary text-xs">Times are subject to change - late starts happen!</p>

          <p className="text-text-tertiary text-xs">
            Website by{' '}
            <a
              href="https://www.instagram.com/artificialclancy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400/80 hover:text-accent-400 transition-colors inline-flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={faInstagram} aria-hidden="true" />
              <span>Dre</span>
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
