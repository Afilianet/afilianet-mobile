import { render } from "@testing-library/react-native";
import NotificationSettingsScreen from "../../app/notification-settings";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("../../components/PushPreferences", () => ({
  PushPreferences: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>push-preferences-section</Text>;
  },
}));

describe("Notification settings", () => {
  it("holds the push preferences that used to sit on top of the inbox", async () => {
    const { getByText } = await render(<NotificationSettingsScreen />);

    expect(getByText("Configurar notificaciones")).toBeTruthy();
    expect(getByText("push-preferences-section")).toBeTruthy();
  });
});
