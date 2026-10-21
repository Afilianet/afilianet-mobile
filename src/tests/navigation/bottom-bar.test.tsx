import { useFocusEffect } from "expo-router";
import { screen } from "@testing-library/react-native";
import { act, fireEvent, renderRouter } from "expo-router/testing-library";
import { useCallback } from "react";
import { Text, View } from "react-native";
import AppTabsLayout from "../../app/(app)/_layout";
import SurveysLayout, { unstable_settings as surveysSettings } from "../../app/(app)/surveys/_layout";
import { registerLeaveGuard } from "../../navigation/leaveGuard";

/**
 * The REAL bottom bar (app/(app)/_layout.tsx) and the REAL Encuestas stack
 * (app/(app)/surveys/_layout.tsx), driven by expo-router's own router. Screens
 * are minimal stand-ins; the response one registers a leave guard the way the
 * real response screen does (its keepDraft() is tested in
 * survey-response.test.tsx: recording, draft, storage failure).
 */
jest.setTimeout(30_000);
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", apiTimeoutMs: 5000, appEnv: "development" } }));

let mockGuard: jest.Mock<Promise<boolean>, []>;
let resolveGuard: ((ok: boolean) => void) | null = null;

function Named({ name }: { name: string }) {
  return (
    <View>
      <Text>{`pantalla:${name}`}</Text>
    </View>
  );
}

function ResponseStandIn() {
  useFocusEffect(useCallback(() => registerLeaveGuard(() => mockGuard()), []));
  return <Named name="respuesta" />;
}

const routes = {
  "(app)/_layout": AppTabsLayout,
  "(app)/index": () => <Named name="inicio" />,
  "(app)/network": () => <Named name="red" />,
  "(app)/sales": () => <Named name="ventas" />,
  "(app)/wallet": () => <Named name="monedero" />,
  "(app)/profile": () => <Named name="perfil" />,
  "(app)/surveys/_layout": { default: SurveysLayout, unstable_settings: surveysSettings },
  "(app)/surveys/index": () => <Named name="lista-encuestas" />,
  "(app)/surveys/[surveyId]": () => <Named name="detalle-encuesta" />,
  "(app)/surveys/response/[draftId]": ResponseStandIn,
};

let app: ReturnType<typeof renderRouter>;
async function start(url: string) {
  const rendered = renderRouter(routes, { initialUrl: url });
  // RNTL 14 renders asynchronously and renderRouter does not wait for it.
  await (rendered as unknown as Promise<unknown>);
  app = rendered;
}
const pathname = () => app.getPathname();
type NavState = { routes: { name: string; state?: NavState }[]; index?: number };
/** The screens stacked inside the Encuestas section, by route name. */
function surveysStack(): string[] {
  const find = (state: NavState | undefined): NavState | undefined => {
    for (const route of state?.routes ?? []) {
      if (route.name === "surveys") return route.state;
      const inner = find(route.state);
      if (inner) return inner;
    }
    return undefined;
  };
  return (find(app.getRouterState() as unknown as NavState)?.routes ?? []).map((route) => route.name);
}
const tab = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });
const visible = (name: string) => screen.queryAllByText(`pantalla:${name}`).length > 0;

beforeEach(() => {
  resolveGuard = null;
  mockGuard = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      }),
  );
});

describe("Bottom bar on every main section, Encuestas included", () => {
  it.each([
    ["the survey list", "/surveys"],
    ["a survey", "/surveys/aaaaaaaa-0000-4000-8000-000000000001"],
    ["a response being answered", "/surveys/response/d-1"],
  ])("is visible and usable on %s", async (_where, url) => {
    await start(url);
    expect(pathname()).toBe(url);
    for (const label of ["Inicio", "Red", "Perfil"]) expect(tab(label)).toBeTruthy();
    // Encuestas is a section reached from Home, not a tab of its own.
    expect(screen.queryByRole("button", { name: /^Encuestas/ })).toBeNull();
  });

  it("without work at risk, a tab switches section at once", async () => {
    await start("/surveys");
    await act(async () => {
      fireEvent.press(tab("Red"));
    });
    expect(pathname()).toBe("/network");
    expect(mockGuard).not.toHaveBeenCalled();
  });
});

describe("Leaving a response from the bar runs its safe exit first", () => {
  it("waits for it (recording finished, draft saved), then switches section once, even after repeated taps", async () => {
    await start("/surveys/response/d-1");

    await act(async () => {
      fireEvent.press(tab("Red"));
      fireEvent.press(tab("Red"));
      fireEvent.press(tab("Inicio"));
    });
    expect(mockGuard).toHaveBeenCalledTimes(1);
    // Still on the response while it finishes and saves.
    expect(pathname()).toBe("/surveys/response/d-1");

    await act(async () => {
      resolveGuard?.(true);
    });
    expect(pathname()).toBe("/network");
    expect(visible("red")).toBe(true);
  });

  it("if it could not keep everything, the response stays on screen and nothing navigates", async () => {
    await start("/surveys/response/d-1");
    await act(async () => {
      fireEvent.press(tab("Inicio"));
    });
    await act(async () => {
      resolveGuard?.(false);
    });
    expect(pathname()).toBe("/surveys/response/d-1");
    expect(visible("respuesta")).toBe(true);

    // A later tap tries again; it can succeed then.
    await act(async () => {
      fireEvent.press(tab("Inicio"));
    });
    expect(mockGuard).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveGuard?.(true);
    });
    expect(pathname()).toBe("/");
  });

  it("coming back to Encuestas starts at the list: no stale response, no stacked copies, no loop", async () => {
    await start("/surveys/response/d-1");
    await act(async () => {
      fireEvent.press(tab("Perfil"));
    });
    await act(async () => {
      resolveGuard?.(true);
    });
    expect(pathname()).toBe("/profile");
    // Back into the section, as Home's «Abrir encuestas» does.
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      router.push("/surveys");
    });
    expect(pathname()).toBe("/surveys");
    expect(visible("lista-encuestas")).toBe(true);
    expect(visible("respuesta")).toBe(false);
    // Exactly the list: the old survey and response are not kept underneath.
    expect(surveysStack()).toEqual(["index"]);

    // The guard went with the response: leaving the list is immediate.
    await act(async () => {
      fireEvent.press(tab("Red"));
    });
    expect(pathname()).toBe("/network");
    expect(mockGuard).toHaveBeenCalledTimes(1);
  });

  it("a survey opened directly (e.g. from a notification) goes back to the list, not out of the section", async () => {
    await start("/surveys/aaaaaaaa-0000-4000-8000-000000000001");
    expect(surveysStack()).toEqual(["index", "[surveyId]"]);
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      router.back();
    });
    expect(pathname()).toBe("/surveys");
  });
});
