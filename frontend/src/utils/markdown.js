/**
 * Markdown rendering utilities for band bios.
 *
 * Pipeline: markdown → HTML (marked) → sanitize (DOMPurify) → safe HTML.
 *
 * The sanitizer is NEVER removed — it's the last line of defence against
 * XSS regardless of what the markdown parser produces. If DOMPurify is not
 * available in the current environment (e.g. a Node test shim without a
 * real DOM), the function returns an empty string rather than unsanitized HTML.
 */

import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Tags that are safe to render from markdown output.
// h1/h2 are intentionally excluded — page and section headings are SEO/layout
// concerns reserved for the page shell, not user content. img/iframe/script are
// always excluded to block embedding and execution.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'code', 'blockquote', 'hr']
const ALLOWED_ATTR = ['href', 'target', 'rel']

// pre (preformatted code blocks) is intentionally NOT allowed: band bios are
// prose, and downstream whitespace-normalization would destroy the significant
// whitespace inside <pre> anyway. Inline <code> is fine (normal-flow whitespace).

// Force rel="noopener noreferrer" on every sanitized link so this util's output
// is self-contained-safe — no caller can reintroduce reverse-tabnabbing, and no
// separate string-surgery step is needed (which also avoids duplicate rel attrs).
function forceLinkRel(node) {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('rel', 'noopener noreferrer')
  }
}

/**
 * Parse markdown to HTML and sanitize the result.
 *
 * @param {string} md - Raw markdown (or plain text, or legacy HTML).
 * @returns {string} Safe HTML ready for dangerouslySetInnerHTML.
 */
export function renderMarkdownToSafeHtml(md) {
  if (!md) return ''
  if (typeof DOMPurify.sanitize !== 'function') return ''

  const html = marked.parse(md, { async: false })
  // Scope the rel-forcing hook to this call (add before, remove after) so there
  // are no global DOMPurify side effects (#793). removeHook(type, fn) removes
  // by identity — the plain removeHook(type) form would pop whatever hook is
  // last, clobbering hooks other consumers may have registered.
  DOMPurify.addHook('afterSanitizeAttributes', forceLinkRel)
  try {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes', forceLinkRel)
  }
}

/**
 * Parse markdown to HTML, then strip ALL tags to produce plain text.
 * Used for <meta name="description">, og:description, and JSON-LD description
 * so raw markdown syntax (`**`, `##`, etc.) never leaks into meta content.
 *
 * @param {string} md - Raw markdown (or plain text, or legacy HTML).
 * @returns {string} Plain text with no HTML or markdown syntax.
 */
export function stripMarkdownToText(md) {
  if (!md) return ''
  if (typeof DOMPurify.sanitize !== 'function') return ''

  const html = marked.parse(md, { async: false })
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim()
}
