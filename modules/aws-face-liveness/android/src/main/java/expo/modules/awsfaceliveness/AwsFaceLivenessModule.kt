package expo.modules.awsfaceliveness

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher

/**
 * Afilianet-owned thin Expo Module wrapping AWS's OFFICIAL
 * `com.amplifyframework.ui:liveness` package's `FaceLivenessDetector`
 * Composable (Amplify's Android Face Liveness UI component -- not a
 * third-party/community re-implementation; see this project's README "AWS
 * Face Liveness architecture" section for the full provenance and the
 * deliberate decision NOT to use the unofficial
 * `expo-face-liveness-for-aws-amplify` community bridge).
 *
 * This module registers no functions of its own -- the entire surface is
 * the `AwsFaceLiveness` VIEW registered below (see
 * AwsFaceLivenessView.kt), which is the only thing JS ever talks to.
 */
class AwsFaceLivenessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AwsFaceLiveness")

    View(AwsFaceLivenessView::class) {
      Prop("sessionId") { view: AwsFaceLivenessView, sessionId: String ->
        view.sessionId = sessionId
      }
      Prop("region") { view: AwsFaceLivenessView, region: String ->
        view.region = region
      }
      // Temporary AWS STS credentials -- held on the view only for the
      // lifetime of one capture attempt (see AwsFaceLivenessView.kt's own
      // docblock for the full in-memory-only discipline). Never logged,
      // never persisted by this module.
      Prop("accessKeyId") { view: AwsFaceLivenessView, accessKeyId: String ->
        view.accessKeyId = accessKeyId
      }
      Prop("secretAccessKey") { view: AwsFaceLivenessView, secretAccessKey: String ->
        view.secretAccessKey = secretAccessKey
      }
      Prop("sessionToken") { view: AwsFaceLivenessView, sessionToken: String ->
        view.sessionToken = sessionToken
      }
      Prop("expiration") { view: AwsFaceLivenessView, expiration: String ->
        view.expiration = expiration
      }

      Events("onComplete", "onError")
    }
  }
}
