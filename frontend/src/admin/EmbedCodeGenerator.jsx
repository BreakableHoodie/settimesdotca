export default function EmbedCodeGenerator({ event }) {
  const embedCode = `
<iframe
  src="https://setplan.app/embed/${event.slug}"
  width="100%"
  height="600"
  frameborder="0"
  title="${event.name} Schedule"
></iframe>
  `.trim()

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode)
    alert('Embed code copied!')
  }

  return (
    <div className="bg-band-purple rounded-lg p-4">
      <h3 className="text-white font-bold mb-2">Embed on Your Website</h3>
      <p className="text-gray-400 text-sm mb-4">Copy this code and paste it into your website&apos;s HTML</p>

      <pre className="bg-band-navy p-3 rounded text-sm text-white overflow-x-auto mb-4">{embedCode}</pre>

      <button
        onClick={handleCopy}
        className="min-h-[44px] px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600"
      >
        Copy Code
      </button>

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
