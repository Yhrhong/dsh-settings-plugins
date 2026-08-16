// Persistent MCP Servers settings page — Client half.
// Card-style two-column grid layout (dark theme): each MCP server is a card
// with status dot + name, config meta, and tool chips; remove per card,
// "Add Server" in the header. Talks to the Host half via /mcps/* routes.

window.__ModuleLoader__.load({
  id: 'mcps-settings',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let react = require('react')

    const name = 'mcps-settings'
    const inject = ['slots', 'timer']

    const css =
      '.mcps-wrap{background:#2e2e30;border:1px solid #3a3a3d;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}' +
      '.mcps-head{display:flex;align-items:center;gap:10px}' +
      '.mcps-title{font-size:14px;font-weight:600;color:#e8e8e8}' +
      '.mcps-count{font-size:12px;color:#9a9a9e}' +
      '.mcps-spacer{flex:1}' +
      '.mcps-btn{background:transparent;border:1px solid #4a4a4e;color:#d4d4d8;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer}' +
      '.mcps-btn:hover{border-color:#6b6b70;color:#fff}' +
      '.mcps-btn.primary{background:#3f3f46;border-color:#3f3f46;color:#fff}' +
      '.mcps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
      '.mcps-card{display:flex;flex-direction:column;gap:8px;background:#262628;border:1px solid #3a3a3d;border-radius:10px;padding:12px 14px;transition:border-color .15s}' +
      '.mcps-card:hover{border-color:#6b6b70}' +
      '.mcps-card-top{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.mcps-dot{width:8px;height:8px;border-radius:50%;flex:none}' +
      '.mcps-dot.on{background:#3fb950}' +
      '.mcps-dot.off{background:#9a9a9e}' +
      '.mcps-dot.stopped{background:#5a5a5f}' +
      '.mcps-name{font-size:13px;color:#e8e8e8;font-weight:600;font-family:ui-monospace,Consolas,monospace;word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.mcps-status{font-size:11px;color:#9a9a9e;flex:none}' +
      '.mcps-remove{background:transparent;border:none;color:#9a9a9e;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:6px;flex:none}' +
      '.mcps-remove:hover{color:#f87171;background:#3a3a3d}' +
      '.mcps-switch{position:relative;width:34px;height:20px;border-radius:10px;background:#4a4a4e;border:1px solid #3a3a3d;cursor:pointer;transition:background .15s;flex:none;padding:0}' +
      '.mcps-switch.on{background:#3fb950}' +
      '.mcps-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s;pointer-events:none}' +
      '.mcps-switch.on .mcps-switch-knob{transform:translateX(14px)}' +
      '.mcps-meta{margin:0;font-size:11px;color:#9a9a9e;background:#1f1f21;border:1px solid #3a3a3d;border-radius:6px;padding:6px 8px;word-break:break-all;font-family:ui-monospace,Consolas,monospace}' +
      '.mcps-tools{display:flex;flex-wrap:wrap;gap:4px}' +
      '.mcps-chip{font-size:11px;border:1px solid #3a3a3d;border-radius:5px;padding:1px 6px;color:#b8b8bd;background:#1f1f21}' +
      '.mcps-chevron{font-size:10px;color:#9a9a9e;transition:transform .15s;flex:none}' +
      '.mcps-chevron.open{transform:rotate(90deg)}' +
      '.mcps-detail{display:flex;flex-direction:column;gap:8px;border-top:1px solid #3a3a3d;padding-top:8px}' +
      '.mcps-note{font-size:12px;color:#9a9a9e}' +
      '.mcps-error{font-size:12px;color:#f87171}' +
      '.mcps-form{display:flex;flex-direction:column;gap:8px;border:1px solid #3a3a3d;border-radius:8px;padding:12px;background:#262628}' +
      '.mcps-form label{font-size:12px;color:#9a9a9e;display:flex;flex-direction:column;gap:4px}' +
      '.mcps-form input,.mcps-form select,.mcps-form textarea{background:#1f1f21;border:1px solid #3a3a3d;color:#e8e8e8;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}' +
      '.mcps-form textarea{font-family:ui-monospace,Consolas,monospace;resize:vertical;min-height:44px}'

    const tagId = 'mcps-settings/section.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function rpc(path, body) {
      const init = body === undefined
        ? undefined
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      return fetch(path, init).then((r) => r.json())
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      function McpServersPage() {
        const [state, setState] = react.useState({ loading: true, servers: [], error: '', fileError: '', message: '', path: '' })
        const [adding, setAdding] = react.useState(false)
        const [form, setForm] = react.useState({ transport: 'stdio', serverName: '', command: '', args: '', url: '', env: '', headers: '' })
        const [expanded, setExpanded] = react.useState({})
        const toggleExpand = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

        // silent: background auto-refresh — no loading indicator, no layout
        // shift; only the data actually updates. The loading note is reserved
        // for the first paint (loading && no servers yet).
        const refresh = (silent) => {
          if (!silent) setState((prev) => ({ ...prev, loading: true, error: '' }))
          rpc('/mcps/list').then((r) => {
            setState((prev) => ({
              ...prev,
              loading: false,
              servers: r.servers || [],
              error: '',
              fileError: r.fileError || '',
              path: r.path || '',
            }))
          }).catch((err) => setState((prev) => ({ ...prev, loading: false, error: String(err && err.message ? err.message : err) })))
        }

        react.useEffect(() => { refresh(false) }, [])
        react.useEffect(() => ctx.interval(() => refresh(true), 5000), [])

        const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

        const submit = () => {
          setState((prev) => ({ ...prev, message: '', error: '' }))
          rpc('/mcps/add', { serverName: form.serverName, transport: form.transport, id: '', command: form.command, args: form.args, url: form.url, env: form.env, headers: form.headers })
            .then((r) => {
              if (r.ok) {
                setForm((f) => ({ ...f, serverName: '', command: '', args: '', url: '', env: '', headers: '' }))
                setAdding(false)
                setState((prev) => ({ ...prev, message: r.message || 'ok' }))
                refresh()
              } else {
                setState((prev) => ({ ...prev, error: r.error || '添加失败' }))
              }
            })
            .catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const remove = (id) => {
          setState((prev) => ({ ...prev, error: '', message: '' }))
          rpc('/mcps/remove', { id })
            .then((r) => {
              if (r.ok) { setState((prev) => ({ ...prev, message: r.message || '已移除' })); refresh() }
              else setState((prev) => ({ ...prev, error: r.error || '移除失败' }))
            })
            .catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const startStop = (s) => {
          setState((prev) => ({ ...prev, error: '', message: '' }))
          rpc('/mcps/toggle', { id: s.id, enabled: !s.enabled })
            .then((r) => {
              if (r.ok) { setState((prev) => ({ ...prev, message: r.message || 'ok' })); refresh() }
              else setState((prev) => ({ ...prev, error: r.error || '操作失败' }))
            })
            .catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const formEl = react.createElement('div', { className: 'mcps-form' }, [
          react.createElement('label', { key: 'sn' }, '服务器名称 (serverName)',
            react.createElement('input', { value: form.serverName, onChange: set('serverName'), placeholder: 'filesystem' })),
          react.createElement('label', { key: 'tr' }, '传输方式',
            react.createElement('select', { value: form.transport, onChange: set('transport') }, [
              react.createElement('option', { value: 'stdio', key: 's' }, 'stdio (本地命令)'),
              react.createElement('option', { value: 'streamable-http', key: 'h' }, 'streamable-http (远程 URL)'),
            ])),
          form.transport === 'stdio'
            ? [
                react.createElement('label', { key: 'cmd' }, 'command', react.createElement('input', { value: form.command, onChange: set('command'), placeholder: 'npx' })),
                react.createElement('label', { key: 'args' }, 'args (每行一个参数)', react.createElement('textarea', { value: form.args, onChange: set('args'), placeholder: '-y\n@modelcontextprotocol/server-filesystem\nD:\\path\\to\\workspace' })),
                react.createElement('label', { key: 'env' }, 'env (KEY=VALUE,每行一个)', react.createElement('textarea', { value: form.env, onChange: set('env'), placeholder: 'TOKEN=xxx' })),
              ]
            : [
                react.createElement('label', { key: 'url' }, 'URL', react.createElement('input', { value: form.url, onChange: set('url'), placeholder: 'http://localhost:3000/mcp' })),
                react.createElement('label', { key: 'hdr' }, 'headers (Name: Value,每行一个)', react.createElement('textarea', { value: form.headers, onChange: set('headers'), placeholder: 'Authorization: Bearer xxx' })),
              ],
          react.createElement('button', { className: 'mcps-btn primary', key: 'go', onClick: submit }, '添加'),
        ])

        const card = (s) => {
          const open = !!expanded[s.serverName]
          const dotCls = s.status === 'connected' ? 'on' : s.status === 'stopped' ? 'stopped' : 'off'
          const statusText = s.status === 'connected'
            ? '已启动 · ' + s.toolCount + ' 工具'
            : s.status === 'stopped' ? '已停止' : '未连接'
          return react.createElement('div', { className: 'mcps-card', key: s.serverName }, [
            react.createElement('div', {
              className: 'mcps-card-top',
              key: 'top',
              onClick: () => toggleExpand(s.serverName),
              style: { cursor: 'pointer' },
            }, [
              react.createElement('span', { className: 'mcps-dot ' + dotCls, key: 'dot' }),
              react.createElement('span', { className: 'mcps-name', title: s.serverName, key: 'name' }, s.serverName),
              react.createElement('div', { className: 'mcps-spacer', key: 'sp' }),
              react.createElement('span', { className: 'mcps-chevron' + (open ? ' open' : ''), key: 'chev' }, '▸'),
            ]),
            open ? react.createElement('div', { className: 'mcps-detail', key: 'detail' }, [
              react.createElement('div', { className: 'mcps-status', key: 'status' }, statusText),
              react.createElement('div', { className: 'mcps-meta', key: 'meta' },
                'transport: ' + (s.transport || '—') +
                (s.command ? ' | command: ' + s.command : '') +
                (s.url ? ' | url: ' + s.url : '') +
                (s.id ? ' | id: ' + s.id : '')),
              (s.tools && s.tools.length)
                ? react.createElement('div', { className: 'mcps-tools', key: 'tools' }, s.tools.map((t) => react.createElement('span', { className: 'mcps-chip', key: t }, t)))
                : null,
              s.id
                ? react.createElement('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
                    react.createElement('button', {
                      className: 'mcps-switch' + (s.enabled ? ' on' : ''),
                      onClick: () => startStop(s),
                      'aria-pressed': !!s.enabled,
                      key: 'sw',
                    }, react.createElement('span', { className: 'mcps-switch-knob' })),
                    react.createElement('span', { className: 'mcps-status', key: 'swlabel' }, s.enabled ? '启用' : '禁用'),
                    react.createElement('div', { className: 'mcps-spacer', key: 'sp' }),
                    react.createElement('button', { className: 'mcps-remove', onClick: () => remove(s.id), key: 'rm' }, '移除'),
                  ])
                : null,
            ]) : null,
          ])
        }

        const servers = state.servers || []
        return react.createElement('div', { className: 'mcps-wrap' }, [
          react.createElement('div', { className: 'mcps-head', key: 'head' }, [
            react.createElement('span', { className: 'mcps-title' }, 'MCP 管理'),
            react.createElement('span', { className: 'mcps-count' }, '共 ' + servers.length + ' 个'),
            react.createElement('div', { className: 'mcps-spacer' }),
            react.createElement('button', { className: 'mcps-btn', onClick: refresh, key: 'refresh' }, '刷新'),
            react.createElement('button', { className: 'mcps-btn primary', onClick: () => setAdding((v) => !v), key: 'add' }, adding ? '取消' : '添加'),
          ]),
          state.message ? react.createElement('div', { className: 'mcps-note', key: 'msg' }, state.message) : null,
          state.error ? react.createElement('div', { className: 'mcps-error', key: 'err' }, state.error) : null,
          state.fileError ? react.createElement('div', { className: 'mcps-error', key: 'ferr' }, '配置文件读取失败: ' + state.fileError) : null,
          adding ? formEl : null,
          state.loading && servers.length === 0 ? react.createElement('div', { className: 'mcps-note', key: 'load' }, '加载中…') : null,
          !state.loading && servers.length === 0
            ? react.createElement('div', { className: 'mcps-note', key: 'empty' }, '还没有配置 MCP 服务器,点击「添加」创建。')
            : null,
          react.createElement('div', { className: 'mcps-grid', key: 'grid' }, servers.map(card)),
          react.createElement('div', { className: 'mcps-note', key: 'hint' }, '修改会写入 ' + (state.path || 'cordis.patch.yml') + ' ,重启 dsh 后生效。'),
        ])
      }

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'mcp-servers', order: 18, label: 'MCP 管理' },
        (props) => react.createElement(McpServersPage),
      ))
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
