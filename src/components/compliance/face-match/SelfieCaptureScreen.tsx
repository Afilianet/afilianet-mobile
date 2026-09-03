import { Image } from "expo-image";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import type { CameraCaptureResult } from "../../../hooks/useDocumentCamera";
import { useEvidenceUploadFlow } from "../../../hooks/useEvidenceUploadFlow";
import { useSelfieCamera } from "../../../hooks/useSelfieCamera";
import { analytics } from "../../../services/analytics";
import type { Evidence } from "../../../types/api";
import { resolveMimeType, validateCapturedAsset } from "../../../utils/documentCapture";
import { Button } from "../../ui/Button";
import { colors, radius, spacing, typography } from "../../ui/theme";
import { SELFIE_GUIDANCE } from "./faceMatchCopy";

type CapturedAsset = { uri: string; width: number; height: number; fileSize: number | null; mimeType: string | null };
type LocalStage =
  | { kind: "guidance" }
  | { kind: "permission_denied"; canAskAgain: boolean }
  | { kind: "unavailable" }
  | { kind: "preview"; asset: CapturedAsset }
  | { kind: "invalid"; error: string };

/**
 * Mirrors document-capture/CaptureScreen.tsx's exact structure (Phase 9C.2's
 * established pattern: the OS's own native camera UI already provides
 * shutter/preview/retake, so this app never builds a custom live camera
 * preview) -- the differences are front-facing capture (useSelfieCamera) and
 * face-specific, non-liveness guidance copy.
 *
 * `stepId` here is deliberately the sibling `biometric_liveness` step's id,
 * never `face_match`'s own -- `selfie` evidence is only ever compatible
 * with `biometric_liveness` (see StepEvidenceCompatibility in
 * afilianet-api; `face_match` itself accepts no upload of its own and
 * reads this evidence case-wide) -- see FaceMatchCaptureFlow's docblock for
 * the full reasoning. Callers must resolve that step id before rendering
 * this component.
 */
export function SelfieCaptureScreen({
  stepId,
  onCancel,
  onUploaded,
}: {
  stepId: string;
  onCancel: () => void;
  onUploaded: (evidence: Evidence) => void;
}) {
  const [stage, setStage] = useState<LocalStage>({ kind: "guidance" });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const camera = useSelfieCamera();
  const uploadFlow = useEvidenceUploadFlow();

  async function handleOpenCamera() {
    setUploadError(null);
    const result: CameraCaptureResult = await camera.capture();

    if (result.status === "cancelled") {
      setStage({ kind: "guidance" });
      return;
    }
    if (result.status === "permission_denied") {
      setStage({ kind: "permission_denied", canAskAgain: true });
      return;
    }
    if (result.status === "unavailable") {
      setStage({ kind: "unavailable" });
      return;
    }

    const check = validateCapturedAsset({
      uri: result.uri,
      width: result.width,
      height: result.height,
      fileSize: result.fileSize,
    });
    if (!check.valid) {
      setStage({ kind: "invalid", error: check.error });
      return;
    }

    setStage({
      kind: "preview",
      asset: { uri: result.uri, width: result.width, height: result.height, fileSize: result.fileSize, mimeType: result.mimeType },
    });
  }

  async function handleUsePhoto(asset: CapturedAsset) {
    const mimeType = resolveMimeType(asset.mimeType);
    if (!mimeType) {
      setUploadError("That photo's format isn't supported. Please retake it.");
      return;
    }
    if (asset.fileSize === null) {
      setUploadError("That photo looks empty or corrupted. Please retake it.");
      return;
    }

    setUploadError(null);
    try {
      const evidence = await uploadFlow.upload({
        stepId,
        evidenceType: "selfie",
        uri: asset.uri,
        mimeType,
        size: asset.fileSize,
      });
      // No evidence id, step id, or any capture detail -- matches this
      // app's zero-property analytics convention for compliance events.
      analytics.capture("face_match_selfie_captured");
      onUploaded(evidence);
    } catch (error) {
      setUploadError(isApiError(error) ? friendlyMessage(error) : "The upload didn't complete. Please try again.");
    }
  }

  if (stage.kind === "preview") {
    const uploading = uploadFlow.stage !== "idle";
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your selfie</Text>
        <Image
          source={{ uri: stage.asset.uri }}
          style={styles.preview}
          contentFit="cover"
          accessibilityLabel="Preview of your captured selfie"
        />
        {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
        {uploading ? <Text style={styles.meta}>{uploadStageLabel(uploadFlow.stage)}</Text> : null}
        <View style={styles.actions}>
          <Button label="Retake" variant="secondary" disabled={uploading} onPress={() => setStage({ kind: "guidance" })} />
          <Button label="Use this photo" loading={uploading} onPress={() => void handleUsePhoto(stage.asset)} />
        </View>
      </View>
    );
  }

  if (stage.kind === "permission_denied") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.description}>Afilianet needs camera access to take your selfie. Please enable it in your device settings.</Text>
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
          <Button label="Open settings" onPress={() => void Linking.openSettings()} />
        </View>
      </View>
    );
  }

  if (stage.kind === "unavailable") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera unavailable</Text>
        <Text style={styles.description}>This device doesn&apos;t have a usable camera right now.</Text>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Take a selfie</Text>
      <View style={styles.guidanceList} accessible accessibilityLabel={`Selfie tips: ${SELFIE_GUIDANCE.join(". ")}`}>
        {SELFIE_GUIDANCE.map((tip) => (
          <Text key={tip} style={styles.guidanceItem}>
            {"•"} {tip}
          </Text>
        ))}
      </View>
      {stage.kind === "invalid" ? <Text style={styles.error}>{stage.error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
        <Button label="Open camera" onPress={() => void handleOpenCamera()} />
      </View>
    </View>
  );
}

function uploadStageLabel(stage: "idle" | "authorizing" | "uploading" | "completing"): string {
  switch (stage) {
    case "authorizing":
      return "Preparing upload...";
    case "uploading":
      return "Uploading...";
    case "completing":
      return "Confirming upload...";
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  guidanceList: {
    gap: 4,
  },
  guidanceItem: {
    ...typography.body,
    color: colors.textSecondary,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
