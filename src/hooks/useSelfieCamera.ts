import * as ImagePicker from "expo-image-picker";
import type { CameraCaptureResult } from "./useDocumentCamera";

/**
 * Mirrors useDocumentCamera.ts (same native-camera-UI, no custom preview,
 * same permission/cancel/unavailable handling) -- differences are
 * `cameraType: front` (a selfie is naturally front-facing) and `quality: 1`
 * (see below). Never promises anti-spoofing/liveness: this only captures a
 * still image, same as the document flow (Phase 9D.3's explicit "face
 * match only, no liveness" scope).
 *
 * QUALITY: 1, NOT 0.8 -- a real physical-device finding (Face Match
 * attempts 3/4, failure_reason: no_face_probe): the identity engine's
 * YuNet detector reliably finds the same upright face, but zero-detects
 * the identical image rotated 90/180/270 -- it has no EXIF orientation tag
 * to correct for. expo-image-picker's Android quality<1 path re-exports/
 * recompresses the captured JPEG (confirmed via the SDK 57 docs: quality
 * triggers additional processing, not just a straight passthrough), which
 * is the most likely place that recompression drops the EXIF Orientation
 * tag the original camera capture would otherwise carry. quality: 1 is
 * documented as the maximum-quality setting and is this SDK's own default
 * -- it does not GUARANTEE untouched bytes (the docs are explicit that an
 * already-compressed source can still grow/shrink under quality: 1), but
 * it is the smallest, correct mitigation available at this layer, mirrors
 * the identity-engine's own defense-in-depth orientation-recovery work
 * (feat/face-match-document-primary-portrait, commit 1974e94), and is
 * scoped to Face Match's own probe capture ONLY -- document capture
 * (useDocumentCamera.ts) and liveness (a completely separate native
 * capture module, no expo-image-picker involved at all) are untouched.
 */
export function useSelfieCamera() {
  async function capture(): Promise<CameraCaptureResult> {
    let permission: ImagePicker.CameraPermissionResponse;
    try {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    } catch {
      return { status: "unavailable" };
    }

    if (!permission.granted) {
      return { status: "permission_denied" };
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.front,
        quality: 1,
        exif: false,
        base64: false,
        allowsEditing: false,
      });
    } catch {
      return { status: "unavailable" };
    }

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { status: "cancelled" };
    }

    const asset = result.assets[0];
    return {
      status: "captured",
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize ?? null,
      mimeType: asset.mimeType ?? null,
    };
  }

  return { capture };
}
