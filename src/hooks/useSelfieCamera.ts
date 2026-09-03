import * as ImagePicker from "expo-image-picker";
import type { CameraCaptureResult } from "./useDocumentCamera";

/**
 * Mirrors useDocumentCamera.ts exactly (same native-camera-UI, no custom
 * preview, same permission/cancel/unavailable handling) -- the only
 * difference is `cameraType: front`, since a selfie is naturally front-
 * facing. Never promises anti-spoofing/liveness: this only captures a still
 * image, same as the document flow (Phase 9D.3's explicit "face match only,
 * no liveness" scope).
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
        quality: 0.8,
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
