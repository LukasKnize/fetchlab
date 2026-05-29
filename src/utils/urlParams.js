const PARAM_RE = /\{(\w+)\}/g

/** Extract all {param} names from a URL template string. */
export function extractParams(url) {
  return [...(url ?? '').matchAll(PARAM_RE)].map(m => m[1])
}

/** Replace {key} placeholders with values from the params map. */
export function interpolateUrl(url, params) {
  if (!url) return url
  return url.replace(PARAM_RE, (_, key) => params?.[key] ?? `{${key}}`)
}

/**
 * Sync urlParams with newly detected params in the URL.
 * Keeps existing values, adds empty entries for new params, drops removed ones.
 */
export function syncParams(url, existing) {
  const keys = extractParams(url)
  if (keys.length === 0) return {}
  const next = {}
  for (const k of keys) {
    next[k] = existing?.[k] ?? ''
  }
  return next
}
