import { useMemo } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import './RichTextEditor.css'

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write a short description...',
  minHeight = 200,
}) {
  const modules = useMemo(
    () => ({
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    }),
    []
  )

  const formats = useMemo(
    () => ['bold', 'italic', 'underline', 'list', 'bullet', 'link'],
    []
  )

  return (
    <div className="rich-text-editor" style={{ '--rich-text-min-height': `${minHeight}px` }}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
      />
      <div className="text-white/50 text-xs mt-2">
        Rich text enabled. Use the toolbar for basic formatting.
      </div>
    </div>
  )
}
