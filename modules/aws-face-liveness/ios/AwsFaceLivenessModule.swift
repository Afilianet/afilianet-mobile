import ExpoModulesCore

/**
 * Afilianet-owned thin Expo Module wrapping AWS's OFFICIAL
 * `amplify-ui-swift-liveness` package's `FaceLivenessDetectorView`
 * (Amplify's Swift Face Liveness UI component -- not a third-party/
 * community re-implementation; see this project's README "AWS Face
 * Liveness architecture" section for the full provenance and the
 * deliberate decision NOT to use the unofficial
 * `expo-face-liveness-for-aws-amplify` community bridge).
 *
 * This module registers no functions of its own -- the entire surface is
 * the `AwsFaceLiveness` VIEW registered below (see
 * AwsFaceLivenessView.swift), which is the only thing JS ever talks to.
 */
public class AwsFaceLivenessModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AwsFaceLiveness")

    View(AwsFaceLivenessView.self) {
      Prop("sessionId") { (view: AwsFaceLivenessView, sessionId: String) in
        view.sessionId = sessionId
      }
      Prop("region") { (view: AwsFaceLivenessView, region: String) in
        view.region = region
      }
      // Temporary AWS STS credentials -- held on the view only for the
      // lifetime of one capture attempt (see AwsFaceLivenessView.swift's
      // own docblock for the full in-memory-only discipline). Never
      // logged, never persisted by this module.
      Prop("accessKeyId") { (view: AwsFaceLivenessView, accessKeyId: String) in
        view.accessKeyId = accessKeyId
      }
      Prop("secretAccessKey") { (view: AwsFaceLivenessView, secretAccessKey: String) in
        view.secretAccessKey = secretAccessKey
      }
      Prop("sessionToken") { (view: AwsFaceLivenessView, sessionToken: String) in
        view.sessionToken = sessionToken
      }
      Prop("expiration") { (view: AwsFaceLivenessView, expiration: String) in
        view.expiration = expiration
      }

      Events("onComplete", "onError")
    }
  }
}
