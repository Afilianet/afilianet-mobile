import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { fetchMyPrivacy, myPrivacyKey, type MyPrivacy } from "../../api/privacy";
import { useAuth } from "../../auth/AuthContext";
import { secureStorage } from "../../services/storage";
import { useApiQuery } from "../../hooks/useApiQuery";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";

const SEEN_KEY = (userId: string) => `privacy_inform_shown_${userId}`;

function pendingOf(status: MyPrivacy | null | undefined) {
  if (!status) return { review: [] as string[], inform: [] as string[], summary: null as string | null };
  const entries = [{ id: "general", ...status.privacy_notice }, ...status.organizations];
  const keyOf = (entry: (typeof entries)[number]) => `${entry.id}:${entry.current?.sha256 ?? ""}`;
  const review = entries.filter((entry) => entry.action_required === "review");
  const inform = entries.filter((entry) => entry.action_required === "inform");
  return {
    review: review.map(keyOf),
    inform: inform.map(keyOf),
    summary: (review[0] ?? inform[0])?.summary_of_changes ?? null,
  };
}

/**
 * Home's notice of a pending notice (API #93), when the server does not block:
 * "revisar" stays until it is reviewed; "informar" is shown once per version
 * on this phone and never blocks. Both lead to the review screen.
 */
export function PrivacyNoticeBanner() {
  const router = useRouter();
  const { user, status: authStatus } = useAuth();
  const query = useApiQuery(myPrivacyKey(user?.id), fetchMyPrivacy, { enabled: authStatus === "signedIn" && Boolean(user) });
  const pending = pendingOf(query.data);
  const informKey = pending.inform.join("|");
  const userId = user?.id;
  const shownKey = `${userId}/${informKey}`;
  const [shownOnce, setShownOnce] = useState<{ key: string; visible: boolean } | null>(null);
  const informVisible = Boolean(userId && informKey) && shownOnce?.key === shownKey && shownOnce.visible;

  useEffect(() => {
    if (!userId || !informKey) return;
    let current = true;
    (async () => {
      const seen: string[] = JSON.parse((await secureStorage.get(SEEN_KEY(userId)).catch(() => null)) ?? "[]");
      const unseen = informKey.split("|").filter((key) => !seen.includes(key));
      if (!current) return;
      setShownOnce({ key: `${userId}/${informKey}`, visible: unseen.length > 0 });
      if (unseen.length) await secureStorage.set(SEEN_KEY(userId), JSON.stringify([...seen, ...unseen])).catch(() => undefined);
    })();
    return () => {
      current = false;
    };
  }, [userId, informKey]);

  const copy = strings.privacyNotices.banner;
  const review = pending.review.length > 0;
  if (!review && !informVisible) return null;
  return (
    <Card style={styles.card} testID="privacy-notice-banner">
      <Text style={styles.title}>{review ? copy.review : copy.inform}</Text>
      {pending.summary ? <Text style={styles.text}>{pending.summary}</Text> : null}
      <Button label={review ? copy.reviewCta : copy.cta} variant="secondary" onPress={() => router.push(routes.privacyReview as never)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  text: { ...typography.body, color: colors.textSecondary },
});
