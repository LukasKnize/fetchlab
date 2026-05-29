import { interpolateUrl } from '../../utils/urlParams'

export default function UrlParamsEditor({ paramKeys, urlParams, url, onChange }) {
  if (paramKeys.length === 0) return null

  const resolved = interpolateUrl(url, urlParams)
  const allFilled = paramKeys.every(k => urlParams[k])

  return (
    <div className="url-params-editor">
      <div className="url-params-rows">
        {paramKeys.map(key => (
          <div key={key} className="url-param-row">
            <span className="url-param-key">{key}</span>
            <input
              className="url-param-value"
              type="text"
              placeholder={`{${key}}`}
              value={urlParams[key] ?? ''}
              onChange={e => onChange({ ...urlParams, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className={`url-resolved ${allFilled ? '' : 'url-resolved-partial'}`}>
        <span className="url-resolved-label">→</span>
        <span className="url-resolved-value">{resolved}</span>
      </div>
    </div>
  )
}
