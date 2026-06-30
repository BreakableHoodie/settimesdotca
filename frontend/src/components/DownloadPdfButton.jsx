import { useState } from 'react'
import { Download } from 'lucide-react'

/**
 * DownloadPdfButton — one-click PDF download for the legal pages (Terms / Privacy).
 *
 * Dynamically imports jsPDF on click (separate chunk, not in the main bundle) and
 * generates a text-selectable PDF directly from the rendered `.legal-document` DOM.
 * Legal prose stays single-source in the React page — no duplicated text to drift.
 *
 * DOM traversal rules:
 *  - Skip any element with the `no-print` class (back link, this button).
 *  - h1/h2/h3 → bold headings at decreasing font sizes.
 *  - p         → body paragraph.
 *  - ul/ol     → bullet / numbered list items.
 *  - table     → "Data type — Retention" rows (privacy table).
 *  - div/section/article → recurse. If a container has no block-level children
 *    (e.g. a notice div whose only children are <strong> and <a>) its full
 *    textContent is emitted as a paragraph.
 *
 * The filename is derived from document.title so the same component works on
 * both /terms and /privacy without extra props.
 */

const BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'p',
  'ul',
  'ol',
  'table',
  'div',
  'section',
  'article',
  'aside',
  'blockquote',
])

function deriveFilename() {
  const title = (document.title || '').toLowerCase()
  if (title.includes('privacy')) return 'settimes-privacy-policy.pdf'
  return 'settimes-terms-of-service.pdf'
}

function extractItems(container) {
  const items = []

  function processNode(node) {
    if (!node || node.nodeType !== 1) return
    if (node.classList?.contains('no-print')) return

    const tag = node.tagName?.toLowerCase()

    if (tag === 'h1') {
      items.push({ type: 'h1', text: node.textContent.trim() })
    } else if (tag === 'h2') {
      items.push({ type: 'h2', text: node.textContent.trim() })
    } else if (tag === 'h3') {
      items.push({ type: 'h3', text: node.textContent.trim() })
    } else if (tag === 'p') {
      const text = node.textContent.trim()
      if (text) items.push({ type: 'p', text })
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(node.querySelectorAll(':scope > li')).forEach((li, i) => {
        const prefix = tag === 'ul' ? '• ' : `${i + 1}. `
        const text = li.textContent.trim()
        if (text) items.push({ type: 'li', text: prefix + text })
      })
    } else if (tag === 'table') {
      Array.from(node.querySelectorAll('tr')).forEach(row => {
        const cells = row.querySelectorAll('th, td')
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim()
          const value = cells[1].textContent.trim()
          if (label || value) items.push({ type: 'table-row', text: `${label} — ${value}` })
        }
      })
    } else {
      // Container element: recurse if it has block-level children; otherwise
      // treat its full text content as a paragraph (handles notice divs etc.)
      const hasBlockChild = Array.from(node.children || []).some(c => BLOCK_TAGS.has(c.tagName?.toLowerCase()))
      if (hasBlockChild) {
        Array.from(node.childNodes).forEach(child => processNode(child))
      } else {
        const text = node.textContent?.trim()
        if (text) items.push({ type: 'p', text })
      }
    }
  }

  Array.from(container.childNodes).forEach(child => processNode(child))
  return items
}

async function generatePdf() {
  const container = document.querySelector('.legal-document')
  if (!container) return

  const { jsPDF } = await import('jspdf')
  const items = extractItems(container)

  const margin = 20 // mm
  const pageWidth = 210 // A4
  const pageHeight = 297 // A4
  const contentWidth = pageWidth - margin * 2
  const bottomMargin = 25

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = margin

  function checkPageBreak(neededMm) {
    if (y + neededMm > pageHeight - bottomMargin) {
      doc.addPage()
      y = margin
    }
  }

  function addBlock(text, fontSize, bold, spacingAfter = 4) {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(text, contentWidth)
    // 1pt = 0.352778mm; use 1.25 line-height factor
    const lineH = fontSize * 0.352778 * 1.25
    const blockH = lines.length * lineH
    checkPageBreak(blockH + spacingAfter)
    doc.text(lines, margin, y)
    y += blockH + spacingAfter
  }

  for (const item of items) {
    switch (item.type) {
      case 'h1':
        if (y > margin) y += 5
        addBlock(item.text, 18, true, 6)
        break
      case 'h2':
        if (y > margin) y += 7
        addBlock(item.text, 13, true, 4)
        break
      case 'h3':
        if (y > margin) y += 4
        addBlock(item.text, 11, true, 3)
        break
      case 'p':
        addBlock(item.text, 10, false, 4)
        break
      case 'li':
        addBlock(item.text, 10, false, 2)
        break
      case 'table-row':
        addBlock(item.text, 10, false, 2)
        break
    }
  }

  doc.save(deriveFilename())
}

export default function DownloadPdfButton({ className = '' }) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleClick() {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      await generatePdf()
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isGenerating}
      aria-label="Download this page as a PDF file"
      className={`no-print inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <Download size={16} aria-hidden="true" />
      {isGenerating ? 'Generating…' : 'Download PDF'}
    </button>
  )
}
