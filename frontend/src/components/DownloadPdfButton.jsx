import { Download } from 'lucide-react'

/**
 * DownloadPdfButton — "Download PDF" for the legal pages (Terms / Privacy).
 *
 * Triggers the browser print dialog (window.print()); the print stylesheet in
 * index.css (@media print) isolates the `.legal-document` content so the saved
 * PDF is a clean, text-selectable copy of just the legal text — no app chrome.
 * This keeps the legal content single-source in the React page (no duplicated
 * text to drift) and adds no PDF-library bundle weight.
 *
 * The button itself is marked `no-print` so it never appears in the output.
 */
export default function DownloadPdfButton({ className = '' }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Download this page as a PDF — opens your browser print dialog; choose Save as PDF"
      className={`no-print inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 ${className}`}
    >
      <Download size={16} aria-hidden="true" />
      Download PDF
    </button>
  )
}
