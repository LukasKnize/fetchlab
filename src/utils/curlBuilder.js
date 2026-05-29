/**
 * Builds a curl command string from request parameters.
 * @param {{ method: string, url: string, headers: Array, body: string }} req
 * @returns {string}
 */
export function buildCurl({ method, url, headers = [], body = '' }) {
  if (!url) return ''

  const escapeForShell = str => str.replace(/'/g, `'"'"'`)

  const parts = [`curl -X ${method}`]

  const enabledHeaders = headers.filter(h => h.enabled && h.key.trim())
  for (const h of enabledHeaders) {
    parts.push(`  -H '${escapeForShell(h.key)}: ${escapeForShell(h.value)}'`)
  }

  const hasBody = body && body.trim() && !['GET', 'HEAD'].includes(method)
  if (hasBody) {
    parts.push(`  --data-raw '${escapeForShell(body)}'`)
  }

  parts.push(`  '${escapeForShell(url)}'`)

  return parts.join(' \\\n')
}
