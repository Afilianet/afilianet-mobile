import { Text, View } from "react-native";
import type { AwsFaceLivenessViewProps } from "./AwsFaceLiveness.types";

// AWS's official Face Liveness native SDKs (both platforms wrapped by this
// module) have no web equivalent this module provides -- the app's web
// export target never offers real device camera capture at all (see
// afilianet-mobile's README), so this is a safe, inert placeholder rather
// than a crash at import time. No real Afilianet screen should ever
// actually render this on web; if one somehow did, this fails safely
// (visible, honest placeholder) instead of throwing.
export function AwsFaceLivenessView(_props: AwsFaceLivenessViewProps) {
  return (
    <View>
      <Text>Face liveness capture isn&apos;t available on web.</Text>
    </View>
  );
}
