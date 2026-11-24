import * as Network from "expo-network";

/** Usable for sending: connected, and not known to be without internet. */
export function isOnline(state: { isConnected?: boolean; isInternetReachable?: boolean }): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/**
 * Calls `onReconnect` each time the phone goes from no usable connection to a
 * usable one (airplane mode off, Wi-Fi or data back). It only says the PHONE
 * has a connection: whether the API answers, and whether the session is still
 * valid, is decided by the sync itself (offline/timeout vs server vs 401).
 * Never throws: without the native module it simply never fires, and the
 * other triggers (foreground, the periodic tick, «Sincronizar ahora») remain.
 */
export function subscribeReconnect(onReconnect: () => void): () => void {
  let online: boolean | null = null;
  const apply = (state: { isConnected?: boolean; isInternetReachable?: boolean }) => {
    const next = isOnline(state);
    if (online === false && next) onReconnect();
    online = next;
  };
  let subscription: { remove: () => void } | null = null;
  try {
    subscription = Network.addNetworkStateListener(apply) ?? null;
    void Network.getNetworkStateAsync()
      .then((state) => {
        // A listener event may already have set it: never overwrite a newer value.
        if (online === null) online = isOnline(state);
      })
      .catch(() => undefined);
  } catch {
    subscription = null;
  }
  return () => {
    // Defensive: a missing or stubbed native module may hand back no remover.
    if (typeof subscription?.remove === "function") subscription.remove();
  };
}
