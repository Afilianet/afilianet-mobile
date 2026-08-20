import { View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../components/ui/theme";

export default function WalletScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState title="Wallet" description="Balances, transactions, and payouts will live here." />
    </View>
  );
}
