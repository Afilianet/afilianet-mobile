import { CommercialFeatureGate } from "../../components/CommercialFeatureGate";
import { View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { colors } from "../../components/ui/theme";
import { strings } from "../../i18n";

export default function SalesScreen() {
  return (
    <CommercialFeatureGate>
      <SalesScreenContent />
    </CommercialFeatureGate>
  );
}

function SalesScreenContent() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState title={strings.sales.title} description={strings.sales.description} />
    </View>
  );
}
