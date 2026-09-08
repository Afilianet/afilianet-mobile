import type { StyleProp, ViewStyle } from "react-native";

/**
 * A thin, provider-neutral wrapper around whatever this platform's OFFICIAL
 * AWS Amplify Face Liveness SDK actually requires -- NOT a re-export of AWS's
 * own types. This shape is deliberately minimal (Phase 9E.2's brief: "Keep
 * the JS/TypeScript API provider-neutral and minimal"): the JS side never
 * imports anything AWS-specific, never sees AWS's SDK types directly, and
 * this module could in principle be re-implemented against a different
 * native liveness SDK later without changing this file's shape.
 *
 * `sessionId`/`region` carry exactly what afilianet-api's own
 * LivenessSessionResource returns (AWS's own SessionId, and the region that
 * session lives in) -- passed straight through, never generated here.
 *
 * The four credential fields ARE named in the native AWS SDKs' own
 * camelCase convention (`accessKeyId`/`secretAccessKey`/`sessionToken`/
 * `expiration`) -- that is what this VIEW's props are named, matching
 * every native Prop("...") handler in AwsFaceLivenessModule.swift /
 * AwsFaceLivenessModule.kt exactly. afilianet-api's own
 * LivenessCredentialsResource returns these snake_case
 * (`access_key_id`/`secret_access_key`/`session_token`/`expiration`) -- the
 * rename happens in ordinary JS, at the one call site that reads a fetched
 * LivenessCredentials object and spreads it into this view's props (see
 * LivenessCaptureFlow.tsx), not natively. That JS-side rename is a plain,
 * inert field mapping -- it doesn't touch the actual credential VALUES,
 * which stay exactly as issued the entire time.
 *
 * Every one of these four values lives ONLY as long as this view is
 * mounted with them as props -- the calling screen (LivenessCaptureFlow)
 * is responsible for holding them in local component state/a ref for
 * exactly one capture attempt and clearing that reference afterward, never
 * in AsyncStorage/SecureStore/a query cache/Redux or any other persisted
 * or global store.
 */
export interface AwsFaceLivenessCredentialsProps {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** ISO-8601 timestamp string, exactly as the backend's `expiration` field returns it. */
  expiration: string;
}

export interface AwsFaceLivenessCompletionEvent {
  sessionId: string;
}

// A closed, safe category set -- NEVER the raw underlying AWS/Amplify SDK
// error type, message, or stack trace (see this module's native
// implementations' own docblocks for the exact native-error -> category
// mapping). The JS layer (livenessCopy.ts) maps each of these to safe user
// copy; nothing here is ever logged/displayed raw.
export type AwsFaceLivenessErrorCode =
  | "camera_permission_denied"
  | "camera_unavailable"
  | "session_invalid_or_expired"
  | "network_error"
  | "credentials_invalid"
  | "cancelled"
  | "unknown_error";

export interface AwsFaceLivenessErrorEvent {
  code: AwsFaceLivenessErrorCode;
}

export interface AwsFaceLivenessViewProps extends AwsFaceLivenessCredentialsProps {
  sessionId: string;
  region: string;
  onComplete: (event: { nativeEvent: AwsFaceLivenessCompletionEvent }) => void;
  onError: (event: { nativeEvent: AwsFaceLivenessErrorEvent }) => void;
  style?: StyleProp<ViewStyle>;
}
