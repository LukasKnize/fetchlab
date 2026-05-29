import { useCallback } from 'react'
import useAppStore from '../store/useAppStore'

export function useFetch() {
  const updateRequest = useAppStore(s => s.updateRequest)

  const execute = useCallback(async (requestId, { method, url, headers, body }) => {
    if (!url) return

    // Ensure the URL is absolute so fetch doesn't treat it as a relative path.
    // e.g. "localhost:3002/api" → "http://localhost:3002/api"
    if (!/^https?:\/\//i.test(url)) {
      url = (url.startsWith('//') ? 'http:' : 'http://') + url.replace(/^\/\//, '')
    }

    updateRequest(requestId, { isLoading: true, error: null, response: null })

    const enabledHeaders = Object.fromEntries(
      headers.filter(h => h.enabled && h.key.trim()).map(h => [h.key, h.value])
    )

    const hasBody = body && body.trim() && !['GET', 'HEAD'].includes(method)

    const options = {
      method,
      headers: enabledHeaders,
      body: hasBody ? body : undefined,
    }

    const start = Date.now()

    try {
      const res = await fetch(url, options)
      const duration = Date.now() - start
      const text = await res.text()

      // Collect response headers
      const responseHeaders = {}
      res.headers.forEach((value, key) => { responseHeaders[key] = value })

      updateRequest(requestId, {
        isLoading: false,
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
          body: text,
          duration,
        },
      })
    } catch (err) {
      const duration = Date.now() - start
      let message = err.message
      if (message === 'Failed to fetch' && navigator.onLine) {
        message = 'Failed to fetch — this is likely a CORS error. Check the browser DevTools console for details.'
      }
      updateRequest(requestId, { isLoading: false, error: message, response: null })
    }
  }, [updateRequest])

  return { execute }
}
