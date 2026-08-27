import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../api/errors";
import { AddDestinationSheet } from "../../components/AddDestinationSheet";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ForbiddenState } from "../../components/ForbiddenState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { IconButton } from "../../components/ui/IconButton";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, spacing, typography } from "../../components/ui/theme";
import { Icon } from "../../design-system/icons/Icon";
import { usePayoutDestinations } from "../../hooks/usePayoutDestinations";
import { usePayoutEligibility } from "../../hooks/usePayoutEligibility";
import { useRequestPayout } from "../../hooks/useRequestPayout";
import { analytics } from "../../services/analytics";
import { formatMoney, parseAmountInput, toMinorUnits } from "../../utils/money";

export default function PayoutRequestScreen() {
  const router = useRouter();
  const { currency } = useLocalSearchParams<{ currency: string }>();
  const eligibilityQuery = usePayoutEligibility(currency);
  const destinationsQuery = usePayoutDestinations();
  const requestMutation = useRequestPayout();

  const [amountText, setAmountText] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [addingDestination, setAddingDestination] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One idempotency key per screen visit (this "logical attempt") -- reused
  // across retries of the SAME attempt (e.g. a network error, then tapping
  // submit again) so a retry can never create a duplicate payout. A fresh
  // key is only generated if this screen is remounted (navigating away and
  // back is a genuinely new attempt).
  const [idempotencyKey] = useState(() => Crypto.randomUUID());

  useEffect(() => {
    analytics.capture("payout_request_started");
  }, []);

  const destinations = destinationsQuery.data?.data ?? [];
  const eligibility = eligibilityQuery.data;
  const amountResult = eligibility ? parseAmountInput(amountText || "0", currency) : null;
  const hasEnteredAmount = amountText.trim().length > 0;

  let amountError: string | null = null;
  if (hasEnteredAmount && amountResult && !amountResult.valid) {
    amountError = amountResult.error;
  } else if (hasEnteredAmount && amountResult?.valid && eligibility) {
    const eligibleMinor = toMinorUnits(eligibility.eligible_balance, currency);
    if (BigInt(amountResult.minorUnits) > eligibleMinor) {
      amountError = `You can withdraw up to ${formatMoney(eligibility.eligible_balance, currency)}.`;
    }
  }

  const canSubmit =
    Boolean(eligibility) &&
    hasEnteredAmount &&
    amountResult?.valid === true &&
    !amountError &&
    Boolean(selectedDestinationId) &&
    !requestMutation.isPending;

  async function handleSubmit() {
    if (!eligibility || !amountResult?.valid || !selectedDestinationId) return;
    setSubmitError(null);
    try {
      analytics.capture("payout_request_submitted");
      await requestMutation.mutateAsync({
        payout_destination_id: selectedDestinationId,
        currency,
        amount_minor: amountResult.minorUnits,
        idempotency_key: idempotencyKey,
      });
      Alert.alert("Payout requested", "Your withdrawal request has been submitted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      setSubmitError(isApiError(error) ? friendlyMessage(error) : "Something went wrong. Please try again.");
    }
  }

  const eligibilityError = isApiError(eligibilityQuery.error) ? eligibilityQuery.error : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="payout-request-scroll">
        <View style={styles.header}>
          <Text style={styles.heading}>Withdraw {currency}</Text>
          <IconButton label="Close" onPress={() => router.back()}>
            <Icon name="cerrar" size={18} color={colors.textPrimary} />
          </IconButton>
        </View>

        {eligibilityQuery.isPending ? (
          <SkeletonGroup lines={4} />
        ) : eligibilityError?.kind === "forbidden" ? (
          <ForbiddenState area="payout eligibility" />
        ) : eligibilityError ? (
          <ErrorState
            error={eligibilityError}
            onRetry={() => void eligibilityQuery.refetch()}
            retrying={eligibilityQuery.isFetching}
          />
        ) : eligibility ? (
          <>
            <Card style={styles.eligibilityCard}>
              <Text
                style={styles.eligibleAmount}
                accessibilityLabel={`Eligible to withdraw: ${formatMoney(eligibility.eligible_balance, currency)}`}
              >
                {formatMoney(eligibility.eligible_balance, currency)}
              </Text>
              <Text style={styles.meta}>Eligible to withdraw</Text>
              {Number(eligibility.minimum_payout) > 0 ? (
                <Text style={styles.meta}>Minimum: {formatMoney(eligibility.minimum_payout, currency)}</Text>
              ) : null}
            </Card>

            <TextInput
              label="Amount"
              accessibilityLabel="Amount"
              placeholder="0.00"
              keyboardType="decimal-pad"
              mono
              value={amountText}
              onChangeText={setAmountText}
              error={amountError ?? undefined}
            />

            <Card style={styles.destinationsCard}>
              <View style={styles.destinationsHeader}>
                <Text style={styles.label}>Payout destination</Text>
                <Button label="Add new" variant="ghost" size="sm" onPress={() => setAddingDestination(true)} />
              </View>
              {destinationsQuery.isPending ? (
                <SkeletonGroup lines={2} />
              ) : destinations.length === 0 ? (
                <EmptyState
                  title="No payout destination yet"
                  description="Add one to continue with this withdrawal."
                />
              ) : (
                destinations.map((destination) => (
                  <Pressable
                    key={destination.id}
                    onPress={() => setSelectedDestinationId(destination.id)}
                    style={[
                      styles.destinationRow,
                      selectedDestinationId === destination.id ? styles.destinationRowSelected : null,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedDestinationId === destination.id }}
                    accessibilityLabel={destination.display_label}
                  >
                    <Text style={styles.destinationLabel}>{destination.display_label}</Text>
                    {selectedDestinationId === destination.id ? (
                      <Icon name="check" size={16} color={colors.primary} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </Card>

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <Button
              label="Request payout"
              fullWidth
              disabled={!canSubmit}
              loading={requestMutation.isPending}
              onPress={() => void handleSubmit()}
            />
          </>
        ) : null}
      </ScrollView>

      <AddDestinationSheet
        visible={addingDestination}
        currency={currency}
        onClose={() => setAddingDestination(false)}
        onCreated={(destinationId) => {
          setSelectedDestinationId(destinationId);
          setAddingDestination(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: measures.mobileGutter,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  eligibilityCard: {
    alignItems: "center",
    gap: 2,
  },
  eligibleAmount: {
    ...typography.display,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
  destinationsCard: {
    gap: spacing.sm,
  },
  destinationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  destinationRowSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  destinationLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  submitError: {
    ...typography.body,
    color: colors.danger,
  },
});
