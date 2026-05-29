import { useState, useCallback, useRef } from 'react'
import ResponseBody from './ResponseBody'
import ResponsePopup from './ResponsePopup'

function statusClass(status) {
  if (status >= 200 && status < 300) return 'status-2xx'
  if (status >= 300 && status < 400) return 'status-3xx'
  if (status >= 400 && status < 500) return 'status-4xx'
  return 'status-5xx'
}

export default function ResponsePanel({ response, isLoading, error }) {
  const [activeTab, setActiveTab] = useState('body')
  const [popupOpen, setPopupOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const closePopup = useCallback(() => setPopupOpen(false), [])

  const handleCopy = useCallback((body) => {
    navigator.clipboard.writeText(body)
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 1500)
  }, [])

  if (isLoading) {
    return <div className="response-panel loading"><span className="spinner" /> Sending request…</div>
  }

  if (error) {
    return (
      <div className="response-panel error">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="response-panel empty">
        <span className="empty-hint">Hit Send to see the response</span>
      </div>
    )
  }

  const { status, statusText, headers, body, duration } = response

  return (
    <div className="response-panel">
      <div className="response-meta">
        <span className={`status-badge ${statusClass(status)}`}>
          {status} {statusText}
        </span>
        <span className="response-time">{duration}ms</span>
        <span className="response-size">{new Blob([body]).size} B</span>
        <div className="response-meta-actions">
          <button
            className="btn-secondary small"
            onClick={() => handleCopy(body)}
            title="Copy response body"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            className="btn-secondary small"
            onClick={() => setPopupOpen(true)}
            title="Expand response body (Ctrl+F to search)"
          >
            ⤢ Expand
          </button>
        </div>
      </div>

      <div className="tab-bar secondary">
        {['body', 'headers', 'raw'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && ` (${Object.keys(headers).length})`}
          </button>
        ))}
      </div>

      <div className="response-content">
        {activeTab === 'body' && <ResponseBody body={body} />}
        {activeTab === 'headers' && (
          <table className="headers-table">
            <tbody>
              {Object.entries(headers).map(([k, v]) => (
                <tr key={k}>
                  <td className="header-key-cell">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'raw' && <pre className="raw-body">{body}</pre>}
      </div>

      {popupOpen && <ResponsePopup body={body} onClose={closePopup} />}
    </div>
  )
}
