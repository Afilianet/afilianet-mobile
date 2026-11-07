import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * «Cerrar» for a screen opened on top of a section: goes back ONCE.
 *
 * `router.back()` is global -- it goes back from whatever is on display when
 * it runs. While this screen is still animating out (a slow phone), a second
 * tap on its «Cerrar» used to run it again, and that second «atrás» was taken
 * by the bottom bar, which goes back through its own history (Red → Inicio).
 * The person saw Inicio instead of the section they came from. Only the
 * first press counts; the screen is gone after it.
 */
export function useCloseScreen(): () => void {
  const router = useRouter();
  const closing = useRef(false);
  return useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    router.back();
  }, [router]);
}
