/**
 * Where to anchor a band photo inside an `object-cover` frame.
 *
 * `object-cover` defaults to `object-position: 50% 50%`, which crops to the
 * MIDDLE of the source. Band and press photos are overwhelmingly full-body
 * group shots in portrait orientation, and every frame this app crops them
 * into is wider than it is tall. The arithmetic is unkind: a 539x639 photo in
 * the 3.5:1 profile hero shows only ~24% of the image height, and centred that
 * window lands on the band's midsections — faces cropped out entirely.
 *
 * 25% from the top is the one anchor that is safe in every frame this app
 * uses:
 *
 * - Wide hero + portrait source: the window is short, so 25% moves it up onto
 *   the faces. `object-top` (0%) would overshoot into sky and cut faces in
 *   half.
 * - Square avatar + portrait source: the window is nearly as tall as the
 *   source, so there is almost no travel and this clamps to roughly the top —
 *   still better than centre.
 * - Any landscape source: little or no vertical crop, so the value barely
 *   matters and cannot make things worse.
 *
 * MUST stay a complete literal string. Tailwind v4 scans source *text* for
 * whole class names and never evaluates template expressions, so building this
 * from parts (`object-[50%_${pct}]`) generates no CSS and silently restores
 * the centre crop. Same rule as the colour literals in
 * `admin/utils/bandFields.js`; `__tests__/bandPhoto.test.js` scans the source
 * to enforce it, and to catch a ninth `object-cover` site that forgets to
 * import this.
 */
export const BAND_PHOTO_CROP = 'object-[50%_25%]'
