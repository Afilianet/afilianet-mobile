import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { strings } from "../i18n";
import { colors } from "../components/ui/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: strings.notFoundScreen.stackTitle }} />
      <View style={styles.container}>
        <EmptyState title={strings.notFoundScreen.title} description={strings.notFoundScreen.description} />
        <Link href="/(app)" style={styles.link}>
          {strings.notFoundScreen.goHome}
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
