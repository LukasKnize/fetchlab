import useAppStore from '../../store/useAppStore'

export default function TabBar() {
  const openRequests = useAppStore(s => s.openRequests)
  const activeRequestId = useAppStore(s => s.activeRequestId)
  const addRequest = useAppStore(s => s.addRequest)
  const removeRequest = useAppStore(s => s.removeRequest)
  const setActiveRequest = useAppStore(s => s.setActiveRequest)

  return (
    <div className="tab-bar main-tabs">
      {openRequests.map(req => (
        <div
          key={req.id}
          className={`main-tab ${req.id === activeRequestId ? 'active' : ''}`}
          onClick={() => setActiveRequest(req.id)}
          title={req.url || req.title}
        >
          <span className={`method-dot method-${req.method.toLowerCase()}`} />
          <span className="tab-label">
            {req.title !== 'New Request' ? req.title : req.url || req.title}
          </span>
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); removeRequest(req.id) }}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}
      <button className="new-tab-btn" onClick={() => addRequest()} title="New request">
        +
      </button>
    </div>
  )
}
