import { config } from "../../config/env";

/**
 * Surveys are a PREVIEW until afilianet-api publishes the contract: off in
 * production builds, on in development/internal/staging, mirroring
 * afilianet-admin's NEXT_PUBLIC_SURVEYS_PREVIEW gate. EXPO_PUBLIC_SURVEYS_PREVIEW
 * decides explicitly for a build: "1" turns them on (even in production), "0"
 * turns them off (e.g. the store beta, so testers never get sample surveys).
 */
const surveysPreviewSetting = process.env.EXPO_PUBLIC_SURVEYS_PREVIEW;

export const surveysPreviewEnabled =
  surveysPreviewSetting === "1" || (surveysPreviewSetting !== "0" && config.appEnv !== "production");
