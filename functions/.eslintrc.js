module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended"
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "off",  // Allow normal function syntax
    "quotes": ["warn", "double", {"allowTemplateLiterals": true}], // Warnings instead of errors
    "indent": "off", // No indentation enforcement
    "object-curly-spacing": "off", // No spacing inside `{ }` enforcement
    "arrow-parens": "off", // No forced parentheses in arrow functions
    "eol-last": "off", // No forced newline at end of file
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
