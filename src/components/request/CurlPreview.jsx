import { useMemo, useState } from 'react'
import { buildCurl } from '../../utils/curlBuilder'

export default function CurlPreview({ method, url, headers, body }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(true)

  const curl = useMemo(() => buildCurl({ method, url, headers, body }), [method, url, headers, body])

  const handleCopy = () => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!curl) return null

  return (
    <div className="curl-preview">
      <div className="curl-preview-header" onClick={() => setOpen(o => !o)}>
        <span className="curl-toggle">{open ? '▾' : '▸'} curl</span>
        {open && (
          <button
            className="btn-secondary small"
            onClick={e => { e.stopPropagation(); handleCopy() }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
      {open && <pre className="curl-code">{curl}</pre>}
    </div>
  )
}
