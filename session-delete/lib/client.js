// Persistent session-delete plugin - Client half (delete button removed).
// The per-session delete button in the conversation session header action row
// (conversation.session.header.actions) was removed on user request.
// This bundle is served by the host at /plugins/session-delete/client.js and
// re-fetched on every page boot (cache-control: no-cache), so the removal
// takes effect on the next page refresh.

window.__ModuleLoader__.load({
  id: 'session-delete',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const name = 'session-delete'
    const inject = ['slots']

    function apply(ctx) {
      // Delete button intentionally removed (user request): nothing to register.
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
