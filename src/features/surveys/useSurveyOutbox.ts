import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { strings } from "../../i18n";
import type { SurveyOrigin } from "./origin";
import { upgradeLegacyOrigins } from "./originUpgrade";
import { discardRejectedAudio, discardResponse, listOutbox, listReceipts, syncOutbox, type OutboxItem, type OutboxReceipt, type SyncProgress } from "./outbox";
import { surveySource } from "./runtime";
import { scopeId, type SurveyScope } from "./vault";

const AUTO_SYNC_INTERVAL_MS = 60_000;

/**
 * Outbox state and syncing for the CURRENT account+organization only.
 * Syncs on open, when the app returns to the foreground and every minute
 * while anything is pending (each item still honours its retry backoff);
 * "Sincronizar ahora" forces it. Results for a previous scope are dropped.
 *
 * Split by origin: `items`/`receipts` are the active source's; `other*` are
 * kept from another (or an unconfirmed) origin and are never sent from here.
 */
export function useSurveyOutbox(scope: SurveyScope | null) {
  // Keyed by scope: another account's or organization's list is never rendered, not even briefly.
  type Listed<T> = (T & { origin: SurveyOrigin })[];
  const [state, setState] = useState<{
    key: string;
    items: Listed<OutboxItem>;
    receipts: Listed<OutboxReceipt>;
    otherItems: Listed<OutboxItem>;
    otherReceipts: Listed<OutboxReceipt>;
  } | null>(null);
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
    // Classify what older versions stored (writes only its own ledger; never blocks listing).
    await upgradeLegacyOrigins(scope).catch(() => undefined);
    const [allItems, allReceipts] = await Promise.all([listOutbox(scope), listReceipts(scope)]);
    if (currentScope.current !== id) return;
    const own = (record: { origin: SurveyOrigin }) => record.origin === surveySource.origin;
    setState({
      key: id,
      items: allItems.filter(own),
      receipts: allReceipts.filter(own),
      otherItems: allItems.filter((item) => !own(item)),
      otherReceipts: allReceipts.filter((receipt) => !own(receipt)),
    });
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
      await discardResponse(scope, itemId, surveySource.origin);
      await reload();
    },
    [scope, reload],
  );

  const discardAudio = useCallback(
    async (itemId: string) => {
      if (!scope) return;
      await discardRejectedAudio(scope, itemId, surveySource.origin);
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
  const otherItems = current?.otherItems ?? [];
  const otherReceipts = current?.otherReceipts ?? [];
  // Only what this origin can send keeps the periodic retry going.
  const hasPending = items.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void sync(false), AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, sync]);

  return { items, receipts, otherItems, otherReceipts, syncing, progress, message, sync, discard, discardAudio, reload };
}
