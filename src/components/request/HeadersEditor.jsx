const COMMON_HEADERS = [
  'Accept', 'Accept-Encoding', 'Accept-Language', 'Authorization',
  'Cache-Control', 'Content-Type', 'Cookie', 'Origin',
  'User-Agent', 'X-API-Key', 'X-Auth-Token', 'X-Request-ID',
]

let hid = 0
const newHeaderId = () => `hdr-${++hid}-${Date.now()}`

export default function HeadersEditor({ headers, onChange }) {
  const addRow = () => {
    onChange([...headers, { id: newHeaderId(), key: '', value: '', enabled: true }])
  }

  const updateRow = (id, patch) => {
    onChange(headers.map(h => h.id === id ? { ...h, ...patch } : h))
  }

  const removeRow = (id) => {
    onChange(headers.filter(h => h.id !== id))
  }

  return (
    <div className="headers-editor">
      <datalist id="header-keys">
        {COMMON_HEADERS.map(h => <option key={h} value={h} />)}
      </datalist>

      {headers.length === 0 && (
        <p className="empty-hint">No headers. Click "Add Header" to add one.</p>
      )}

      {headers.map(h => (
        <div key={h.id} className={`header-row ${!h.enabled ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={h.enabled}
            onChange={e => updateRow(h.id, { enabled: e.target.checked })}
            title="Enable/disable header"
          />
          <input
            type="text"
            className="header-key"
            placeholder="Key"
            value={h.key}
            list="header-keys"
            onChange={e => updateRow(h.id, { key: e.target.value })}
          />
          <span className="header-sep">:</span>
          <input
            type="text"
            className="header-value"
            placeholder="Value"
            value={h.value}
            onChange={e => updateRow(h.id, { value: e.target.value })}
          />
          <button className="icon-btn danger" onClick={() => removeRow(h.id)} title="Remove header">
            ✕
          </button>
        </div>
      ))}

      <button className="btn-secondary small" onClick={addRow}>
        + Add Header
      </button>
    </div>
  )
}
