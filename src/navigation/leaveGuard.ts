/**
 * The bottom bar's "safe exit". A screen holding work that must not be lost
 * (today: a survey response, possibly with a recording in progress)
 * registers a guard while it is focused. Before the bar switches section it
 * runs that guard -- the same steps as the screen's own «Guardar borrador y
 * salir»: finish the recording, save the draft -- and only navigates when it
 * resolves true. On false the screen stays as it is and explains why.
 *
 * One guard at a time (the focused screen's), and one run at a time: a
 * second tab press while it runs is ignored rather than queued, so repeated
 * taps never save twice or navigate twice.
 */
export type LeaveGuard = () => Promise<boolean>;

let current: { id: symbol; guard: LeaveGuard } | null = null;
let running: Promise<boolean> | null = null;

/** Registers the focused screen's guard; returns the function that removes exactly this registration. */
export function registerLeaveGuard(guard: LeaveGuard): () => void {
  const id = Symbol("leave-guard");
  current = { id, guard };
  return () => {
    if (current?.id === id) current = null;
  };
}

export function hasLeaveGuard(): boolean {
  return current !== null;
}

/** True when there is nothing to protect or the guard kept the work safe; false to stay. Never throws. */
export async function runLeaveGuard(): Promise<boolean> {
  if (!current) return true;
  if (running) return false;
  const { guard } = current;
  running = guard().catch(() => false);
  try {
    return await running;
  } finally {
    running = null;
  }
}

/**
 * The bar's tabPress listener. Without a guard the press proceeds untouched.
 * With one, the press is held, the guard runs, and only a successful guard
 * navigates -- to the tab that was pressed, once.
 */
export function guardedTabPress(event: { preventDefault: () => void }, navigateToPressedTab: () => void): void {
  if (!hasLeaveGuard()) return;
  event.preventDefault();
  void runLeaveGuard().then((ok) => {
    if (ok) navigateToPressedTab();
  });
}
