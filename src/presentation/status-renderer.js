import { createAnnouncementManager } from '../accessibility/announcement-manager.js';

// One polite, coalesced live region (T22, T-REQ-037) -- every status update
// goes through the same announcement manager, so rapid commits never flood
// assistive technology with superseded intermediate text.
export function createStatusRenderer({ liveRegion, coalesceMs = 150 }) {
  const manager = createAnnouncementManager({
    coalesceMs,
    publish: (message) => {
      liveRegion.textContent = message;
    },
  });
  return { announce: manager.announce, flush: manager.flush, cancel: manager.cancel };
}
