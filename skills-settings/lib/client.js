// Persistent Skills settings page — Client half.
// Card-style two-column grid layout (dark theme), same look as the MCP
// management page: each skill is a card with invocation dot + name,
// description, meta chips, a 使用/禁止 switch, and (for user-added skills) a
// remove action; the header adds new skills. Talks to the Host half via
// /skills/list, /skills/toggle, /skills/add and /skills/remove.

window.__ModuleLoader__.load({
  id: 'skills-settings',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let react = require('react')

    const name = 'skills-settings'
    const inject = ['slots', 'timer']

    const css =
      '.sk-wrap{background:#2e2e30;border:1px solid #3a3a3d;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}' +
      '.sk-head{display:flex;align-items:center;gap:10px}' +
      '.sk-title{font-size:14px;font-weight:600;color:#e8e8e8}' +
      '.sk-count{font-size:12px;color:#9a9a9e}' +
      '.sk-spacer{flex:1}' +
      '.sk-btn{background:transparent;border:1px solid #4a4a4e;color:#d4d4d8;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer}' +
      '.sk-btn:hover{border-color:#6b6b70;color:#fff}' +
      '.sk-btn.primary{background:#3f3f46;border-color:#3f3f46;color:#fff}' +
      '.sk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
      '.sk-card{display:flex;flex-direction:column;gap:8px;background:#262628;border:1px solid #3a3a3d;border-radius:10px;padding:12px 14px;transition:border-color .15s}' +
      '.sk-card:hover{border-color:#6b6b70}' +
      '.sk-card.disabled{opacity:.72}' +
      '.sk-card-top{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.sk-dot{width:8px;height:8px;border-radius:50%;flex:none}' +
      '.sk-dot.on{background:#3fb950}' +
      '.sk-dot.off{background:#9a9a9e}' +
      '.sk-dot.disabled{background:#5a5a5f}' +
      '.sk-name{font-size:13px;color:#e8e8e8;font-weight:600;font-family:ui-monospace,Consolas,monospace;word-break:break-all;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sk-switch{position:relative;width:34px;height:20px;border-radius:10px;background:#4a4a4e;border:1px solid #3a3a3d;cursor:pointer;transition:background .15s;flex:none;padding:0}' +
      '.sk-switch.on{background:#3fb950}' +
      '.sk-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s;pointer-events:none}' +
      '.sk-switch.on .sk-switch-knob{transform:translateX(14px)}' +
      '.sk-desc{font-size:12px;color:#b8b8bd;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
      '.sk-chips{display:flex;flex-wrap:wrap;gap:4px}' +
      '.sk-chip{font-size:11px;border:1px solid #3a3a3d;border-radius:5px;padding:1px 6px;color:#b8b8bd;background:#1f1f21}' +
      '.sk-chip.muted{color:#6b6b70}' +
      '.sk-chip.warn{border-color:#7a4a3a;color:#f0a080;background:#2a1f1b}' +
      '.sk-chip.user{border-color:#3a5a7a;color:#a0c8f0;background:#1b2630}' +
      '.sk-chevron{font-size:10px;color:#9a9a9e;transition:transform .15s;flex:none}' +
      '.sk-chevron.open{transform:rotate(90deg)}' +
      '.sk-detail{display:flex;flex-direction:column;gap:8px;border-top:1px solid #3a3a3d;padding-top:8px}' +
      '.sk-when{font-size:12px;color:#9a9a9e;word-break:break-all}' +
      '.sk-meta{margin:0;font-size:11px;color:#9a9a9e;background:#1f1f21;border:1px solid #3a3a3d;border-radius:6px;padding:6px 8px;word-break:break-all;font-family:ui-monospace,Consolas,monospace}' +
      '.sk-remove{background:transparent;border:none;color:#9a9a9e;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:6px;flex:none}' +
      '.sk-remove:hover{color:#f87171;background:#3a3a3d}' +
      '.sk-form{display:flex;flex-direction:column;gap:8px;border:1px solid #3a3a3d;border-radius:8px;padding:12px;background:#262628}' +
      '.sk-form label{font-size:12px;color:#9a9a9e;display:flex;flex-direction:column;gap:4px}' +
      '.sk-form input,.sk-form textarea{background:#1f1f21;border:1px solid #3a3a3d;color:#e8e8e8;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}' +
      '.sk-form textarea{font-family:ui-monospace,Consolas,monospace;resize:vertical;min-height:64px}' +
      '.sk-note{font-size:12px;color:#9a9a9e}' +
      '.sk-error{font-size:12px;color:#f87171}'

    const tagId = 'skills-settings/section.css'
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

      function SkillsPage() {
        const [state, setState] = react.useState({ loading: true, skills: [], error: '', message: '' })
        const [expanded, setExpanded] = react.useState({})
        const [adding, setAdding] = react.useState(false)
        const [form, setForm] = react.useState({ name: '', description: '', whenToUse: '', content: '' })
        const toggleExpand = (skillName) => setExpanded((prev) => ({ ...prev, [skillName]: !prev[skillName] }))

        // silent: background auto-refresh — no loading indicator, no layout
        // shift; only the data actually updates. The loading note is reserved
        // for the first paint (loading && no skills yet).
        const refresh = (silent) => {
          if (!silent) setState((prev) => ({ ...prev, loading: true, error: '' }))
          rpc('/skills/list').then((r) => {
            setState((prev) => ({
              ...prev,
              loading: false,
              skills: r.skills || [],
              error: r.ok ? '' : (r.error || '加载失败'),
            }))
          }).catch((err) => setState((prev) => ({ ...prev, loading: false, error: String(err && err.message ? err.message : err) })))
        }

        react.useEffect(() => { refresh(false) }, [])
        react.useEffect(() => ctx.interval(() => refresh(true), 5000), [])

        const toggle = (s) => {
          const next = !s.disabled
          setState((prev) => ({ ...prev, error: '', message: '' }))
          rpc('/skills/toggle', { name: s.name, disabled: next }).then((r) => {
            if (r.ok) { setState((prev) => ({ ...prev, message: r.message || 'ok' })); refresh(false) }
            else setState((prev) => ({ ...prev, error: r.error || '操作失败' }))
          }).catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const remove = (s) => {
          if (typeof window !== 'undefined' && window.confirm && !window.confirm('确认删除技能 "' + s.name + '"?')) return
          setState((prev) => ({ ...prev, error: '', message: '' }))
          rpc('/skills/remove', { name: s.name }).then((r) => {
            if (r.ok) { setState((prev) => ({ ...prev, message: r.message || '已删除' })); refresh(false) }
            else setState((prev) => ({ ...prev, error: r.error || '删除失败' }))
          }).catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

        const submitAdd = () => {
          setState((prev) => ({ ...prev, message: '', error: '' }))
          rpc('/skills/add', {
            name: form.name,
            description: form.description,
            whenToUse: form.whenToUse,
            content: form.content,
          }).then((r) => {
            if (r.ok) {
              setForm((f) => ({ ...f, name: '', description: '', whenToUse: '', content: '' }))
              setAdding(false)
              setState((prev) => ({ ...prev, message: r.message || '已添加' }))
              refresh(false)
            } else {
              setState((prev) => ({ ...prev, error: r.error || '添加失败' }))
            }
          }).catch((err) => setState((prev) => ({ ...prev, error: String(err && err.message ? err.message : err) })))
        }

        const formEl = react.createElement('div', { className: 'sk-form' }, [
          react.createElement('label', { key: 'n' }, '技能名称 (kebab-case,如 my-skill)',
            react.createElement('input', { value: form.name, onChange: set('name'), placeholder: 'my-skill' })),
          react.createElement('label', { key: 'd' }, '描述 (模型看到的简介)',
            react.createElement('textarea', { value: form.description, onChange: set('description'), placeholder: 'Use when ...' })),
          react.createElement('label', { key: 'w' }, 'whenToUse (可选)',
            react.createElement('input', { value: form.whenToUse, onChange: set('whenToUse'), placeholder: 'Use when the task ...' })),
          react.createElement('label', { key: 'c' }, '内容 (模型将遵循的 Markdown 说明)',
            react.createElement('textarea', { value: form.content, onChange: set('content'), placeholder: '# Title\n\nStep-by-step instructions...' })),
          react.createElement('div', { key: 'row', style: { display: 'flex', gap: 8 } }, [
            react.createElement('button', { className: 'sk-btn primary', onClick: submitAdd, key: 'go' }, '创建'),
            react.createElement('button', { className: 'sk-btn', onClick: () => setAdding(false), key: 'cancel' }, '取消'),
          ]),
        ])

        const card = (s) => {
          const open = !!expanded[s.name]
          const dotCls = s.disabled ? 'disabled' : (s.modelInvocable ? 'on' : 'off')
          const dotTitle = s.disabled ? '已禁用' : (s.modelInvocable ? '模型可调用' : '模型不可调用')
          const invoc = []
          if (s.modelInvocable) invoc.push('模型')
          if (s.userInvocable) invoc.push('用户')
          return react.createElement('div', { className: 'sk-card' + (s.disabled ? ' disabled' : ''), key: s.name }, [
            react.createElement('div', {
              className: 'sk-card-top',
              key: 'top',
              onClick: () => toggleExpand(s.name),
              style: { cursor: 'pointer' },
            }, [
              react.createElement('span', { className: 'sk-dot ' + dotCls, title: dotTitle, key: 'dot' }),
              react.createElement('span', { className: 'sk-name', title: s.name, key: 'name' }, s.name),
              react.createElement('div', { className: 'sk-spacer', key: 'sp' }),
              react.createElement('button', {
                className: 'sk-switch' + (s.disabled ? '' : ' on'),
                onClick: (e) => { e.stopPropagation(); toggle(s) },
                'aria-pressed': !s.disabled,
                title: s.disabled ? '禁止使用(点击启用)' : '允许使用(点击禁用)',
                key: 'sw',
              }, react.createElement('span', { className: 'sk-switch-knob' })),
              react.createElement('span', { className: 'sk-chevron' + (open ? ' open' : ''), key: 'chev' }, '▸'),
            ]),
            react.createElement('div', { className: 'sk-desc', key: 'desc' }, s.description),
            react.createElement('div', { className: 'sk-chips', key: 'chips' }, [
              s.disabled
                ? react.createElement('span', { className: 'sk-chip warn', key: 'off' }, '已禁用')
                : react.createElement('span', { className: 'sk-chip' + (invoc.length ? '' : ' muted'), key: 'inv' }, invoc.length ? invoc.join(' · ') : '不可调用'),
              s.removable ? react.createElement('span', { className: 'sk-chip user', key: 'me' }, '我的') : null,
              s.source ? react.createElement('span', { className: 'sk-chip', key: 'src' }, s.source) : null,
              s.provider ? react.createElement('span', { className: 'sk-chip', key: 'prov' }, s.provider) : null,
            ]),
            open ? react.createElement('div', { className: 'sk-detail', key: 'detail' }, [
              s.whenToUse ? react.createElement('div', { className: 'sk-when', key: 'when' }, 'whenToUse: ' + s.whenToUse) : null,
              s.resourceBase ? react.createElement('div', { className: 'sk-meta', key: 'meta' }, 'path: ' + s.resourceBase) : null,
              (s.presets && s.presets.length) ? react.createElement('div', { className: 'sk-note', key: 'presets' }, '所在预设: ' + s.presets.join(', ')) : null,
              s.removable
                ? react.createElement('div', { key: 'actions', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
                    react.createElement('div', { className: 'sk-spacer', key: 'sp' }),
                    react.createElement('button', { className: 'sk-remove', onClick: () => remove(s), key: 'rm' }, '移除'),
                  ])
                : null,
            ]) : null,
          ])
        }

        const skills = state.skills || []
        return react.createElement('div', { className: 'sk-wrap' }, [
          react.createElement('div', { className: 'sk-head', key: 'head' }, [
            react.createElement('span', { className: 'sk-title' }, '技能管理'),
            react.createElement('span', { className: 'sk-count' }, '共 ' + skills.length + ' 个'),
            react.createElement('div', { className: 'sk-spacer' }),
            react.createElement('button', { className: 'sk-btn', onClick: () => refresh(false), key: 'refresh' }, '刷新'),
            react.createElement('button', { className: 'sk-btn primary', onClick: () => setAdding((v) => !v), key: 'add' }, adding ? '取消' : '添加'),
          ]),
          state.message ? react.createElement('div', { className: 'sk-note', key: 'msg' }, state.message) : null,
          state.error ? react.createElement('div', { className: 'sk-error', key: 'err' }, state.error) : null,
          adding ? formEl : null,
          state.loading && skills.length === 0 ? react.createElement('div', { className: 'sk-note', key: 'load' }, '加载中…') : null,
          !state.loading && skills.length === 0
            ? react.createElement('div', { className: 'sk-note', key: 'empty' }, '还没有可用的技能,点击「添加」创建。')
            : null,
          react.createElement('div', { className: 'sk-grid', key: 'grid' }, skills.map(card)),
          react.createElement('div', { className: 'sk-note', key: 'hint' }, '新技能写入 ~/.dsh/skills/<name>/SKILL.md,出现在所有包含默认技能目录的预设中。禁用后该技能不会出现在任何会话的技能目录中。'),
        ])
      }

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'skills', order: 19, label: '技能管理' },
        (props) => react.createElement(SkillsPage),
      ))
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
