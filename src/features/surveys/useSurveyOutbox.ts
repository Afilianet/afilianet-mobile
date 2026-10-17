import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { strings } from "../../i18n";
import { discardRejectedAudio, discardResponse, listOutbox, listReceipts, syncOutbox, type OutboxItem, type OutboxReceipt, type SyncProgress } from "./outbox";
import { surveySource } from "./runtime";
import { scopeId, type SurveyScope } from "./vault";

const AUTO_SYNC_INTERVAL_MS = 60_000;

/**
 * Outbox state and syncing for the CURRENT account+organization only.
 * Syncs on open, when the app returns to the foreground and every minute
 * while anything is pending (each item still honours its retry backoff);
 * "Sincronizar ahora" forces it. Results for a previous scope are dropped.
 */
export function useSurveyOutbox(scope: SurveyScope | null) {
  // Keyed by scope: another account's or organization's list is never rendered, not even briefly.
  const [state, setState] = useState<{ key: string; items: OutboxItem[]; receipts: OutboxReceipt[] } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = scope ? scopeId(scope) : null;
  const currentScope = useRef<string | null>(key);
  useEffect(() => {
    currentScope.current = key;
  }, [key]);

  const reload = useCallback(async () => {
    if (!scope) return;
    const id = scopeId(scope);
    const [nextItems, nextReceipts] = await Promise.all([listOutbox(scope), listReceipts(scope)]);
    if (currentScope.current !== id) return;
    setState({ key: id, items: nextItems, receipts: nextReceipts });
  }, [scope]);

  const sync = useCallback(
    async (force = false) => {
      if (!scope) return;
      const id = scopeId(scope);
      setSyncing(true);
      setMessage(null);
      try {
        const result = await syncOutbox(scope, surveySource, { force, onProgress: (value) => setProgress(value) });
        if (currentScope.current !== id) return;
        if (result.stoppedReason === "offline") setMessage(strings.surveys.outbox.offline);
        else if (result.stoppedReason === "session_changed") setMessage(strings.surveys.outbox.sessionChanged);
        else if (result.errors.length) setMessage(strings.surveys.outbox.someFailed);
        else if (result.received) setMessage(strings.surveys.outbox.done(result.received));
      } catch {
        if (currentScope.current === id) setMessage(strings.surveys.outbox.someFailed);
      } finally {
        if (currentScope.current === id) {
          setSyncing(false);
          setProgress(null);
          await reload();
        }
      }
    },
    [scope, reload],
  );

  const discard = useCallback(
    async (itemId: string) => {
      if (!scope) return;
      await discardResponse(scope, itemId);
      await reload();
    },
    [scope, reload],
  );

  const discardAudio = useCallback(
    async (itemId: string) => {
      if (!scope) return;
      await discardRejectedAudio(scope, itemId);
      await reload();
    },
    [scope, reload],
  );

  useEffect(() => {
    void Promise.resolve().then(reload).then(() => sync(false));
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync(false);
    });
    return () => subscription.remove();
  }, [reload, sync]);

  const current = state && state.key === key ? state : null;
  const items = current?.items ?? [];
  const receipts = current?.receipts ?? [];
  const hasPending = items.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void sync(false), AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, sync]);

  return { items, receipts, syncing, progress, message, sync, discard, discardAudio, reload };
}
