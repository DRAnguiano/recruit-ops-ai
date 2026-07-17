# api-conventions

## ADDED Requirements

### Requirement: REST API under /api prefix
The system SHALL expose its REST API under the global prefix `/api`, leaving `/health`,
`/webhooks/*` and `/ws` outside the prefix. Responses and request bodies are JSON with
domain values in English.

#### Scenario: Prefixed route responds
- **WHEN** a GET request is made to `/api/leads`
- **THEN** the leads listing responds, while `/health` and `/webhooks/meta` keep working
  unprefixed

### Requirement: Request validation with zod
Every API endpoint with body or query parameters SHALL validate input against a zod
schema via a shared validation pipe. Invalid input MUST be rejected with 400 and an error
body `{ code: 'VALIDATION_ERROR', message, issues }` without reaching domain logic.

#### Scenario: Invalid body rejected
- **WHEN** a PATCH to a lead sends `status: 123` (wrong type)
- **THEN** the API responds 400 with `code=VALIDATION_ERROR` and the offending path in
  `issues`, and the lead is not modified

### Requirement: Stable error shape
Domain errors reaching the HTTP layer SHALL keep the existing serialization
`{ code, message }` (no stack traces). Unknown resources MUST map to 404 with a typed
domain error, never to a bare framework error.

#### Scenario: Unknown id yields typed 404
- **WHEN** a GET requests `/api/conversations/<uuid inexistente>`
- **THEN** the API responds 404 with a stable domain error code and message

### Requirement: Keyset pagination for large listings
Large listings (conversations, leads, messages) SHALL paginate by opaque cursor with
`limit` (bounded default) and `cursor` query params over a stable ordering, responding
`{ items, nextCursor }` where `nextCursor` is null on the last page. Small catalogs MAY
return the full list without pagination.

#### Scenario: Second page via cursor
- **WHEN** a listing is requested with `limit=2` and then re-requested with the returned
  `nextCursor`
- **THEN** the second response contains the following items in order, without duplicates
  or gaps

#### Scenario: Insertion does not shift pages
- **WHEN** a new row is inserted after the first page was fetched
- **THEN** fetching the next page with the cursor still returns the items that followed
  the first page

### Requirement: CORS restricted by environment
The API SHALL enable CORS only for the origins listed in `CORS_ALLOWED_ORIGINS`
(comma-separated). Requests from other origins MUST NOT receive permissive CORS headers.

#### Scenario: Allowed origin
- **WHEN** a browser request arrives from an origin included in `CORS_ALLOWED_ORIGINS`
- **THEN** the response includes `Access-Control-Allow-Origin` for that origin

#### Scenario: Disallowed origin
- **WHEN** a request arrives from an origin not in the list
- **THEN** the response carries no `Access-Control-Allow-Origin` header
