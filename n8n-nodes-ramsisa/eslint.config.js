const tsParser = require("@typescript-eslint/parser");
const n8nPlugin = require("eslint-plugin-n8n-nodes-base");

// We apply the `community` ruleset to all .ts files. The `nodes` and
// `credentials` rulesets target n8n's main monorepo and include rules
// (e.g. cred-class-field-documentation-url-miscased) that don't apply
// to community packages.
const tsConfig = {
  files: ["nodes/**/*.ts", "credentials/**/*.ts"],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
  plugins: { "n8n-nodes-base": n8nPlugin },
  rules: { ...n8nPlugin.configs.community.rules },
};

module.exports = [
  { ignores: ["dist/**", "node_modules/**"] },
  tsConfig,
  { files: ["**/*.js"], rules: {} },
];
