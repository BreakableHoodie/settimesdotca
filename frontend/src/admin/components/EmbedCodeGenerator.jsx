import { useState } from 'react'
import PropTypes from 'prop-types'
import { copyToClipboard } from '../../utils/clipboard'

/**
 * Escape a value for interpolation into a DOUBLE-QUOTED HTML attribute.
 *
 * The output of this component is copied by an admin and pasted into someone
 * else's website, so an unescaped `"` in an event name does not misbehave here
 * — it ships a broken or attribute-injecting tag to a third party. `&` must be
 * replaced first, or it would double-escape the entities added after it.
 */
export function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default function EmbedCodeGenerator({ event }) {
  const [copyState, setCopyState] = useState('idle')

  const embedCode = `
<iframe
  src="https://settimes.ca/embed/${escapeHtmlAttribute(event.slug)}"
  width="100%"
  height="600"
  frameborder="0"
  title="${escapeHtmlAttribute(event.name)} Schedule"
></iframe>
  `.trim()

  // copyToClipboard reports failure rather than throwing, and falls back to a
  // hidden textarea + execCommand when the async API is unavailable (insecure
  // context, denied permission). Reporting success unconditionally — as this
  // did before — is worse than failing: the admin pastes whatever was already
  // on their clipboard and never learns otherwise.
  const handleCopy = async () => {
    // copyToClipboard is written to report false rather than reject, but a
    // handler whose only failure path depends on that promise is one refactor
    // away from silently doing nothing. Treat a throw as a failed copy.
    try {
      setCopyState((await copyToClipboard(embedCode)) ? 'copied' : 'error')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <div className="bg-bg-purple rounded-lg p-4">
      <h3 className="text-white font-bold mb-2">Embed on Your Website</h3>
      <p className="text-gray-400 text-sm mb-4">Copy this code and paste it into your website&apos;s HTML</p>

      <pre className="bg-bg-navy p-3 rounded text-sm text-white overflow-x-auto mb-4">{embedCode}</pre>

      <button
        onClick={handleCopy}
        className="min-h-[44px] px-4 py-2 bg-accent-500 text-bg-navy rounded hover:bg-accent-600"
      >
        Copy Code
      </button>

      <p aria-live="polite" className="mt-2 text-sm min-h-[1.25rem]">
        {copyState === 'copied' && <span className="text-green-300">Embed code copied.</span>}
        {copyState === 'error' && (
          <span className="text-red-300">Could not copy automatically — select the code above and copy it.</span>
        )}
      </p>

      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded">
        <p className="text-blue-200 text-sm">
          <strong>Preview:</strong>{' '}
          <a href={`/embed/${event.slug}`} target="_blank" className="underline" rel="noreferrer">
            Open in new tab
          </a>
        </p>
      </div>
    </div>
  )
}

EmbedCodeGenerator.propTypes = {
  event: PropTypes.shape({
    slug: PropTypes.string,
    name: PropTypes.string,
  }).isRequired,
}
