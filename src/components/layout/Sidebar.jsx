import RequestLibrary from '../library/RequestLibrary'
import OpenApiLoader from '../openapi/OpenApiLoader'
import OperationList from '../openapi/OperationList'

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">fetch<span className="logo-accent">lab</span></span>
      </div>
      <OpenApiLoader />
      <OperationList />
      <div className="sidebar-divider" />
      <RequestLibrary />
    </aside>
  )
}
