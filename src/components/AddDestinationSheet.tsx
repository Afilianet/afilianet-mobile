import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../design-system/icons/Icon";
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
      setError("Enter a label for this destination.");
      return;
    }
    if (country.trim().length !== 2) {
      setError("Enter a 2-letter country code.");
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
    } catch {
      setError("Couldn't add this destination. Please try again.");
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add payout destination</Text>
            <IconButton label="Close" onPress={onClose}>
              <Icon name="cerrar" size={18} color={colors.textPrimary} />
            </IconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.notice}>
              No payment provider is connected yet -- this label just identifies the destination in
              the app. It never stores a real account, card, or CLABE number.
            </Text>

            <View style={styles.typeRow}>
              <Button
                label="Bank account"
                variant={type === "bank_account" ? "primary" : "secondary"}
                size="sm"
                onPress={() => setType("bank_account")}
              />
              <Button
                label="Provider account"
                variant={type === "provider_account" ? "primary" : "secondary"}
                size="sm"
                onPress={() => setType("provider_account")}
              />
            </View>

            <TextInput label="Label" placeholder="e.g. My BBVA account" value={label} onChangeText={setLabel} />
            <TextInput
              label="Country"
              placeholder="MX"
              value={country}
              onChangeText={(text) => setCountry(text.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
              maxLength={2}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label="Add destination"
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
    backgroundColor: "rgba(12,10,20,0.6)",
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
