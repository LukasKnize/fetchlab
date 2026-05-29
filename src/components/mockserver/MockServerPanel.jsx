import { useState, useEffect, useRef } from 'react'
import jsYaml from 'js-yaml'
import { extractMockRoutes, getSpecBasePath } from '../../utils/mockRouteExtractor'

const mockAPI = window.electronAPI?.mockServer

const defaultConfig = () => ({
  mode: 'proxy',
  proxyUrl: '',
  mods: {
    schemaFields: {},  // { [fieldName]: { included: boolean, value: string } }
    add: [],
    remove: [],
  },
})
const cfgKey = (specId, route) => `${specId}:${route.method} ${route.path}`

// ── Schema helpers ────────────────────────────────────────────────────────────

function resolveRef(ref, spec) {
  const parts = ref.replace(/^#\//, '').split('/')
  let cur = spec
  for (const p of parts) cur = cur?.[p]
  return cur
}

// Gets the best example/default/enum value for a single property definition.
function propExample(prop, spec) {
  const candidates = [prop]
  if (prop.$ref) candidates.unshift(resolveRef(prop.$ref, spec) ?? {})
  for (const c of candidates) {
    if (c.example !== undefined) return String(c.example)
    if (c.default !== undefined) return String(c.default)
    if (c.enum?.[0] !== undefined) return String(c.enum[0])
  }
  return ''
}

// Returns top-level response properties: { name, type, required, example }.
// Handles $ref, allOf, and array-of-objects so all methods work uniformly.
function getSchemaProperties(schema, spec, visited = new Set()) {
  if (!schema) return []
  if (schema.$ref) {
    if (visited.has(schema.$ref)) return []
    const next = new Set(visited)
    next.add(schema.$ref)
    return getSchemaProperties(resolveRef(schema.$ref, spec), spec, next)
  }
  if (schema.allOf) return schema.allOf.flatMap(s => getSchemaProperties(s, spec, visited))
  if (schema.oneOf) return getSchemaProperties(schema.oneOf[0], spec, visited)
  if (schema.anyOf) return getSchemaProperties(schema.anyOf[0], spec, visited)
  if (schema.type === 'array' && schema.items) return getSchemaProperties(schema.items, spec, visited)
  if (schema.properties) {
    const required = new Set(schema.required ?? [])
    return Object.entries(schema.properties).map(([name, prop]) => {
      let type = prop.type
      if (!type && prop.$ref) type = prop.$ref.split('/').pop()
      if (!type && prop.allOf) type = 'object'
      if (!type && prop.items) type = 'array'
      return { name, type: type ?? '?', required: required.has(name), example: propExample(prop, spec) }
    })
  }
  return []
}

// Builds the initial schemaFields map for a route from its response schema.
function initSchemaFields(responseSchema, spec) {
  const fields = {}
  for (const prop of getSchemaProperties(responseSchema, spec)) {
    fields[prop.name] = { included: true, value: prop.example }
  }
  return fields
}

let specIdCounter = 0

export default function MockServerPanel() {
  const [specFiles, setSpecFiles] = useState([])
  const [routeConfigs, setRouteConfigs] = useState(new Map())
  const [globalProxyUrl, setGlobalProxyUrl] = useState('')
  const [configExpanded, setConfigExpanded] = useState(new Set())
  const [servers, setServers] = useState([])
  const [port, setPort] = useState('3001')
  const [parseError, setParseError] = useState(null)
  const [startError, setStartError] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [logsExpanded, setLogsExpanded] = useState(new Set())
  const [serverLogs, setServerLogs] = useState(new Map())
  const fileInputRef = useRef(null)
  const logRefs = useRef({})

  useEffect(() => {
    if (!mockAPI) return
    mockAPI.list().then(list => {
      setServers(prev => {
        const known = new Set(prev.map(s => s.port))
        const orphans = list
          .filter(s => !known.has(s.port))
          .map(s => ({ port: s.port, routes: [], fileName: '(survived reload)' }))
        return [...prev, ...orphans]
      })
    })
  }, [])

  useEffect(() => {
    if (!mockAPI?.onLog) return
    return mockAPI.onLog(({ port, entry }) => {
      setServerLogs(prev => {
        const next = new Map(prev)
        next.set(port, [...(next.get(port) ?? []), entry])
        return next
      })
    })
  }, [])

  useEffect(() => {
    for (const el of Object.values(logRefs.current)) {
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [serverLogs])

  if (!mockAPI) {
    return (
      <div className="mock-server-panel">
        <div className="empty-state">Mock Servers are only available in the Electron app.</div>
      </div>
    )
  }

  // ── Spec loading ────────────────────────────────────────────────────────────

  const handleFile = (e) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setParseError(null)

    for (const file of files) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          let spec
          try { spec = JSON.parse(ev.target.result) } catch { spec = jsYaml.load(ev.target.result) }
          if (!spec?.paths) throw new Error(`No "paths" found in ${file.name}`)
          const routes = extractMockRoutes(spec)
          const basePath = getSpecBasePath(spec)
          const id = ++specIdCounter
          setSpecFiles(prev => [...prev, { id, routes, spec, fileName: file.name, basePath }])
          setRouteConfigs(prev => {
            const next = new Map(prev)
            for (const r of routes) {
              next.set(cfgKey(id, r), {
                ...defaultConfig(),
                mods: {
                  ...defaultConfig().mods,
                  schemaFields: initSchemaFields(r.responseSchema, spec),
                },
              })
            }
            return next
          })
        } catch (err) {
          setParseError(err.message)
        }
      }
      reader.readAsText(file)
    }
    e.target.value = ''
  }

  const handleRemoveSpec = (specId) => {
    const sf = specFiles.find(s => s.id === specId)
    if (!sf) return
    setSpecFiles(prev => prev.filter(s => s.id !== specId))
    setRouteConfigs(prev => {
      const next = new Map(prev)
      for (const r of sf.routes) next.delete(cfgKey(specId, r))
      return next
    })
    setConfigExpanded(prev => {
      const next = new Set(prev)
      for (const r of sf.routes) next.delete(cfgKey(specId, r))
      return next
    })
  }

  // ── Config helpers ──────────────────────────────────────────────────────────

  const updateConfig = (key, patch) => setRouteConfigs(prev => {
    const next = new Map(prev)
    next.set(key, { ...next.get(key), ...patch })
    return next
  })

  const updateMods = (key, modsPatch) => setRouteConfigs(prev => {
    const next = new Map(prev)
    const cur = next.get(key)
    next.set(key, { ...cur, mods: { ...cur.mods, ...modsPatch } })
    return next
  })

  const updateSchemaField = (key, fieldName, patch) => setRouteConfigs(prev => {
    const next = new Map(prev)
    const cur = next.get(key)
    const existing = cur.mods.schemaFields[fieldName] ?? { included: true, value: '' }
    next.set(key, {
      ...cur,
      mods: {
        ...cur.mods,
        schemaFields: { ...cur.mods.schemaFields, [fieldName]: { ...existing, ...patch } },
      },
    })
    return next
  })

  const toggleConfigExpand = key => setConfigExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // ── Start / Stop ────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!specFiles.length) return
    setStartError(null)
    const portNum = parseInt(port)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) { setStartError('Invalid port (1–65535)'); return }
    if (servers.some(s => s.port === portNum)) { setStartError(`Port ${portNum} is already occupied`); return }

    const specs = specFiles.map(sf => sf.spec)
    const routesWithConfig = specFiles.flatMap((sf, specIndex) =>
      sf.routes.map(r => {
        const key = cfgKey(sf.id, r)
        const cfg = routeConfigs.get(key) ?? defaultConfig()
        const schemaProps = getSchemaProperties(r.responseSchema, sf.spec)

        // Derive add/remove from the schema field toggles
        const fixedAdd = []
        const excluded = []
        for (const prop of schemaProps) {
          const state = cfg.mods.schemaFields[prop.name] ?? { included: true, value: prop.example ?? '' }
          if (!state.included) {
            excluded.push(prop.name)
          } else if (state.value !== '') {
            fixedAdd.push({ path: prop.name, value: state.value })
          }
        }

        return {
          ...r,
          specIndex,
          mode: cfg.mode,
          proxyUrl: cfg.proxyUrl,
          mods: {
            add: [...fixedAdd, ...cfg.mods.add],
            remove: [...excluded, ...cfg.mods.remove.filter(p => p.trim())],
          },
        }
      })
    )

    const label = specFiles.map(sf => sf.fileName).join(', ')
    const result = await mockAPI.start(portNum, routesWithConfig, specs, globalProxyUrl)
    if (result.success) {
      setServers(prev => [...prev, { port: portNum, routes: routesWithConfig, fileName: label }])
      setPort(String(portNum + 1))
    } else {
      setStartError(result.error)
    }
  }

  const handleStop = async (portNum) => {
    await mockAPI.stop(portNum)
    setServers(prev => prev.filter(s => s.port !== portNum))
    setExpanded(prev => { const n = new Set(prev); n.delete(portNum); return n })
    setLogsExpanded(prev => { const n = new Set(prev); n.delete(portNum); return n })
    setServerLogs(prev => { const n = new Map(prev); n.delete(portNum); return n })
  }

  const toggleExpand = portNum => setExpanded(prev => {
    const n = new Set(prev)
    n.has(portNum) ? n.delete(portNum) : n.add(portNum)
    return n
  })

  const toggleLogs = portNum => setLogsExpanded(prev => {
    const n = new Set(prev)
    n.has(portNum) ? n.delete(portNum) : n.add(portNum)
    return n
  })

  const totalRoutes = specFiles.reduce((n, sf) => n + sf.routes.length, 0)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mock-server-panel">

      {/* ── Top form ── */}
      <div className="mock-server-form">
        <div className="mock-form-title">New Mock Server</div>

        <div className="spec-file-list">
          {specFiles.map(sf => (
            <div key={sf.id} className="spec-file-item">
              <span className="spec-file-name">{sf.fileName}</span>
              {sf.basePath && <span className="spec-file-basepath">{sf.basePath}</span>}
              <span className="spec-file-routecount">{sf.routes.length} route{sf.routes.length !== 1 ? 's' : ''}</span>
              <button className="spec-remove-btn" onClick={() => handleRemoveSpec(sf.id)} title="Remove spec">×</button>
            </div>
          ))}
          <div className="spec-file-actions">
            <label className="file-label btn-secondary small">
              + Add spec…
              <input type="file" accept=".json,.yaml,.yml" multiple onChange={handleFile} ref={fileInputRef} hidden />
            </label>
            {parseError && <span className="mock-error">{parseError}</span>}
          </div>
        </div>

        {specFiles.length > 0 && (
          <div className="mock-form-row">
            <span className="mock-port-prefix">Proxy base URL</span>
            <input
              className="mock-proxy-url-input"
              type="text"
              placeholder="https://api.example.com  (fallback for all proxy routes)"
              value={globalProxyUrl}
              onChange={e => setGlobalProxyUrl(e.target.value)}
            />
          </div>
        )}

        <div className="mock-form-row">
          <span className="mock-port-prefix">localhost:</span>
          <input
            className="mock-port-input"
            type="number" min="1" max="65535"
            value={port}
            onChange={e => setPort(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
          />
          <button className="btn-primary" onClick={handleStart} disabled={!specFiles.length}>
            Start Server
          </button>
          {specFiles.length > 0 && (
            <span className="mock-route-count">{totalRoutes} route{totalRoutes !== 1 ? 's' : ''} total</span>
          )}
          {startError && <span className="mock-error">{startError}</span>}
        </div>
      </div>

      {/* ── Per-route configuration ── */}
      {specFiles.length > 0 && (
        <div className="route-config-list">
          {specFiles.map(sf => (
            <div key={sf.id} className="route-spec-group">
              <div className="route-group-header">
                <span className="route-group-filename">{sf.fileName}</span>
                {sf.basePath && <span className="route-group-basepath">{sf.basePath}</span>}
              </div>

              {sf.routes.map(route => {
                const key = cfgKey(sf.id, route)
                const cfg = routeConfigs.get(key) ?? defaultConfig()
                const isOpen = configExpanded.has(key)
                const schemaProps = getSchemaProperties(route.responseSchema, sf.spec)

                return (
                  <div key={key} className="route-config-entry">
                    <div className="route-config-row">
                      <span className={`method-badge method-${route.method.toLowerCase()}`}>{route.method}</span>
                      <span className="route-config-path">{route.path}</span>
                      <div className="mode-toggle">
                        <button className={cfg.mode === 'mock' ? 'active' : ''} onClick={() => updateConfig(key, { mode: 'mock' })}>Mock</button>
                        <button className={cfg.mode === 'proxy' ? 'active' : ''} onClick={() => updateConfig(key, { mode: 'proxy' })}>Proxy</button>
                      </div>
                      <button className="route-config-toggle" onClick={() => toggleConfigExpand(key)}>
                        {isOpen ? '▲' : '▼'}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="route-config-panel">

                        {cfg.mode === 'proxy' && (
                          <div className="mods-section">
                            <span className="mods-label">Forward to</span>
                            <input
                              className="mock-proxy-url-input"
                              type="text"
                              placeholder={globalProxyUrl || 'https://api.example.com'}
                              value={cfg.proxyUrl}
                              onChange={e => updateConfig(key, { proxyUrl: e.target.value })}
                            />
                          </div>
                        )}

                        {schemaProps.length > 0 && (
                          <div className="mods-section">
                            <div className="mods-label-row">
                              <span className="mods-label">Response fields</span>
                              <span className="mods-hint">uncheck to exclude · clear value for random</span>
                            </div>
                            <div className="schema-fields-list">
                              {schemaProps.map(prop => {
                                const state = cfg.mods.schemaFields[prop.name]
                                  ?? { included: true, value: prop.example ?? '' }
                                return (
                                  <div key={prop.name} className={`schema-field-row ${!state.included ? 'excluded' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={state.included}
                                      onChange={e => updateSchemaField(key, prop.name, { included: e.target.checked })}
                                    />
                                    <span className="schema-field-name">{prop.name}</span>
                                    <span className="schema-field-type">{prop.type}</span>
                                    <input
                                      type="text"
                                      className="schema-field-value"
                                      placeholder={state.included ? (prop.example ? prop.example : 'random') : '—'}
                                      value={state.value}
                                      disabled={!state.included}
                                      onChange={e => updateSchemaField(key, prop.name, { value: e.target.value })}
                                    />
                                    {prop.required && <span className="schema-field-required">required</span>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mods-section">
                          <span className="mods-label">Add / override fields</span>
                          {cfg.mods.add.map((entry, i) => (
                            <div key={i} className="mod-row">
                              <input className="mod-path-input" placeholder="dot.path" value={entry.path}
                                onChange={e => updateMods(key, { add: cfg.mods.add.map((a, j) => j === i ? { ...a, path: e.target.value } : a) })} />
                              <span className="mod-eq">=</span>
                              <input className="mod-value-input" placeholder='value or "string"' value={entry.value}
                                onChange={e => updateMods(key, { add: cfg.mods.add.map((a, j) => j === i ? { ...a, value: e.target.value } : a) })} />
                              <button className="mod-remove-btn" onClick={() => updateMods(key, { add: cfg.mods.add.filter((_, j) => j !== i) })}>×</button>
                            </div>
                          ))}
                          <button className="mod-add-btn" onClick={() => updateMods(key, { add: [...cfg.mods.add, { path: '', value: '' }] })}>+ Add field</button>
                        </div>

                        <div className="mods-section">
                          <span className="mods-label">Remove nested fields</span>
                          {cfg.mods.remove.map((p, i) => (
                            <div key={i} className="mod-row">
                              <input className="mod-path-input mod-path-full" placeholder="e.g. address.street" value={p}
                                onChange={e => updateMods(key, { remove: cfg.mods.remove.map((r, j) => j === i ? e.target.value : r) })} />
                              <button className="mod-remove-btn" onClick={() => updateMods(key, { remove: cfg.mods.remove.filter((_, j) => j !== i) })}>×</button>
                            </div>
                          ))}
                          <button className="mod-add-btn" onClick={() => updateMods(key, { remove: [...cfg.mods.remove, ''] })}>+ Remove field</button>
                        </div>

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Running servers ── */}
      {servers.length > 0 ? (
        <div className="mock-server-list">
          {servers.map(server => (
            <div key={server.port} className="mock-server-card">
              <div className="mock-server-card-header">
                <span className="mock-status-dot" title="Running" />
                <span className="mock-server-url">localhost:{server.port}</span>
                <span className="mock-server-file">{server.fileName}</span>
                {server.routes.length > 0 && (
                  <button className="mock-routes-toggle" onClick={() => toggleExpand(server.port)}>
                    {server.routes.length} route{server.routes.length !== 1 ? 's' : ''} {expanded.has(server.port) ? '▲' : '▼'}
                  </button>
                )}
                <button className="mock-routes-toggle" onClick={() => toggleLogs(server.port)}>
                  logs {logsExpanded.has(server.port) ? '▲' : '▼'}
                </button>
                <button className="btn-secondary small" onClick={() => handleStop(server.port)}>Stop</button>
              </div>
              {expanded.has(server.port) && (
                <div className="mock-routes-list">
                  {server.routes.map((route, i) => (
                    <div key={i} className="mock-route-item">
                      <span className={`method-badge method-${route.method.toLowerCase()}`}>{route.method}</span>
                      <span className="mock-route-path">{route.path}</span>
                      <span className="mock-route-status">{route.responseStatus}</span>
                      <span className={route.mode === 'proxy' ? 'proxy-mode-badge' : 'mock-mode-badge'}>
                        {route.mode === 'proxy' ? 'PROXY' : 'MOCK'}
                      </span>
                      {route.summary && <span className="mock-route-summary">{route.summary}</span>}
                    </div>
                  ))}
                </div>
              )}
              {logsExpanded.has(server.port) && (() => {
                const logs = serverLogs.get(server.port) ?? []
                return (
                  <div className="mock-server-logs">
                    <div className="mock-logs-toolbar">
                      <span className="mock-logs-title">Request log</span>
                      <button className="mock-logs-clear" onClick={() =>
                        setServerLogs(prev => { const n = new Map(prev); n.set(server.port, []); return n })
                      }>Clear</button>
                    </div>
                    <div className="mock-logs-list" ref={el => { logRefs.current[server.port] = el }}>
                      {logs.length === 0
                        ? <span className="mock-logs-empty">No requests yet.</span>
                        : logs.map((entry, i) => {
                            const t = new Date(entry.ts)
                            const ts = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`
                            const statusClass = !entry.status ? '' : entry.status < 300 ? 'log-status-ok' : entry.status < 500 ? 'log-status-warn' : 'log-status-err'
                            return (
                              <div key={i} className="mock-log-entry">
                                <span className="log-ts">{ts}</span>
                                <span className={`method-badge method-${(entry.method ?? '').toLowerCase()}`}>{entry.method}</span>
                                <span className="log-path">{entry.path}</span>
                                {entry.status && <span className={`log-status ${statusClass}`}>{entry.status}</span>}
                                <span className="log-label">{entry.label}</span>
                              </div>
                            )
                          })
                      }
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      ) : !specFiles.length && (
        <div className="mock-empty-hint">No servers running — add a spec and start one.</div>
      )}

    </div>
  )
}
