import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { strings } from "../i18n";
import { affiliateProfilePresence } from "../state/membership";
import { useOrganization } from "../state/OrganizationContext";
import { EmptyState } from "./EmptyState";
import { colors } from "./ui/theme";

/**
 * Wraps a screen made only of PERSONAL affiliate features (own KYC, wallet,
 * commissions, payouts, referral link). When the active organization says
 * this account has no affiliate profile there (API #75), the screen is not
 * mounted at all -- so none of its requests run -- and a neutral «not
 * available for this account» is shown instead: never «No iniciada» nor an
 * offer to start anything. Unknown (field absent) renders the screen as before.
 */
export function PersonalAffiliateGate({ children }: { children: ReactNode }) {
  const { activeOrganization } = useOrganization();
  if (affiliateProfilePresence(activeOrganization) !== "absent") return <>{children}</>;
  return (
    <View style={styles.screen} testID="personal-affiliate-unavailable">
      <EmptyState title={strings.staffWithoutProfile.title} description={strings.staffWithoutProfile.personalUnavailable} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
