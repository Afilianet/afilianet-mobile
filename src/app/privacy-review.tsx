import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  fetchGeneralNotice,
  fetchMyPrivacy,
  fetchOrganizationNotice,
  isNoticeOutdated,
  myPrivacyKey,
  recordAcknowledgement,
  recordConsent,
  refOf,
  sameRef,
  type MyPrivacy,
  type NoticeDocument,
  type NoticeStatus,
} from "../api/privacy";
import { useAuth } from "../auth/AuthContext";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { NoticeConfirmation } from "../components/privacy/NoticeConfirmation";
import { NoticeDocumentView } from "../components/privacy/NoticeDocumentView";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { colors, measures, spacing, typography } from "../components/ui/theme";
import { useSafeSignOut } from "../features/surveys/signOut";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAttemptId } from "../hooks/useAttemptId";
import { strings } from "../i18n";
import { routes } from "../navigation/routes";
import { useOrganization } from "../state/OrganizationContext";
import { reviewBlocks, syncPrivacyReview, usePrivacyReview } from "../state/privacyReview";

const TONES = { none: "success", inform: "brand", review: "warning" } as const;

/**
 * The account's notices (API #91/#93): the current version of the general
 * notice and of each organization's supplement, whether each needs anything
 * ("al día", "informar", "revisar"), what changed, and the separate consents
 * per purpose. Reachable from Profile and, while the server blocks the
 * session (409 privacy_notice_review_required), the only place the app leads
 * to -- with reading the notice, signing out, leaving an organization and
 * requesting deletion still available, as the server allows.
 */
export default function PrivacyReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const signOut = useSafeSignOut();
  const review = usePrivacyReview();
  const blocking = reviewBlocks(review, activeOrganization?.id);
  const copy = strings.privacyNotices.review;
  const query = useApiQuery(myPrivacyKey(user?.id), fetchMyPrivacy, { enabled: Boolean(user) });
  // Entered (or became) blocked here: once it no longer blocks, offer to continue.
  const [wasBlocking, setWasBlocking] = useState(blocking);
  if (blocking && !wasBlocking) setWasBlocking(true);

  useEffect(() => {
    if (query.data !== undefined) syncPrivacyReview(query.data);
  }, [query.data]);

  // An answer for this account only: a session change drops it (see the cards' guard).
  const userId = user?.id;
  const currentUser = useRef(userId);
  useEffect(() => {
    currentUser.current = userId;
  }, [userId]);
  function apply(status: MyPrivacy, forUser: string | undefined) {
    // Only for the account still signed in: a late answer never touches another one.
    if (!forUser || forUser !== currentUser.current) return;
    queryClient.setQueryData(myPrivacyKey(forUser), status);
    syncPrivacyReview(status);
  }

  function leave() {
    // Whatever the review blocked is loaded again, now that it may answer.
    void queryClient.invalidateQueries();
    if (router.canGoBack()) router.back();
    else router.replace(routes.home as never);
  }

  if (query.isPending) return <LoadingState message={strings.privacyNotices.step.loading} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const status = query.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">{copy.title}</Text>
      {blocking ? (
        <Text accessibilityRole="alert" style={styles.alert}>{copy.blockingIntro}</Text>
      ) : (
        <Text style={styles.description}>{copy.intro}</Text>
      )}
      {!status ? <Text style={styles.description}>{copy.unsupported}</Text> : null}
      {status ? (
        <NoticeCard
          key={`general:${status.privacy_notice.current?.sha256 ?? ""}`}
          title={copy.general}
          status={status.privacy_notice}
          userId={userId}
          load={async () => fetchGeneralNotice()}
          onRecorded={apply}
          onOutdated={() => void query.refetch()}
          acknowledge={(ref, id) => recordAcknowledgement({ privacy_notice: ref, client_request_id: id })}
        />
      ) : null}
      {status?.organizations.map((organization) => (
        <NoticeCard
          key={`${organization.id}:${organization.current?.sha256 ?? ""}`}
          title={copy.organization(organization.name)}
          status={organization}
          organizationId={organization.id}
          userId={userId}
          load={() => fetchOrganizationNotice(organization.id)}
          onRecorded={apply}
          onOutdated={() => void query.refetch()}
          acknowledge={(ref, id) => recordAcknowledgement({ organization_id: organization.id, organization_notice: ref, client_request_id: id })}
          organizationName={organization.name}
          onLeave={() => router.push({ pathname: "/leave-organization", params: { organizationId: organization.id } } as never)}
        />
      ))}
      {wasBlocking && !blocking ? <Button label={copy.continue} size="lg" fullWidth onPress={leave} /> : null}
      <View style={styles.actions}>
        <Button label={copy.readNotice} variant="ghost" onPress={() => router.push("/privacy" as never)} />
        {blocking ? <Button label={copy.deleteAccount} variant="ghost" onPress={() => router.push("/delete-account" as never)} /> : null}
        <Button label={copy.signOut} variant="secondary" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}

