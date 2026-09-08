import AWSPluginsCore
import ExpoModulesCore
import FaceLiveness
import SwiftUI

/**
 * Backend-issued temporary AWS credentials, held ONLY as Swift value-type
 * properties on this view for exactly the lifetime of one capture attempt.
 * Never written to disk, UserDefaults, Keychain, or any log -- see this
 * module's README section for the full in-memory-only discipline this
 * whole file follows.
 *
 * `AWSTemporaryCredentials` (refining `AWSCredentials`) is the OFFICIAL
 * protocol `amplify-ui-swift-liveness` itself defines for exactly this
 * purpose -- confirmed against that package's own
 * Tests/FaceLivenessTests/MockAWSTemporaryCredentials.swift, which declares
 * the identical four-property shape used here.
 */
private struct BackendIssuedCredentials: AWSTemporaryCredentials {
  var accessKeyId: String
  var secretAccessKey: String
  var sessionToken: String
  var expiration: Date
}

/**
 * The OFFICIAL `AWSCredentialsProvider` protocol's single requirement
 * (`fetchAWSCredentials() async throws -> AWSCredentials`) is called
 * EXACTLY ONCE, at the start of the liveness flow (confirmed against
 * Amplify's own Face Liveness docs -- "the provided Credentials Provider's
 * fetchAWSCredentials function is called once at the start of the liveness
 * flow, with no token refresh"). Since this app already fetches temporary
 * credentials from afilianet-api BEFORE ever presenting this view (see
 * LivenessCaptureFlow.tsx), this provider only ever needs to return the
 * single set of credentials it was constructed with -- there is
 * deliberately no refresh/retry logic here, matching the SDK's own
 * one-shot contract. (The 900s STS credential lifetime already comfortably
 * outlives the ~3 minute liveness session -- see this project's README
 * "Credential refresh semantics" section for the full timing rationale.)
 */
private struct StaticCredentialsProvider: AWSCredentialsProvider {
  let credentials: AWSTemporaryCredentials

  func fetchAWSCredentials() async throws -> AWSCredentials {
    credentials
  }
}

/**
 * Afilianet-owned Expo native view hosting AWS's OFFICIAL SwiftUI
 * `FaceLivenessDetectorView` (from `amplify-ui-swift-liveness`) inside an
 * Expo-managed `UIHostingController`. This view never re-implements any
 * part of the actual liveness capture experience -- guidance screens,
 * camera preview, oval/light challenge, and result determination are all
 * exactly AWS's own component, unmodified.
 *
 * Every prop (`sessionId`/`region`/the four credential fields) is set by
 * `AwsFaceLivenessModule.swift`'s `Prop(...)` handlers before
 * `layoutSubviews()` first presents the AWS view -- JS is responsible for
 * having already fetched a real backend session + real backend-issued
 * credentials before ever mounting this component (see
 * LivenessCaptureFlow.tsx), this view never creates a session or requests
 * credentials on its own.
 */
public class AwsFaceLivenessView: ExpoView {
  var sessionId: String = ""
  var region: String = ""
  var accessKeyId: String = ""
  var secretAccessKey: String = ""
  var sessionToken: String = ""
  /// ISO-8601, exactly as afilianet-api's `expiration` field returns it.
  var expiration: String = ""

  let onComplete = EventDispatcher()
  let onError = EventDispatcher()

  private var hostingController: UIHostingController<AnyView>?
  private var isPresentedBinding = true
  private var hasPresented = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    if !hasPresented, !sessionId.isEmpty, !accessKeyId.isEmpty {
      hasPresented = true
      presentLivenessDetector()
    }
    hostingController?.view.frame = bounds
  }

  private func presentLivenessDetector() {
    guard let expirationDate = ISO8601DateFormatter().date(from: expiration) else {
      onError(["code": "credentials_invalid"])
      return
    }

    let provider = StaticCredentialsProvider(
      credentials: BackendIssuedCredentials(
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        sessionToken: sessionToken,
        expiration: expirationDate
      )
    )

    let detectorView = FaceLivenessDetectorView(
      sessionID: sessionId,
      credentialsProvider: provider,
      region: region,
      isPresented: Binding(
        get: { [weak self] in self?.isPresentedBinding ?? false },
        set: { [weak self] newValue in self?.isPresentedBinding = newValue }
      ),
      onCompletion: { [weak self] result in
        guard let self else { return }
        switch result {
        case .success:
          self.onComplete(["sessionId": self.sessionId])
        case let .failure(error):
          self.onError(["code": Self.mapErrorCode(error)])
        }
      }
    )

    let controller = UIHostingController(rootView: AnyView(detectorView))
    hostingController = controller
    addSubview(controller.view)
  }

  /**
   * Maps every `FaceLivenessDetectionError` case (the OFFICIAL SDK's own
   * closed error enum, enumerated exhaustively against
   * amplify-ui-swift-liveness's own FaceLivenessDetectionView.swift source)
   * to this module's safe, closed AwsFaceLivenessErrorCode category set --
   * the raw AWS error type/message is NEVER passed across the bridge, only
   * this category string.
   */
  private static func mapErrorCode(_ error: FaceLivenessDetectionError) -> String {
    switch error {
    case .cameraPermissionDenied:
      return "camera_permission_denied"
    case .cameraNotAvailable:
      return "camera_unavailable"
    case .userCancelled:
      return "cancelled"
    case .sessionNotFound, .invalidRegion, .sessionTimedOut, .sessionInterrupted, .socketClosed:
      return "session_invalid_or_expired"
    case .accessDenied, .invalidSignature:
      return "credentials_invalid"
    case .throttling, .serviceUnavailable, .serviceQuotaExceeded, .internalServer:
      return "network_error"
    default:
      return "unknown_error"
    }
  }
}
