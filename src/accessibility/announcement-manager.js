// Coalesced status announcements (T22, T-REQ-037): rapid announce() calls
// within one coalescing window collapse to a single publish of the latest
// message -- superseded intermediate messages are never sent to assistive
// technology.
export function createAnnouncementManager({ coalesceMs = 150, publish }) {
  let pending = null;
  let timer = null;

  function announce(message) {
    pending = message;
    if (timer) return; // a publish is already scheduled; it will use the latest pending message
    timer = setTimeout(() => {
      const message = pending;
      pending = null;
      timer = null;
      publish(message);
    }, coalesceMs);
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending != null) {
      const message = pending;
      pending = null;
      publish(message);
    }
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  }

  return { announce, flush, cancel };
}
