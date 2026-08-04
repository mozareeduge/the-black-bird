// Monotonic transaction ids and ownership (T07, T-REQ-006 / P-RULE-021).
// Beginning a new transaction aborts whatever transaction was previously in
// flight, so stale visual work loses its signal and cannot commit presentation.
export function createTransactionController() {
  let currentTxId = 0;
  let currentController = null;

  function begin() {
    if (currentController) currentController.abort();
    currentTxId += 1;
    currentController = new AbortController();
    return { txId: currentTxId, signal: currentController.signal };
  }

  function isActive(txId) {
    return txId === currentTxId && !!currentController && !currentController.signal.aborted;
  }

  function abortCurrent() {
    if (currentController) currentController.abort();
  }

  function currentTransaction() {
    if (!currentController) return null;
    return { txId: currentTxId, signal: currentController.signal };
  }

  return { begin, isActive, abortCurrent, currentTransaction };
}
