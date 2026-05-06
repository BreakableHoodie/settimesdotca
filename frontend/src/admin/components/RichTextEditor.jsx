import { useMemo } from 'react'
import ReactQuill from 'react-quill-new'
import DOMPurify from 'dompurify'
import 'react-quill-new/dist/quill.snow.css'
import './RichTextEditor.css'

const QUILL_ALLOWED = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write a short description...',
  minHeight = 200,
}) {
  const modules = useMemo(
    () => ({
      toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']],
      // Prevents Quill from doing expensive visual-style matching on paste, which with
      // complex clipboard HTML (websites, Word docs) blocks the main thread long enough
      // to freeze the tab. Pasted content arrives as plain text; formatting via toolbar still works.
      clipboard: { matchVisual: false },
    }),
    []
  )

  const formats = useMemo(() => ['bold', 'italic', 'underline', 'list', 'bullet', 'link'], [])

  const handleChange = html => onChange(DOMPurify.sanitize(html, QUILL_ALLOWED))

  return (
    <div className="rich-text-editor" style={{ '--rich-text-min-height': `${minHeight}px` }}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
      />
      <div className="text-white/50 text-xs mt-2">Rich text enabled. Use the toolbar for basic formatting.</div>
    </div>
  )
}
