const { src, dest } = require('gulp');

/**
 * n8n loads node icons at runtime from the compiled output, so the SVG has to
 * be copied next to the .js file. TypeScript only emits .js/.d.ts.
 */
function buildIcons() {
	return src('nodes/**/*.svg').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
