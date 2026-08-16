// Persistent session-delete plugin - Host half.
// 1) Slash-command 汉化: translates the descriptions of /plan /compact /goal
//    /feedback /export /permission for the browser command menu.
// 2) POST /session-delete/delete: permanently delete one session's log
//    directory. The sidebar "永久删除会话" menu action calls this route.
//    Only cold sessions can be deleted: an attached (open/running) session is
//    refused. After the directory is removed, a `session/disposed` event is
//    emitted so every connected client drops the session from its lists; the
//    search index and workspace accounting reconcile themselves from the
//    persistence listing.

import { rmSync } from 'node:fs'
import { dirname } from 'node:path'

export const name = 'session-delete'

// Required services: webServer must be registered before this plugin applies,
// otherwise ctx.get('webServer') is undefined and the delete route is never
// mounted (the browser then hits the SPA fallback, which 405s non-GET/HEAD).
export const inject = ['webServer']

const SESSION_ID_RE = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
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

export function apply(ctx) {
  const ZH = {
    plan: '进入或退出计划模式',
    compact: '压缩较早的对话历史',
    goal: '设置或查看长期任务的目标',
    feedback: '记录对本会话的反馈',
    export: '将会话日志下载为 ZIP 压缩包',
    permission: '切换权限预设（沙箱模式与审批策略）',
  }

  const commands = ctx.get('commands')
  if (commands !== void 0 && typeof commands.list === 'function') {
    const originalList = commands.list
    const wrapped = function (agent) {
      const list = originalList.call(this, agent)
      return list.map((descriptor) => {
        const zh = ZH[descriptor.name]
        if (zh === void 0 || zh === descriptor.description) return descriptor
        return {
          name: descriptor.name,
          description: zh,
          ...(descriptor.input !== void 0 ? { input: descriptor.input } : {}),
        }
      })
    }

    ctx.effect(() => {
      commands.list = wrapped
      return () => {
        if (commands.list === wrapped) commands.list = originalList
      }
    }, 'session-delete: translate command descriptions')

    if (typeof commands.notifyChange === 'function') commands.notifyChange()
  }

  const webServer = ctx.get('webServer')
  if (webServer === void 0 || typeof webServer.register !== 'function') return

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/session-delete/delete',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, { ok: false, error: 'method not allowed' }, 405)
        return
      }
      const body = await readJsonBody(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!SESSION_ID_RE.test(sessionId)) {
        sendJson(res, { ok: false, error: '无效的会话 ID' })
        return
      }
      try {
        const sessions = ctx.get('sessions')
        if (sessions !== void 0 && sessions.get(sessionId) !== void 0) {
          sendJson(res, { ok: false, error: '该会话正在运行或已打开，无法删除' })
          return
        }
        const persistence = ctx.get('sessionPersistence')
        if (persistence === void 0 || typeof persistence.list !== 'function' || typeof persistence.locate !== 'function') {
          sendJson(res, { ok: false, error: '会话存储服务不可用' })
          return
        }
        const metas = await persistence.list()
        const meta = metas.find((m) => m.id === sessionId)
        if (meta === void 0) {
          sendJson(res, { ok: false, error: '会话不存在' })
          return
        }
        const loc = persistence.locate(meta)
        if (loc === void 0 || typeof loc.path !== 'string') {
          sendJson(res, { ok: false, error: '无法定位会话日志' })
          return
        }
        const dir = dirname(loc.path)
        rmSync(dir, { recursive: true, force: true })
        // Tell connected clients to drop this session from their lists.
        ctx.emit('session/disposed', { id: sessionId })
        sendJson(res, { ok: true, message: '会话已永久删除' })
      } catch (error) {
        console.error('session-delete: delete failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
      }
    },
  }), 'session-delete: delete route')
}
