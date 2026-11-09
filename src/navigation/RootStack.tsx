import { Stack } from "expo-router";

/**
 * The app's root navigator (app/_layout.tsx). A stack, not a Slot: a screen
 * without the bar (notifications, the referral link, capture flows...) opens
 * ON TOP of the section it came from, which stays as it was, and «Cerrar» or
 * «atrás» returns to it. With a Slot the whole bar was replaced, and going
 * back rebuilt it at Inicio. Headers are each screen's own.
 */
export function RootStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
