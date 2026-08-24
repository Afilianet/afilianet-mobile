import { Pressable, StyleSheet, Text, View } from "react-native";
import { affiliateStatusCopy } from "../design-system/statusMapping";
import { Icon } from "../design-system/icons/Icon";
import type { AffiliateProfile } from "../types/api";
import { formatDate } from "../utils/date";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { colors, spacing, typography } from "./ui/theme";

interface AffiliateRowProps {
  affiliate: AffiliateProfile;
  /** Omit to render a plain (non-interactive) row -- used where no drill-down navigation applies. */
  onPress?: () => void;
}

/** One row for a directly-sponsored or directly-placed affiliate. Shared by the Network screen's lists and (non-interactively) the detail screen. */
export function AffiliateRow({ affiliate, onPress }: AffiliateRowProps) {
  const status = affiliateStatusCopy(affiliate.status);
  const name = affiliate.user ? `${affiliate.user.first_name} ${affiliate.user.last_name}`.trim() : null;
  const label = name || affiliate.affiliate_code;

  const content = (
    <View style={styles.row}>
      <Avatar name={label} size={36} />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {label}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <View style={styles.metaRow}>
          {/* Only repeat the code here when the bold line above is showing a real name -- otherwise it's already the label and repeating it is just noise. */}
          {name ? <Text style={styles.code}>{affiliate.affiliate_code}</Text> : null}
          {affiliate.joined_at ? <Text style={styles.meta}>Joined {formatDate(affiliate.joined_at)}</Text> : null}
        </View>
      </View>
      {onPress ? <Icon name="flechaDerecha" size={16} color={colors.textTertiary} /> : null}
    </View>
  );

  const accessibilityLabel = `${label}, ${status.label}${affiliate.joined_at ? `, joined ${formatDate(affiliate.joined_at)}` : ""}`;

  if (!onPress) {
    return (
      <View style={styles.pressable} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens this affiliate's network details"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  code: {
    ...typography.numeric,
    fontSize: 12,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
