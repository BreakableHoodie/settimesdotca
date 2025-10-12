/**
 * Configuration for highlighted bands
 * These bands will get special treatment in the My Schedule view
 */
export const HIGHLIGHTED_BANDS = ['ba-johnston', 'blackout', 'handheld']

/**
 * Message to display for highlighted bands
 * Returns JSX with styled text
 */
export const getHighlightMessage = () => (
  <>
    If you spot Dre tonight (short guy with <span className="text-red-400 font-semibold">red</span> glasses), say hi,
    tell him a joke, or even maybe grab him a drink.
  </>
)
