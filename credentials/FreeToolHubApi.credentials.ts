import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * FreeToolHub API credentials.
 *
 * The credential is deliberately optional in the node (`required: false`) so a
 * fresh install works out of the box against the public endpoint (50 free tool
 * calls per IP per day). Adding an API key raises the quota and unlocks the
 * higher-volume tools — this is the "free tier creates dependency, billing
 * lives at the infrastructure end" pattern.
 */
export class FreeToolHubApi implements ICredentialType {
	name = 'freeToolHubApi';

	displayName = 'FreeToolHub API';

	documentationUrl = 'https://freetoolhub.org/api';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://freetoolhub.org',
			description:
				'Root URL of the FreeToolHub instance. Change this only if you self-host FreeToolHub.',
			placeholder: 'https://freetoolhub.org',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. Without a key the node runs on the free tier (50 calls/day per IP). With a key that limit is lifted. The key is the licence key from your FreeToolHub Pro purchase (https://freetoolhub.org/pro/) — the same key activates Pro in the browser. There is nothing separate to generate.',
			placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	/**
	 * Credential test hits `tools/list` rather than a health route.
	 *
	 * Note: the FreeToolHub MCP server documents `GET /api/mcp/health`, but that
	 * path is not routed by Cloudflare Pages Functions (only `/api/mcp` is), so
	 * it currently returns the static 404 page. `tools/list` is a better probe
	 * anyway: it is POST-only, requires no quota (the rate limiter only guards
	 * `tools/call`), and proves the JSON-RPC contract works end to end.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/mcp',
			method: 'POST',
			body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
			json: true,
		},
	};
}
