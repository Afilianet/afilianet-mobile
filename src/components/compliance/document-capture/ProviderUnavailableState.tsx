import { StyleSheet, Text, View } from "react-native";
import type { ProviderUnavailableReason } from "../../../types/api";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { colors, spacing, typography } from "../../ui/theme";
import { providerUnavailableCopy } from "./documentCaptureCopy";

/**
 * The safe, pre-capture "this org's provider-driven verification isn't
 * reachable through this flow right now" state (Phase 9C.2a, generalized
 * in Phase 9D.3 to any step-type provider gate -- currently
 * IdentityDocumentStep and FaceMatchStep) -- shown BEFORE the camera/upload
 * UI ever mounts, driven entirely by ComplianceStep's server-authoritative
 * configured_provider/provider_actionable/provider_unavailable_reason.
 * Never exposes a service URL, secret/token, internal engine class,
 * container name, or stack trace -- see providerUnavailableCopy()'s own
 * docblock. `featureLabel` (e.g. "Document verification"/"Face
 * verification") names what's unavailable so the copy stays accurate for
 * whichever step is showing it.
 */
export function ProviderUnavailableState({
  configuredProvider,
  reason,
  featureLabel,
  onCheckAgain,
  checking,
}: {
  configuredProvider: string | null;
  reason: ProviderUnavailableReason | null;
  featureLabel: string;
  onCheckAgain: () => void;
  checking: boolean;
}) {
  const copy = providerUnavailableCopy(configuredProvider, reason, featureLabel);

  // Deliberately no wrapping `accessible`/`accessibilityLabel` here (unlike
  // ProcessingState's short, non-duplicating label) -- the Badge and
  // description Text below are already independently accessible, and an
  // aggregate label repeating the description verbatim would both
  // double-announce it to screen readers and make it ambiguous which node
  // matches a text query, exactly the bug this comment replaced.
  return (
    <View style={styles.container}>
      <Badge label={copy.title} tone="neutral" />
      <Text style={styles.description}>{copy.description}</Text>
      {copy.retryable ? (
        <Button label="Check again" variant="secondary" size="sm" onPress={onCheckAgain} loading={checking} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