function NoticeCard({
  title,
  status,
  organizationId,
  organizationName,
  userId,
  load,
  acknowledge,
  onRecorded,
  onOutdated,
  onLeave,
}: {
  title: string;
  status: NoticeStatus;
  organizationId?: string;
  organizationName?: string;
  userId: string | undefined;
  load: () => Promise<NoticeDocument | null>;
  acknowledge: (ref: { version: string; sha256: string }, clientRequestId: string) => Promise<MyPrivacy>;
  onRecorded: (status: MyPrivacy, forUser: string | undefined) => void;
  /** The server has a newer version: reload the statuses, so the card shows (and confirms) that one. */
  onOutdated: () => void;
  onLeave?: () => void;
}) {
  const copy = strings.privacyNotices.review;
  const [document, setDocument] = useState<NoticeDocument | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const attemptId = useAttemptId();
  const userRef = useRef(userId);
  useEffect(() => {
    userRef.current = userId;
  }, [userId]);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  const action = status.action_required;

  async function read() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (document && sameRef(refOf(document), status.current)) return;
    setLoading(true);
    setMessage(null);
    const startedFor = userId;
    try {
      const loaded = await load();
      if (!mounted.current || userRef.current !== startedFor) return;
      setDocument(loaded);
    } catch {
      if (mounted.current) setMessage(copy.loadFailed);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  /**
   * Runs one write for the document on screen, never for another one: if the
   * server's current version is not what is shown, the new one is loaded and
   * shown instead. Answers that arrive after a session change are dropped.
   */
  async function write(run: (ref: { version: string; sha256: string }) => Promise<MyPrivacy>) {
    // Opening is optional: without it, the version made available is the current one the server listed.
    const ref = document ? refOf(document) : status.current;
    if (!ref || busyRef.current) return;
    if (!sameRef(ref, status.current)) {
      setMessage(copy.changedWhileReading);
      setOpen(false);
      setDocument(null);
      onOutdated();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    const startedFor = userId;
    try {
      const next = await run(ref);
      if (!mounted.current || userRef.current !== startedFor) return;
      onRecorded(next, startedFor);
    } catch (cause) {
      if (!mounted.current || userRef.current !== startedFor) return;
      if (isNoticeOutdated(cause)) {
        setDocument(null);
        setOpen(false);
        setMessage(copy.changedWhileReading);
        onOutdated();
      } else {
        setMessage(copy.saveFailed);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const shown = open && document && sameRef(refOf(document), status.current) ? document : null;
  const [confirmed, setConfirmed] = useState(false);
  const purposes = shown?.purposes ?? [];

  return (
    <Card style={styles.card} testID={`notice-card-${organizationId ?? "general"}`}>
      <View style={styles.row}>
        <Text style={styles.label}>{title}</Text>
        <Badge label={copy.states[action]} tone={TONES[action]} />
      </View>
      {action === "review" ? <Text style={styles.description}>{copy.reviewHint}</Text> : null}
      {action === "inform" ? <Text style={styles.description}>{copy.informHint}</Text> : null}
      {action !== "none" && status.summary_of_changes ? (
        <View style={styles.changes}>
          <Text style={styles.label}>{copy.whatChanged}</Text>
          <Text style={styles.description}>{status.summary_of_changes}</Text>
        </View>
      ) : null}
      <Text style={styles.meta}>{status.last_acknowledged ? copy.lastSeen(status.last_acknowledged.version) : copy.neverSeen}</Text>
      <Button label={open ? strings.privacyNotices.step.hide : strings.privacyNotices.step.read} variant="secondary" loading={loading} onPress={() => void read()} />
      {shown ? <NoticeDocumentView document={shown} /> : null}
      {action !== "none" && status.current ? (
        <>
          {/* Never preselected; it states the version was made available, not that it was opened or read. */}
          <NoticeConfirmation label={copy.confirmation(status.current.version)} checked={confirmed} disabled={busy} onChange={setConfirmed} />
          <Button
            label={action === "review" ? copy.acknowledge : copy.informAcknowledge}
            loading={busy}
            disabled={!confirmed}
            onPress={() => void write((ref) => acknowledge(ref, attemptId(`ack/${ref.sha256}`)))}
          />
        </>
      ) : null}
      {purposes.length ? (
        <View style={styles.purposes}>
          <Text style={styles.label}>{copy.purposesTitle}</Text>
          <Text style={styles.description}>{copy.purposesHint}</Text>
          {purposes.map((purpose) => {
            const decided = status.purposes.find((item) => item.key === purpose.key);
            const current = decided && (!purpose.text_sha256 || decided.text_sha256 === purpose.text_sha256);
            const decision = current ? decided?.decision ?? null : null;
            const stale = Boolean(decided?.decision) && !current;
            return (
              <View key={purpose.key} style={styles.purpose} testID={`purpose-${purpose.key}`}>
                <Text style={styles.label}>{purpose.title}</Text>
                <Text style={styles.description}>{purpose.text}</Text>
                <Text accessibilityLiveRegion="polite" style={styles.meta}>
                  {stale ? copy.stale : decision === "granted" ? copy.granted : decision === "refused" ? copy.refused : copy.undecided}
                </Text>
                {/* Two explicit choices; neither is preselected, the current decision is only described. */}
                <View style={styles.choices}>
                  {(["granted", "refused"] as const).map((choice) => (
                    <Button
                      key={choice}
                      label={choice === "granted" ? copy.grant : copy.refuse}
                      variant="secondary"
                      disabled={busy || decision === choice}
                      onPress={() =>
                        void write((ref) =>
                          recordConsent({
                            ...(organizationId ? { organization_id: organizationId } : {}),
                            document: ref,
                            purpose: purpose.key,
                            decision: choice,
                            client_request_id: attemptId(`consent/${ref.sha256}/${purpose.key}/${purpose.text_sha256 ?? ""}/${choice}`),
                          }),
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {!shown && status.purposes.length ? <Text style={styles.meta}>{copy.readFirst}</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
      {onLeave && action === "review" ? <Button label={copy.leaveOrganization(organizationName ?? "")} variant="ghost" onPress={onLeave} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  alert: { ...typography.body, color: colors.textPrimary },
  card: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  label: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.textTertiary },
  changes: { gap: spacing.xs },
  purposes: { gap: spacing.sm },
  purpose: { gap: spacing.xs },
  choices: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  actions: { gap: spacing.sm },
  error: { ...typography.body, color: colors.danger },
});
