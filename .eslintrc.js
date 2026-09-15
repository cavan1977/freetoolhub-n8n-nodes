module.exports = {
	root: true,
	env: { node: true, es2022: true },
	parser: '@typescript-eslint/parser',
	parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
	plugins: ['n8n-nodes-base'],
	extends: ['plugin:n8n-nodes-base/community'],
	ignorePatterns: ['dist/**', 'node_modules/**'],
	rules: {
		// The icon lives next to the node source and is copied by gulp; the rule
		// cannot see the file at lint time.
		'n8n-nodes-base/node-class-description-icon-not-svg': 'off',
	},
};
