// Isolated visual-direction demo -- NOT a production screen. Expo Router
// ignores any file/folder prefixed with "_" when building its route table
// (https://docs.expo.dev/router/advanced/router-settings/#ignoring-a-route),
// so this file creates no navigable route and is unreachable from the app's
// real navigation. It exists only so a developer can run it directly
// (e.g. temporarily renaming this one file to drop the "_dev/" prefix,
// or via a deep link during local development) to inspect the two
// proposals on-device. See src/design-system/demo/README.md for scope,
// what it reuses, and how to remove it entirely once a direction is chosen.
import { BrandDirectionDemo } from "../../design-system/demo/BrandDirectionDemo";

export default function BrandDemoRoute() {
  return <BrandDirectionDemo />;
}
