require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AwsFaceLiveness'
  s.version        = package['version']
  s.summary        = package['description']
  s.author         = 'Afilianet'
  s.homepage       = 'https://github.com/Afilianet/afilianet-mobile'
  # amplify-ui-swift-liveness's own Package.swift declares `.iOS(.v14)` --
  # confirmed directly from that repo's Package.swift, not assumed. The
  # EFFECTIVE app-wide minimum is whichever is higher between this and
  # Expo SDK 57 / React Native 0.86's own minimum iOS deployment target
  # (not independently re-verified here) -- this line only states what
  # THIS package itself requires.
  s.platforms      = { :ios => '14.0' }
  s.source         = { :git => 'https://github.com/Afilianet/afilianet-mobile.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'

  # amplify-ui-swift-liveness is distributed via Swift Package Manager ONLY
  # (no CocoaPods trunk publication) -- `spm_dependency` is React Native
  # 0.75+'s own bridging helper (see react_native_pods.rb) that lets a
  # LOCAL, autolinked podspec like this one (never published to the
  # CocoaPods trunk registry itself, so unaffected by that registry's own
  # Dec 2026 sunset) pull in an SPM-only package automatically during `pod
  # install` (which `expo prebuild` still runs for SDK 57) -- no manual
  # "add package in Xcode after every prebuild" step required, unlike a
  # pure-SPM-only integration would need today (Expo's own config-plugin
  # automation for SPM-only local modules isn't there yet as of this
  # writing -- see this project's README "AWS Face Liveness architecture"
  # section).
  #
  # REQUIRES the app's Podfile to use `use_frameworks! :linkage => :dynamic`
  # (set via the `expo-build-properties` config plugin's
  # `ios.useFrameworks: "dynamic"` option in app.json) -- SPM package
  # integration via this helper does not support static linkage.
  spm_dependency(
    s,
    url: 'https://github.com/aws-amplify/amplify-ui-swift-liveness.git',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '1.4.6' }, # latest release at the time this module was written -- bump freely.
    products: ['FaceLiveness']
  )
end
