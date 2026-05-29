// Extracts the path portion from a spec's servers[0].url to use as a route prefix.
// e.g. "http://localhost:8000/api/v1/auth" → "/api/v1/auth"
export function getSpecBasePath(spec) {
  if (spec.openapi) {
    const serverUrl = spec.servers?.[0]?.url
    if (!serverUrl) return ''
    try {
      const p = new URL(serverUrl).pathname.replace(/\/$/, '')
      return p === '' ? '' : p
    } catch {
      // Relative / path-only URL like "/api/v1/auth"
      const p = serverUrl.replace(/\/$/, '')
      return p.startsWith('/') ? p : ''
    }
  }
  if (spec.swagger) {
    return (spec.basePath ?? '').replace(/\/$/, '')
  }
  return ''
}

function resolveResponseRef(responseOrRef, spec) {
  if (!responseOrRef?.$ref) return responseOrRef
  const parts = responseOrRef.$ref.replace(/^#\//, '').split('/')
  let cur = spec
  for (const p of parts) cur = cur?.[p]
  return cur ?? responseOrRef
}

export function extractMockRoutes(spec) {
  const isOas3 = !!spec.openapi
  const basePath = getSpecBasePath(spec)
  const routes = []

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const operation = pathItem[method]
      if (!operation) continue

      // First 2xx response schema — resolve $ref on the response object itself
      let responseSchema = null
      let responseStatus = 200
      for (const [statusStr, responseOrRef] of Object.entries(operation.responses ?? {})) {
        const code = parseInt(statusStr)
        if (code >= 200 && code < 300) {
          responseStatus = code
          const response = resolveResponseRef(responseOrRef, spec)
          responseSchema = isOas3
            ? (response?.content?.['application/json']?.schema ?? null)
            : (response?.schema ?? null)
          break
        }
      }

      // Request body schema
      let requestSchema = null
      if (isOas3 && operation.requestBody) {
        requestSchema = operation.requestBody.content?.['application/json']?.schema ?? null
      } else if (!isOas3) {
        const bodyParam = (operation.parameters ?? []).find(p => p.in === 'body')
        requestSchema = bodyParam?.schema ?? null
      }

      routes.push({
        method: method.toUpperCase(),
        path: basePath + path,
        responseStatus,
        responseSchema,
        requestSchema,
        summary: operation.summary || operation.operationId || null,
      })
    }
  }

  return routes
}
