import * as ImagePicker from "expo-image-picker";

export type CameraCaptureResult =
  | { status: "captured"; uri: string; width: number; height: number; fileSize: number | null; mimeType: string | null }
  | { status: "cancelled" }
  | { status: "permission_denied" }
  | { status: "unavailable" };

/**
 * Wraps expo-image-picker's native camera UI -- the OS's own camera screen
 * already provides shutter/preview/retake before returning a result, so
 * this app never builds a custom live camera preview (Phase 9C.2's "do not
 * build a custom native camera module unless necessary"). `exif: false`
 * keeps GPS/device metadata out of the captured asset entirely -- nothing
 * about a document's capture location is needed or wanted here.
 *
 * "unavailable" (not the same as permission_denied) covers a device/
 * simulator with no camera hardware at all, or any other native-layer
 * failure launchCameraAsync can throw for -- this hook never lets that
 * surface as an unhandled rejection.
 */
export function useDocumentCamera() {
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
        cameraType: ImagePicker.CameraType.back,
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
