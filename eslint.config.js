const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierConfig = require("eslint-config-prettier");

module.exports = defineConfig([
  ...expoConfig,
  prettierConfig,
  {
    ignores: ["dist/*", ".expo/*", "node_modules/*", "scripts/select-env.js", "eslint.config.js"],
  },
]);
