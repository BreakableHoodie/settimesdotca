import { useEffect } from 'react'

// Marks the current page `noindex` for the not-found states (#1446).
//
// main.jsx owns one <meta name="robots"> for the whole document, so this edits
// THAT tag instead of declaring a second one through <Helmet>: a second tag would
// sit beside main.jsx's `index,follow` and leave two conflicting directives.
// The previous value is restored on unmount, so client-side navigation from a
// not-found page back to a real one is indexable again.
export function useNoindex(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    let meta = document.querySelector("meta[name='robots']")
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'robots'
      document.head.appendChild(meta)
    }
    const previous = meta.getAttribute('content')
    meta.setAttribute('content', 'noindex')
    return () => {
      if (created) meta.remove()
      else if (previous === null) meta.removeAttribute('content')
      else meta.setAttribute('content', previous)
    }
  }, [active])
}
