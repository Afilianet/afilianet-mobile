import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { OutboxPanel } from "./components";
import type { OutboxItem } from "./outbox";

jest.mock("@react-native-async-storage/async-storage", () => jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../config/env", () => ({ config: { apiBaseUrl: "https://api.test", appEnv: "staging" } }));

const base: OutboxItem = {
  id: "r-1",
  surveyId: "s-1",
  versionId: "v-1",
  surveyTitle: "Prueba Afilianet: tu experiencia (sin audio)",
  respondentType: "self",
  consentAudio: null,
  completedAt: "2026-11-24T14:20:00Z",
  missingRequired: 0,
  audio: null,
  attempts: 0,
};

async function renderPanel(items: OutboxItem[]) {
  return render(
    <OutboxPanel items={items} receipts={[]} syncing={false} progress={null} message={null} onSync={() => {}} onDiscard={() => {}} onDiscardAudio={() => {}} destination="Se envían a: prueba." />,
  );
}

describe("«Envíos» card (vc25 field report)", () => {
  it("a response not yet received says it is on this phone only, never «Enviada desde este teléfono»", async () => {
    await renderPanel([{ ...base, attempts: 2, lastError: "offline" }]);
    expect(screen.getByText("Pendiente de sincronizar")).toBeTruthy();
    expect(screen.getByText("Guardada solo en este teléfono; el servidor aún no la recibe. Ya no se puede editar.")).toBeTruthy();
    expect(screen.getByText("Último intento: el teléfono no tenía conexión. Se enviará en cuanto tenga internet.")).toBeTruthy();
    expect(screen.queryByText(/Enviada desde este teléfono/)).toBeNull();
  });

  it("keeps phone, session and server causes apart", async () => {
    await renderPanel([
      { ...base, id: "a", attempts: 1, lastError: "unauthorized" },
      { ...base, id: "b", attempts: 1, lastError: "server" },
    ]);
    expect(screen.getByTestId("outbox-a-last-try")).toHaveTextContent(/tu sesión ya no era válida/);
    expect(screen.getByTestId("outbox-b-last-try")).toHaveTextContent(/el servidor no la recibió/);
  });

  it("saved but never tried shows no last-try line", async () => {
    await renderPanel([base]);
    expect(screen.getByText("Guardado en el dispositivo")).toBeTruthy();
    expect(screen.queryByTestId("outbox-r-1-last-try")).toBeNull();
  });

  it("answers received by the server (audio still on the phone) say so", async () => {
    await renderPanel([{ ...base, responseId: "srv-1", receivedAt: "2026-11-24T14:30:00Z", audio: { clientAudioId: "a-1", mimeType: "audio/mp4", durationMs: 1000, interrupted: false, bytes: 10 } }]);
    expect(screen.getByTestId("outbox-r-1-where")).toHaveTextContent("El servidor ya recibió las respuestas. Ya no se puede editar.");
  });

  it("puts the title above its badge, so a long badge never squeezes the title into fragments", async () => {
    await renderPanel([{ ...base, attempts: 1, lastError: "offline" }]);
    const header = screen.getByText(base.surveyTitle).parent!;
    const style = StyleSheet.flatten((header as unknown as { props: { style: unknown } }).props.style) as { flexDirection?: string };
    expect(style.flexDirection ?? "column").toBe("column");
  });
});
