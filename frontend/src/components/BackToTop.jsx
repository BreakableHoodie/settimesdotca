import { faArrowUp } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useState } from 'react'

const PRIVACY_KEY = 'privacy-acknowledged'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    setBannerVisible(window.localStorage.getItem(PRIVACY_KEY) !== 'true')

    const handleScroll = () => {
      setVisible(window.scrollY > 400)
    }

    const handleStorage = e => {
      if (e.key === PRIVACY_KEY) {
        setBannerVisible(e.newValue !== 'true')
      }
    }

    // Detect same-tab banner dismissal via click
    const handleClick = () => {
      if (window.localStorage.getItem(PRIVACY_KEY) === 'true') {
        setBannerVisible(false)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('storage', handleStorage)
    document.addEventListener('click', handleClick, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('click', handleClick)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed right-6 z-50 h-12 w-12 rounded-full bg-accent-500 text-white shadow-lg transition-all duration-300 hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-navy active:scale-95 ${
        bannerVisible ? 'bottom-20' : 'bottom-6'
      } ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
    >
      <FontAwesomeIcon icon={faArrowUp} />
    </button>
  )
}
