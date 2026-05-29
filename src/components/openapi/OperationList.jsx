import useAppStore from '../../store/useAppStore'

const METHOD_COLORS = {
  GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
  PATCH: '#50e3c2', DELETE: '#f93e3e', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
}

export default function OperationList() {
  const templates = useAppStore(s => s.openApiTemplates)
  const addRequest = useAppStore(s => s.addRequest)

  if (templates.length === 0) return null

  return (
    <div className="operation-list">
      {templates.map((t, i) => (
        <button
          key={i}
          className="operation-item"
          onClick={() => addRequest({ title: t.title, method: t.method, url: t.url, headers: t.headers, body: t.body })}
          title={`${t.method} ${t.url}`}
        >
          <span className="lib-method" style={{ color: METHOD_COLORS[t.method] ?? '#fff' }}>
            {t.method}
          </span>
          <span className="lib-name">{t.title}</span>
        </button>
      ))}
    </div>
  )
}
