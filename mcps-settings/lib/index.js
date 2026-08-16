// Persistent MCP Servers settings page — Host half.
// Serves /mcps/list, /mcps/add, /mcps/remove, /mcps/toggle over the webserver:
// live server status comes from the tools registry, configured rows come
// from (and are written back to) the profile patch file, and start/stop
// drives the Loader entries at runtime.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'mcps-settings'

export const inject = ['webServer', 'loader']

// DSH home resolution mirrors @deepseek-ai/dsh-home-paths: $DSH_HOME wins,
// otherwise the user's home directory (~/.dsh on all platforms).
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

// This deployment's profile patch layer — the file this page manages.
const PATCH_PATH = join(DSH_HOME, 'profiles', 'web', 'cordis.patch.yml')
const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client'

// Quote YAML scalars conservatively: bare only when the value starts with
// an alphanumeric/underscore and contains no spaces or indicator chars.
function scalar(value) {
  const s = String(value)
  if (/^[A-Za-z0-9_][A-Za-z0-9_./:@+\-]*$/.test(s)) return s
  return "'" + s.replace(/'/g, "''") + "'"
}

function unquote(value) {
  const s = String(value).trim()
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'")
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1)
  return s
}

// Live MCP servers derived from the tools registry (mcp__<server>__<tool>).
function liveServers(ctx) {
  const map = new Map()
  try {
    const tools = ctx.get('tools')
    if (tools !== undefined && typeof tools.schemas === 'function') {
      const schemas = tools.schemas() || []
      for (const schema of schemas) {
        const toolName = schema && typeof schema.name === 'string' ? schema.name : ''
        if (!toolName.startsWith('mcp__')) continue
        const rest = toolName.slice(5)
        const sep = rest.indexOf('__')
        if (sep <= 0) continue
        const server = rest.slice(0, sep)
        const tool = rest.slice(sep + 2)
        let entry = map.get(server)
        if (!entry) { entry = { serverName: server, tools: [] }; map.set(server, entry) }
        entry.tools.push(tool)
      }
    }
  } catch (error) {
    console.error('mcps: liveServers failed', error)
  }
  const out = []
  for (const entry of map.values()) {
    out.push({ serverName: entry.serverName, toolCount: entry.tools.length, tools: entry.tools.slice(0, 20) })
  }
  return out
}

async function readPatchText(ctx) {
  const fs = ctx.get('fs')
  if (fs === undefined) throw new Error('fs service unavailable')
  const target = await fs.resolve(PATCH_PATH)
  return await fs.readText(target)
}

async function writePatchText(ctx, text) {
  const fs = ctx.get('fs')
  if (fs === undefined) throw new Error('fs service unavailable')
  const target = await fs.resolve(PATCH_PATH)
  await fs.writeText(target, text)
}

