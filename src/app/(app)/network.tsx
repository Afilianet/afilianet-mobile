import { useRouter } from "expo-router";
import { View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors } from "../../components/ui/theme";
import { routes } from "../../navigation/routes";

export default function NetworkScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState
        title="Network"
        description="Your downline and network tree will live here. For now, invite people using your referral link."
        action={<Button label="Invite & share" onPress={() => router.push(routes.referral as never)} />}
      />
    </View>
  );
}
