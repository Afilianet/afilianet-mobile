import { XML } from "expo/config-plugins";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

// Exact keys shipped by the AWS liveness UI SDKs this app links:
// com.amplifyframework.ui:liveness:1.11.0 (res/values/values.xml) and
// amplify-ui-swift-liveness 1.5.0 (Base.lproj/Localizable.strings). Neither
// ships Spanish. Re-diff these lists whenever either dependency is bumped.
const ROOT = join(__dirname, "..", "..", "..");
const MODULE_DIR = join(ROOT, "modules/aws-face-liveness");
const ANDROID_STRINGS = join(MODULE_DIR, "android/src/main/res/values/strings.xml");

// Every XML file the module itself ships (generated build output excluded).
function moduleXmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ["build", ".gradle", ".cxx", "node_modules"].includes(entry.name) ? [] : moduleXmlFiles(join(dir, entry.name));
    }
    return entry.name.endsWith(".xml") ? [join(dir, entry.name)] : [];
  });
}

type ParsedStrings = { resources: { string?: { $: { name: string }; _?: string }[] } };
const ANDROID_KEYS = [
  "amplify_ui_liveness_challenge_a11y_cancel_content_description",
  "amplify_ui_liveness_challenge_connecting",
  "amplify_ui_liveness_challenge_instruction_hold_face_during_freshness",
  "amplify_ui_liveness_challenge_instruction_move_face",
  "amplify_ui_liveness_challenge_instruction_move_face_closer",
  "amplify_ui_liveness_challenge_instruction_move_face_further",
  "amplify_ui_liveness_challenge_instruction_multiple_faces_detected",
  "amplify_ui_liveness_challenge_recording_indicator_label",
  "amplify_ui_liveness_challenge_verifying",
  "amplify_ui_liveness_get_ready_a11y_photosensitivity_icon_content_description",
  "amplify_ui_liveness_get_ready_begin_check",
  "amplify_ui_liveness_get_ready_center_face_label",
  "amplify_ui_liveness_get_ready_photosensitivity_description",
  "amplify_ui_liveness_get_ready_photosensitivity_dialog_description",
  "amplify_ui_liveness_get_ready_photosensitivity_dialog_dismiss",
  "amplify_ui_liveness_get_ready_photosensitivity_dialog_title",
  "amplify_ui_liveness_get_ready_photosensitivity_title",
];

const IOS_KEYS = [
  "amplify_ui_liveness_camera_permission_button_description",
  "amplify_ui_liveness_camera_permission_button_header",
  "amplify_ui_liveness_camera_permission_button_title",
  "amplify_ui_liveness_camera_permission_page_title",
  "amplify_ui_liveness_camera_setting_alert_message",
  "amplify_ui_liveness_camera_setting_alert_not_now_button_text",
  "amplify_ui_liveness_camera_setting_alert_title",
  "amplify_ui_liveness_camera_setting_alert_update_setting_button_text",
  "amplify_ui_liveness_center_your_face_text",
  "amplify_ui_liveness_challenge_cancel_a11y",
  "amplify_ui_liveness_challenge_connecting",
  "amplify_ui_liveness_challenge_instruction_hold_face_during_countdown",
  "amplify_ui_liveness_challenge_instruction_hold_face_during_freshness",
  "amplify_ui_liveness_challenge_instruction_hold_still",
  "amplify_ui_liveness_challenge_instruction_move_face_back",
  "amplify_ui_liveness_challenge_instruction_move_face_closer",
  "amplify_ui_liveness_challenge_instruction_move_face_in_front_of_camera",
  "amplify_ui_liveness_challenge_instruction_multiple_faces_detected",
  "amplify_ui_liveness_challenge_recording_indicator_label",
  "amplify_ui_liveness_challenge_verifying",
  "amplify_ui_liveness_close_button_a11y",
  "amplify_ui_liveness_face_not_prepared_reason_face_too_close",
  "amplify_ui_liveness_face_not_prepared_reason_move_face_closer",
  "amplify_ui_liveness_face_not_prepared_reason_move_face_left",
  "amplify_ui_liveness_face_not_prepared_reason_move_face_right",
  "amplify_ui_liveness_face_not_prepared_reason_move_to_brighter_area",
  "amplify_ui_liveness_face_not_prepared_reason_move_to_dimmer_area",
  "amplify_ui_liveness_face_not_prepared_reason_multiple_faces",
  "amplify_ui_liveness_face_not_prepared_reason_no_face",
  "amplify_ui_liveness_face_not_prepared_reason_not_in_oval",
  "amplify_ui_liveness_face_not_prepared_reason_pendingCheck",
  "amplify_ui_liveness_get_ready_begin_check",
  "amplify_ui_liveness_get_ready_page_title",
  "amplify_ui_liveness_get_ready_photosensitivity_description",
  "amplify_ui_liveness_get_ready_photosensitivity_dialog_description",
  "amplify_ui_liveness_get_ready_photosensitivity_dialog_title",
  "amplify_ui_liveness_get_ready_photosensitivity_icon_a11y",
  "amplify_ui_liveness_get_ready_photosensitivity_title",
  "amplify_ui_liveness_orientation_prompt_description",
  "amplify_ui_liveness_orientation_prompt_title",
];

const ENGLISH_DEFAULTS = /\b(Hold still|Move closer|Move back|Verifying|Connecting|Start video check|Photosensitivity|Got it|Cancel Challenge|Center your face|Not Now)\b/;

describe("Spanish copy for the native AWS liveness screens", () => {
  // Gradle's resource merger (aapt2) rejects XML that is not well-formed,
  // e.g. "--" inside a comment (EAS build 39cd9486). A regex never noticed.
  // Expo's own Android resource parser (xml2js/sax, strict) fails the same.
  it("ships only well-formed XML in the native module", async () => {
    const files = moduleXmlFiles(MODULE_DIR).map((file) => relative(MODULE_DIR, file)).sort();
    expect(files).toEqual(["android/src/main/AndroidManifest.xml", "android/src/main/res/values/strings.xml"]);
    for (const file of files) {
      await expect(XML.parseXMLAsync(readFileSync(join(MODULE_DIR, file), "utf8"))).resolves.toBeTruthy();
    }
  });

  it("overrides every Android string resource of the AWS liveness AAR", async () => {
    const parsed = (await XML.parseXMLAsync(readFileSync(ANDROID_STRINGS, "utf8"))) as unknown as ParsedStrings;
    const entries = (parsed.resources.string ?? []).map((entry) => [entry.$.name, entry._ ?? ""] as const);
    expect(entries.map(([name]) => name).sort()).toEqual([...ANDROID_KEYS].sort());
    for (const [, value] of entries) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(ENGLISH_DEFAULTS);
    }
  });

  it("overrides every iOS Localizable key through Expo's locales config", () => {
    const appJson = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8"));
    expect(appJson.expo.locales).toEqual({ es: "./locales/es.json" });
    const locale = JSON.parse(readFileSync(join(ROOT, "locales/es.json"), "utf8"));
    const strings: Record<string, string> = locale.ios["Localizable.strings"];
    expect(Object.keys(strings).sort()).toEqual([...IOS_KEYS].sort());
    for (const value of Object.values(strings)) {
      expect(value).not.toMatch(ENGLISH_DEFAULTS);
    }
  });
});
