import { act, fireEvent, render, within } from "@testing-library/react-native";
import { useEffect, useState, type ComponentType } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { OutboxPanel } from "../../features/surveys/components";
import { downloadVersion, listDrafts, refreshInbox } from "../../features/surveys/library";
import { listOutbox, listReceipts } from "../../features/surveys/outbox";
import SurveyResponseScreen from "../../app/survey-response/[draftId]";
import SurveyDetailScreen from "../../app/surveys/[surveyId]";
import SurveysInboxScreen from "../../app/surveys/index";

/**
 * Physical findings on the survey journey (exit, close loop, draft vs. send,
 * completeness after the receipt, answering without a manual download).
 *
 * The real survey library, outbox and sample source run against in-memory
 * storage. Navigation is simulated two ways:
 * - "slot": what this app has today -- the root <Slot /> in expo-router 57
 *   uses a StackRouter (history grows with push/replace) and renders only the
 *   top route (the ones below unmount);
 * - "native": a native stack, which keeps the screens below mounted.
 */
jest.setTimeout(90_000);

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", appEnv: "development" } }));
jest.mock("../../features/surveys/vault", () => {
  const files = new Map<string, string>();
  const key = (scope: { userId: string; organizationId: string }, name: string) => `${scope.userId}/${scope.organizationId}/${name}`;
  return {
    __files: files,
    sealJson: jest.fn(async (scope, name: string, value: unknown) => void files.set(key(scope, name), JSON.stringify(value))),
    openJson: jest.fn(async (scope, name: string) => (files.has(key(scope, name)) ? JSON.parse(files.get(key(scope, name))!) : null)),
    removeItem: jest.fn(async (scope, name: string) => void files.delete(key(scope, name))),
    sealBytes: jest.fn(async () => 0),
    openBytes: jest.fn(async () => null),
    listScopes: jest.fn(async () => []),
    scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
    StorageFullError: class extends Error {},
  };
});

// The signed-in session the outbox checks before each send (no real API session here).
jest.mock("../../api/client", () => ({ ...jest.requireActual("../../api/client"), captureApiSessionGuard: () => () => true }));

