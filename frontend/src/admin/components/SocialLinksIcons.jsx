import { Globe } from 'lucide-react'
import PropTypes from 'prop-types'
import { safeExternalHref, safeHttpsFallbackHref, safeInstagramHref } from '../../utils/urlSafety'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../../components/ui/SocialIcons'

export function parseSocialLinks(band) {
  let links = {}
  try {
    links = typeof band.social_links === 'string' ? JSON.parse(band.social_links) : band.social_links || {}
  } catch (_e) {
    /* ignore */
  }
  return links
}

export default function SocialLinksIcons({ band }) {
  const links = parseSocialLinks(band)
  const websiteHref = safeExternalHref(links.website)
  const instagramHref = safeInstagramHref(links.instagram)
  const bandcampHref = safeHttpsFallbackHref(links.bandcamp)
  const facebookHref = safeExternalHref(links.facebook)
  const youtubeHref = safeExternalHref(links.youtube)
  const spotifyHref = safeExternalHref(links.spotify)
  const appleMusicHref = safeExternalHref(links.apple_music)
  const linktreeHref = safeExternalHref(links.linktree)
  const hasAnyLink = [
    websiteHref,
    instagramHref,
    bandcampHref,
    facebookHref,
    youtubeHref,
    spotifyHref,
    appleMusicHref,
    linktreeHref,
  ].some(href => href !== '#')

  if (!hasAnyLink) return <span className="text-white/30">-</span>

  return (
    <div className="flex gap-2 flex-wrap">
      {websiteHref !== '#' && (
        <a
          href={websiteHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-accent-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          title="Website"
          aria-label={`Open website for ${band.name}`}
        >
          <Globe size={14} />
        </a>
      )}
      {instagramHref !== '#' && (
        <a
          href={instagramHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-pink-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400"
          title="Instagram"
          aria-label={`Open Instagram for ${band.name}`}
        >
          <InstagramIcon size={14} />
        </a>
      )}
      {bandcampHref !== '#' && (
        <a
          href={bandcampHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-teal-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
          title="Bandcamp"
          aria-label={`Open Bandcamp for ${band.name}`}
        >
          <BandcampIcon size={14} />
        </a>
      )}
      {facebookHref !== '#' && (
        <a
          href={facebookHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-blue-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          title="Facebook"
          aria-label={`Open Facebook for ${band.name}`}
        >
          <FacebookIcon size={14} />
        </a>
      )}
      {youtubeHref !== '#' && (
        <a
          href={youtubeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-red-500 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          title="YouTube"
          aria-label={`Open YouTube for ${band.name}`}
        >
          <YouTubeIcon size={14} />
        </a>
      )}
      {spotifyHref !== '#' && (
        <a
          href={spotifyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-green-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400"
          title="Spotify"
          aria-label={`Open Spotify for ${band.name}`}
        >
          <SpotifyIcon size={14} />
        </a>
      )}
      {appleMusicHref !== '#' && (
        <a
          href={appleMusicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-rose-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          title="Apple Music"
          aria-label={`Open Apple Music for ${band.name}`}
        >
          <AppleMusicIcon size={14} />
        </a>
      )}
      {linktreeHref !== '#' && (
        <a
          href={linktreeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-lime-400 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400"
          title="Linktree"
          aria-label={`Open Linktree for ${band.name}`}
        >
          <LinktreeIcon size={14} />
        </a>
      )}
    </div>
  )
}

SocialLinksIcons.propTypes = {
  band: PropTypes.object.isRequired,
}
