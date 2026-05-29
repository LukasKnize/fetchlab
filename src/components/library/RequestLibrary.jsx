import { useState } from 'react'
import useAppStore from '../../store/useAppStore'

const METHOD_COLORS = {
  GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
  PATCH: '#50e3c2', DELETE: '#f93e3e', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
}

export default function RequestLibrary() {
  const savedRequests = useAppStore(s => s.savedRequests)
  const loadRequest = useAppStore(s => s.loadRequest)
  const deleteFromLibrary = useAppStore(s => s.deleteFromLibrary)
  const [search, setSearch] = useState('')

  const filtered = savedRequests.filter(r => {
    const q = search.toLowerCase()
    return (r.name ?? '').toLowerCase().includes(q) || (r.url ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="request-library">
      <div className="library-header">
        <span className="section-title">Saved Requests</span>
        <span className="library-count">{savedRequests.length}</span>
      </div>
      <input
        className="library-search"
        type="text"
        placeholder="Search…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {filtered.length === 0 && (
        <p className="empty-hint">{savedRequests.length === 0 ? 'No saved requests yet.' : 'No matches.'}</p>
      )}
      <ul className="library-list">
        {filtered.map(req => (
          <li key={req.id} className="library-item">
            <button className="library-load" onClick={() => loadRequest(req)} title="Open request">
              <span className="lib-method" style={{ color: METHOD_COLORS[req.method] ?? '#fff' }}>
                {req.method}
              </span>
              <span className="lib-name">{req.name}</span>
            </button>
            <button
              className="icon-btn danger"
              onClick={() => deleteFromLibrary(req.id)}
              title="Delete"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
