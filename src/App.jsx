import { useState, useEffect } from 'react'
import useAppStore from './store/useAppStore'
import Sidebar from './components/layout/Sidebar'
import TabBar from './components/layout/TabBar'
import RequestPanel from './components/request/RequestPanel'
import MockServerPanel from './components/mockserver/MockServerPanel'

export default function App() {
  const activeRequestId = useAppStore(s => s.activeRequestId)
  const openRequests = useAppStore(s => s.openRequests)
  const init = useAppStore(s => s._init)
  const [view, setView] = useState('requests')

  useEffect(() => { init() }, [init])

  const active = activeRequestId ?? openRequests[0]?.id

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <div className="view-nav">
          <button
            className={`view-nav-btn ${view === 'requests' ? 'active' : ''}`}
            onClick={() => setView('requests')}
          >
            Requests
          </button>
          <button
            className={`view-nav-btn ${view === 'mock' ? 'active' : ''}`}
            onClick={() => setView('mock')}
          >
            Mock Servers
          </button>
        </div>

        {view === 'requests' ? (
          <>
            <TabBar />
            {active
              ? <RequestPanel key={active} requestId={active} />
              : <div className="empty-state">Click + to create a new request</div>
            }
          </>
        ) : (
          <MockServerPanel />
        )}
      </div>
    </div>
  )
}
