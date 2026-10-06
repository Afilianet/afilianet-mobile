/** Bound automatic native-token/foreground refreshes; manual activation stays available. */
export function createAutomaticPushRefresh(register: () => Promise<unknown>, now = Date.now) {
  let pending = false;
  let nextAttemptAt = -Infinity;
  return () => {
    if (pending || now() < nextAttemptAt) return;
    pending = true;
    nextAttemptAt = now() + 60000;
    void register().catch(() => undefined).finally(() => { pending = false; });
  };
}
