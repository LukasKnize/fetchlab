import jsYaml from 'js-yaml'

function schemaToExample(schema, components, depth = 0) {
  if (!schema || depth > 5) return null

  // Resolve $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/', '').split('/')
    let resolved = { components }
    // refPath looks like ['components', 'schemas', 'Pet']
    // We already have components as root, adjust
    const fullDoc = { components }
    let cur = fullDoc
    for (const part of refPath) {
      if (part === '#') continue
      cur = cur?.[part]
    }
    return schemaToExample(cur, components, depth + 1)
  }

  if (schema.example !== undefined) return schema.example

  switch (schema.type) {
    case 'object': {
      if (!schema.properties) return {}
      const obj = {}
      for (const [key, val] of Object.entries(schema.properties)) {
        obj[key] = schemaToExample(val, components, depth + 1)
      }
      return obj
    }
    case 'array': {
      const item = schemaToExample(schema.items, components, depth + 1)
      return item !== null ? [item] : []
    }
    case 'string':
      return schema.enum?.[0] ?? schema.default ?? ''
    case 'integer':
    case 'number':
      return schema.default ?? 0
    case 'boolean':
      return schema.default ?? false
    default:
      if (schema.properties) return schemaToExample({ type: 'object', ...schema }, components, depth + 1)
      return null
  }
}

function resolveRef(ref, spec) {
  // e.g. #/components/schemas/Pet
  const parts = ref.replace(/^#\//, '').split('/')
  let cur = spec
  for (const p of parts) cur = cur?.[p]
  return cur
}

function schemaToExampleFull(schema, spec, depth = 0) {
  if (!schema || depth > 5) return null
  if (schema.$ref) {
    return schemaToExampleFull(resolveRef(schema.$ref, spec), spec, depth + 1)
  }
  if (schema.example !== undefined) return schema.example
  switch (schema.type) {
    case 'object': {
      if (!schema.properties) return {}
      const obj = {}
      for (const [k, v] of Object.entries(schema.properties)) {
        obj[k] = schemaToExampleFull(v, spec, depth + 1)
      }
      return obj
    }
    case 'array':
      return [schemaToExampleFull(schema.items, spec, depth + 1)].filter(v => v !== null)
    case 'string':
      return schema.enum?.[0] ?? schema.default ?? ''
    case 'integer':
    case 'number':
      return schema.default ?? 0
    case 'boolean':
      return schema.default ?? false
    default:
      if (schema.properties) return schemaToExampleFull({ type: 'object', ...schema }, spec, depth + 1)
      return null
  }
}

export function parseOpenApiSpec(text) {
  let spec
  try {
    spec = JSON.parse(text)
  } catch {
    try {
      spec = jsYaml.load(text)
    } catch (e) {
      throw new Error(`Could not parse file as JSON or YAML: ${e.message}`)
    }
  }

  if (!spec || typeof spec !== 'object') throw new Error('Invalid spec: not an object')
  if (!spec.paths) throw new Error('No paths found in spec')

  const isOas3 = !!spec.openapi
  const isSwagger2 = !!spec.swagger

  let baseUrl = ''
  if (isOas3 && spec.servers?.[0]?.url) {
    baseUrl = spec.servers[0].url.replace(/\/$/, '')
  } else if (isSwagger2) {
    const scheme = spec.schemes?.[0] ?? 'https'
    baseUrl = `${scheme}://${spec.host ?? ''}${spec.basePath ?? ''}`
  }

  const templates = []

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
    for (const method of httpMethods) {
      const operation = pathItem[method]
      if (!operation) continue

      const title = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`
      const url = `${baseUrl}${path}`

      // Extract headers and query params
      const headers = []
      let queryString = ''
      const queryParams = []

      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      for (const param of parameters) {
        const resolved = param.$ref ? resolveRef(param.$ref, spec) : param
        if (!resolved) continue
        if (resolved.in === 'header') {
          headers.push({
            id: `h-${Math.random()}`,
            key: resolved.name,
            value: resolved.example ?? '',
            enabled: true,
          })
        } else if (resolved.in === 'query') {
          queryParams.push(`${resolved.name}=${resolved.example ?? ''}`)
        }
      }
      if (queryParams.length) queryString = '?' + queryParams.join('&')

      // Extract body
      let body = ''
      if (isOas3 && operation.requestBody) {
        const content = operation.requestBody.content
        const jsonContent = content?.['application/json']
        if (jsonContent?.schema) {
          const example = schemaToExampleFull(jsonContent.schema, spec)
          if (example !== null) {
            body = JSON.stringify(example, null, 2)
            // Auto-add Content-Type if not already present
            if (!headers.some(h => h.key.toLowerCase() === 'content-type')) {
              headers.push({ id: `h-${Math.random()}`, key: 'Content-Type', value: 'application/json', enabled: true })
            }
          }
        }
      } else if (isSwagger2 && operation.parameters) {
        const bodyParam = operation.parameters.find(p => p.in === 'body')
        if (bodyParam?.schema) {
          const example = schemaToExampleFull(bodyParam.schema, spec)
          if (example !== null) {
            body = JSON.stringify(example, null, 2)
            if (!headers.some(h => h.key.toLowerCase() === 'content-type')) {
              headers.push({ id: `h-${Math.random()}`, key: 'Content-Type', value: 'application/json', enabled: true })
            }
          }
        }
      }

      templates.push({
        title,
        method: method.toUpperCase(),
        url: url + queryString,
        headers,
        body,
      })
    }
  }

  return templates
}
