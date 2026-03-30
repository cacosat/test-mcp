# Gorgias MCP Server

MCP server that connects Claude to your [Gorgias](https://www.gorgias.com/) helpdesk — query tickets, monitor CX metrics, classify incidents, and manage tags in real time.

## Available Tools

| Tool | Description | Type |
|------|-------------|------|
| `list_tickets` | List tickets with pagination, sorting, and customer/view filtering | Read |
| `get_ticket` | Get a single ticket with messages, tags, and custom fields | Read |
| `create_ticket` | Create a new ticket | Write |
| `update_ticket` | Update status, assignee, custom fields (Incidencias L1/L2/L3), tags | Write |
| `add_message_to_ticket` | Add a reply or internal note to a ticket | Write |
| `list_customers` | List customers with optional email filter | Read |
| `get_customer` | Get a single customer by ID | Read |
| `get_ticket_fields` | Get custom field definitions (Incidencias taxonomy dropdowns) | Read |
| `get_satisfaction_stats` | Get individual CSAT survey responses | Read |
| `get_ticket_stats` | Get first response time or resolution time for a date range | Read |
| `list_tags` | List all available tags | Read |
| `manage_tags` | Add or remove a tag on a ticket | Write |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Gorgias API credentials (Settings > REST API in your Gorgias account)

## Setup

```bash
git clone https://github.com/cacosat/test-mcp.git
cd test-mcp
npm install
cp .env.example .env
```

Edit `.env` with your credentials:

```
GORGIAS_DOMAIN=your-subdomain.gorgias.com
GORGIAS_USERNAME=your-email@example.com
GORGIAS_API_KEY=your-api-key
READ_ONLY=false
```

## Testing

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test tools interactively:

```bash
npx @modelcontextprotocol/inspector node src/index.js
```

This opens a web UI where you can call any tool and see the response. Try `list_tickets` with `{"limit": 5}` to verify your connection.

## Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gorgias": {
      "command": "node",
      "args": ["/absolute/path/to/test-mcp/src/index.js"],
      "env": {
        "GORGIAS_DOMAIN": "your-subdomain.gorgias.com",
        "GORGIAS_USERNAME": "your-email@example.com",
        "GORGIAS_API_KEY": "your-api-key",
        "READ_ONLY": "true"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` (project-level or `~/.claude/settings.json` globally):

```json
{
  "mcpServers": {
    "gorgias": {
      "command": "node",
      "args": ["/absolute/path/to/test-mcp/src/index.js"],
      "env": {
        "GORGIAS_DOMAIN": "your-subdomain.gorgias.com",
        "GORGIAS_USERNAME": "your-email@example.com",
        "GORGIAS_API_KEY": "your-api-key",
        "READ_ONLY": "true"
      }
    }
  }
}
```

## READ_ONLY Mode

Set `READ_ONLY=true` to disable all write operations. Only 8 read tools are registered — Claude cannot create, update, or modify any data. Recommended for initial deployment.

## Rate Limiting & Caching

- **Rate limiting:** On HTTP 429 from Gorgias, retries up to 3 times with exponential backoff (1s, 2s, 4s). Respects `Retry-After` header.
- **Caching:** Responses from `/stats/*` and `/custom-fields` are cached in memory for 5 minutes to reduce API calls during report generation.

## Architecture

```
src/
  index.js              Entry point — env validation, stdio transport
  gorgias-client.js     HTTP client — auth, rate limiting, caching
  server.js             MCP server — tool registration, READ_ONLY gating
  tools/
    tickets.js          list, get, create, update, add message (5 tools)
    customers.js        list, get (2 tools)
    fields.js           get custom fields (1 tool)
    stats.js            satisfaction surveys, ticket stats (2 tools)
    tags.js             list, manage (2 tools)
```

See [DOCS.md](DOCS.md) for full tool reference with parameters, API mappings, and troubleshooting.

## Production Deployment

### Step 1: Validate with READ_ONLY

Run with `READ_ONLY=true` and test all 8 read tools against your live Gorgias data. Confirm `list_tickets`, `get_ticket_fields`, `get_ticket_stats`, and `get_satisfaction_stats` return correct results. This is the current state — no changes needed if you've already tested.

### Step 2: Enable Write Tools

Once confident, set `READ_ONLY=false` and restart Claude Desktop. Test write tools on non-critical tickets first:

1. `manage_tags` — safest write op. Add a test tag, then remove it.
2. `update_ticket` — try setting a custom field (Incidencias) on a test ticket.
3. `add_message_to_ticket` — add an internal note (invisible to customer).
4. `create_ticket` — create a test ticket and close it immediately.

### Step 3: Create Gorgias Views for Filtering

Since `list_tickets` doesn't support ad-hoc filtering by status/channel/tags, create Views in Gorgias to cover your common queries:

- **Open tickets this week** — filter: status=open, created in last 7 days
- **Unclassified tickets** — filter: Incidencias field is empty
- **Escalated from Vambe** — filter: tag contains `api` or `reuse`
- **By country** — one View per country/integration (Chile, Mexico, Peru)

Note each View's ID (visible in the URL when viewing it in Gorgias) and pass it to `list_tickets` via `view_id`.

### Step 4: Secure Credentials

For team or production use:

- **Never commit `.env`** — it's already in `.gitignore`
- **Rotate API keys** — create a dedicated Gorgias API key for the MCP server, separate from personal keys
- **Restrict permissions** — if Gorgias supports scoped API keys, use read-only keys when write access isn't needed
- **Secrets manager** — for shared/deployed environments, load credentials from a secrets manager (AWS Secrets Manager, 1Password CLI, etc.) instead of a `.env` file

### Step 5: Deploy to Cloudflare Workers (Remote Access)

Deploy the server to Cloudflare Workers so your team can connect without local setup. The server uses **Streamable HTTP** transport (MCP spec 2025-03-26).

**Prerequisites:** [Cloudflare account](https://dash.cloudflare.com/sign-up) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated (`npx wrangler login`).

**Set secrets:**

```bash
npx wrangler secret put GORGIAS_DOMAIN
npx wrangler secret put GORGIAS_USERNAME
npx wrangler secret put GORGIAS_API_KEY
npx wrangler secret put READ_ONLY
```

Each command will prompt you to enter the value interactively (secrets are never stored in code).

**Deploy:**

```bash
npm run deploy
```

Your server will be live at `https://gorgias-mcp.<your-account>.workers.dev/mcp`.

**Connect from Claude Code:**

```bash
claude mcp add gorgias --transport streamable-http https://gorgias-mcp.<your-account>.workers.dev/mcp
```

**Local Worker development:**

```bash
cp .dev.vars.example .dev.vars
# Fill in your credentials in .dev.vars
npm run dev:worker
```

**Known limitations (Phase 1 — authless):**
- No authentication on the Worker endpoint — anyone with the URL can call it. Suitable for internal testing only.
- All users share a single Gorgias API key. Gorgias rate limits (~2 req/s on basic plans) apply to the key, not per user. A busy team could hit limits.
- Durable Objects are billed separately from Workers free tier (~$0.15/million requests). For a small team this is essentially free.

### Step 6: Claude Enterprise — Share with Your Organization

For Claude Enterprise/Team accounts, admins can make the MCP server available to all workspace members:

1. Go to **Organization Settings > Connectors > Add custom connector**
2. Enter the Worker URL: `https://gorgias-mcp.<your-account>.workers.dev/mcp`
3. For Phase 1 (authless), leave OAuth fields empty
4. Team members enable the connector per-conversation via the **+** button > **Connectors** toggle

**For production (OAuth):** The claude.ai web connector UI requires OAuth 2.1 — bare bearer tokens are not supported. To add OAuth:

1. Use Cloudflare's OAuth template as reference: `cloudflare/ai/demos/remote-mcp-github-oauth`
2. Add an OAuth provider (GitHub, Google, or custom via Auth0/Stytch/WorkOS)
3. Configure the OAuth client ID/secret in the Claude Enterprise connector settings

For **Claude Code CLI** users, the authless version works directly — no OAuth needed.

### Step 7: Migrate Stats API (Before Dec 2026)

The `POST /api/stats/{metric}` endpoint is legacy and will be **sunset on December 31, 2026**. Before that date, migrate `get_ticket_stats` to the new `POST /api/reporting/stats` endpoint. See [Gorgias API docs](https://developers.gorgias.com/reference/post_api-reporting-stats) for the new format.

### Possible Next Steps

- **Add OAuth** — secure the Worker endpoint for production use with your Claude Enterprise organization
- **Shopify MCP server** — add a separate MCP server for Shopify order data, letting Claude cross-reference tickets with orders
- **Prompt templates** — create system prompts for recurring workflows: weekly CX report, ticket classifier, CSAT monitor, anomaly detector
- **Scheduled reports** — use Claude Code's `/schedule` command to run weekly CX reports automatically
