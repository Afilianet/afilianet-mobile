const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Keep staging builds within the worker's memory budget while investigating
// the EAS disconnect observed when Metro starts. Local development stays unchanged.
if (process.env.EAS_BUILD === "true" && process.env.EAS_BUILD_PROFILE === "staging") {
  config.maxWorkers = 1;
}

module.exports = config;
