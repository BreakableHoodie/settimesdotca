import { ArrowRight, CircleAlert, Clock, Footprints, Guitar, Navigation } from 'lucide-react'
import { buildDirectionsHrefForBand } from '../utils/directions'

// Glanceable live-event companion. Renders the single "what do I do right now"
// answer produced by computeNextMove() — see utils/nextMove.js. Purely
// presentational: all decisions live in the state machine, this just paints it.

const formatMins = mins => {
  if (mins == null) return ''
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const KIND_META = {
  watching: { eyebrow: 'Now playing', Icon: Guitar, accent: 'border-success-500/50 bg-success-500/10' },
  move: { eyebrow: 'Time to move', Icon: Footprints, accent: 'border-warning-500/50 bg-warning-500/10' },
  decide: { eyebrow: 'Sets clash', Icon: CircleAlert, accent: 'border-error-500/50 bg-error-500/10' },
  upnext: { eyebrow: 'Up next', Icon: Clock, accent: 'border-info-500/50 bg-info-500/10' },
}

function DirectionsButton({ band }) {
  const href = buildDirectionsHrefForBand(band)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-bg-navy transition-colors hover:bg-accent-400 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300"
      aria-label={`Directions to ${band.venue || 'the venue'}`}
    >
      <Navigation size={15} aria-hidden="true" />
      Directions
    </a>
  )
}

function Body({ state }) {
  const titleClass = 'truncate text-lg font-bold leading-tight text-text-primary sm:text-xl'
  const subClass = 'mt-0.5 text-sm text-text-secondary'

  if (state.kind === 'watching') {
    const { nowBand, minutesLeft, nextBand, minutesToNext } = state
    return (
      <>
        <p className={titleClass}>{nowBand.name}</p>
        <p className={subClass}>
          {nowBand.venue ? `${nowBand.venue} · ` : ''}
          {minutesLeft} min left
        </p>
        {nextBand && (
          <p className="mt-1 truncate text-xs text-text-tertiary">
            Then {nextBand.name} in {formatMins(minutesToNext)}
          </p>
        )}
      </>
    )
  }

  if (state.kind === 'move') {
    const { nextBand, minutesToNext, walkMin, slackMin } = state
    let walkLine
    if (walkMin == null) {
      walkLine = `Starts in ${formatMins(minutesToNext)}`
    } else if (slackMin != null && slackMin <= 0) {
      walkLine = `~${walkMin} min walk · leave now`
    } else {
      walkLine = `~${walkMin} min walk · ${formatMins(slackMin)} to spare`
    }
    return (
      <>
        <p className={titleClass}>Head to {nextBand.venue || 'the next venue'}</p>
        <p className={subClass}>
          {nextBand.name} · {walkLine}
        </p>
      </>
    )
  }

  if (state.kind === 'decide') {
    const [a, b] = state.conflict
    return (
      <>
        <p className={titleClass}>
          {a.name} <span className="text-text-tertiary">vs</span> {b.name}
        </p>
        <p className={subClass}>
          {a.venue && b.venue ? `${a.venue} & ${b.venue} overlap — pick one` : 'Two saved sets overlap — pick one'}
        </p>
      </>
    )
  }

  // upnext
  const { nextBand, minutesToNext } = state
  return (
    <>
      <p className={titleClass}>{nextBand.name}</p>
      <p className={subClass}>
        {nextBand.venue ? `${nextBand.venue} · ` : ''}in {formatMins(minutesToNext)}
      </p>
    </>
  )
}

function Action({ state, onDecide }) {
  if (state.kind === 'decide') {
    return (
      <button
        type="button"
        onClick={onDecide}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-bg-navy transition-colors hover:bg-accent-400 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300"
      >
        Choose in My Route
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    )
  }
  if (state.kind === 'move' || state.kind === 'upnext') {
    return <DirectionsButton band={state.nextBand} />
  }
  return null
}

export default function NextMove({ state, onDecide }) {
  if (!state || !state.kind) return null
  const meta = KIND_META[state.kind]
  if (!meta) return null
  const { Icon, eyebrow, accent } = meta

  return (
    <div className="container mx-auto max-w-(--breakpoint-2xl) px-4">
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-col gap-3 rounded-xl border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between ${accent}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-bg-navy/20 p-2 text-text-primary">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-secondary">{eyebrow}</p>
            <Body state={state} />
          </div>
        </div>
        <div className="shrink-0 sm:pl-3">
          <Action state={state} onDecide={onDecide} />
        </div>
      </div>
    </div>
  )
}
