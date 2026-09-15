import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal MCP (Model Context Protocol) JSON-RPC client.
//
// FreeToolHub already exposes a production MCP server at /api/mcp, so the n8n
// node is a thin adapter over it — no backend changes are required for this
// package to work. Keeping the transport in one place means that when a plain
// REST endpoint is added later, only these two functions change.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://freetoolhub.org';
const MCP_PATH = '/api/mcp';

interface McpRpcResponse {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: IDataObject;
	error?: { code: number; message: string };
}

interface McpToolSchema {
	name: string;
	description: string;
	inputSchema?: {
		properties?: Record<string, IDataObject>;
		required?: string[];
	};
}

async function mcpCall(
	ctx: IExecuteFunctions | ILoadOptionsFunctions,
	method: string,
	params: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await ctx.getCredentials('freeToolHubApi').catch(() => null);
	const baseUrl = ((credentials?.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const apiKey = (credentials?.apiKey as string) || '';

	const headers: IDataObject = { 'Content-Type': 'application/json' };
	if (apiKey) headers['X-API-Key'] = apiKey;

	const response = (await ctx.helpers.httpRequest({
		method: 'POST',
		url: `${baseUrl}${MCP_PATH}`,
		headers,
		body: { jsonrpc: '2.0', id: 1, method, params },
		json: true,
	})) as McpRpcResponse;

	if (response?.error) {
		throw new Error(`FreeToolHub MCP error ${response.error.code}: ${response.error.message}`);
	}
	if (!response?.result) {
		throw new Error('FreeToolHub MCP returned an empty response.');
	}
	return response.result;
}

/**
 * MCP wraps every tool result in a `content` array of text blocks. FreeToolHub
 * returns a single JSON-encoded text block, so unwrap it back into an object.
 */
function unwrapToolResult(result: IDataObject): IDataObject {
	const content = result.content as Array<{ type: string; text?: string }> | undefined;
	if (!Array.isArray(content) || content.length === 0) return result;

	const first = content[0];
	if (first?.type === 'text' && typeof first.text === 'string') {
		try {
			return JSON.parse(first.text) as IDataObject;
		} catch {
			return { text: first.text };
		}
	}
	return result;
}

// ─────────────────────────────────────────────────────────────────────────────

export class FreeToolHub implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FreeToolHub',
		name: 'freeToolHub',
		icon: 'file:freetoolhub.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] === "run" ? $parameter["toolName"] : "List tools"}}',
		description:
			'Call FreeToolHub tax, finance and business calculators inside your workflows — payroll, sales tax, economic nexus, dropshipping profit, mortgage, 401(k) and more',
		defaults: {
			name: 'FreeToolHub',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'freeToolHubApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Tool',
						value: 'run',
						description: 'Execute a calculator and return its result',
						action: 'Run a calculator',
					},
					{
						name: 'List Tools',
						value: 'list',
						description: 'Return every available calculator with its parameters',
						action: 'List available calculators',
					},
				],
				default: 'run',
			},

			// ── run ──────────────────────────────────────────────────────────
			{
				displayName: 'Tool Name or ID',
				name: 'toolName',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTools',
				},
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['run'] },
				},
				description:
					'The calculator to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Arguments (JSON)',
				name: 'arguments',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: { operation: ['run'] },
				},
				description:
					'Calculator inputs as a JSON object, e.g. <code>{"grossSalary": 85000, "state": "CA"}</code>. Use <b>List Tools</b> to see the parameter names each calculator accepts.',
			},
			{
				displayName: 'Output',
				name: 'outputMode',
				type: 'options',
				options: [
					{
						name: 'Result Only',
						value: 'data',
						description: 'Just the calculator result',
					},
					{
						name: 'Result + Metadata',
						value: 'withMeta',
						description:
							'Calculator result plus source, web link, remaining quota and data freshness',
					},
				],
				default: 'data',
				displayOptions: {
					show: { operation: ['run'] },
				},
			},
		],
	};

	methods = {
		loadOptions: {
			/**
			 * Populate the "Tool Name" dropdown from the live MCP server so the
			 * node never drifts out of sync with what the backend actually serves.
			 */
			async getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const result = await mcpCall(this, 'tools/list');
					const tools = (result.tools as McpToolSchema[]) || [];
					return tools
						.map((tool) => ({
							name: `${tool.name} — ${tool.description.slice(0, 90)}`,
							value: tool.name,
							description: tool.description,
						}))
						.sort((a, b) => a.value.localeCompare(b.value));
				} catch (error) {
					// A dropdown that throws makes the node unusable, so degrade to a
					// clear hint instead of an empty list.
					return [
						{
							name: '⚠️ Could not reach FreeToolHub — check the credential Base URL',
							value: '',
							description: (error as Error).message,
						},
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const operation = this.getNodeParameter('operation', 0) as string;

		// `list` is input-independent: emit the catalogue once and stop.
		if (operation === 'list') {
			let result: IDataObject;
			try {
				result = await mcpCall(this, 'tools/list');
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
			const tools = (result.tools as McpToolSchema[]) || [];
			return [
				tools.map((tool) => ({
					json: {
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema?.properties ?? {},
						required: tool.inputSchema?.required ?? [],
					},
				})),
			];
		}

		for (let i = 0; i < items.length; i++) {
			const toolName = this.getNodeParameter('toolName', i) as string;
			const rawArguments = this.getNodeParameter('arguments', i, '{}') as string | IDataObject;
			const outputMode = this.getNodeParameter('outputMode', i, 'data') as string;

			if (!toolName) {
				throw new NodeOperationError(
					this.getNode(),
					'No calculator selected. Pick one from the "Tool Name" dropdown, or use the List Tools operation to see what is available.',
					{ itemIndex: i },
				);
			}

			let args: IDataObject;
			if (typeof rawArguments === 'string') {
				try {
					args = rawArguments.trim() === '' ? {} : (JSON.parse(rawArguments) as IDataObject);
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Arguments must be valid JSON. Received: ${rawArguments}`,
						{ itemIndex: i },
					);
				}
			} else {
				args = rawArguments ?? {};
			}

			let payload: IDataObject;
			try {
				const result = await mcpCall(this, 'tools/call', { name: toolName, arguments: args });
				payload = unwrapToolResult(result);
			} catch (error) {
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}

			const { _meta: meta, ...data } = payload as IDataObject & { _meta?: IDataObject };

			returnData.push({
				json: outputMode === 'withMeta' ? { ...data, _meta: meta } : data,
				pairedItem: { item: i },
			});
		}

		return [returnData];
	}
}
