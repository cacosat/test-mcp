# Gorgias MCP Server — Documentation

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
- [Gorgias API Endpoints](#gorgias-api-endpoints)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Overview

This MCP (Model Context Protocol) server acts as a bridge between Claude and the Gorgias helpdesk REST API. It exposes 12 tools that allow Claude to:

- List and sort tickets, filter by customer or pre-configured Gorgias Views
- Read full ticket details including messages, attachments, and custom field values
- Read custom field definitions (Incidencias L1/L2/L3 taxonomy, Bandeja, AI Intent)
- Pull CSAT survey responses and performance stats (FRT, resolution time)
- Create and update tickets, including assigning custom field values
- Manage tags on tickets
- Look up customer information with Shopify integration data

The server communicates via **stdio transport** — it reads JSON-RPC messages from stdin and writes responses to stdout. This is the standard MCP transport for local integrations with Claude Desktop and Claude Code.

---

## Authentication

The server authenticates with Gorgias using **HTTP Basic Auth**.

| Environment Variable | Description | Example |
|---------------------|-------------|---------|
| `GORGIAS_DOMAIN` | Your Gorgias domain (subdomain or full URL) | `reuse.gorgias.com` |
| `GORGIAS_USERNAME` | Email address associated with your Gorgias API key | `admin@reuse.com` |
| `GORGIAS_API_KEY` | REST API key from Gorgias | `abc123...` |

**How to get your API key:**

1. Log into your Gorgias account
2. Go to **Settings > REST API**
3. Create a new API key or copy an existing one
4. The username is the email address associated with that API key

**Domain normalization:**

The `GORGIAS_DOMAIN` value is flexible:
- `reuse.gorgias.com` → `https://reuse.gorgias.com/api`
- `https://reuse.gorgias.com` → `https://reuse.gorgias.com/api`
- `https://reuse.gorgias.com/` → `https://reuse.gorgias.com/api` (trailing slash stripped)

---

## Tool Reference

### Tickets

#### `list_tickets`

List Gorgias tickets with pagination and sorting. Supports filtering by customer ID or pre-configured Gorgias View.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `cursor` | string | No | — | Cursor for pagination (from previous response `meta.next_cursor`) |
| `customer_id` | number | No | — | Filter tickets by customer ID |
| `view_id` | number | No | — | Filter using a pre-configured Gorgias View ID |
| `order_by` | string | No | — | Sort order: `created_datetime:asc`, `created_datetime:desc`, `updated_datetime:asc`, `updated_datetime:desc` |

**Gorgias API:** `GET /api/tickets`

**Note:** Gorgias does not support ad-hoc filtering by status, channel, tags, or date range on this endpoint. To filter by these fields, create a View in the Gorgias UI and pass its `view_id`, or fetch tickets and let Claude filter client-side.

**Example prompt:** "List my 5 most recent tickets sorted by creation date"

---

#### `get_ticket`

Get a single ticket with full details including all messages, attachments, tags, custom field values, and satisfaction survey data.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID |

**Gorgias API:** `GET /api/tickets/{id}`

**Response includes:** message bodies (HTML + text), attachment URLs, customer profile, custom_fields (Incidencias taxonomy values), tags, assignee_team, satisfaction_survey, timestamps.

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

**Hidden when `READ_ONLY=true`.**

---

#### `update_ticket` (write)

Update an existing ticket. Assign agents, change status, set custom field values (Incidencias L1/L2/L3), or replace tags.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID to update |
| `assignee_user__id` | number | No | User ID to assign the ticket to |
| `status` | string | No | `open` or `closed` |
| `custom_fields` | array | No | Array of `{id, value}` objects. Use `get_ticket_fields` to discover field IDs. |
| `tags` | array | No | Array of `{name}` objects. **Replaces** all existing tags. |

**Gorgias API:** `PUT /api/tickets/{id}`

**Custom fields example:** To classify a ticket as "Despacho::Estado", first call `get_ticket_fields` to find the Incidencias field ID (e.g., `133864`), then:

```json
{
  "ticket_id": 90498537,
  "custom_fields": [
    { "id": 133864, "value": "Despacho::Estado" }
  ]
}
```

**Hidden when `READ_ONLY=true`.**

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

Use `via: "internal-note"` for agent-only notes that customers won't see. **Hidden when `READ_ONLY=true`.**

---

### Customers

#### `list_customers`

List Gorgias customers with optional email filter.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `cursor` | string | No | — | Cursor for pagination |
| `email` | string | No | — | Filter by exact email address |

**Gorgias API:** `GET /api/customers`

---

#### `get_customer`

Get a single customer by ID with full details including Shopify integration data.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customer_id` | number | Yes | The customer ID |

**Gorgias API:** `GET /api/customers/{id}`

**Response includes:** communication channels, Shopify integration data (customer ID, currency, creation date), meta fields, custom_fields.

---

### Ticket Fields

#### `get_ticket_fields`

Get custom field definitions including dropdown options. Essential for discovering field IDs and allowed values before updating tickets with `update_ticket`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_field_id` | number | No | Get a specific field by ID. Omit to list all ticket fields. |

**Gorgias API:** `GET /api/custom-fields?object_type=Ticket` or `GET /api/custom-fields/{id}`

**Response includes:** field IDs, labels, types, dropdown choices with allowed values.

**Known fields in Reuse's Gorgias account:**
- **Incidencias** (id 133864) — 53 contact reason categories (`Consulta::Disponibilidad`, `Despacho::Estado`, `Garantia::Falla::Funcional`, etc.)
- **Bandeja** (id 133862) — 8 routing categories (Ventas, Post Venta, Cliente critico, etc.)
- **Incidencias L1** (id 121007) — Top-level types (Garantias, Cambios, Despacho, Devolucion, Consultas, Otros)
- **AI Intent** (id 120995) — 110+ AI-detected topic categories
- **Managed sentiment** (id 120999) — Positive / Negative / Undefined

**This endpoint is cached for 5 minutes.**

---

### Statistics

#### `get_satisfaction_stats`

Get individual CSAT satisfaction survey responses. Returns raw survey data that Claude can aggregate for CSAT scores by agent, country, or time period.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Number of survey responses to return (1-100) |
| `cursor` | string | No | — | Cursor for pagination |

**Gorgias API:** `GET /api/satisfaction-surveys`

**Response includes per survey:** `score` (1-5, or null if unscored), `body_text` (customer feedback), `ticket_id`, `customer_id`, `sent_datetime`, `scored_datetime`.

**Example prompt:** "Get the last 50 CSAT surveys and calculate our satisfaction rate"

---

#### `get_ticket_stats`

Get a performance statistic for a date range using the Gorgias Statistics API.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `metric` | string | Yes | `first-response-time` or `resolution-time` |
| `from` | string | Yes | Start of date range (ISO 8601 datetime) |
| `to` | string | Yes | End of date range (ISO 8601 datetime) |

**Gorgias API:** `POST /api/stats/{metric}`

**Request body sent:**
```json
{
  "filters": {
    "period": {
      "start_datetime": "2026-03-01T00:00:00Z",
      "end_datetime": "2026-03-28T23:59:59Z"
    }
  }
}
```

**Available metrics:**
- `first-response-time` — Median time from customer message to first agent reply
- `resolution-time` — Median time from first customer message to ticket closure

**This endpoint is cached for 5 minutes.** The legacy stats API is scheduled for sunset on December 31, 2026.

**Example prompt:** "What's our average first response time for March 2026?"

---

### Tags

#### `list_tags`

List all available Gorgias tags with usage counts.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 30 | Results per page (1-100) |
| `cursor` | string | No | — | Cursor for pagination |

**Gorgias API:** `GET /api/tags`

---

#### `manage_tags` (write)

Add or remove a tag on a specific ticket. Internally fetches the ticket's current tags, modifies the list, and updates the ticket.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticket_id` | number | Yes | The ticket ID |
| `action` | string | Yes | `add` or `remove` |
| `tag_name` | string | Yes | The tag name to add or remove |

**Gorgias API:** `GET /api/tickets/{id}` then `PUT /api/tickets/{id}` with updated tags array.

Tag matching is case-insensitive. Duplicate adds are ignored. **Hidden when `READ_ONLY=true`.**

---

## Rate Limiting

Gorgias enforces API rate limits (~2 requests/second on basic plans). When exceeded, the API returns HTTP `429 Too Many Requests`.

The client handles this automatically:

1. On 429, reads the `Retry-After` header from Gorgias
2. If no header, applies exponential backoff: **1s → 2s → 4s**
3. Retries up to **3 times** before throwing an error
4. All other HTTP errors fail immediately (no retry)

**Implementation:** `src/gorgias-client.js:87-114` — the `request()` method's retry loop.

---

## Caching

Responses from certain endpoints are cached in memory to reduce API calls.

**Cached endpoints:**

| Path pattern | Cache Duration | Reason |
|-------------|---------------|--------|
| `/stats/*` | 5 minutes | Performance stats are stable short-term (uses POST) |
| `/custom-fields` | 5 minutes | Field definitions rarely change |

**Not cached:** Tickets, customers, tags, satisfaction surveys, and messages — these change frequently.

**Cache key format:** `path?{params}:{data}` — different query parameters or POST bodies are cached separately.

**Implementation:** `src/gorgias-client.js` — the `cache` Map, `getCached()`, `isCacheable()`, and `cacheKey()` methods.

---

## READ_ONLY Mode

Set `READ_ONLY=true` in your environment to disable all write operations.

**When enabled (8 tools):** `list_tickets`, `get_ticket`, `list_customers`, `get_customer`, `get_ticket_fields`, `get_satisfaction_stats`, `get_ticket_stats`, `list_tags`

**When disabled (12 tools):** All of the above plus `create_ticket`, `update_ticket`, `add_message_to_ticket`, `manage_tags`

Write tools are not registered at all when read-only — Claude cannot see or call them.

**Implementation:** `src/tools/tickets.js` and `src/tools/tags.js` check `options.readOnly` and skip registering write tools when true.

---

## Error Handling

### HTTP Client Level (`gorgias-client.js`)

- **429 Too Many Requests:** Retried with exponential backoff (see [Rate Limiting](#rate-limiting))
- **401 / 403:** `"Authentication failed (status). Check GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY."`
- **Other API errors:** `"Gorgias API error {status}: {response body}"`
- **Network errors:** `"Gorgias request failed: {message}"`

### Tool Level

Every tool handler wraps its body in try/catch and returns:

```json
{
  "content": [{ "type": "text", "text": "Error message here" }],
  "isError": true
}
```

This tells Claude the tool call failed without crashing the MCP connection.

### Startup Validation

On startup, `src/index.js` checks that all required environment variables are present. If any are missing, it prints a clear error and exits with code 1.

---

## Architecture

```
src/
  index.js              Entry point
  │                     - Loads .env via dotenv
  │                     - Validates GORGIAS_DOMAIN, GORGIAS_USERNAME, GORGIAS_API_KEY
  │                     - Creates GorgiasClient and MCP server
  │                     - Starts StdioServerTransport
  │
  gorgias-client.js     HTTP client (GorgiasClient class)
  │                     - Axios instance with Basic Auth
  │                     - get(), post(), put() convenience methods
  │                     - request() with retry/backoff on 429
  │                     - In-memory cache with 5-min TTL for stats + custom-fields
  │
  server.js             MCP server factory (createServer function)
  │                     - Creates McpServer instance
  │                     - Calls each tool registration function
  │                     - Passes readOnly flag to gate write tools
  │
  tools/
    tickets.js          5 tools — list, get, create, update, add message
    customers.js        2 tools — list, get
    fields.js           1 tool  — get custom field definitions
    stats.js            2 tools — satisfaction surveys, ticket stats
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

## Gorgias API Endpoints

| Endpoint | Method | Tool(s) |
|----------|--------|---------|
| `/api/tickets` | GET | `list_tickets` |
| `/api/tickets/{id}` | GET | `get_ticket`, `manage_tags` (read step) |
| `/api/tickets` | POST | `create_ticket` |
| `/api/tickets/{id}` | PUT | `update_ticket`, `manage_tags` (write step) |
| `/api/tickets/{id}/messages` | POST | `add_message_to_ticket` |
| `/api/customers` | GET | `list_customers` |
| `/api/customers/{id}` | GET | `get_customer` |
| `/api/custom-fields` | GET | `get_ticket_fields` (list all, with `?object_type=Ticket`) |
| `/api/custom-fields/{id}` | GET | `get_ticket_fields` (single field) |
| `/api/satisfaction-surveys` | GET | `get_satisfaction_stats` |
| `/api/stats/{metric}` | POST | `get_ticket_stats` |
| `/api/tags` | GET | `list_tags` |

Full Gorgias API docs: https://developers.gorgias.com/reference

---

## Known Limitations

- **No ad-hoc ticket filtering:** The `GET /api/tickets` endpoint does not support filtering by status, channel, tags, or date range. Use `view_id` (pre-configured Gorgias Views) or fetch and filter client-side.
- **Limited stat metrics:** Only `first-response-time` and `resolution-time` are confirmed working. Other metrics (ticket volume, messages sent) may use different names on the legacy stats API.
- **Legacy stats API sunset:** The `POST /api/stats/{name}` endpoint is scheduled for deprecation on December 31, 2026. A newer `POST /api/reporting/stats` endpoint exists but is not yet implemented in this server.
- **Satisfaction aggregation:** The satisfaction tool returns individual survey responses, not pre-aggregated CSAT scores. Claude aggregates them client-side.
- **Pagination:** All list endpoints use cursor-based pagination, not page numbers. Pass the `cursor` value from `meta.next_cursor` in the previous response to get the next page.
- **Timestamps:** All Gorgias timestamps are in UTC. Convert to local timezone when building reports (e.g., Chile = UTC-3).

---

## Troubleshooting

### "Missing required environment variables"

You haven't created a `.env` file or it's missing values:
```bash
cp .env.example .env
```
Then fill in your Gorgias credentials.

### "Authentication failed (401)"

- Verify `GORGIAS_USERNAME` is the email associated with the API key (not just any account email)
- Verify `GORGIAS_API_KEY` is correct and hasn't been revoked
- Verify `GORGIAS_DOMAIN` matches your actual Gorgias subdomain

### "Gorgias API error 429"

Rate limited. The server retries automatically up to 3 times with backoff. If you still see this, reduce concurrent requests. The basic Gorgias plan allows ~2 requests/second.

### Server starts but Claude doesn't see the tools

- Ensure the path in `"args"` is an **absolute path** to `src/index.js`
- On Windows, use double backslashes: `"C:\\Users\\you\\test-mcp\\src\\index.js"`
- Restart Claude Desktop fully (quit from system tray, not just close window)
- Test manually first: `node src/index.js` should show "Missing required environment variables"

### "Cannot find module" error

The repo wasn't cloned or `npm install` wasn't run:
```bash
cd /path/to/test-mcp
npm install
```

### Tools return empty results

- All list endpoints return newest-first by default
- Verify the Gorgias account has data
- Some endpoints (stats) may require a higher-tier Gorgias plan
