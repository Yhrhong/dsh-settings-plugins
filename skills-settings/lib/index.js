// Persistent Skills settings page — Host half.
//
// Serves /skills/list, /skills/toggle, /skills/add and /skills/remove over
// the webserver.
//
// The live skill catalog comes from the `skills` service, viewed through every
// agent preset's standing scope and merged, so the page shows the whole
// deployment's skill catalog; each skill records which preset(s) expose it.
//
// Enable/disable works by registering an override provider into each preset's
// standing scope layer. The provider advertises disabled skills with a very
// low rank and `invocation: { modelInvocable: false, userInvocable: false }`,
// so the registry's merge picks the override (invocation-off) entry over the
// filesystem entry for that name — the skill then disappears from every
// model/user-facing catalog and the `skill` tool rejects it. Toggling updates
// the in-memory candidate set, persists the disabled list to a JSON sidecar,
// and calls the provider control's `invalidate()` so the change is live.
//
// Adding a skill writes `<DSH_HOME>/skills/<name>/SKILL.md` (the user-dsh
// skill root the filesystem provider scans and watches), so the new skill
// appears in every preset that includes default roots without a restart.
// Removing is allowed only for skills under that same root.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createScope } from '@deepseek-ai/dsh-scope'

export const name = 'skills-settings'

export const inject = ['webServer', 'skills', 'agentPresets']

// DSH home resolution mirrors @deepseek-ai/dsh-home-paths: $DSH_HOME wins,
// otherwise the user's home directory (~/.dsh on all platforms).
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

// This deployment's profile dir — the sidecar lives beside the patch file.
const STATE_PATH = join(DSH_HOME, 'profiles', 'web', 'skills-settings.json')

// The user-owned skill root (user-dsh source) the add/remove actions manage.
const USER_SKILLS_ROOT = join(DSH_HOME, 'skills')

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

/** Render one string as a valid YAML double-quoted scalar (JSON escaping is YAML-safe). */
function yamlScalar(value) {
  return JSON.stringify(String(value))
}

/** Normalized (forward-slash, lower-case) form for path comparisons on Windows. */
function normPath(value) {
  return String(value).replace(/\\/g, '/').toLowerCase()
}

function loadDisabled() {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.disabled)) return []
    return data.disabled.filter((name) => typeof name === 'string' && SKILL_NAME_RE.test(name))
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    console.error('skills-settings: loadDisabled failed', error)
    return []
  }
}

function skillView(s, disabled, removable) {
  return {
    name: s.name,
    description: s.description || '',
    whenToUse: s.whenToUse || '',
    modelInvocable: !!(s.invocation && s.invocation.modelInvocable),
    userInvocable: !!(s.invocation && s.invocation.userInvocable),
    source: s.source || '',
    provider: s.provider || '',
    disabled: !!disabled,
    removable: !!removable,
    resourceBase:
      s.resourceBase && s.resourceBase.kind === 'directory'
        ? s.resourceBase.path
        : s.resourceBase && s.resourceBase.kind === 'url'
          ? s.resourceBase.url
          : '',
  }
}

