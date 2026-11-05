import { useFocusEffect } from "expo-router";
import { screen } from "@testing-library/react-native";
import { act, fireEvent, renderRouter } from "expo-router/testing-library";
import { useCallback } from "react";
import { Text, View } from "react-native";
import AppTabsLayout from "../../app/(app)/_layout";
import SurveysLayout, { unstable_settings as surveysSettings } from "../../app/(app)/surveys/_layout";
import { registerLeaveGuard } from "../../navigation/leaveGuard";
import { RootStack } from "../../navigation/RootStack";
import { openFromOverlay, resetTo } from "../../navigation/rootNavigation";

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

function ReferralStandIn() {
  const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
  return (
    <View>
      <Text>pantalla:liga-referido</Text>
      <Text accessibilityRole="button" onPress={() => router.back()}>
        Cerrar
      </Text>
    </View>
  );
}

const routes = {
  // The app's REAL root navigator (app/_layout.tsx renders it).
  _layout: RootStack,
  "(auth)/login": () => <Named name="login" />,
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
  // A root screen outside the bar, like the notification detail (app/notification/[id].tsx).
  "notification/[id]": () => <Named name="detalle-notificacion" />,
  // «Invitar a alguien» from Red: an overlay without the bar, closed with «Cerrar» (router.back), as app/referral.tsx.
  referral: ReferralStandIn,
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
/** The screens of the root stack, by route name. */
const rootStack = () => ((app.getRouterState() as unknown as NavState).routes[0].state?.routes ?? []).map((route) => route.name);
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

  it.each([
    ["the survey list", "/surveys", "index", "lista-encuestas"],
    ["one survey", "/surveys/aaaaaaaa-0000-4000-8000-000000000001", "[surveyId]", "detalle-encuesta"],
  ])("from a notification's detail (a screen without the bar), opening %s reaches Encuestas on the SAME bar", async (_label, url, stack, name) => {
    await start("/");
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      router.push("/notification/n-1");
    });
    expect(pathname()).toBe("/notification/n-1");
    expect(rootStack()).toEqual(["(app)", "notification/[id]"]);
    await act(async () => {
      openFromOverlay(router, url);
    });
    expect(pathname()).toBe(url);
    expect(visible(name)).toBe(true);
    // The notification closed onto the existing bar: never a second bar underneath.
    expect(rootStack()).toEqual(["(app)"]);
    expect(surveysStack().at(-1)).toBe(stack);
  });

});

describe("Red → «Invitar a alguien»", () => {
  it.each([
    ["«Cerrar»", async () => fireEvent.press(screen.getByText("Cerrar"))],
    ["Android's back", async () => (jest.requireActual("expo-router") as typeof import("expo-router")).router.back()],
  ])("opens the referral link without the bar (on purpose) and %s returns to Red with the bar", async (_label, close) => {
    // As on the phone: the app opens on Inicio and Red is chosen in the bar.
    await start("/");
    await act(async () => {
      fireEvent.press(tab("Red"));
    });
    expect(pathname()).toBe("/network");
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      router.push("/referral");
    });
    expect(pathname()).toBe("/referral");
    expect(visible("liga-referido")).toBe(true);
    // An overlay: no bar, so no second way into the same section.
    expect(screen.queryByRole("button", { name: /^Inicio/ })).toBeNull();

    await act(async () => {
      await close();
    });
    expect(pathname()).toBe("/network");
    expect(visible("red")).toBe(true);
    expect(tab("Inicio")).toBeTruthy();
  });
});

describe("Redirects start over (sign-out, sign-in, organization, privacy review)", () => {
  it("from a screen without the bar, the previous sections are not left under the login: «atrás» cannot return to them", async () => {
    await start("/");
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      fireEvent.press(tab("Red"));
    });
    await act(async () => {
      router.push("/referral");
    });
    expect(rootStack()).toEqual(["(app)", "referral"]);

    await act(async () => {
      resetTo(router, "/login");
    });
    expect(pathname()).toBe("/login");
    expect(rootStack()).toEqual(["(auth)/login"]);
    expect(router.canGoBack()).toBe(false);
  });

  it("also from inside Encuestas", async () => {
    await start("/surveys/aaaaaaaa-0000-4000-8000-000000000001");
    const { router } = jest.requireActual("expo-router") as typeof import("expo-router");
    await act(async () => {
      resetTo(router, "/login");
    });
    expect(pathname()).toBe("/login");
    expect(rootStack()).toEqual(["(auth)/login"]);
  });
});

