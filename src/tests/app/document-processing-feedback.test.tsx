import { act, fireEvent, render } from "@testing-library/react-native";
import { ProcessingState } from "../../components/compliance/document-capture/ProcessingState";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

it("shows the stage, a delayed status check, and a clear continue action", async () => {
  jest.useFakeTimers();
  try {
    const onCheckStatus = jest.fn();
    const screen = await render(<ProcessingState status="pending" onCheckStatus={onCheckStatus} />);
    expect(screen.getByText("Fotos recibidas")).toBeTruthy();
    expect(screen.getByText("Esperando el documento")).toBeTruthy();
    expect(screen.queryByText("Verificar estado")).toBeNull();

    await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText(/tardando más de lo habitual/i)).toBeTruthy();
    fireEvent.press(screen.getByText("Verificar estado"));
    expect(onCheckStatus).toHaveBeenCalledTimes(1);

    await screen.rerender(<ProcessingState status="processing" onCheckStatus={onCheckStatus} checkError />);
    expect(screen.getByText("Procesando tu documento")).toBeTruthy();
    expect(screen.getByText(/no pudimos consultar el estado/i)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();

    fireEvent.press(screen.getByText("Continuar"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await screen.unmount();
  } finally {
    jest.useRealTimers();
  }
});
