import { StyleSheet, Text, View } from "react-native";
import { invitationStatusCopy } from "../design-system/statusMapping";
import type { Invitation } from "../types/api";
import { formatDate } from "../utils/date";
import { Badge } from "./ui/Badge";
import { colors, spacing, typography } from "./ui/theme";

/**
 * `masked_email`/`masked_phone` come pre-masked from the backend
 * (SponsoredInvitationResource) -- this component never sees, and must
 * never be given, the raw recipient contact value.
 */
export function InvitationRow({ invitation }: { invitation: Invitation }) {
  const status = invitationStatusCopy(invitation.status);
  const recipient = invitation.masked_email ?? invitation.masked_phone ?? "Unaddressed link";
  const detail =
    invitation.status === "accepted" && invitation.accepted_at
      ? `Accepted ${formatDate(invitation.accepted_at)}`
      : invitation.status === "pending"
        ? `Expires ${formatDate(invitation.expires_at)}`
        : `Sent ${formatDate(invitation.created_at)}`;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Invitation to ${recipient}, ${status.label}, ${detail}`}
    >
      <View style={styles.info}>
        <Text style={styles.recipient} numberOfLines={1}>
          {recipient}
        </Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Badge label={status.label} tone={status.tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 44,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  recipient: {
    ...typography.numeric,
    fontSize: 13,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
