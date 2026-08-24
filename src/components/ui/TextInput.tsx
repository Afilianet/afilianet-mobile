import { useState } from "react";
import { StyleSheet, Text, TextInput as RNTextInput, View, type TextInputProps as RNTextInputProps } from "react-native";
import { colors, radius, spacing, typography } from "./theme";

interface TextInputProps extends RNTextInputProps {
  label: string;
  helperText?: string;
  error?: string;
  /** CLABE, RFC, invitation codes -- monospaced, normal tracking. */
  mono?: boolean;
}

export function TextInput({ label, helperText, error, mono = false, style, onFocus, onBlur, ...inputProps }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const isEmphasized = focused || Boolean(error);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <RNTextInput
        style={[
          styles.input,
          mono ? styles.inputMono : null,
          {
            borderWidth: isEmphasized ? 2 : 1,
            borderColor: error ? colors.danger : focused ? colors.primaryHover : colors.border,
          },
          style,
        ]}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...inputProps}
      />
      {error || helperText ? <Text style={[styles.helper, error ? styles.error : null]}>{error || helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  label: {
    ...typography.bodyStrong,
    fontSize: typography.body.fontSize - 1,
    color: colors.textSecondary,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputMono: {
    fontFamily: typography.numeric.fontFamily,
    letterSpacing: 0.3,
  },
  helper: {
    ...typography.caption,
  },
  error: {
    color: colors.danger,
  },
});
