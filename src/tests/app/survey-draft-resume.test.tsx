import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useEffect, useState, type ComponentType } from "react";
import { Alert, Text } from "react-native";
import { downloadVersion, listDrafts, refreshInbox } from "../../features/surveys/library";
import { listOutbox } from "../../features/surveys/outbox";
import SurveyResponseScreen from "../../app/survey-response/[draftId]";
import SurveyDetailScreen from "../../app/surveys/[surveyId]";
import SurveysInboxScreen from "../../app/surveys/index";

/**
 * Physical finding: an incomplete response could not be reopened. The real
 * survey library, outbox and sample source run here against in-memory
 * storage; only the native stack is simulated -- like expo-router's native
 * stack, a screen stays mounted under the one pushed on top of it, and
 * useFocusEffect runs only for the screen that is visible.
 */
jest.setTimeout(60_000);

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

// expo-crypto has no native module under Jest (randomUUID returns undefined).
let mockUuid = 0;
jest.mock("expo-crypto", () => ({ ...jest.requireActual("expo-crypto"), randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, "0")}` }));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
// Offline keeps a saved response in the outbox (no automatic send to the sample server).
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
  const navigation = { push: (_: string) => undefined, back: () => undefined, replace: (_: string) => undefined };
  return {
    __ParamsContext: ParamsContext,
    __FocusContext: FocusContext,
    __navigation: navigation,
    useRouter: () => ({
      push: (path: string) => navigation.push(path),
      back: () => navigation.back(),
      replace: (path: string) => navigation.replace(path),
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
  __navigation: { push: (path: string) => void; back: () => void; replace: (path: string) => void };
};
const files = (jest.requireMock("../../features/surveys/vault") as { __files: Map<string, string> }).__files;

const SCOPE = { userId: "user-1", organizationId: "org-a" };
const SATISFACTION = "fx-servicio";

function screenFor(path: string): { Screen: ComponentType; params: Record<string, string> } {
  const response = path.match(/^\/survey-response\/(.+)$/);
  if (response) return { Screen: SurveyResponseScreen, params: { draftId: decodeURIComponent(response[1]) } };
  const detail = path.match(/^\/surveys\/(.+)$/);
  if (detail) return { Screen: SurveyDetailScreen, params: { surveyId: decodeURIComponent(detail[1]) } };
  if (path === "/surveys") return { Screen: SurveysInboxScreen, params: {} };
  return { Screen: () => <Text>{`unknown ${path}`}</Text>, params: {} };
}

let entryKey = 0;
function NativeStack({ initial }: { initial: string[] }) {
  const [stack, setStack] = useState(() => initial.map((path) => ({ path, key: entryKey++ })));
  useEffect(() => {
    router.__navigation.push = (path) => setStack((current) => [...current, { path, key: entryKey++ }]);
    router.__navigation.back = () => setStack((current) => current.slice(0, -1));
    router.__navigation.replace = (path) => setStack((current) => [...current.slice(0, -1), { path, key: entryKey++ }]);
  }, []);
  return (
    <>
      {stack.map((entry, index) => {
        const { Screen, params } = screenFor(entry.path);
        const focused = index === stack.length - 1;
        return (
          <router.__ParamsContext.Provider key={entry.key} value={params}>
            <router.__FocusContext.Provider value={focused}>
              {/* Same element tree focused or not: focus changes never remount a screen. */}
              <Layer hidden={!focused}>
                <Screen />
              </Layer>
            </router.__FocusContext.Provider>
          </router.__ParamsContext.Provider>
        );
      })}
    </>
  );
}

// A screen under the top one stays mounted but hidden; queries below only
// look at the focused (top) screen.
function Layer({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const { View } = jest.requireActual("react-native");
  return <View testID={hidden ? "hidden-screen" : "visible-screen"} style={hidden ? { display: "none" } : undefined}>{children}</View>;
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function renderStack(initial: string[]) {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<NativeStack initial={initial} />);
  });
  await settle(20);
  return screen;
}

async function navigate(action: () => void) {
  await act(async () => {
    action();
  });
  await settle(20);
}

function visible(screen: Awaited<ReturnType<typeof render>>) {
  // Only what is on the top (focused) screen.
  const hidden = screen.queryAllByTestId("hidden-screen");
  return {
    getByText: (text: string | RegExp) => {
      const matches = screen.getAllByText(text).filter((node) => !hidden.some((container) => isInside(node, container)));
      if (matches.length === 0) throw new Error(`Not visible: ${String(text)}`);
      return matches[0];
    },
    queryByText: (text: string | RegExp) => screen.queryAllByText(text).find((node) => !hidden.some((container) => isInside(node, container))) ?? null,
    getByLabelText: (text: string) => {
      const match = screen.getAllByLabelText(text).find((node) => !hidden.some((container) => isInside(node, container)));
      if (!match) throw new Error(`Not visible: ${text}`);
      return match;
    },
  };
}

function isInside(node: { parent: unknown }, container: unknown): boolean {
  let current = node as { parent: unknown } | null;
  while (current) {
    if (current === container) return true;
    current = current.parent as { parent: unknown } | null;
  }
  return false;
}

beforeEach(async () => {
  files.clear();
  mockScope = { ...SCOPE };
  mockOnline = true;
  const { surveySource } = jest.requireMock("../../features/surveys/runtime") as { surveySource: { reset(): Promise<void> } };
  await surveySource.reset();
  const inbox = await refreshInbox(SCOPE, surveySource as never);
  for (const survey of inbox.surveys) await downloadVersion(SCOPE, surveySource as never, survey);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Survey drafts: save incomplete, leave, reopen from the visible list", () => {
  it("lists the incomplete draft as «Borrador» with «Continuar», reopens it with its answers and lets the person continue", async () => {
    const screen = await renderStack(["/surveys", `/surveys/${SATISFACTION}`]);

    await navigate(() => fireEvent.press(visible(screen).getByText("Responder yo")));
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta (número)"), "12");
    });
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta"), "Buen servicio");
    });
    await settle(700);
    expect(visible(screen).getByText("Borrador guardado en el teléfono")).toBeTruthy();

    // Back to the survey (still mounted under the response screen).
    await navigate(() => router.__navigation.back());
    expect(visible(screen).getByText("Borrador")).toBeTruthy();
    expect(visible(screen).getByText(/2 de 5 respondidas/)).toBeTruthy();

    // Back to the main list: the draft is visible there too.
    await navigate(() => router.__navigation.back());
    expect(visible(screen).getByText("Borrador")).toBeTruthy();
    await navigate(() => fireEvent.press(visible(screen).getByText("Continuar")));

    expect(visible(screen).getByLabelText("Tu respuesta (número)").props.value).toBe("12");
    expect(visible(screen).getByLabelText("Tu respuesta").props.value).toBe("Buen servicio");
    // Continue: still editable.
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta"), "Buen servicio, gracias");
    });
    await settle(700);
    const [stored] = await listDrafts(SCOPE);
    expect(stored.answers).toEqual({ 4: "12", 5: "Buen servicio, gracias" });
  });

  it("shows a saved response as sent and not editable, never as a draft to continue", async () => {
    mockOnline = false;
    const screen = await renderStack(["/surveys", `/surveys/${SATISFACTION}`]);
    await navigate(() => fireEvent.press(visible(screen).getByText("Responder yo")));
    await act(async () => {
      fireEvent.press(visible(screen).getByText("Muy buena"));
    });
    await act(async () => {
      fireEvent.press(visible(screen).getByText("4"));
    });
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta"), "Todo bien");
    });
    await navigate(() => fireEvent.press(visible(screen).getByText("Guardar respuestas")));
    await settle(50);

    expect(await listDrafts(SCOPE)).toEqual([]);
    expect(visible(screen).queryByText("Borrador")).toBeNull();
    expect(visible(screen).queryByText("Continuar")).toBeNull();
    expect(await listOutbox(SCOPE)).toHaveLength(1);
    await waitFor(() => expect(visible(screen).getByText(/no se puede editar/i)).toBeTruthy());
    expect(visible(screen).queryByText(/Incompleta/)).toBeNull();
  });

  it("shows an interview saved incomplete as incomplete and not editable, and it is no longer a draft", async () => {
    mockOnline = false;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const screen = await renderStack(["/surveys", "/surveys/fx-vecinal"]);
    await navigate(() => fireEvent.press(visible(screen).getByText("Iniciar entrevista")));
    await act(async () => {
      fireEvent.press(visible(screen).getByText("Continuar sin grabar"));
    });
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta"), "Baches");
    });
    await act(async () => {
      fireEvent.press(visible(screen).getByText("Guardar respuestas"));
    });
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await navigate(() => buttons.find((button) => button.text === "Guardar incompleta")?.onPress?.());
    await settle(50);

    expect(await listDrafts(SCOPE)).toEqual([]);
    const [queued] = await listOutbox(SCOPE);
    // q1 and q3 are required and unanswered; q2 was answered.
    expect(queued.missingRequired).toBe(2);
    await waitFor(() => expect(visible(screen).getByText("Incompleta: 2 preguntas obligatorias sin responder")).toBeTruthy());
    expect(visible(screen).getByText(/no se puede editar/i)).toBeTruthy();
    expect(visible(screen).queryByText("Continuar")).toBeNull();
  });

  it("never lists one account's or organization's draft under another", async () => {
    const screen = await renderStack(["/surveys", `/surveys/${SATISFACTION}`]);
    await navigate(() => fireEvent.press(visible(screen).getByText("Responder yo")));
    await act(async () => {
      fireEvent.changeText(visible(screen).getByLabelText("Tu respuesta"), "Privado");
    });
    await settle(700);
    await navigate(() => router.__navigation.back());
    await navigate(() => router.__navigation.back());
    expect(visible(screen).getByText("Borrador")).toBeTruthy();

    mockScope = { userId: "user-1", organizationId: "org-b" };
    await act(async () => {
      screen.rerender(<NativeStack key="org-b" initial={["/surveys"]} />);
    });
    await settle(20);
    expect(visible(screen).getByText(/Envíos/)).toBeTruthy();
    expect(visible(screen).queryByText("Borrador")).toBeNull();
    expect(visible(screen).queryByText("Continuar")).toBeNull();
  });
});
