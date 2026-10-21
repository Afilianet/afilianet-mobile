import { Stack, useNavigation } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Encuestas is a section of the bottom bar: its list, a survey and a response
 * form one stack under the bar, so the bar stays visible and usable on all
 * three. A response being answered is kept by its safe exit before the bar
 * leaves (navigation/leaveGuard.ts).
 *
 * The list is always at the bottom of this stack, also when a notification
 * opens a survey directly: «atrás» from it leads to the list.
 */
export const unstable_settings = { initialRouteName: "index" };

export default function SurveysLayout() {
  // This section, as a screen of the bottom bar.
  const section = useNavigation();
  // This stack's own navigation, captured from its screens.
  const stack = useRef<{ popToTop: () => void; getState: () => { index: number } } | null>(null);

  // Leaving the section returns it to its list, so coming back never shows a
  // stale survey or response, nor stacks a second list. Done from inside the
  // stack: the bar's view of it may not be complete yet after a direct link.
  useEffect(
    () =>
      section.addListener("blur", () => {
        // Only when something is above the list (popToTop on the list itself is not an action).
        if ((stack.current?.getState().index ?? 0) > 0) stack.current?.popToTop();
      }),
    [section],
  );

  return (
    <Stack
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation }) => ({
        focus: () => {
          stack.current = navigation as unknown as { popToTop: () => void; getState: () => { index: number } };
        },
      })}
    />
  );
}
