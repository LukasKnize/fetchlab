import { useEffect } from 'react'
import { useCodeMirror } from '../../hooks/useCodeMirror'
import { formatJson, getJsonError } from '../../utils/jsonUtils'

export default function BodyEditor({ value, onChange }) {
  const { ref, setValue } = useCodeMirror({ initialValue: value, onChange })

  // Sync external value changes (e.g. loading a saved request)
  useEffect(() => {
    setValue(value ?? '')
  }, [value, setValue])

  const handleFormat = () => {
    const formatted = formatJson(value)
    if (formatted !== null) {
      setValue(formatted)
      onChange(formatted)
    }
  }

  const jsonError = getJsonError(value)

  return (
    <div className="body-editor">
      <div className="body-editor-toolbar">
        <button className="btn-secondary small" onClick={handleFormat} title="Format JSON">
          Format JSON
        </button>
        {jsonError && <span className="json-error-badge">⚠ {jsonError}</span>}
        {!jsonError && value?.trim() && <span className="json-valid-badge">✓ Valid JSON</span>}
      </div>
      <div ref={ref} className="cm-container" />
    </div>
  )
}
