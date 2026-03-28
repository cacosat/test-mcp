# Gorgias MCP Server

MCP server that connects Claude to your [Gorgias](https://www.gorgias.com/) helpdesk — query tickets, monitor CX metrics, classify incidents, and manage tags in real time.

## Available Tools

| Tool | Description | Type |
|------|-------------|------|
| `list_tickets` | List and filter tickets by date range, channel, tags, assignee, status | Read |
| `get_ticket` | Get a single ticket with messages, tags, and custom fields | Read |
| `create_ticket` | Create a new ticket | Write |
| `update_ticket` | Update status, assignee, custom fields (Incidencias L1/L2/L3), tags | Write |
| `add_message_to_ticket` | Add a reply or internal note to a ticket | Write |
| `list_customers` | List customers with optional email filter | Read |
| `get_customer` | Get a single customer by ID | Read |
| `get_ticket_fields` | Get ticket field definitions (Incidencias taxonomy dropdowns) | Read |
| `get_satisfaction_stats` | Get CSAT / satisfaction stats for a date range | Read |
| `get_ticket_stats` | Get FRT, resolution time, and volume stats | Read |
| `list_tags` | List all available tags | Read |
| `manage_tags` | Add or remove a tag on a ticket | Write |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- Gorgias API credentials (Settings → REST API in your Gorgias account)

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

Add to `claude_desktop_config.json` (Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

Set `READ_ONLY=true` in your env to disable all write operations. In this mode, only 8 read tools are registered — Claude cannot create, update, or modify any data. Recommended for initial deployment until you're comfortable with the write tools.

## Rate Limiting & Caching

- **Rate limiting**: On HTTP 429 from Gorgias, retries up to 3 times with exponential backoff (1s, 2s, 4s). Respects `Retry-After` header when present.
- **Caching**: Responses from `/satisfaction`, `/stats`, and `/ticket-fields` are cached in memory for 5 minutes to reduce API calls during report generation.

## Architecture

```
src/
  index.js              Entry point — env validation, stdio transport
  gorgias-client.js     HTTP client — auth, rate limiting, caching
  server.js             MCP server — tool registration, READ_ONLY gating
  tools/
    tickets.js          list, get, create, update, add message (5 tools)
    customers.js        list, get (2 tools)
    fields.js           get ticket fields (1 tool)
    stats.js            satisfaction, ticket stats (2 tools)
    tags.js             list, manage (2 tools)
```
