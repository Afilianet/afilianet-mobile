import { config } from "../../config/env";

/**
 * Surveys are a PREVIEW until afilianet-api publishes the contract: off in
 * production builds, on in development/internal/staging, mirroring
 * afilianet-admin's NEXT_PUBLIC_SURVEYS_PREVIEW gate.
 */
export const surveysPreviewEnabled = config.appEnv !== "production" || process.env.EXPO_PUBLIC_SURVEYS_PREVIEW === "1";
