import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { strings } from "../../i18n";
import { PHONE_COUNTRIES, type PhoneCountry } from "../../utils/phone";
import { TextInput } from "../ui/TextInput";
import { colors, radius, spacing, typography } from "../ui/theme";

/**
 * Country selector + national number. The caller normalizes with
 * utils/phone.ts#normalizePhone before sending anything: this field only
 * collects what the person typed.
 */
export function PhoneField({
  country,
  onCountryChange,
  value,
  onChangeText,
  error,
  label = strings.access.phoneLabel,
}: {
  country: PhoneCountry;
  onCountryChange: (country: PhoneCountry) => void;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  label?: string;
}) {
  const [choosing, setChoosing] = useState(false);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{strings.access.countryLabel}</Text>
      <Pressable
        testID="phone-country"
        accessibilityRole="button"
        accessibilityLabel={strings.access.countryA11y(country.name, country.dialCode)}
        accessibilityState={{ expanded: choosing }}
        onPress={() => setChoosing((open) => !open)}
        style={styles.country}
      >
        <Text style={styles.countryText}>{`${country.name} (+${country.dialCode})`}</Text>
      </Pressable>
      {choosing ? (
        <View style={styles.list} accessibilityRole="list">
          {PHONE_COUNTRIES.map((option) => (
            <Pressable
              key={option.iso}
              accessibilityRole="button"
              accessibilityState={{ selected: option.iso === country.iso }}
              onPress={() => {
                onCountryChange(option);
                setChoosing(false);
              }}
              style={[styles.option, option.iso === country.iso ? styles.optionSelected : null]}
            >
              <Text style={styles.countryText}>{`${option.name} (+${option.dialCode})`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        helperText={strings.access.phoneHint}
        error={error}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { ...typography.label, color: colors.textSecondary },
  country: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  countryText: { ...typography.body, color: colors.textPrimary },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  optionSelected: { backgroundColor: colors.surfaceRaised },
});
