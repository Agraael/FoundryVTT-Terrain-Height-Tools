import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
	{
		files: [
			"./src/**/*.{js,mjs,cjs}",
			"./test/**/*.{js,mjs,cjs}",
		],
		plugins: {
			js,
			"@stylistic": stylistic
		},
		extends: ["js/recommended"],
		languageOptions: {
			globals: globals.browser
		},
		rules: {
			"@stylistic/array-bracket-newline": ["error", "consistent"],
			"@stylistic/array-bracket-spacing": ["error", "never"],
			"@stylistic/array-element-newline": ["error", "consistent"],
			"@stylistic/arrow-parens": ["error", "as-needed"],
			"@stylistic/arrow-spacing": "error",
			"@stylistic/comma-dangle": ["error", "never"],
			"@stylistic/comma-spacing": ["error", { "before": false, "after": true }],
			"@stylistic/comma-style": ["error", "last"],
			"@stylistic/computed-property-spacing": ["error", "never"],
			"@stylistic/function-call-spacing": ["error", "never"],
			"@stylistic/function-paren-newline": ["error", "consistent"],
			"@stylistic/indent": ["error", "tab", { "SwitchCase": 1 }],
			"@stylistic/key-spacing": "error",
			"@stylistic/keyword-spacing": "error",
			"@stylistic/line-comment-position": "off",
			"@stylistic/lines-around-comment": "off",
			"@stylistic/lines-between-class-members": ["error", "always"],
			"@stylistic/no-extra-parens": ["error", "all", { "nestedBinaryExpressions": false }],
			"@stylistic/no-extra-semi": "error",
			"@stylistic/no-floating-decimal": "error",
			"@stylistic/no-mixed-operators": "error",
			"@stylistic/no-multi-spaces": "error",
			"@stylistic/no-trailing-spaces": "error",
			"@stylistic/no-whitespace-before-property": "error",
			"@stylistic/object-curly-spacing": ["error", "always"],
			"@stylistic/quote-props": ["error", "consistent"],
			"@stylistic/quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": "avoidEscape" }],
			"@stylistic/rest-spread-spacing": ["error", "never"],
			"@stylistic/semi-spacing": "error",
			"@stylistic/semi-style": ["error", "last"],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/space-before-blocks": "error",
			"@stylistic/space-before-function-paren": ["error", { "anonymous": "never", "named": "never", "asyncArrow": "always" }],
			"@stylistic/space-in-parens": ["error", "never"],
			"@stylistic/space-infix-ops": "error",
			"@stylistic/space-unary-ops": "error",
			"@stylistic/spaced-comment": ["error", "always"],
			"@stylistic/switch-colon-spacing": "error",
			"@stylistic/template-curly-spacing": "error",
			"@stylistic/template-tag-spacing": "error",
			"no-undef": "off",
			"no-unused-vars": ["warn", { "ignoreRestSiblings": true }],
			"prefer-const": ["warn", { "destructuring": "all" }]
		}
	},
	{
		ignores: [
			"./foundry.js"
		]
	}
]);
