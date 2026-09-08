const { withAppBuildGradle } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

// aws-face-liveness's dependency graph (com.amplifyframework:aws-predictions /
// aws-core / core / common-core, from AWS Amplify's core SDK) requires core
// library desugaring. AGP's checkDebugAarMetadata verifies this against the
// FINAL, APK-producing :app module, not just the library module that
// declares the requirement -- :app must enable it too, independently of
// modules/aws-face-liveness/android/build.gradle's own (also required, for
// its own compilation) coreLibraryDesugaringEnabled/coreLibraryDesugaring.
//
// expo-build-properties -- the project's existing mechanism for this class
// of build.gradle tweak -- has no option for this in the installed 57.0.16
// version (confirmed by reading its own pluginConfig.d.ts, not assumed).
// This is a small local config plugin instead: the standard Expo mechanism
// for build.gradle edits an existing plugin doesn't cover, applied via
// mergeContents so it re-applies idempotently on every
// `expo prebuild --clean` rather than being a hand-edit prebuild would wipe.
const DESUGAR_JDK_LIBS = 'com.android.tools:desugar_jdk_libs:2.1.5';

function withAndroidCoreLibraryDesugaring(config) {
  return withAppBuildGradle(config, (config) => {
    let { contents } = mergeContents({
      src: config.modResults.contents,
      newSrc: '    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }',
      tag: 'aws-face-liveness-core-library-desugaring-compile-options',
      anchor: /^android \{/,
      offset: 1,
      comment: '//',
    });

    ({ contents } = mergeContents({
      src: contents,
      newSrc: `    coreLibraryDesugaring '${DESUGAR_JDK_LIBS}'`,
      tag: 'aws-face-liveness-core-library-desugaring-dependency',
      anchor: /^dependencies \{/,
      offset: 1,
      comment: '//',
    }));

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidCoreLibraryDesugaring;
