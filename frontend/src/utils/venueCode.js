/**
 * Short venue codes for the schedule board, derived from the venue name.
 *
 * Derived rather than stored: no migration, and renaming a venue in admin cannot
 * leave a stale code behind. If derivation ever proves inadequate the answer is a
 * `short_code` column, but the live bill does not need one -- see the Vol 18
 * collision case in the tests.
 *
 * Uniqueness is resolved across the whole set, because a collision only exists
 * relative to the other venues on the same bill.
 */
const MAX = 4

const clean = name =>
  String(name ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()

// Leading articles carry no identity: "The Copper Mug" must read COPP, not THE.
const ARTICLE = /^(the|a|an)$/i

function candidate(name) {
  const words = clean(name).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  // The first MAX characters of the first SIGNIFICANT word, not the initials.
  //
  // Initials were the first attempt and they read worse at this length:
  // "Prohibition Warehouse" gives PW, which then has to be padded back out to
  // PWRO. PROH is what a person would write on a wristband. Ties are not this
  // function's problem -- venueCodes() breaks them with a numeric suffix, and a
  // tie only exists relative to the other venues on the same bill.
  const significant = words.length > 1 && ARTICLE.test(words[0]) ? words.slice(1) : words
  return (significant[0] ?? words[0]).slice(0, MAX).toUpperCase()
}

export function venueCodes(names) {
  const codes = new Map()
  const taken = new Set()
  // Sorted so the result does not depend on the order venues arrive in.
  const unique = [...new Set(names.filter(n => clean(n).length > 0))].sort()

  for (const name of unique) {
    const base = candidate(name)
    let code = base
    let n = 2
    while (taken.has(code)) {
      code = (base.slice(0, MAX - 1) + n).slice(0, MAX)
      n += 1
    }
    taken.add(code)
    codes.set(name, code)
  }
  return codes
}
