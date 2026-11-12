import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { countPendingAssistedForUser } from "../../services/assistedQueue";
import { listDrafts } from "./library";
import { listOutbox } from "./outbox";
import { listScopes, type SurveyScope } from "./vault";

export interface PendingSurveyData {
  scope: SurveyScope;
  unsent: number;
  drafts: number;
}

/** Unsent responses and drafts this account keeps on the phone, per organization. */
export async function pendingSurveyData(userId: string): Promise<PendingSurveyData[]> {
  const result: PendingSurveyData[] = [];
  for (const scope of await listScopes()) {
    if (scope.userId !== userId) continue;
    const [items, drafts] = await Promise.all([listOutbox(scope).catch(() => []), listDrafts(scope).catch(() => [])]);
    if (items.length || drafts.length) result.push({ scope, unsent: items.length, drafts: drafts.length });
  }
  return result;
}

/**
 * Every user-initiated sign-out goes through this. With nothing pending it
 * signs out right away. With survey data it opens /sign-out-pending, where the
 * person explicitly chooses -- data is never dropped silently. With only
 * assisted-enrollment drafts (any organization of this account) it asks first:
 * they are kept, encrypted, and only reappear for this same account; nothing
 * here deletes them. (A forced sign-out, e.g. an expired session, keeps all of
 * it on the phone, bound to this account, without asking.)
 */
export function useSafeSignOut(): () => Promise<void> {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return useCallback(async () => {
    if (user) {
      const pending = await pendingSurveyData(user.id).catch(() => []);
      if (pending.length) {
        router.push(routes.signOutPending as never);
        return;
      }
      const assisted = await countPendingAssistedForUser(user.id).catch(() => 0);
      if (assisted > 0) {
        const copy = strings.surveys.signOut;
        Alert.alert(copy.assistedTitle, copy.assistedMessage(assisted), [
          { text: copy.cancel, style: "cancel" },
          { text: copy.assistedContinue, onPress: () => void signOut() },
        ]);
        return;
      }
    }
    await signOut();
  }, [user, signOut, router]);
}
