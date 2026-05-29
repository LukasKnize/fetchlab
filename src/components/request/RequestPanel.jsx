import { useState, useEffect, useCallback, useMemo } from 'react'
import useAppStore from '../../store/useAppStore'
import { useFetch } from '../../hooks/useFetch'
import MethodSelector from './MethodSelector'
import HeadersEditor from './HeadersEditor'
import BodyEditor from './BodyEditor'
import CurlPreview from './CurlPreview'
import UrlParamsEditor from './UrlParamsEditor'
import ResponsePanel from '../response/ResponsePanel'
import { extractParams, syncParams, interpolateUrl } from '../../utils/urlParams'

const TABS = ['Headers', 'Body']

export default function RequestPanel({ requestId }) {
  const request = useAppStore(s => s.openRequests.find(r => r.id === requestId))
  const updateRequest = useAppStore(s => s.updateRequest)
  const saveRequest = useAppStore(s => s.saveRequest)
  const { execute } = useFetch()

  const [activeTab, setActiveTab] = useState('Headers')
  const [saved, setSaved] = useState(false)

  const update = useCallback((patch) => updateRequest(requestId, patch), [requestId, updateRequest])

  // Keyboard shortcut: Ctrl+Enter to send, Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  if (!request) return <div className="request-panel empty">Request not found</div>

  const { method, url, headers, body, urlParams = {}, response, isLoading, error } = request

  const paramKeys = useMemo(() => extractParams(url), [url])
  const effectiveUrl = useMemo(() => interpolateUrl(url, urlParams), [url, urlParams])

  const handleUrlChange = (newUrl) => {
    const synced = syncParams(newUrl, urlParams)
    update({ url: newUrl, urlParams: synced })
  }

  const handleSend = () => {
    execute(requestId, { method, url: effectiveUrl, headers, body })
  }

  const handleSave = () => {
    saveRequest(requestId)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const showBodyTab = !['GET', 'HEAD'].includes(method)

  return (
    <div className="request-panel">
      {/* URL bar */}
      <div className="url-bar">
        <MethodSelector value={method} onChange={v => update({ method: v })} />
        <input
          className="url-input"
          type="text"
          placeholder="https://api.example.com/endpoint"
          value={url}
          onChange={e => handleUrlChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          className="btn-primary send-btn"
          onClick={handleSend}
          disabled={isLoading || !url}
          title="Send (Ctrl+Enter)"
        >
          {isLoading ? '…' : 'Send'}
        </button>
        <button
          className="btn-secondary"
          onClick={handleSave}
          title="Save to library (Ctrl+S)"
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      <UrlParamsEditor
        paramKeys={paramKeys}
        urlParams={urlParams}
        url={url}
        onChange={v => update({ urlParams: v })}
      />

      {/* Request tabs */}
      <div className="tab-bar">
        {TABS.filter(t => t !== 'Body' || showBodyTab).map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === 'Headers' && headers.length > 0 && (
              <span className="tab-count">{headers.filter(h => h.enabled).length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'Headers' && (
          <HeadersEditor headers={headers} onChange={v => update({ headers: v })} />
        )}
        {activeTab === 'Body' && showBodyTab && (
          <BodyEditor value={body} onChange={v => update({ body: v })} />
        )}
      </div>

      <CurlPreview method={method} url={effectiveUrl} headers={headers} body={body} />

      {/* Response */}
      <ResponsePanel response={response} isLoading={isLoading} error={error} />
    </div>
  )
}
