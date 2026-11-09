import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  fetchGeneralNotice,
  fetchMyPrivacy,
  IDENTITY_VERIFICATION_PURPOSE,
  myPrivacyKey,
  newClientRequestId,
  recordConsent,
  refOf,
  sameRef,
  type MyPrivacy,
} from "../../api/privacy";
import { isApiError, friendlyMessage } from "../../api/errors";
import { useAuth } from "../../auth/AuthContext";
import { useAssistedComplianceId } from "../../state/ComplianceScopeContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { formatDate } from "../../utils/date";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { colors, spacing, typography } from "../ui/theme";

export type IdentityConsentPhase = "inert" | "loading" | "effective" | "grant" | "holder_verification";

/**
 * Where the person's own identity verification consent stands, only as the
 * API says (GET /me/privacy, registration consents v1). `inert` when the
 * general notice has no such purpose (gate off, or an API without it).
 *
 * Never in an assisted case: /me/privacy is the sponsor's, and the case's
 * holder is the person. The server checks the person and answers 403
 * consent_required (holder: assisted_person), which the screen explains.
 */
export function useIdentityConsentPhase(): { phase: IdentityConsentPhase; status: MyPrivacy | null | undefined } {
  const ownCase = !useAssistedComplianceId();
  const userId = useAuth().user?.id;
  // Always read again on opening Verification: confirming the email or phone elsewhere (a link in the mail)
  // changes what the server requires, and a cached answer would keep asking for it.
  const query = useApiQuery(myPrivacyKey(userId), fetchMyPrivacy, { enabled: Boolean(userId) && ownCase, refetchOnMount: "always" });
  if (!ownCase || !userId || query.isError) return { phase: "inert", status: undefined };
  if (query.isPending) return { phase: "loading", status: undefined };
  const purpose = query.data?.privacy_notice.purposes.find((item) => item.key === IDENTITY_VERIFICATION_PURPOSE);
  if (!purpose) return { phase: "inert", status: query.data };
  if (purpose.effective) return { phase: "effective", status: query.data };
  if (purpose.requirement === "holder_verification") return { phase: "holder_verification", status: query.data };
  return { phase: "grant", status: query.data };
}

/**
 * Before KYC starts: reuses an effective authorization (no box), or asks for
 * it with the notice's own text and an unticked box. It is not the camera
 * permission, and only the person's own session records it.
 */
export function IdentityConsentGate({ phase, status }: { phase: IdentityConsentPhase; status: MyPrivacy | null | undefined }) {
  const router = useRouter();
  const copy = strings.registrationConsents.kyc;
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const purpose = status?.privacy_notice.purposes.find((item) => item.key === IDENTITY_VERIFICATION_PURPOSE);
  const current = status?.privacy_notice.current ?? null;
  const notice = useApiQuery(["privacy-notice-general"], fetchGeneralNotice, { enabled: phase === "grant" });
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // One id per attempt, reused by its retries until the API answers.
  const requestId = useRef<string | null>(null);

  if (phase === "inert" || phase === "loading" || !purpose) return null;

  if (phase === "effective") {
    return (
      <View style={styles.group} testID="identity-consent-effective">
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.reused(purpose.decided_at ? formatDate(purpose.decided_at) : "")}</Text>
      </View>
    );
  }

  if (phase === "holder_verification") {
    return (
      <View style={styles.group} testID="identity-consent-holder-verification">
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.holderVerification}</Text>
        <Button label={copy.verifyAccount} variant="secondary" onPress={() => router.push(routes.verifyAccount as never)} />
      </View>
    );
  }

  // The text must be exactly the version the decision is recorded against.
  const document = notice.data ?? null;
  const served = document && sameRef(refOf(document), current) ? document.purposes?.find((item) => item.key === purpose.key) : undefined;
  const textMatches = served && (!served.text_sha256 || served.text_sha256 === purpose.text_sha256);

  async function record() {
    if (busy.current || !current) return;
    if (!checked) {
      setError(copy.mustTick);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    requestId.current ??= newClientRequestId();
    try {
      const next = await recordConsent({ document: current, purpose: IDENTITY_VERIFICATION_PURPOSE, decision: "granted", client_request_id: requestId.current });
      requestId.current = null;
      queryClient.setQueryData(myPrivacyKey(userId), next);
      const stored = next?.privacy_notice.purposes.find((item) => item.key === IDENTITY_VERIFICATION_PURPOSE);
      // Shown as recorded only from the API's own answer.
      if (!stored?.effective && stored?.requirement !== "holder_verification") setError(copy.notRecorded);
    } catch (cause) {
      setError(isApiError(cause) ? friendlyMessage(cause) : copy.notRecorded);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.group} testID="identity-consent-grant">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.intro}</Text>
      {purpose.status === "refused" ? <Text style={styles.note}>{copy.refusedNote}</Text> : null}
      {purpose.status === "outdated" ? <Text style={styles.note}>{copy.outdatedNote}</Text> : null}
      {notice.isPending ? <Text style={styles.note}>{strings.privacyNotices.step.loading}</Text> : null}
      {notice.isError || (!notice.isPending && !textMatches) ? (
        <View style={styles.group}>
          <Text accessibilityRole="alert" style={styles.error}>{copy.loadFailed}</Text>
          <Button label={strings.privacyNotices.step.retry} variant="secondary" onPress={() => void notice.refetch()} />
        </View>
      ) : null}
      {served && textMatches ? (
        <>
          <Checkbox label={served.text} checked={checked} disabled={saving} onChange={setChecked} testID="identity-consent-box">
            {served.help ? <Text style={styles.note}>{served.help}</Text> : null}
          </Checkbox>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label={copy.record} variant="secondary" loading={saving} onPress={() => void record()} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.body, color: colors.danger },
});
