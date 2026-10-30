import { CommercialFeatureGate } from "../../components/CommercialFeatureGate";
import { StyleSheet, View } from "react-native";
import { ActiveOrganizationBar } from "../../components/ActiveOrganizationBar";
import { EmptyState } from "../../components/EmptyState";
import { colors, measures } from "../../components/ui/theme";
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
    <View style={styles.screen}>
      <View style={styles.bar}>
        <ActiveOrganizationBar />
      </View>
      <EmptyState title={strings.sales.title} description={strings.sales.description} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: { paddingHorizontal: measures.mobileGutter, paddingTop: measures.mobileGutter },
});
