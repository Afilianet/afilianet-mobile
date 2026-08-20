import * as Sentry from "@sentry/react-native";
import { config } from "../config/env";

export const sentryEnabled = config.sentryDsn.length > 0;

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    tracesSampleRate: config.appEnv === "production" ? 0.2 : 1.0,
  });
}

export function captureException(error: unknown): void {
  if (!sentryEnabled) return;
  Sentry.captureException(error);
}
