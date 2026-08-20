import { View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../components/ui/theme";

export default function NetworkScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState title="Network" description="Your downline and referral network will live here." />
    </View>
  );
}
