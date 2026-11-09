import { StyleSheet, View } from "react-native";
import { strings } from "../../i18n";
import { Button } from "../ui/Button";
import { spacing } from "../ui/theme";

export type AccessChannel = "email" | "phone";

/** Email vs. mobile choice for sign-in and recovery. Registration uses both fields instead. */
export function ChannelToggle({ value, onChange }: { value: AccessChannel; onChange: (channel: AccessChannel) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {(["email", "phone"] as const).map((channel) => (
        <View key={channel} style={styles.item}>
          <Button
            label={strings.access.channel[channel]}
            variant={value === channel ? "primary" : "ghost"}
            size="sm"
            accessibilityLabel={strings.access.channelChoiceA11y(strings.access.channel[channel])}
            accessibilityState={{ selected: value === channel }}
            onPress={() => onChange(channel)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  item: { flex: 1 },
});
