export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (error) {
    console.error('Clipboard API failed, using fallback:', error)
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    const selection = document.getSelection()
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (originalRange && selection) {
      selection.removeAllRanges()
      selection.addRange(originalRange)
    }
    return successful
  } catch (error) {
    console.error('Fallback copy method failed:', error)
    return false
  }
}
