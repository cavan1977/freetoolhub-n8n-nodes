# n8n-nodes-freetoolhub

An [n8n](https://n8n.io) community node that puts **44 calculators and MCP utilities** inside your workflows — US tax, finance and business (payroll, sales tax, economic nexus, dropshipping profit, mortgage, 401(k) vs Roth, capital gains) plus an MCP engineering suite for context budgeting, server trust scoring, security auditing and client config generation.

No API key required to start. Install it, drop the node into a workflow, pick a calculator, done.

```
[n8n workflow] → [FreeToolHub node] → {"federalTax": 9842.5, "stateTax": 3100, ...}
```

---

## Why this node exists

If you run automations for US-facing e-commerce, agencies, or freelancer platforms, you regularly hit questions that need a *correct, current* number rather than a guess:

| Workflow you're probably building | Calculator to call |
|---|---|
| Order comes in → do I now owe sales tax in this state? | `check_economic_nexus` |
| Shopify order → what's the *real* margin after fees + ad spend? | `calculate_dropship_profit` |
| New contractor onboarded → W-2 or 1099, which is cheaper? | `compare_w2_vs_1099` |
| Payroll run → what are the actual deductions? | `calculate_payroll_tax` |
| Reseller order → profit after eBay/Poshmark/Mercari fees | `calculate_reseller_profit` |
| Import shipment → landed cost with duties | `calculate_tariff` |
| Freelancer invoice → what should this project quote be? | `calculate_freelancer_pricing` |
| Campaign report → ROAS, CPA, CPC | `calculate_roi` |

Every result comes back as structured JSON you can pipe straight into Google Sheets, Airtable, Slack, an invoice PDF, or your database.

Tax brackets, contribution limits and state rates are loaded from FreeToolHub's live CDN datasets, and each response carries a `_meta.dataFreshness` block telling you how current the underlying data is.

---

## Installation

### Via the n8n UI (recommended)

1. Open your n8n instance → **Settings → Community Nodes**
2. Select **Install a community node**
3. Enter `n8n-nodes-freetoolhub`
4. Accept the risk warning and install

### Via npm (self-hosted)

```bash
cd ~/.n8n
npm install n8n-nodes-freetoolhub
```

Then restart n8n.

### From source

```bash
git clone https://github.com/cavan1977/freetoolhub-n8n-nodes.git
cd freetoolhub-n8n-nodes
npm install
npm run build
# link into your n8n custom extensions folder, or:
npm link
cd ~/.n8n/custom && npm link n8n-nodes-freetoolhub
```

---

## Credentials

The credential is **optional**. With no credential configured, the node runs against the public endpoint on the free tier (50 calls per IP per day).

To raise the quota, add a **FreeToolHub API** credential:

| Field | Value |
|---|---|
| Base URL | `https://freetoolhub.org` (change only if you self-host) |
| API Key | your licence key from [freetoolhub.org/pro](https://freetoolhub.org/pro/) |

The key is sent as an `X-API-Key` header on every request, and the server lifts the daily
per-IP limit for it. There is no separate key to generate: it is the same licence key that
activates Pro in the browser (format `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`). Keys are validated
against the payment provider and cached for 10 minutes, so a refund or cancellation takes
effect within that window.

Each tool response reports the tier it ran under at `_meta.rateLimit.tier` — `"free"` or
`"pro"` — which is the quickest way to confirm the credential is being picked up.

---

## Operations

### Run Tool

Executes a single calculator.

| Parameter | Description |
|---|---|
| **Tool Name** | Dropdown loaded live from the server, so it always matches what the backend actually serves |
| **Arguments (JSON)** | Calculator inputs as a JSON object |
| **Output** | *Result Only* — just the numbers. *Result + Metadata* — adds `_meta` with source, web link, remaining quota and data freshness |

Example **Arguments**:

```json
{
  "grossSalary": 85000,
  "filingStatus": "single",
  "state": "CA",
  "retirementContribution": 6000
}
```

Example **output** (`calculate_payroll_tax`, verified against production):

```json
{
  "gross": 85000,
  "ssTax": 5270,
  "medicare": 1232.5,
  "fedTax": 9842.5,
  "stateTax": 3100,
  "retirement": 6000,
  "takeHome": 59555,
  "monthly": 4962.92,
  "_meta": {
    "source": "FreeToolHub",
    "webUrl": "https://freetoolhub.org/payroll-tax-calculator",
    "rateLimit": { "remaining": 47, "limit": 50 },
    "dataFreshness": { "freshness": "fresh", "updatedAt": "2026-09-01" }
  }
}
```

### List Tools

Emits one item per calculator with its full parameter schema — useful for building a dynamic parameter UI or documenting a workflow.

```json
{
  "name": "check_economic_nexus",
  "description": "Check which US states you have economic nexus in for sales tax collection...",
  "parameters": { "totalSales": { "type": "number", ... } },
  "required": ["totalSales"]
}
```

---

## Example: flag tax exposure on every new order

```
[Shopify Trigger] → [Code: sum YTD sales by state] → [FreeToolHub: check_economic_nexus]
                                                              │
                                                              ▼
                                            [IF: statesRequiringCollection.length > 0]
                                                              │
                                                              ▼
                                                    [Slack: alert finance]
```

In the **FreeToolHub** node set:

- **Tool Name**: `check_economic_nexus`
- **Arguments**: `={{ JSON.stringify({ totalSales: $json.ytdSales }) }}`

Real response shape:

```json
{
  "totalSales": 250000,
  "statesChecked": 51,
  "statesRequiringCollection": ["AL", "AK", "AZ", "..."],
  "federalThreshold": 100000,
  "warning": "You likely have nexus in most states."
}
```

## Example: nightly margin audit

```
[Schedule Trigger] → [Postgres: yesterday's orders] → [FreeToolHub: calculate_dropship_profit]
                                                              │
                                                              ▼
                                                    [Google Sheets: append row]
```

- **Tool Name**: `calculate_dropship_profit`
- **Arguments**: `={{ JSON.stringify({ salePrice: $json.price, productCost: $json.cost, adSpendPerOrder: $json.adSpend, platform: "shopify" }) }}`

---

## Available tools

**Tax (12)** — `calculate_se_tax`, `calculate_freelancer_tax`, `calculate_1099k_tax`, `calculate_capital_gains_tax`, `compare_w2_vs_1099`, `get_sales_tax_rate`, `calculate_payroll_tax`, `calculate_estate_tax`, `calculate_hsa_fsa_savings`, `calculate_quarterly_tax`, `check_economic_nexus`, `calculate_tariff`

**Finance (10)** — `calculate_compound_interest`, `calculate_mortgage`, `compare_401k_vs_roth`, `calculate_car_loan`, `calculate_rental_roi`, `calculate_student_loan`, `calculate_roi`, `calculate_life_insurance`, `calculate_rental_affordability`, `calculate_home_equity`

**Business (5)** — `calculate_break_even`, `compare_llc_cost`, `calculate_dropship_profit`, `calculate_reseller_profit`, `calculate_freelancer_pricing`

**MCP engineering (10)** — `estimate_mcp_context_budget`, `plan_mcp_token_budget`, `compress_tool_definitions`, `score_mcp_server_trust`, `audit_mcp_server_security`, `generate_mcp_client_config`, `generate_mcp_server_card`, `validate_mcp_server_card`, `advise_tool_portfolio`, `find_tool`

Useful when you are building or operating agents: budget how much of a context window your MCP servers consume, compress tool definitions to cut token cost, audit a server against the OWASP MCP Top 10, score a server's abandonment risk, and emit ready-to-paste client config for Claude Desktop / Cursor / Windsurf / VS Code.

**CI & automation cost (4)** — `calculate_github_actions_cost`, `compare_automation_platform_costs`, `estimate_selfhosted_tco`, `detect_polling_cost_traps`

**AI cost (3)** — `compare_llm_api_costs`, `compare_ai_coding_tool_costs`, `plan_context_window_budget`

The catalogue grows — because the dropdown is loaded live from the server, new tools appear in your workflow editor without upgrading this package.

---

## Self-hosting

Point the **Base URL** credential field at your own FreeToolHub deployment. The node talks to the standard MCP JSON-RPC endpoint at `/api/mcp`, so any instance exposing it will work.

---

## Development

```bash
npm install
npm run build      # tsc + copy icons
npm run dev        # tsc --watch
npm run lint       # n8n community node lint rules
```

The node is a thin adapter over FreeToolHub's MCP server. The transport lives in the `mcpCall` / `unwrapToolResult` helpers at the top of `nodes/FreeToolHub/FreeToolHub.node.ts` — if a plain REST endpoint is added later, only those two functions change.

## Resources

- [FreeToolHub API](https://freetoolhub.org/api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Model Context Protocol](https://modelcontextprotocol.io)

## License

[MIT](LICENSE)