// Line-based scan of the patch file for mcp rows (best-effort, leaf scalars only).
function parseConfigured(text) {
  const rows = []
  const lines = String(text).split(/\r?\n/)
  let current = null
  for (const line of lines) {
    const start = line.match(/^ {4}- id: (\S+)/)
    if (start) {
      if (current) rows.push(current)
      current = { id: start[1], serverName: '', transport: '', command: '', url: '' }
      continue
    }
    if (!current) continue
    if (!/^( {4,}|\s*$|#)/.test(line)) { rows.push(current); current = null; continue }
    const kv = line.match(/^ {6,}(serverName|transport|command|url):\s*(.*)$/)
    if (kv) current[kv[1]] = unquote(kv[2])
  }
  if (current) rows.push(current)
  return rows.filter((row) => row.id.startsWith('mcp-'))
}

// Runtime enablement of a configured row, read from the live Loader entries.
function entryDisabled(ctx, rowId) {
  try {
    for (const entry of ctx.loader.entries()) {
      if (entry.options.id === rowId) return !!entry.disabled
    }
  } catch (error) {
    console.error('mcps: loader entries failed', error)
  }
  return false
}

function buildView(ctx, configuredRows) {
  const live = liveServers(ctx)
  const liveByName = new Map(live.map((s) => [s.serverName, s]))
  const servers = configuredRows.map((row) => {
    const l = liveByName.get(row.serverName)
    const stopped = entryDisabled(ctx, row.id)
    return {
      id: row.id,
      serverName: row.serverName || row.id,
      transport: row.transport,
      command: row.command,
      url: row.url,
      enabled: !stopped,
      status: stopped ? 'stopped' : l ? 'connected' : 'idle',
      toolCount: l ? l.toolCount : 0,
      tools: l ? l.tools : [],
    }
  })
  for (const l of live) {
    if (!configuredRows.some((r) => r.serverName === l.serverName)) {
      servers.push({ id: '', serverName: l.serverName, transport: '', command: '', url: '', enabled: true, status: 'connected', toolCount: l.toolCount, tools: l.tools })
    }
  }
  return servers
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

export function apply(ctx) {
  const register = (path, handler) => {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), 'mcps:' + path)
  }

  register('/mcps/list', (req, res) => {
    if (req.method !== 'GET') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    let configuredRows = []
    let fileError = null
    readPatchText(ctx)
      .then((text) => { configuredRows = parseConfigured(text) })
      .catch((error) => { fileError = error && error.message ? error.message : String(error) })
      .finally(() => {
        sendJson(res, { servers: buildView(ctx, configuredRows), path: PATCH_PATH, fileError })
      })
  })

  register('/mcps/add', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then((a) => {
      const serverName = String(a.serverName || '').trim()
      const transport = a.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
        sendJson(res, { ok: false, error: 'serverName 必须是 1-32 位字母、数字、下划线或连字符' })
        return
      }
      let id = String(a.id || '').trim()
      if (!/^[A-Za-z0-9_-]+$/.test(id)) id = 'mcp-' + serverName
      const lines = []
      lines.push('- insert:')
      lines.push('    - id: ' + id)
      lines.push("      name: '" + MCP_PACKAGE + "'")
      lines.push('      config:')
      lines.push('        serverName: ' + scalar(serverName))
      lines.push('        transport: ' + transport)
      if (transport === 'stdio') {
        const command = String(a.command || '').trim()
        if (!command) { sendJson(res, { ok: false, error: 'stdio 传输必须填写 command' }); return }
        lines.push('        command: ' + scalar(command))
        const argLines = String(a.args || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        if (argLines.length) {
          lines.push('        args:')
          for (const arg of argLines) lines.push('          - ' + scalar(arg))
        }
        const envLines = String(a.env || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        if (envLines.length) {
          lines.push('        env:')
          for (const pair of envLines) {
            const eq = pair.indexOf('=')
            if (eq > 0) lines.push('          ' + scalar(pair.slice(0, eq)) + ': ' + scalar(pair.slice(eq + 1)))
          }
        }
      } else {
        const url = String(a.url || '').trim()
        if (!/^https?:\/\//i.test(url)) { sendJson(res, { ok: false, error: 'streamable-http 传输必须填写 http(s) URL' }); return }
        lines.push('        url: ' + scalar(url))
        const headerLines = String(a.headers || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        if (headerLines.length) {
          lines.push('        headers:')
          for (const pair of headerLines) {
            const colon = pair.indexOf(':')
            if (colon > 0) lines.push('          ' + scalar(pair.slice(0, colon).trim()) + ': ' + scalar(pair.slice(colon + 1).trim()))
          }
        }
      }
      lines.push('        failOnStartupError: false')
      const block = '\n' + lines.join('\n') + '\n'
      readPatchText(ctx)
        .then((text) => writePatchText(ctx, String(text).replace(/\s+$/, '') + block))
        .then(() => sendJson(res, { ok: true, message: '已添加 MCP Server "' + serverName + '",重启后生效' }))
        .catch((error) => {
          console.error('mcps/add failed', error)
          sendJson(res, { ok: false, error: (error && error.message) || String(error) })
        })
    })
  })

  register('/mcps/remove', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then((a) => {
      const id = typeof a.id === 'string' ? a.id : ''
      if (!/^mcp-[A-Za-z0-9_-]+$/.test(id)) { sendJson(res, { ok: false, error: '无效的服务器 id' }); return }
      readPatchText(ctx)
        .then((text) => {
          const lines = String(text).split(/\r?\n/)
          const result = []
          let skipping = false
          let removed = false
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const start = line.match(/^ {4}- id: (\S+)/)
            if (skipping) {
              if (start || /^- /.test(line) || (/^\S/.test(line) && !/^ /.test(line)) || (line.trim() !== '' && !/^ {4,}/.test(line))) {
                skipping = false
              } else {
                continue
              }
            }
            if (start) {
              if (start[1] === id) { skipping = true; removed = true; continue }
            }
            result.push(line)
          }
          if (!removed) { sendJson(res, { ok: false, error: '未找到 id=' + id }); return }
          // Drop a now-empty insert header ("- insert:" with no indented rows left).
          const cleaned = []
          for (let i = 0; i < result.length; i++) {
            const line = result[i]
            const isInsert = /^- insert:\s*$/.test(line)
            if (isInsert) {
              const next = result.slice(i + 1).find((l) => l.trim() !== '')
              if (next === undefined || !/^ {4}/.test(next)) continue
            }
            cleaned.push(line)
          }
          return writePatchText(ctx, cleaned.join('\n').replace(/\n{3,}/g, '\n\n'))
        })
        .then(() => sendJson(res, { ok: true, message: '已移除 ' + id + ',重启后生效' }))
        .catch((error) => {
          console.error('mcps/remove failed', error)
          sendJson(res, { ok: false, error: (error && error.message) || String(error) })
        })
    })
  })

  register('/mcps/toggle', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then((a) => {
      const id = typeof a.id === 'string' ? a.id : ''
      if (!/^mcp-[A-Za-z0-9_-]+$/.test(id)) { sendJson(res, { ok: false, error: '无效的服务器 id' }); return }
      const want = typeof a.enabled === 'boolean' ? a.enabled : undefined
      let entry = null
      try {
        for (const e of ctx.loader.entries()) {
          if (e.options.id === id) { entry = e; break }
        }
      } catch (error) {
        console.error('mcps/toggle entries failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
        return
      }
      if (!entry) { sendJson(res, { ok: false, error: '未找到配置行 ' + id }); return }
      const next = want !== undefined ? want : !!entry.disabled
      entry.update({ disabled: !next }).then(() => {
        sendJson(res, { ok: true, enabled: next, message: (next ? '已启动 ' : '已停止 ') + id })
      }).catch((error) => {
        console.error('mcps/toggle failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
      })
    })
  })
}
