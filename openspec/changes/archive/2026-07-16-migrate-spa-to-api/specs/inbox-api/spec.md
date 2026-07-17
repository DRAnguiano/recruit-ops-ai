# inbox-api (delta)

## MODIFIED Requirements

### Requirement: Conversation listing filters by person
`GET /api/conversations` SHALL additionally accept a `personId` filter (uuid) so clients
can load one person's threads, combinable with the existing filters.

#### Scenario: Person filter
- **WHEN** `GET /api/conversations?personId=<uuid>` is requested
- **THEN** only that person's conversations are returned
