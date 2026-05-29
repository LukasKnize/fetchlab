const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const METHOD_COLORS = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  PATCH: '#50e3c2',
  DELETE: '#f93e3e',
  HEAD: '#9012fe',
  OPTIONS: '#0d5aa7',
}

export default function MethodSelector({ value, onChange }) {
  return (
    <select
      className="method-selector"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ color: METHOD_COLORS[value] ?? '#fff' }}
    >
      {METHODS.map(m => (
        <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>
          {m}
        </option>
      ))}
    </select>
  )
}
