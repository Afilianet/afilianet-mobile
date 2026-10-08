/**
 * Isolated visual-direction demo route -- NOT reachable in a release build.
 *
 * CORRECTION from this branch's first pass: that version assumed Expo
 * Router excludes a path under an underscore-prefixed folder (`_dev/`) from
 * its route table. Verified directly against this project's installed
 * expo-router (57.0.15) instead of assuming: its file-scanning step
 * (expo-router/build/testing-library/require-context-ponyfill.js, the same
 * context-building logic Metro's require.context uses) and its route-
 * generation ignore list (expo-router/build/getRoutesCore.js) only special-
 * case `_layout`, `+html`, `+not-found`, `+api`, and `+middleware` -- there
 * is no underscore-prefix exclusion. A file under `_dev/` WOULD have become
 * a real, navigable route. That file has been removed.
 *
 * This route instead uses the same proven, already-shipped, already-
 * audited double gate `isDevelopmentSimulatorEnabled` uses for the
 * Compliance Fake-provider simulator (src/config/env.ts): `__DEV__` is a
 * build-time constant compiled to `false` and dead-code-eliminated out of
 * every release/EAS build regardless of environment, AND
 * EXPO_PUBLIC_APP_ENV must explicitly be "development". A release build
 * (or any internal/staging/production build) renders the plain fallback
 * below instead of the demo, structurally, not by relying on a route
 * naming convention.
 *
 * See src/design-system/demo/README.md for the verified steps to open this
 * during local development.
 */
import { Text, View } from "react-native";
import { isDevelopmentSimulatorEnabled } from "../config/env";
import { BrandDirectionDemo } from "../design-system/demo/BrandDirectionDemo";

export default function DevBrandDemoRoute() {
  if (!isDevelopmentSimulatorEnabled) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text>No disponible.</Text>
      </View>
    );
  }
  return <BrandDirectionDemo />;
}
