import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { colors } from "../components/ui/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <EmptyState title="This screen doesn't exist" description="Let's get you back on track." />
        <Link href="/(app)" style={styles.link}>
          Go to home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    color: colors.primary,
    fontWeight: "600",
  },
});
