/**
 * Smoke test: drives the compiled n8n node against the LIVE FreeToolHub
 * production MCP endpoint, with the n8n execution context stubbed out.
 *
 *   node test/smoke.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { FreeToolHub } = require('../dist/nodes/FreeToolHub/FreeToolHub.node.js');
const { FreeToolHubApi } = require('../dist/credentials/FreeToolHubApi.credentials.js');

const BASE_URL = process.env.FTH_BASE_URL || 'https://freetoolhub.org';

let failures = 0;
const check = (label, ok, detail = '') => {
	console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
};

// ── Stub the n8n runtime ────────────────────────────────────────────────────
async function httpRequest(opts) {
	const res = await fetch(opts.url, {
		method: opts.method,
		headers: opts.headers,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
	});
	return await res.json();
}

function makeCtx(params = {}) {
	return {
		getCredentials: async () => ({ baseUrl: BASE_URL, apiKey: '' }),
		helpers: { httpRequest },
		getNode: () => ({ name: 'FreeToolHub', type: 'n8n-nodes-freetoolhub.freeToolHub' }),
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
	};
}

// ── Run ─────────────────────────────────────────────────────────────────────
const node = new FreeToolHub();

console.log('\n1. Node description');
check('displayName', node.description.displayName === 'FreeToolHub');
check('credential is optional', node.description.credentials?.[0]?.required === false);
check('has run + list operations', node.description.properties[0].options.length === 2);

console.log('\n2. Credential test request points at a routed path');
const cred = new FreeToolHubApi();
check('credential name', cred.name === 'freeToolHubApi');
check(
	'test request uses POST /api/mcp (not the unrouted /api/mcp/health)',
	cred.test.request.url === '/api/mcp' && cred.test.request.method === 'POST',
	`got ${cred.test.request.method} ${cred.test.request.url}`,
);

console.log('\n3. loadOptions.getTools() against live server');
const tools = await node.methods.loadOptions.getTools.call(makeCtx());
check('returned a non-empty list', tools.length > 0, `${tools.length} tools`);
check('no error placeholder leaked in', !tools.some((t) => t.value === ''), tools[0]?.name?.slice(0, 60));
const hasNexus = tools.some((t) => t.value === 'check_economic_nexus');
check('contains check_economic_nexus', hasNexus);
check(
	'options are sorted',
	JSON.stringify(tools.map((t) => t.value)) ===
		JSON.stringify([...tools.map((t) => t.value)].sort()),
);
console.log(`  → sample: ${tools.slice(0, 3).map((t) => t.value).join(', ')}`);

console.log('\n4. execute() — Run Tool, Result Only');
const runCtx = makeCtx({
	operation: 'run',
	toolName: 'calculate_payroll_tax',
	arguments: JSON.stringify({ grossSalary: 85000, filingStatus: 'single', state: 'CA' }),
	outputMode: 'data',
});
const [[runOut]] = await node.execute.call(runCtx);
check('produced one item', !!runOut);
check('_meta stripped in data mode', !('_meta' in runOut.json));
const numeric = Object.entries(runOut.json).filter(([, v]) => typeof v === 'number');
check('returned numeric fields', numeric.length > 0, `${numeric.length} numeric fields`);
check(
	'take-home is less than gross',
	typeof runOut.json.takeHome === 'number' && runOut.json.takeHome < 85000,
	`takeHome=${runOut.json.takeHome}`,
);
console.log(`  → keys: ${Object.keys(runOut.json).join(', ')}`);

console.log('\n5. execute() — Run Tool, Result + Metadata');
const metaCtx = makeCtx({
	operation: 'run',
	toolName: 'check_economic_nexus',
	arguments: JSON.stringify({ totalSales: 250000 }),
	outputMode: 'withMeta',
});
const [[metaOut]] = await node.execute.call(metaCtx);
check('_meta present in withMeta mode', '_meta' in metaOut.json);
check('_meta carries a webUrl', typeof metaOut.json._meta?.webUrl === 'string', metaOut.json._meta?.webUrl);
check('_meta carries rateLimit', typeof metaOut.json._meta?.rateLimit?.remaining === 'number',
	`remaining=${metaOut.json._meta?.rateLimit?.remaining}`);

console.log('\n6. execute() — List Tools');
const listCtx = makeCtx({ operation: 'list' });
const [listOut] = await node.execute.call(listCtx);
check('one item per tool', listOut.length === tools.length, `${listOut.length} items`);
check('each item has a parameter schema', Object.keys(listOut[0].json.parameters).length > 0);

console.log('\n7. Error handling');
let threwOnBadJson = false;
try {
	await node.execute.call(makeCtx({
		operation: 'run', toolName: 'calculate_payroll_tax',
		arguments: '{not valid json', outputMode: 'data',
	}));
} catch { threwOnBadJson = true; }
check('invalid JSON arguments raise an error', threwOnBadJson);

let threwOnUnknownTool = false;
try {
	await node.execute.call(makeCtx({
		operation: 'run', toolName: 'does_not_exist', arguments: '{}', outputMode: 'data',
	}));
} catch { threwOnUnknownTool = true; }
check('unknown tool name raises an error', threwOnUnknownTool);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
