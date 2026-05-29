const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const http = require('http')
const https = require('https')
const crypto = require('crypto')

const isDev = !app.isPackaged

// ── Mock server state ──────────────────────────────────────────────────────────
const mockServers = new Map() // port → { server }
const serverLogs  = new Map() // port → entry[]

function emitLog(port, entry) {
  const list = serverLogs.get(port)
  if (list) {
    list.push(entry)
    if (list.length > 500) list.shift()
  }
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('mock-server:log', { port, entry })
  }
}

function pathToRegex(openApiPath) {
  const pattern = openApiPath
    .replace(/[\\^$.|?*+()\[\]]/g, '\\$&') // escape regex specials (not { })
    .replace(/\{[^}]+\}/g, '([^/]+)')       // {param} → capture group
  return new RegExp(`^${pattern}$`)
}

function resolveRef(ref, spec) {
  const parts = ref.replace(/^#\//, '').split('/')
  let cur = spec
  for (const p of parts) cur = cur?.[p]
  return cur
}

// visitedRefs is mutated in-place to track the current $ref resolution chain.
// Callers that branch (object properties, array items) must pass a fresh copy
// so sibling branches don't block each other from using the same $ref.
function resolveSchema(schema, spec, visitedRefs) {
  if (!schema) return null
  if (schema.$ref) {
    if (visitedRefs.has(schema.$ref)) return null // circular — stop here
    visitedRefs.add(schema.$ref)
    return resolveSchema(resolveRef(schema.$ref, spec), spec, visitedRefs)
  }
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] }
    for (const s of schema.allOf) {
      const r = resolveSchema(s, spec, visitedRefs)
      if (r?.properties) Object.assign(merged.properties, r.properties)
      if (r?.required) merged.required.push(...r.required)
    }
    return merged
  }
  if (schema.oneOf) return resolveSchema(schema.oneOf[0], spec, visitedRefs)
  if (schema.anyOf) return resolveSchema(schema.anyOf[0], spec, visitedRefs)
  return schema
}

function generateValue(schema, spec, visitedRefs = new Set()) {
  if (!schema) return null
  const s = resolveSchema(schema, spec, visitedRefs)
  if (!s) return null
  if (s.enum) return s.enum[Math.floor(Math.random() * s.enum.length)]

  switch (s.type) {
    case 'object': {
      if (!s.properties) return {}
      const obj = {}
      // Each property gets its own copy so siblings don't block each other
      for (const [k, v] of Object.entries(s.properties))
        obj[k] = generateValue(v, spec, new Set(visitedRefs))
      return obj
    }
    case 'array': {
      if (!s.items) return []
      const count = Math.floor(Math.random() * 3) + 1
      return Array.from({ length: count }, () => generateValue(s.items, spec, new Set(visitedRefs)))
    }
    case 'string': {
      if (s.format === 'date-time') return new Date().toISOString()
      if (s.format === 'date') return new Date().toISOString().split('T')[0]
      if (s.format === 'uuid') return crypto.randomUUID()
      if (s.format === 'email') return `user${Math.floor(Math.random() * 1000)}@example.com`
      const chars = 'abcdefghijklmnopqrstuvwxyz'
      return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    }
    case 'integer': {
      const min = s.minimum ?? 1
      const max = s.maximum ?? 1000
      return Math.floor(Math.random() * (max - min + 1)) + min
    }
    case 'number': {
      const min = s.minimum ?? 0
      const max = s.maximum ?? 1000
      return Math.round((Math.random() * (max - min) + min) * 100) / 100
    }
    case 'boolean':
      return Math.random() > 0.5
    default:
      if (s.properties) return generateValue({ type: 'object', ...s }, spec, new Set(visitedRefs))
      return null
  }
}

// ── Response modification helpers ──────────────────────────────────────────────

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split('.')
  const last = parts.pop()
  let cur = obj
  for (const k of parts) {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[last] = value
}

function deleteByPath(obj, dotPath) {
  const parts = dotPath.split('.')
  const last = parts.pop()
  let cur = obj
  for (const k of parts) {
    cur = cur?.[k]
    if (cur == null) return
  }
  if (cur && typeof cur === 'object') delete cur[last]
}

// Applies add/remove field modifications to a JSON string.
// If the response is an array, modifications are applied to each item.
// Non-JSON bodies are returned unchanged.
function applyMods(bodyStr, mods) {
  if (!mods) return bodyStr
  const { add = [], remove = [] } = mods
  if (!add.length && !remove.length) return bodyStr
  let obj
  try { obj = JSON.parse(bodyStr) } catch { return bodyStr }
  if (obj === null && add.length) obj = {}

  const applyToItem = (item) => {
    if (!item || typeof item !== 'object') return item
    for (const p of remove) {
      if (p?.trim()) deleteByPath(item, p.trim())
    }
    for (const { path, value } of add) {
      if (path?.trim()) {
        let parsed
        try { parsed = JSON.parse(value) } catch { parsed = value }
        setByPath(item, path.trim(), parsed)
      }
    }
    return item
  }

  if (Array.isArray(obj)) obj.forEach(applyToItem)
  else applyToItem(obj)

  return JSON.stringify(obj, null, 2)
}