// expo-crypto has no native module under Jest (randomUUID returns undefined).
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ ...jest.requireActual("expo-crypto"), randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, "0")}` }));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
// Offline keeps a sent response in «Envíos» (no automatic send to the sample server).
let mockOnline = true;
jest.mock("../../features/surveys/runtime", () => {
  const { createFixtureSurveySource } = jest.requireActual("../../features/surveys/fixtureSource");
  const { ApiError } = jest.requireActual("../../api/errors");
  return {
    useSurveyScope: () => mockScope,
    surveySource: createFixtureSurveySource(async () => {
      if (!mockOnline) throw new ApiError("offline", "Sin conexión.");
    }),
    surveysPreviewEnabled: true,
  };
});
jest.mock("../../features/surveys/useInterviewRecorder", () => ({
  useInterviewRecorder: () => ({ phase: "idle", elapsedMs: 0, message: null, canOpenSettings: false, start: jest.fn(), stop: jest.fn(), openSettings: jest.fn() }),
  formatDuration: (ms: number) => `${Math.round(ms / 1000)}s`,
}));

jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const ParamsContext = React.createContext({});
  const FocusContext = React.createContext(true);
  const navigation = {
    push: (_: string) => undefined,
    back: () => undefined,
    replace: (_: string) => undefined,
    canGoBack: () => false,
  };
  return {
    __ParamsContext: ParamsContext,
    __FocusContext: FocusContext,
    __navigation: navigation,
    useRouter: () => ({
      push: (path: string) => navigation.push(path),
      back: () => navigation.back(),
      replace: (path: string) => navigation.replace(path),
      canGoBack: () => navigation.canGoBack(),
    }),
    useLocalSearchParams: () => React.useContext(ParamsContext),
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = React.useContext(FocusContext);
      React.useEffect(() => (focused ? effect() : undefined), [focused, effect]);
    },
  };
});

const router = jest.requireMock("expo-router") as {
  __ParamsContext: React.Context<Record<string, string>>;
  __FocusContext: React.Context<boolean>;
  __navigation: { push: (path: string) => void; back: () => void; replace: (path: string) => void; canGoBack: () => boolean };
};
const files = (jest.requireMock("../../features/surveys/vault") as { __files: Map<string, string> }).__files;

const SCOPE = { userId: "user-1", organizationId: "org-a" };
const HOME = "/";

function HomeStub() {
  const { useRouter } = jest.requireMock("expo-router") as { useRouter: () => { push(path: string): void } };
  const navigation = useRouter();
  return (
    <View>
      <Text>Inicio</Text>
      <Pressable accessibilityRole="button" onPress={() => navigation.push("/surveys")}>
        <Text>Encuestas</Text>
      </Pressable>
    </View>
  );
}

function screenFor(path: string): { Screen: ComponentType; params: Record<string, string> } {
  const response = path.match(/^\/survey-response\/(.+)$/);
  if (response) return { Screen: SurveyResponseScreen, params: { draftId: decodeURIComponent(response[1]) } };
  const detail = path.match(/^\/surveys\/(.+)$/);
  if (detail) return { Screen: SurveyDetailScreen, params: { surveyId: decodeURIComponent(detail[1]) } };
  if (path === "/surveys") return { Screen: SurveysInboxScreen, params: {} };
  if (path === HOME) return { Screen: HomeStub, params: {} };
  return { Screen: () => <Text>{`unknown ${path}`}</Text>, params: {} };
}

type Mode = "slot" | "native";
let currentStack: string[] = [];
let deepest = 0;
let entryKey = 0;

function Navigator({ mode, initial }: { mode: Mode; initial: string[] }) {
  const [stack, setStack] = useState(() => initial.map((path) => ({ path, key: entryKey++ })));
  useEffect(() => {
    currentStack = stack.map((entry) => entry.path);
    deepest = Math.max(deepest, stack.length);
  }, [stack]);
  useEffect(() => {
    router.__navigation.push = (path) => setStack((current) => [...current, { path, key: entryKey++ }]);
    router.__navigation.back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
    router.__navigation.replace = (path) => setStack((current) => [...current.slice(0, -1), { path, key: entryKey++ }]);
    router.__navigation.canGoBack = () => currentStack.length > 1;
  }, []);
  const rendered = mode === "slot" ? stack.slice(-1) : stack;
  return (
    <>
      {rendered.map((entry) => {
        const { Screen, params } = screenFor(entry.path);
        const focused = entry === stack[stack.length - 1];
        return (
          <router.__ParamsContext.Provider key={entry.key} value={params}>
            <router.__FocusContext.Provider value={focused}>
              {/* Same element tree focused or not: focus changes never remount a screen. */}
              <View testID={focused ? "visible-screen" : "hidden-screen"} style={focused ? undefined : { display: "none" }}>
                <Screen />
              </View>
            </router.__FocusContext.Provider>
          </router.__ParamsContext.Provider>
        );
      })}
    </>
  );
}

type RenderedScreen = Awaited<ReturnType<typeof render>>;

async function settle(ms = 20) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderNavigator(mode: Mode, initial: string[] = [HOME]) {
  let screen!: RenderedScreen;
  await act(async () => {
    screen = await render(<Navigator mode={mode} initial={initial} />);
  });
  await settle();
  return screen;
}

function isInside(node: { parent: unknown }, container: unknown): boolean {
  let current = node as { parent: unknown } | null;
  while (current) {
    if (current === container) return true;
    current = current.parent as { parent: unknown } | null;
  }
  return false;
}

/** Only what is on the top (focused) screen. */
function top(screen: RenderedScreen) {
  const hidden = screen.queryAllByTestId("hidden-screen");
  const shown = <T extends { parent: unknown }>(nodes: T[]) => nodes.filter((node) => !hidden.some((container) => isInside(node, container)));
  const one = <T extends { parent: unknown }>(nodes: T[], what: string) => {
    const [first] = shown(nodes);
    if (!first) throw new Error(`Not visible: ${what}`);
    return first;
  };
  return {
    getByText: (text: string | RegExp) => one(screen.queryAllByText(text), String(text)),
    queryByText: (text: string | RegExp) => shown(screen.queryAllByText(text))[0] ?? null,
    getByLabelText: (text: string) => one(screen.queryAllByLabelText(text), text),
  };
}

async function tap(screen: RenderedScreen, text: string | RegExp) {
  await act(async () => {
    fireEvent.press(top(screen).getByText(text));
  });
  await settle();
}

async function close(screen: RenderedScreen) {
  await act(async () => {
    fireEvent.press(top(screen).getByLabelText("Cerrar"));
  });
  await settle();
}

async function type(screen: RenderedScreen, label: string, value: string) {
  await act(async () => {
    fireEvent.changeText(top(screen).getByLabelText(label), value);
  });
}

async function openSatisfaction(screen: RenderedScreen) {
  await tap(screen, "Encuestas");
  // The list shows each survey's card; open the satisfaction one.
  await act(async () => {
    fireEvent.press(within(screen.getByTestId("survey-fx-servicio")).getByText("Abrir"));
  });
  await settle();
}

async function seed({ download }: { download: boolean }) {
  const { surveySource } = jest.requireMock("../../features/surveys/runtime") as { surveySource: { reset(): Promise<void> } };
  await surveySource.reset();
  const inbox = await refreshInbox(SCOPE, surveySource as never);
  if (download) for (const survey of inbox.surveys) await downloadVersion(SCOPE, surveySource as never, survey);
}

beforeEach(async () => {
  files.clear();
  mockScope = { ...SCOPE };
  mockOnline = true;
  currentStack = [];
  deepest = 0;
  await seed({ download: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each<Mode>(["slot", "native"])("Survey journey (%s navigation)", (mode) => {
  it("list → survey → response → save draft and exit → continue → send → close → home, twice, without piling up routes", async () => {
    mockOnline = false; // the sent response stays in «Envíos» for the assertions below
    const screen = await renderNavigator(mode);

    for (const round of [1, 2]) {
      deepest = 0;
      await openSatisfaction(screen);
      expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio"]);

      await tap(screen, "Responder yo");
      await type(screen, "Tu respuesta (número)", "12");
      await type(screen, "Tu respuesta", `Ronda ${round}`);
      // Explicit draft: kept, editable later.
      await tap(screen, "Guardar borrador y salir");
      expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio"]);
      expect(top(screen).getByText("Borrador")).toBeTruthy();

      await tap(screen, "Continuar");
      expect(top(screen).getByLabelText("Tu respuesta (número)").props.value).toBe("12");
      expect(top(screen).getByLabelText("Tu respuesta").props.value).toBe(`Ronda ${round}`);
      // The response screen has its own visible exit; it also keeps the draft.
      await close(screen);
      expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio"]);
      await tap(screen, "Continuar");

      expect(top(screen).getByText(/ya no se puede editar/)).toBeTruthy();
      await tap(screen, "Muy buena");
      await tap(screen, "4");
      await tap(screen, "Enviar respuesta");
      // Back to the survey that opened it -- never a second copy of the list.
      expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio"]);
      expect(top(screen).queryByText("Borrador")).toBeNull();
      expect(await listDrafts(SCOPE)).toEqual([]);

      await close(screen);
      expect(currentStack).toEqual([HOME, "/surveys"]);
      expect(top(screen).getByText("Completa")).toBeTruthy();
      expect(top(screen).getByText(/Enviada desde este teléfono; ya no se puede editar/)).toBeTruthy();
      expect(top(screen).queryByText("Continuar")).toBeNull();

      await close(screen);
      expect(currentStack).toEqual([HOME]);
      expect(top(screen).getByText("Inicio")).toBeTruthy();
      expect(deepest).toBe(4);
    }
    expect(await listOutbox(SCOPE)).toHaveLength(2);
  });
});

describe("Survey journey: sending incomplete, completeness after the receipt", () => {
  it("«Enviar incompleta» explains it can no longer be edited; the condition stays visible after «Recibido»", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockOnline = false;
    const screen = await renderNavigator("slot", [HOME, "/surveys", "/surveys/fx-vecinal"]);
    await tap(screen, "Iniciar entrevista");
    await tap(screen, "Continuar sin grabar");
    await type(screen, "Tu respuesta", "Baches");
    await tap(screen, "Enviar respuesta");

    const [title, body, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe("Hay preguntas obligatorias sin responder");
    expect(body).toMatch(/ya no podrás editarla/);
    expect(buttons.map((button) => button.text)).toEqual(["Seguir respondiendo", "Guardar borrador y salir", "Enviar incompleta"]);
    await act(async () => {
      buttons.find((button) => button.text === "Enviar incompleta")?.onPress?.();
    });
    await settle(50);
    expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-vecinal"]);
    await close(screen);

    // Sync state (badge) and completeness are separate lines. Offline, the
    // automatic attempt on opening the list leaves it pending.
    expect(top(screen).getByText(/^(Guardado en el dispositivo|Pendiente de sincronizar)$/)).toBeTruthy();
    expect(top(screen).getByText("Incompleta: 2 preguntas obligatorias sin responder")).toBeTruthy();

    // Back online: the server confirms it; it is still marked incomplete.
    mockOnline = true;
    await tap(screen, "Sincronizar ahora");
    await settle(100);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect((await listReceipts(SCOPE))[0].missingRequired).toBe(2);
    expect(top(screen).getByText("Recibido")).toBeTruthy();
    expect(top(screen).getByText("Incompleta: 2 preguntas obligatorias sin responder")).toBeTruthy();
  });

  it("«Guardar borrador y salir» from the incomplete warning keeps it as an editable draft", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderNavigator("slot", [HOME, "/surveys", "/surveys/fx-vecinal"]);
    await tap(screen, "Iniciar entrevista");
    await tap(screen, "Continuar sin grabar");
    await type(screen, "Tu respuesta", "Baches");
    await tap(screen, "Enviar respuesta");
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === "Guardar borrador y salir")?.onPress?.();
    });
    await settle(50);
    expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-vecinal"]);
    expect(await listOutbox(SCOPE)).toEqual([]);
    expect((await listDrafts(SCOPE))[0].answers).toEqual({ 2: "Baches" });
    expect(top(screen).getByText("Borrador")).toBeTruthy();
  });

  it("never invents the condition of a receipt recorded before it was tracked", async () => {
    const screen = await render(
      <OutboxPanel
        items={[]}
        receipts={[{ id: "old", surveyTitle: "Antigua", receivedAt: "2026-10-10T10:00:00Z", withAudio: false }]}
        syncing={false}
        progress={null}
        message={null}
        onSync={jest.fn()}
        onDiscard={jest.fn()}
        onDiscardAudio={jest.fn()}
      />,
    );
    expect(screen.getByText("Recibido")).toBeTruthy();
    expect(screen.queryByText("Completa")).toBeNull();
    expect(screen.queryByText(/Incompleta/)).toBeNull();
  });
});

describe("Survey journey: answering without a manual download", () => {
  beforeEach(async () => {
    files.clear();
    await seed({ download: false });
  });

  it("online, «Responder yo» prepares the download itself and opens the response", async () => {
    const screen = await renderNavigator("slot", [HOME, "/surveys", "/surveys/fx-servicio"]);
    expect(top(screen).getByText("Descargar para usar sin conexión")).toBeTruthy();
    await tap(screen, "Responder yo");
    expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio", expect.stringMatching(/^\/survey-response\//)]);
    expect(top(screen).getByText("Satisfacción con el servicio (ejemplo)")).toBeTruthy();
  });

  it("offline with nothing on the phone, explains what is missing instead of opening an empty response", async () => {
    const screen = await renderNavigator("slot", [HOME, "/surveys", "/surveys/fx-servicio"]);
    mockOnline = false;
    await tap(screen, "Responder yo");
    expect(currentStack).toEqual([HOME, "/surveys", "/surveys/fx-servicio"]);
    expect(top(screen).getByText(/Sin conexión, y esta encuesta no está en el teléfono/)).toBeTruthy();
    expect(await listDrafts(SCOPE)).toEqual([]);
  });
});

describe("Survey journey: isolation", () => {
  it("never lists one account's or organization's draft under another", async () => {
    const screen = await renderNavigator("native", [HOME, "/surveys", "/surveys/fx-servicio"]);
    await tap(screen, "Responder yo");
    await type(screen, "Tu respuesta", "Privado");
    await tap(screen, "Guardar borrador y salir");
    await close(screen);
    expect(top(screen).getByText("Borrador")).toBeTruthy();

    mockScope = { userId: "user-1", organizationId: "org-b" };
    await act(async () => {
      screen.rerender(<Navigator key="org-b" mode="native" initial={[HOME, "/surveys"]} />);
    });
    await settle();
    expect(top(screen).getByText("Envíos")).toBeTruthy();
    expect(top(screen).queryByText("Borrador")).toBeNull();
    expect(top(screen).queryByText("Continuar")).toBeNull();
  });
});
