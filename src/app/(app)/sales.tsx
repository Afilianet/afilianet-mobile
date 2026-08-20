import { View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../components/ui/theme";

export default function SalesScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState title="Sales" description="Products and sales activity will live here." />
    </View>
  );
}
