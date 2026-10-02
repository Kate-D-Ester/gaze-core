import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

const readabilitySyntaxRestrictions = [
  {
    selector: "SequenceExpression",
    message: "Use separate statements instead of comma expressions.",
  },
  {
    selector: "VariableDeclaration[declarations.length>1]",
    message: "Declare each variable separately, including loop initializers.",
  },
]

export default defineConfig([
  globalIgnores(["dist", ".next", "public", "next-env.d.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      curly: ["error", "all"],
      "one-var": ["error", "never"],
      "no-nested-ternary": "error",
      "no-sequences": ["error", { allowInParentheses: false }],
      "no-restricted-syntax": ["error", ...readabilitySyntaxRestrictions],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.types.ts", "**/*.d.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...readabilitySyntaxRestrictions,
        {
          selector: "TSInterfaceDeclaration",
          message: "Declare interfaces in the matching .types.ts module.",
        },
        {
          selector: "TSTypeAliasDeclaration",
          message: "Declare type aliases in the matching .types.ts module.",
        },
        {
          selector: "TSTypeLiteral",
          message:
            "Declare structural object types in the matching .types.ts module.",
        },
      ],
    },
  },
])
