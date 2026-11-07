import { render } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";
import { Button } from "./Button";
import { colors } from "./theme";

type View = Awaited<ReturnType<typeof render>>;

/** The view that draws the button (fill and outline): the pressable's only child. */
function face(view: View) {
  const pressable = view.getByTestId("button") as unknown as { children: { props: { style: ViewStyle } }[] };
  return StyleSheet.flatten(pressable.children[0].props.style);
}
const disabled = (view: View) => Boolean(view.getByTestId("button").props.accessibilityState?.disabled);
const labelColor = (view: View, label: string) => StyleSheet.flatten(view.getByText(label).props.style).color;

describe("Button states", () => {
  it("enabled primary: brand purple with white text", async () => {
    const view = await render(<Button label="Iniciar grabación" testID="button" onPress={() => {}} />);
    expect(disabled(view)).toBe(false);
    expect(face(view).backgroundColor).toBe(colors.primary);
    expect(face(view).borderWidth).toBe(0);
    expect(labelColor(view, "Iniciar grabación")).toBe(colors.textOnBrand);
  });

  it("disabled: pale fill with a visible outline and readable text", async () => {
    const view = await render(<Button label="Iniciar grabación" testID="button" disabled onPress={() => {}} />);
    expect(disabled(view)).toBe(true);
    expect(face(view).backgroundColor).toBe(colors.surfaceRaised);
    expect(face(view).borderWidth).toBe(1);
    expect(face(view).borderColor).toBe(colors.muted);
    expect(labelColor(view, "Iniciar grabación")).toBe(colors.textTertiary);
  });

  it("loading: disabled, and the spinner is not white on the pale fill", async () => {
    const view = await render(<Button label="Iniciar grabación" testID="button" loading onPress={() => {}} />);
    expect(disabled(view)).toBe(true);
    expect(view.getByTestId("button-loading").props.color).toBe(colors.textSecondary);
  });

  it("secondary keeps its own outline when enabled", async () => {
    const view = await render(<Button label="Guardar" variant="secondary" testID="button" onPress={() => {}} />);
    expect(face(view).borderWidth).toBe(1);
    expect(face(view).borderColor).toBe(colors.border);
  });
});
