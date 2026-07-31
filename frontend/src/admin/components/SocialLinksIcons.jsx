import PropTypes from 'prop-types'
import { LINK_BASE_CLASS, LINK_FIELDS, hasAnyLink, parseSocialLinks } from '../utils/bandFields'

export { parseSocialLinks }

export default function SocialLinksIcons({ band }) {
  const links = parseSocialLinks(band)

  if (!hasAnyLink(band)) return <span className="text-white/30">-</span>

  return (
    <div className="flex gap-2 flex-wrap">
      {LINK_FIELDS.map(({ key, label, ariaNoun, resolveHref, Icon, accent }) => {
        const href = resolveHref(links[key])
        if (href === '#') return null
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_BASE_CLASS} ${accent}`}
            title={label}
            aria-label={`Open ${ariaNoun} for ${band.name}`}
          >
            <Icon size={14} />
          </a>
        )
      })}
    </div>
  )
}

SocialLinksIcons.propTypes = {
  band: PropTypes.object.isRequired,
}
