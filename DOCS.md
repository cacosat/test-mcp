# Gorgias MCP Server — Detailed Documentation

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Tool Reference](#tool-reference)
  - [Tickets](#tickets)
  - [Customers](#customers)
  - [Ticket Fields](#ticket-fields)
  - [Statistics](#statistics)
  - [Tags](#tags)
- [Rate Limiting](#rate-limiting)
- [Caching](#caching)
- [READ_ONLY Mode](#read_only-mode)
- [Error Handling](#error-handling)
- [Architecture](#architecture)
- [Gorgias API Reference](#gorgias-api-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

This MCP (Model Context Protocol) server acts as a bridge between Claude and the Gorgias helpdesk REST API. It exposes 12 tools that allow Claude to:

- Query and filter tickets by date, channel, tags, assignee, and status
- Read ticket field definitions (critical for custom taxonomies like Incidencias L1/L2/L3)
- Pull CSAT / satisfaction metrics and ticket statistics (FRT, resolution time, volume)
- Create and update tickets, including assigning custom field values
- Manage tags on tickets
- Look up customer information

The server communicates with Claude via **stdio transport** — it reads JSON-RPC messages from stdin and writes responses to stdout. This is the standard MCP transport for local integrations with Claude Desktop and Claude Code.

---

## Authentication

The server authenticates with Gorgias using **HTTP Basic Auth**.

| Environment Variable | Description | Example |
|---------------------|-------------|---------|
| `GORGIAS_DOMAIN` | Your Gorgias domain (subdomain or full URL) | `reuse.gorgias.com` or `reuse` |
| `GORGIAS_USERNAME` | Email address associated with your Gorgias account | `admin@reuse.com` |
| `GORGIAS_API_KEY` | REST API key from Gorgias | `abc123...` |

**How to get your API key:**

1. Log into your Gorgias account
2. Go to **Settings → REST API**
3. Create a new API key or copy an existing one
4. The username is the email address associated with that API key

**Domain normalization:**

The `GORGIAS_DOMAIN` value is flexible:
- `reuse.gorgias.com` → `https://reuse.gorgias.com/api`
- `https://reuse.gorgias.com` → `https://reuse.gorgias.com/api`
- `https://reuse.gorgias.com/` → `https://reuse.gorgias.com/api` (trailing slash stripped)

The auth header is constructed as: `Authorization: Basic base64(username:apiKey)` — this is handled automatically by axios.

---

## Tool Reference

### Tickets

#### `list_tickets`

List and filter Gorgias tickets.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `page` | number | No | 1 | Page number |
| `created_datetime__gte` | string | No | — | ISO 8601 datetime. Tickets created on or after this date. |
| `created_datetime__lte` | string | No | — | ISO 8601 datetime. Tickets created on or before this date. |
| `channel` | string | No | — | Filter by channel: `email`, `chat`, `phone`, `facebook`, `instagram`, etc. |
| `tags` | string | No | — | Filter by tag name |
| `assignee_user__id` | number | No | — | Filter by assignee user ID |
| `status` | string | No | — | `open` or `closed` |

**Gorgias API:** `GET /api/tickets`

**Example prompt:** "Show me open tickets from the last 7 days assigned to user 12345"

---

#### `get_ticket`

Get a single ticket with full details including all messages, tags, and custom field values.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID |

**Gorgias API:** `GET /api/tickets/{id}`

**Example prompt:** "Show me the details of ticket #98765"

---

#### `create_ticket` (write)

Create a new Gorgias ticket with an initial message.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `subject` | string | Yes | — | Ticket subject line |
| `channel` | string | No | `email` | `email`, `chat`, or `phone` |
| `customer_email` | string | Yes | — | Customer's email address |
| `message_body` | string | Yes | — | Initial message body (HTML supported) |

**Gorgias API:** `POST /api/tickets`

**Note:** This tool is hidden when `READ_ONLY=true`.

---

#### `update_ticket` (write)

Update an existing ticket. Use this to assign agents, change status, set custom field values (Incidencias L1/L2/L3), or replace tags.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID to update |
| `assignee_user__id` | number | No | User ID to assign the ticket to |
| `status` | string | No | `open` or `closed` |
| `custom_fields` | array | No | Array of `{id, value}` objects. Use `get_ticket_fields` to discover field IDs. |
| `tags` | array | No | Array of `{name}` objects. **Replaces** all existing tags. |

**Gorgias API:** `PUT /api/tickets/{id}`

**Custom fields example:**

To set an Incidencias L1 value, first call `get_ticket_fields` to find the field ID (e.g., `42`), then:

```json
{
  "ticket_id": 98765,
  "custom_fields": [
    { "id": 42, "value": "Despacho::Estado" }
  ]
}
```

**Note:** This tool is hidden when `READ_ONLY=true`.

---

#### `add_message_to_ticket` (write)

Add a message or internal note to an existing ticket.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `ticket_id` | number | Yes | — | The ticket ID |
| `body` | string | Yes | — | Message body (HTML supported) |
| `via` | string | No | `internal-note` | `email`, `chat`, or `internal-note` |
| `from_agent` | boolean | No | `true` | Whether the message is from an agent |

**Gorgias API:** `POST /api/tickets/{id}/messages`

**Note:** Use `via: "internal-note"` for agent-only notes that customers won't see. This tool is hidden when `READ_ONLY=true`.

---

### Customers

#### `list_customers`

List Gorgias customers with optional email filter.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `page` | number | No | 1 | Page number |
| `email` | string | No | — | Filter by exact email address |

**Gorgias API:** `GET /api/customers`

---

#### `get_customer`

Get a single customer by ID with full details.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customer_id` | number | Yes | The customer ID |

**Gorgias API:** `GET /api/customers/{id}`

---

### Ticket Fields

#### `get_ticket_fields`

Get ticket field definitions, including custom dropdown fields like the Incidencias taxonomy. This is essential for discovering field IDs and allowed values before updating tickets.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_field_id` | number | No | Get a specific field by ID. Omit to list all fields. |

**Gorgias API:** `GET /api/ticket-fields` or `GET /api/ticket-fields/{id}`

**Response includes:**
- Field IDs (needed for `update_ticket` custom_fields)
- Field names and types (text, dropdown, checkbox, etc.)
- Dropdown options with allowed values
- Field descriptions

**This endpoint is cached for 5 minutes** since field definitions rarely change.

---

### Statistics

#### `get_satisfaction_stats`

Get customer satisfaction (CSAT) statistics for a date range.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `datetime__gte` | string | Yes | Start of date range (ISO 8601) |
| `datetime__lte` | string | Yes | End of date range (ISO 8601) |

**Gorgias API:** `GET /api/satisfaction`

**Response:** Returns individual satisfaction survey responses with scores. Claude can aggregate these to calculate CSAT percentages by agent, country, or time period.

**This endpoint is cached for 5 minutes.**

**Example prompt:** "What's our CSAT score for the last 30 days?"

---

#### `get_ticket_stats`

Get ticket statistics including first response time (FRT), resolution time, and volume.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `datetime__gte` | string | Yes | Start of date range (ISO 8601) |
| `datetime__lte` | string | Yes | End of date range (ISO 8601) |
| `group_by` | string | No | Group by `agent`, `integration`, or `channel` |

**Gorgias API:** `GET /api/stats`

**`group_by` options:**
- `agent` — Break down metrics per agent (useful for performance monitoring)
- `integration` — Break down by integration/country
- `channel` — Break down by communication channel (email, chat, phone)

**This endpoint is cached for 5 minutes.**

**Example prompt:** "Show me FRT by agent for this week"

---

### Tags

#### `list_tags`

List all available Gorgias tags.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `page` | number | No | 1 | Page number |

**Gorgias API:** `GET /api/tags`

---

#### `manage_tags` (write)

Add or remove a tag on a specific ticket. Internally, this fetches the ticket's current tags, modifies the list, and updates the ticket.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID |
| `action` | string | Yes | `add` or `remove` |
| `tag_name` | string | Yes | The tag name to add or remove |

**Gorgias API:** `GET /api/tickets/{id}` then `PUT /api/tickets/{id}` with updated tags array.

**Note:** Tag matching is case-insensitive. Duplicate adds are ignored. This tool is hidden when `READ_ONLY=true`.

---

## Rate Limiting

Gorgias enforces API rate limits (~2 requests/second on basic plans). When the limit is exceeded, the API returns HTTP `429 Too Many Requests`.

The client handles this automatically:

1. On 429 response, reads the `Retry-After` header from Gorgias
2. If no header, applies exponential backoff: **1s → 2s → 4s**
3. Retries up to **3 times** before throwing an error
4. All other HTTP errors fail immediately (no retry)

This ensures that bulk operations (e.g., scanning many tickets for classification) degrade gracefully instead of failing.

**Implementation:** `src/gorgias-client.js` — the `request()` method's retry loop.

---

## Caching

Responses from certain endpoints are cached in memory to reduce API calls and avoid rate limits during report generation.

**Cached endpoints:**

| Path | Cache Duration | Reason |
|------|---------------|--------|
| `/satisfaction` | 5 minutes | CSAT data changes infrequently |
| `/stats` | 5 minutes | Aggregate statistics are stable short-term |
| `/ticket-fields` | 5 minutes | Field definitions rarely change |

**Not cached:** Tickets, customers, tags, and messages — these change frequently and should always reflect current state.

**Cache key format:** `path?{JSON-serialized params}` — so the same endpoint with different query parameters is cached separately.

**Cache invalidation:** Entries expire automatically after 5 minutes. The `clearCache()` method on the client can force-clear all cached data if needed.

**Implementation:** `src/gorgias-client.js` — the `cache` Map, `getCached()`, and `isCacheable()` methods.

---

## READ_ONLY Mode

Set `READ_ONLY=true` in your environment to disable all write operations.

**When enabled:**
- 8 read tools are registered: `list_tickets`, `get_ticket`, `list_customers`, `get_customer`, `get_ticket_fields`, `get_satisfaction_stats`, `get_ticket_stats`, `list_tags`
- 4 write tools are **not registered** (invisible to Claude): `create_ticket`, `update_ticket`, `add_message_to_ticket`, `manage_tags`

**When disabled (default):**
- All 12 tools are registered

**Recommendation:** Start with `READ_ONLY=true` in production until you're confident in the server's behavior. Switch to `false` when ready to enable ticket classification and tag management.

**Implementation:** `src/tools/tickets.js` and `src/tools/tags.js` check `options.readOnly` and skip registering write tools when true.

---

## Error Handling

Errors are handled at two levels:

### 1. HTTP Client Level (`gorgias-client.js`)

- **429 Too Many Requests**: Retried with exponential backoff (see [Rate Limiting](#rate-limiting))
- **401 / 403 Authentication errors**: Throws a clear message: `"Authentication failed (status). Check GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY."`
- **Other API errors**: Throws `"Gorgias API error {status}: {response body}"`
- **Network errors**: Throws `"Gorgias request failed: {message}"`

### 2. Tool Level (each tool handler)

Every tool handler is wrapped in try/catch. On error, it returns:

```json
{
  "content": [{ "type": "text", "text": "Error message here" }],
  "isError": true
}
```

This tells Claude the tool call failed without crashing the MCP connection.

### 3. Startup Validation

On startup, `src/index.js` checks that all required environment variables are present. If any are missing, it prints a clear error and exits with code 1:

```
Missing required environment variables: GORGIAS_DOMAIN, GORGIAS_USERNAME, GORGIAS_API_KEY
Copy .env.example to .env and fill in your Gorgias credentials.
```

---

## Architecture

```
src/
  index.js              Entry point
  │                     - Loads .env via dotenv
  │                     - Validates required env vars
  │                     - Creates GorgiasClient and MCP server
  │                     - Starts stdio transport
  │
  gorgias-client.js     HTTP client (GorgiasClient class)
  │                     - Axios instance with Basic Auth
  │                     - get(), post(), put() convenience methods
  │                     - request() core with retry/backoff on 429
  │                     - In-memory cache with 5-min TTL
  │
  server.js             MCP server factory (createServer function)
  │                     - Creates McpServer instance
  │                     - Calls each tool registration function
  │                     - Passes readOnly flag to gate write tools
  │
  tools/
    tickets.js          5 tools — list, get, create, update, add message
    customers.js        2 tools — list, get
    fields.js           1 tool  — get ticket fields
    stats.js            2 tools — satisfaction stats, ticket stats
    tags.js             2 tools — list tags, manage tags
```

**Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server framework and stdio transport |
| `axios` | ^1.7.0 | HTTP client for Gorgias API |
| `zod` | ^3.23.0 | Schema validation for tool parameters |
| `dotenv` | ^16.4.0 | Load environment variables from `.env` |

---

## Gorgias API Reference

This server consumes the following Gorgias REST API endpoints:

| Endpoint | Method | Tool(s) |
|----------|--------|---------|
| `/api/tickets` | GET | `list_tickets` |
| `/api/tickets/{id}` | GET | `get_ticket`, `manage_tags` (read step) |
| `/api/tickets` | POST | `create_ticket` |
| `/api/tickets/{id}` | PUT | `update_ticket`, `manage_tags` (write step) |
| `/api/tickets/{id}/messages` | POST | `add_message_to_ticket` |
| `/api/customers` | GET | `list_customers` |
| `/api/customers/{id}` | GET | `get_customer` |
| `/api/ticket-fields` | GET | `get_ticket_fields` |
| `/api/ticket-fields/{id}` | GET | `get_ticket_fields` (single field) |
| `/api/satisfaction` | GET | `get_satisfaction_stats` |
| `/api/stats` | GET | `get_ticket_stats` |
| `/api/tags` | GET | `list_tags` |

Full Gorgias API documentation: https://developers.gorgias.com/reference

---

## Troubleshooting

### "Missing required environment variables"

You haven't created a `.env` file or it's missing values. Run:
```bash
cp .env.example .env
```
Then fill in your Gorgias credentials.

### "Authentication failed (401)"

- Verify your `GORGIAS_USERNAME` is the email associated with the API key (not just any account email)
- Verify your `GORGIAS_API_KEY` is correct and hasn't been revoked
- Verify your `GORGIAS_DOMAIN` matches your actual Gorgias subdomain

### "Gorgias API error 429"

You're hitting rate limits. The server retries automatically up to 3 times. If you still see this, you may be making too many concurrent requests. The Gorgias basic plan allows ~2 requests/second.

### Server starts but Claude doesn't see the tools

- Make sure the `"command"` and `"args"` paths in your client config are absolute paths
- Restart Claude Desktop / Claude Code after changing the MCP config
- Check that `node src/index.js` runs without errors when you test it manually

### Tools return empty results

- Check your date range filters — Gorgias uses ISO 8601 format (e.g., `2025-01-01T00:00:00Z`)
- Verify the Gorgias account has data in the queried range
- Some endpoints (like `/api/stats`) may require a higher-tier Gorgias plan
