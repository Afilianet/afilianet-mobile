import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import { Icon } from "../design-system/icons/Icon";
import { strings } from "../i18n";
import { useCreatePayoutDestination } from "../hooks/useCreatePayoutDestination";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { TextInput } from "./ui/TextInput";
import { colors, measures, radius, spacing, typography } from "./ui/theme";

type DestinationType = "bank_account" | "provider_account";

/**
 * Destination creation is a real, callable endpoint today, but
 * self-attested -- afilianet-api has no payment-provider tokenization flow
 * yet (PayoutDestinationService's own docblock: "every destination created
 * here is fake/test data"). This form deliberately asks for only
 * `display_label`/`type`/`country` -- never a `provider_reference` free-text
 * field, since inviting a user to paste something that looks like a bank
 * reference into a field with no secure vault behind it would be worse than
 * not offering the field at all. The notice text says so explicitly rather
 * than quietly pretending this is a verified bank link.
 */
export function AddDestinationSheet({
  visible,
  currency,
  onClose,
  onCreated,
}: {
  visible: boolean;
  currency?: string;
  onClose: () => void;
  onCreated: (destinationId: string) => void;
}) {
  const [type, setType] = useState<DestinationType>("bank_account");
  const [country, setCountry] = useState("MX");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreatePayoutDestination();

  if (!visible) return null;

  async function handleSubmit() {
    setError(null);
    if (!label.trim()) {
      setError(strings.payouts.addDestination.labelRequired);
      return;
    }
    if (country.trim().length !== 2) {
      setError(strings.payouts.addDestination.countryRequired);
      return;
    }
    try {
      const destination = await mutation.mutateAsync({
        type,
        country: country.trim().toUpperCase(),
        display_label: label.trim(),
        currency,
      });
      setLabel("");
      onCreated(destination.id);
    } catch (error) {
      setError(isApiError(error) ? friendlyMessage(error) : strings.compliance.genericError);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{strings.payouts.addDestination.title}</Text>
            <IconButton label={strings.common.close} onPress={onClose}>
              <Icon name="cerrar" size={18} color={colors.textPrimary} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.notice}>{strings.payouts.addDestination.notice}</Text>

            <View style={styles.typeRow}>
              <Button
                label={strings.payouts.addDestination.bankAccount}
                variant={type === "bank_account" ? "primary" : "secondary"}
                size="sm"
                onPress={() => setType("bank_account")}
              />
              <Button
                label={strings.payouts.addDestination.providerAccount}
                variant={type === "provider_account" ? "primary" : "secondary"}
                size="sm"
                onPress={() => setType("provider_account")}
              />
            </View>

            <TextInput
              label={strings.payouts.addDestination.labelField}
              placeholder={strings.payouts.addDestination.labelPlaceholder}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              label={strings.payouts.addDestination.countryField}
              placeholder="MX"
              value={country}
              onChangeText={(text) => setCountry(text.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
              maxLength={2}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={strings.payouts.addDestination.submit}
              fullWidth
              loading={mutation.isPending}
              onPress={() => void handleSubmit()}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: measures.mobileGutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  notice: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
