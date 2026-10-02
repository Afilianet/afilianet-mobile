import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { CommercialFeatureGate } from "../components/CommercialFeatureGate";
import { notificationDestination } from "../navigation/routes";
import { releaseFeatures } from "./release";

const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null; },
}));

test("first release does not mount deferred flows, even when reached directly", async () => {
  expect(releaseFeatures.commerce).toBe(false);
  const mounted = jest.fn();
  function DeferredScreen() { mounted(); return <Text>Deferred</Text>; }
  await render(<CommercialFeatureGate><DeferredScreen /></CommercialFeatureGate>);
  expect(mounted).not.toHaveBeenCalled();
  expect(mockRedirect).toHaveBeenCalledWith("/(app)");
});

test("notifications cannot reopen financial screens in the first release", () => {
  expect(notificationDestination("commissions")).toBeNull();
  expect(notificationDestination("payouts")).toBeNull();
  expect(notificationDestination("compliance")).toBe("/compliance");
  expect(notificationDestination("network")).toBe("/(app)/network");
  expect(notificationDestination("https://untrusted.test")).toBeNull();
});
