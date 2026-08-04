// Owned timers (T07, T-REQ-007 / P-RULE-036). Every timer is registered under an
// owner ({ kind: 'transaction' | 'trace', id }) so it can be cancelled by that
// owner specifically ("owned timers cancel by transaction and by trace clear")
// without touching timers owned by anything else.
export function createTimerRegistry() {
  const timers = new Map();
  let nextId = 1;

  function sameOwner(a, b) {
    return !!a && !!b && a.kind === b.kind && a.id === b.id;
  }

  function schedule(fn, delayMs, owner) {
    const id = nextId++;
    const handle = setTimeout(() => {
      timers.delete(id);
      fn();
    }, delayMs);
    timers.set(id, { handle, owner });
    return id;
  }

  function cancel(id) {
    const entry = timers.get(id);
    if (!entry) return false;
    clearTimeout(entry.handle);
    timers.delete(id);
    return true;
  }

  function cancelByOwner(owner) {
    let cancelled = 0;
    for (const [id, entry] of timers) {
      if (sameOwner(entry.owner, owner)) {
        clearTimeout(entry.handle);
        timers.delete(id);
        cancelled += 1;
      }
    }
    return cancelled;
  }

  function cancelAll() {
    for (const [, entry] of timers) clearTimeout(entry.handle);
    timers.clear();
  }

  function size() {
    return timers.size;
  }

  return { schedule, cancel, cancelByOwner, cancelAll, size };
}