export function apply(ctx) {
  const register = (path, handler) => {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), 'skills-settings:' + path)
  }

  /** Persisted disabled names, loaded at apply. */
  const disabledSet = new Set(loadDisabled())

  /** presetId -> override-provider state in that preset's standing layer. */
  const stateByPreset = new Map()

  async function ensurePreset(presetId) {
    const existing = stateByPreset.get(presetId)
    if (existing !== undefined) return existing
    const key = await ctx.agentPresets.standingKeyFor(presetId)
    const scope = createScope(ctx, key)
    const state = {
      presetId,
      key,
      scope,
      candidates: [],
      invalidate: null,
    }
    const provider = {
      name: 'skills-settings',
      async list() {
        return state.candidates
      },
      async get(candidate) {
        return candidate.locator
      },
    }
    try {
      const disposer = scope.ctx.skills.registerProvider((control) => {
        state.invalidate = () => control.invalidate()
        return provider
      })
      ctx.effect(() => disposer)
      ctx.effect(() => () => scope.dispose())
    } catch (error) {
      await scope.dispose()
      stateByPreset.delete(presetId)
      throw error
    }
    stateByPreset.set(presetId, state)
    return state
  }

  /**
   * Recompute one preset's override candidates: disabled names that the preset
   * exposes, as low-rank invocation-off entries. The current list() contains
   * the same names regardless of override state, so presence is stable.
   */
  async function refreshPreset(state) {
    let list = []
    try {
      list = await ctx.skills.list({ scope: state.key })
    } catch (error) {
      console.error('skills-settings: refreshPreset list failed ' + state.presetId, error)
      return
    }
    const byName = new Map(list.map((s) => [s.name, s]))
    state.candidates = []
    for (const name of disabledSet) {
      const summary = byName.get(name)
      if (summary === undefined) continue
      const description = summary.description || name
      state.candidates.push({
        name,
        description,
        invocation: { modelInvocable: false, userInvocable: false },
        source: 'custom',
        provider: 'skills-settings',
        rank: 1,
        locator: { name, description, content: '' },
      })
    }
  }

  /** Refresh every preset state and invalidate their catalogs (live). */
  async function applyOverrides() {
    for (const state of stateByPreset.values()) {
      await refreshPreset(state)
      try {
        if (state.invalidate) state.invalidate()
      } catch (error) {
        console.error('skills-settings: invalidate failed ' + state.presetId, error)
      }
    }
  }

  function saveDisabled() {
    try {
      writeFileSync(STATE_PATH, JSON.stringify({ disabled: [...disabledSet].sort() }, null, 2) + '\n')
    } catch (error) {
      console.error('skills-settings: saveDisabled failed', error)
      throw error
    }
  }

  /** Whether a skill's resource base lives under the user-owned skill root. */
  function isRemovable(resourceBase) {
    if (typeof resourceBase !== 'string' || resourceBase === '') return false
    const base = normPath(resourceBase).replace(/\/+$/, '')
    const root = normPath(USER_SKILLS_ROOT).replace(/\/+$/, '')
    return base === root || base.startsWith(root + '/')
  }

  /** Whether a skill name is currently discoverable anywhere in the catalog. */
  async function skillExists(name) {
    try {
      if ((await ctx.skills.list()).some((s) => s.name === name)) return true
    } catch (error) {
      console.error('skills-settings: skillExists global failed', error)
    }
    for (const state of stateByPreset.values()) {
      try {
        if ((await ctx.skills.list({ scope: state.key })).some((s) => s.name === name)) return true
      } catch (error) { /* keep checking */ }
    }
    return false
  }

  // Ensure a standing override provider for every preset at apply time, so a
  // persisted disabled list takes effect immediately on boot.
  ctx.agentPresets.list().then((presets) => Promise.allSettled(
    presets.map((preset) => ensurePreset(preset.id)),
  )).then(() => applyOverrides()).catch((error) => {
    console.error('skills-settings: initial override setup failed', error)
  })

  register('/skills/list', async (req, res) => {
    if (req.method !== 'GET') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    try {
      const byName = new Map()

      // Global layer first (deployment-level providers).
      try {
        for (const s of await ctx.skills.list()) {
          byName.set(s.name, skillView(s, disabledSet.has(s.name), isRemovable(resourceBaseOf(s))))
        }
      } catch (error) {
        console.error('skills/list: global view failed', error)
      }

      // Every preset's standing scope (agent-preset-scoped providers).
      let presets = []
      try {
        presets = await ctx.agentPresets.list()
      } catch (error) {
        console.error('skills/list: preset list failed', error)
      }
      for (const preset of presets) {
        let key
        try {
          key = await ctx.agentPresets.standingKeyFor(preset.id)
        } catch (error) {
          console.error('skills/list: standingKeyFor ' + preset.id + ' failed', error)
          continue
        }
        if (key === undefined) continue
        let list = []
        try {
          list = await ctx.skills.list({ scope: key })
        } catch (error) {
          console.error('skills/list: scoped view ' + preset.id + ' failed', error)
          continue
        }
        for (const s of list) {
          const existing = byName.get(s.name)
          const row = skillView(s, disabledSet.has(s.name), isRemovable(resourceBaseOf(s)))
          if (existing) {
            if (!existing.presets.includes(preset.id)) existing.presets.push(preset.id)
            if (row.removable && !existing.removable) existing.removable = true
          } else {
            row.presets = [preset.id]
            byName.set(s.name, row)
          }
        }
      }

      const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
      sendJson(res, { ok: true, skills, count: skills.length })
    } catch (error) {
      console.error('skills/list failed', error)
      sendJson(res, { ok: false, error: (error && error.message) || String(error) })
    }
  })

  register('/skills/toggle', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then(async (a) => {
      const name = typeof a.name === 'string' ? a.name.trim() : ''
      const disabled = a.disabled === true
      if (!SKILL_NAME_RE.test(name)) {
        sendJson(res, { ok: false, error: '技能名无效' })
        return
      }
      try {
        if (disabled && !(await skillExists(name))) {
          sendJson(res, { ok: false, error: '未找到技能 "' + name + '"' })
          return
        }
        if (disabled) disabledSet.add(name)
        else disabledSet.delete(name)
        saveDisabled()
        await applyOverrides()
        sendJson(res, { ok: true, disabled, message: (disabled ? '已禁用 ' : '已启用 ') + name })
      } catch (error) {
        console.error('skills/toggle failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
      }
    })
  })

  register('/skills/add', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then(async (a) => {
      const name = typeof a.name === 'string' ? a.name.trim() : ''
      const description = typeof a.description === 'string' ? a.description.trim() : ''
      const whenToUse = typeof a.whenToUse === 'string' && a.whenToUse.trim() !== '' ? a.whenToUse.trim() : null
      const content = typeof a.content === 'string' ? a.content.trim() : ''
      if (!SKILL_NAME_RE.test(name)) {
        sendJson(res, { ok: false, error: '技能名称必须是 1-32 位小写字母、数字或连字符(如 my-skill)' })
        return
      }
      if (description === '') {
        sendJson(res, { ok: false, error: '请填写技能描述' })
        return
      }
      if (content === '') {
        sendJson(res, { ok: false, error: '请填写技能内容(模型将遵循的说明)' })
        return
      }
      try {
        if (await skillExists(name)) {
          sendJson(res, { ok: false, error: '技能 "' + name + '" 已存在' })
          return
        }
        const skillDir = USER_SKILLS_ROOT + '\\' + name
        mkdirSync(skillDir, { recursive: true })
        const lines = [
          '---',
          'name: ' + name,
          'description: ' + yamlScalar(description),
        ]
        if (whenToUse !== null) lines.push('whenToUse: ' + yamlScalar(whenToUse))
        lines.push('---')
        const body = content.endsWith('\n') ? content : content + '\n'
        writeFileSync(skillDir + '\\SKILL.md', lines.join('\n') + '\n\n' + body)
        sendJson(res, { ok: true, name, message: '已添加技能 "' + name + '",稍后生效' })
      } catch (error) {
        console.error('skills/add failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
      }
    })
  })

  register('/skills/remove', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, { ok: false, error: 'method not allowed' }, 405); return }
    readJsonBody(req).then(async (a) => {
      const name = typeof a.name === 'string' ? a.name.trim() : ''
      if (!SKILL_NAME_RE.test(name)) {
        sendJson(res, { ok: false, error: '技能名无效' })
        return
      }
      const skillDir = USER_SKILLS_ROOT + '\\' + name
      try {
        // Only user-owned skills under the user root can be removed.
        if (!isRemovable(skillDir)) {
          sendJson(res, { ok: false, error: '该技能来自预设或内置目录,不允许删除' })
          return
        }
        rmSync(skillDir, { recursive: true, force: true })
        if (disabledSet.delete(name)) saveDisabled()
        await applyOverrides()
        sendJson(res, { ok: true, name, message: '已删除技能 "' + name + '"' })
      } catch (error) {
        console.error('skills/remove failed', error)
        sendJson(res, { ok: false, error: (error && error.message) || String(error) })
      }
    })
  })
}

function resourceBaseOf(s) {
  return s.resourceBase && s.resourceBase.kind === 'directory'
    ? s.resourceBase.path
    : s.resourceBase && s.resourceBase.kind === 'url'
      ? s.resourceBase.url
      : ''
}
