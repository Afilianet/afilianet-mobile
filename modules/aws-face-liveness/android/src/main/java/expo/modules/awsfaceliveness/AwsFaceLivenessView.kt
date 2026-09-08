package expo.modules.awsfaceliveness

import android.content.Context
import androidx.compose.ui.platform.ComposeView
import aws.smithy.kotlin.runtime.time.Instant
import com.amplifyframework.auth.AWSCredentials
import com.amplifyframework.auth.AWSCredentialsProvider
import com.amplifyframework.auth.AWSTemporaryCredentials
import com.amplifyframework.core.Consumer
import com.amplifyframework.ui.liveness.model.FaceLivenessDetectionException
import com.amplifyframework.ui.liveness.ui.FaceLivenessDetector
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Afilianet-owned Expo native view hosting AWS's OFFICIAL Compose
 * `FaceLivenessDetector` (from `com.amplifyframework.ui:liveness`) inside
 * an Expo-managed `ComposeView`. This view never re-implements any part of
 * the actual liveness capture experience -- guidance screens, camera
 * preview, oval/light challenge, and result determination are all exactly
 * AWS's own component, unmodified.
 *
 * Every prop (`sessionId`/`region`/the four credential fields) is set by
 * `AwsFaceLivenessModule.kt`'s `Prop(...)` handlers before this view first
 * composes the AWS detector -- JS is responsible for having already
 * fetched a real backend session + real backend-issued credentials before
 * ever mounting this component (see LivenessCaptureFlow.tsx); this view
 * never creates a session or requests credentials on its own.
 */
class AwsFaceLivenessView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var sessionId: String = ""
  var region: String = ""
  var accessKeyId: String = ""
  var secretAccessKey: String = ""
  var sessionToken: String = ""
  /** ISO-8601, exactly as afilianet-api's `expiration` field returns it. */
  var expiration: String = ""
    set(value) {
      field = value
      maybeCompose()
    }

  val onComplete by EventDispatcher()
  val onError by EventDispatcher()

  private var hasComposed = false
  private val composeView = ComposeView(context)

  init {
    addView(
      composeView,
      android.view.ViewGroup.LayoutParams(
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  /**
   * `expiration` is set last among the five props Expo dispatches (props
   * are applied in the order this view's setters/Prop handlers are called
   * during one native update batch, and `expiration` is declared last in
   * AwsFaceLivenessModule.kt's Prop list) -- composing only once all of
   * sessionId/region/credentials are non-empty avoids presenting the AWS
   * detector with a partially-set prop set.
   */
  private fun maybeCompose() {
    if (hasComposed || sessionId.isEmpty() || accessKeyId.isEmpty()) return
    hasComposed = true

    val credentials = try {
      AWSTemporaryCredentials(accessKeyId, secretAccessKey, sessionToken, Instant.fromIso8601(expiration))
    } catch (_: Exception) {
      onError(mapOf("code" to "credentials_invalid"))
      return
    }

    val provider = object : AWSCredentialsProvider<AWSCredentials> {
      override fun fetchAWSCredentials(onSuccess: Consumer<AWSCredentials>, onError: Consumer<com.amplifyframework.auth.AuthException>) {
        onSuccess.accept(credentials)
      }
    }

    composeView.setContent {
      FaceLivenessDetector(
        sessionId = sessionId,
        region = region,
        credentialsProvider = provider,
        onComplete = { onComplete(mapOf("sessionId" to sessionId)) },
        onError = { error -> onError(mapOf("code" to mapErrorCode(error))) },
      )
    }
  }

  /**
   * Maps every `FaceLivenessDetectionException` subtype that actually
   * exists in `com.amplifyframework.ui:liveness:1.11.0` (the version this
   * module depends on) to this module's safe, closed
   * AwsFaceLivenessErrorCode category set -- the raw AWS exception
   * type/message is NEVER passed across the bridge, only this category
   * string.
   *
   * Confirmed exhaustively against that exact release tag's own
   * FaceLivenessDetectionException.kt source, not the library's `main`
   * branch: `main` has since gained a `SessionInterruptedException`
   * ("lost connection to the service before it could complete") that is
   * NOT present in 1.11.0 -- an earlier pass here referenced that class
   * before this version was pinned precisely, which would have been a
   * real compile error. There is no 1.11.0 equivalent for that specific
   * case; it falls through to the `else` branch below instead of being
   * matched by name. Revisit this mapping (and re-diff against the new
   * release's exception file) whenever this dependency version is bumped.
   */
  private fun mapErrorCode(error: FaceLivenessDetectionException): String = when (error) {
    is FaceLivenessDetectionException.CameraPermissionDeniedException -> "camera_permission_denied"
    is FaceLivenessDetectionException.UserCancelledException -> "cancelled"
    is FaceLivenessDetectionException.SessionNotFoundException,
    is FaceLivenessDetectionException.SessionTimedOutException,
    -> "session_invalid_or_expired"
    is FaceLivenessDetectionException.AccessDeniedException -> "credentials_invalid"
    is FaceLivenessDetectionException.VideoEncodingException,
    is FaceLivenessDetectionException.VideoMuxingException,
    -> "camera_unavailable"
    else -> "unknown_error"
  }
}
