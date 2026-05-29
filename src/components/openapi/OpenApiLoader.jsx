import { useState } from 'react'
import { parseOpenApiSpec } from '../../utils/openApiParser'
import useAppStore from '../../store/useAppStore'

export default function OpenApiLoader() {
  const setOpenApiTemplates = useAppStore(s => s.setOpenApiTemplates)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [count, setCount] = useState(0)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const templates = parseOpenApiSpec(ev.target.result)
        setOpenApiTemplates(templates)
        setFileName(file.name)
        setCount(templates.length)
      } catch (err) {
        setError(err.message)
        setOpenApiTemplates([])
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-loaded
    e.target.value = ''
  }

  return (
    <div className="openapi-loader">
      <div className="section-title">OpenAPI</div>
      <label className="file-label btn-secondary small">
        Load spec…
        <input type="file" accept=".json,.yaml,.yml" onChange={handleFile} hidden />
      </label>
      {fileName && !error && (
        <span className="openapi-status">
          {fileName} — {count} endpoint{count !== 1 ? 's' : ''}
        </span>
      )}
      {error && <span className="openapi-error">{error}</span>}
    </div>
  )
}
