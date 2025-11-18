import { useMemo } from 'react';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import './MarkdownEditor.css';

/**
 * MarkdownEditor Component
 *
 * Reusable markdown editor with preview and toolbar for rich text editing.
 * Based on SimpleMDE (EasyMDE) with custom styling to match design system.
 *
 * @param {Object} props
 * @param {string} props.value - Current markdown content
 * @param {Function} props.onChange - Callback when content changes
 * @param {string} props.placeholder - Placeholder text
 * @param {number} props.minHeight - Minimum editor height in pixels
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write your description using markdown...',
  minHeight = 200
}) {
  const options = useMemo(() => ({
    placeholder,
    spellChecker: false,
    minHeight: `${minHeight}px`,
    status: false, // Hide status bar
    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'quote',
      'unordered-list',
      'ordered-list',
      '|',
      'link',
      '|',
      'preview',
      'side-by-side',
      'fullscreen',
      '|',
      'guide'
    ],
    shortcuts: {
      toggleBold: 'Cmd-B',
      toggleItalic: 'Cmd-I',
      toggleHeadingSmaller: 'Cmd-H',
      togglePreview: 'Cmd-P',
      toggleSideBySide: 'F9',
      toggleFullScreen: 'F11'
    },
    previewClass: ['editor-preview', 'prose'],
    renderingConfig: {
      singleLineBreaks: false,
      codeSyntaxHighlighting: false
    }
  }), [placeholder, minHeight]);

  return (
    <div className="markdown-editor-wrapper">
      <SimpleMDE
        value={value}
        onChange={onChange}
        options={options}
      />
      <div className="text-white/50 text-xs mt-2">
        Supports <strong>bold</strong>, <em>italic</em>, headings, lists, and links. Use the toolbar or keyboard shortcuts.
      </div>
    </div>
  );
}
