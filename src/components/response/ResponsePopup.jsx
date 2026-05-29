import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { formatJson } from '../../utils/jsonUtils'

export default function ResponsePopup({ body, onClose }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)

  // Build the editor once when the popup mounts
  useEffect(() => {
    if (!containerRef.current) return

    const content = formatJson(body) ?? body ?? ''

    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,           // includes searchKeymap → Ctrl+F works
          json(),
          oneDark,
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    // Auto-focus so Ctrl+F immediately works without clicking first
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [body])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-panel" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <span className="popup-title">Response Body</span>
          <span className="popup-hint">Ctrl+F to search · Esc to close</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div ref={containerRef} className="popup-editor" />
      </div>
    </div>,
    document.body
  )
}
