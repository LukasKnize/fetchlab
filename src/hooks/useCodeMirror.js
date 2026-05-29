import { useEffect, useRef, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { linter, lintGutter } from '@codemirror/lint'

function jsonLinter() {
  return view => {
    const text = view.state.doc.toString()
    if (!text.trim()) return []
    try {
      JSON.parse(text)
      return []
    } catch (e) {
      // Try to find position from error message
      const match = e.message.match(/position (\d+)/)
      const pos = match ? parseInt(match[1]) : 0
      const safePos = Math.min(pos, text.length)
      return [{
        from: safePos,
        to: Math.min(safePos + 1, text.length),
        severity: 'error',
        message: e.message,
      }]
    }
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.initialValue
 * @param {function} opts.onChange
 * @param {boolean} opts.readOnly
 * @returns {{ ref: React.Ref, setValue: function }}
 */
export function useCodeMirror({ initialValue = '', onChange, readOnly = false }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)

  // Keep callback ref fresh without re-creating editor
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      basicSetup,
      json(),
      oneDark,
      EditorView.lineWrapping,
    ]

    if (!readOnly) {
      extensions.push(lintGutter())
      extensions.push(linter(jsonLinter()))
      extensions.push(
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        })
      )
    } else {
      extensions.push(EditorState.readOnly.of(true))
      extensions.push(EditorView.editable.of(false))
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions,
      }),
      parent: containerRef.current,
    })

    viewRef.current = view

    if (readOnly) {
      // Make read-only editors focusable so Ctrl+F (from basicSetup searchKeymap) works
      requestAnimationFrame(() => view.focus())
    }

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]) // Only re-create on readOnly change

  const setValue = useCallback((newValue) => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === newValue) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newValue },
    })
  }, [])

  return { ref: containerRef, setValue }
}