// Forwards an incoming request to a target base URL, preserving path + query.
function forwardRequest(targetBaseUrl, req, rawBody) {
  return new Promise((resolve, reject) => {
    let targetUrl
    try { targetUrl = new URL(req.url, targetBaseUrl) } catch (e) {
      return reject(new Error(`Invalid proxy URL: ${targetBaseUrl}`))
    }

    const isHttps = targetUrl.protocol === 'https:'
    const lib = isHttps ? https : http
    const skipHeaders = new Set(['host', 'connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'keep-alive'])
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (!skipHeaders.has(k.toLowerCase())) headers[k] = v
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    }

    const proxyReq = lib.request(options, proxyRes => {
      let data = ''
      proxyRes.on('data', chunk => { data += chunk })
      proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body: data }))
    })
    proxyReq.on('error', reject)
    if (rawBody) proxyReq.write(rawBody)
    proxyReq.end()
  })
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateBody(schema, body, spec) {
  const s = resolveSchema(schema, spec, new Set())
  if (!s || s.type !== 'object') return null
  for (const field of (s.required ?? [])) {
    if (body[field] === undefined) return `Missing required field: "${field}"`
  }
  return null
}

ipcMain.handle('mock-server:start', async (_event, { port, routes, specs, globalProxyUrl }) => {
  if (mockServers.has(port))
    return { success: false, error: `Port ${port} is already in use by another mock server` }

  serverLogs.set(port, [])

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')

    const logEntry = { ts: Date.now(), method: req.method, path: req.url, label: '' }
    res.on('finish', () => { logEntry.status = res.statusCode; emitLog(port, logEntry) })

    if (req.method === 'OPTIONS') {
      logEntry.label = 'preflight'
      res.writeHead(204)
      res.end()
      return
    }

    const urlObj = new URL(req.url, `http://localhost:${port}`)
    const pathname = urlObj.pathname
    const route = routes.find(r => r.method === req.method && pathToRegex(r.path).test(pathname))

    let rawBody = ''
    req.on('data', chunk => { rawBody += chunk })
    req.on('end', () => {
      if (!route) {
        if (globalProxyUrl) {
          logEntry.label = `pass-through → ${globalProxyUrl}`
          forwardRequest(globalProxyUrl, req, rawBody || null)
            .then(upstream => {
              const ct = upstream.headers['content-type'] ?? 'application/json'
              res.writeHead(upstream.status, { 'Content-Type': ct })
              res.end(upstream.body)
            })
            .catch(err => {
              logEntry.label = 'pass-through error'
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }))
            })
        } else {
          logEntry.label = 'not found'
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Route not found', path: pathname, method: req.method }))
        }
        return
      }
      // Only validate JSON body for mock mode (proxy forwards body as-is)
      let parsedBody = null
      if (rawBody && route.mode !== 'proxy') {
        try { parsedBody = JSON.parse(rawBody) } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }))
          return
        }
        if (route.requestSchema && parsedBody) {
          const spec = specs[route.specIndex] ?? {}
          const err = validateBody(route.requestSchema, parsedBody, spec)
          if (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err }))
            return
          }
        }
      }

      ;(async () => {
        if (route.mode === 'proxy') {
          const targetBase = route.proxyUrl || globalProxyUrl
          if (!targetBase) {
            logEntry.label = 'proxy — no target URL'
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'No proxy URL configured for this route' }))
            return
          }
          logEntry.label = `proxy → ${targetBase}`
          let upstream
          try { upstream = await forwardRequest(targetBase, req, rawBody || null) } catch (err) {
            logEntry.label = 'proxy error'
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }))
            return
          }
          const body = applyMods(upstream.body, route.mods)
          const ct = upstream.headers['content-type'] ?? 'application/json'
          res.writeHead(upstream.status, { 'Content-Type': ct })
          res.end(body)
          return
        }

        // Mock mode
        logEntry.label = 'mock'
        const status = route.responseStatus ?? 200
        if (status === 204 || !route.responseSchema) {
          res.writeHead(status)
          res.end()
          return
        }
        const spec = specs[route.specIndex] ?? {}
        const mockBody = generateValue(route.responseSchema, spec)
        const body = applyMods(JSON.stringify(mockBody, null, 2), route.mods)
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(body)
      })().catch(err => {
        logEntry.label = 'internal error'
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      })
    })
  })

  return new Promise(resolve => {
    server.on('error', err => resolve({ success: false, error: err.message }))
    server.listen(port, 'localhost', () => {
      mockServers.set(port, { server })
      resolve({ success: true })
    })
  })
})

ipcMain.handle('mock-server:stop', async (_event, { port }) => {
  const entry = mockServers.get(port)
  if (!entry) return { success: false, error: 'Server not found' }
  return new Promise(resolve => {
    entry.server.close(() => {
      mockServers.delete(port)
      serverLogs.delete(port)
      resolve({ success: true })
    })
  })
})

ipcMain.handle('mock-server:list', async () =>
  Array.from(mockServers.keys()).map(port => ({ port }))
)

ipcMain.handle('mock-server:logs', async (_event, { port }) =>
  serverLogs.get(port) ?? []
)

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'fetchlab',
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
