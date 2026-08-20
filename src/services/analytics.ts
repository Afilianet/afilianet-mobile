import PostHog from "posthog-react-native";
import { config } from "../config/env";

const analyticsEnabled = config.posthogApiKey.length > 0;

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!analyticsEnabled) return null;
  if (!client) {
    client = new PostHog(config.posthogApiKey, { host: config.posthogHost });
  }
  return client;
}

// Mirrors PostHog's JsonType so callers stay JSON-safe without importing
// PostHog's types directly.
export type AnalyticsProperties = {
  [key: string]: string | number | boolean | null | AnalyticsProperties | AnalyticsProperties[];
};

/**
 * Small abstraction so feature code never imports posthog-react-native
 * directly. No-ops entirely when EXPO_PUBLIC_POSTHOG_API_KEY is blank.
 */
export const analytics = {
  capture(event: string, properties?: AnalyticsProperties): void {
    getClient()?.capture(event, properties);
  },
  identify(userId: string, traits?: AnalyticsProperties): void {
    getClient()?.identify(userId, traits);
  },
  reset(): void {
    getClient()?.reset();
  },
};

export const analyticsEnabledForDebug = analyticsEnabled;
