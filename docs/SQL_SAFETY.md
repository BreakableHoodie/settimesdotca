# SQL Safety Guidelines

This document outlines SQL safety practices implemented in the Long Weekend Band Crawl application to prevent SQL injection and ensure secure database operations.

## Parameterized Queries (Required)

**✅ ALWAYS use parameterized queries with `.bind()`:**

```javascript
// ✅ CORRECT - Parameterized query
const result = await DB.prepare('SELECT * FROM bands WHERE id = ?')
  .bind(bandId)
  .first()

// ❌ WRONG - String concatenation (SQL injection risk)
const result = await DB.prepare(`SELECT * FROM bands WHERE id = ${bandId}`)
  .first()
```

## Multiple Parameters

Use multiple placeholders with `.bind()` in the same order:

```javascript
const result = await DB.prepare(`
  SELECT * FROM bands
  WHERE event_id = ?
  AND venue_id = ?
  AND start_time > ?
`).bind(eventId, venueId, startTime).all()
```

## Bulk Operations Safety

### Batch Inserts

Use transactions and parameterized queries for bulk inserts:

```javascript
// ✅ CORRECT - Safe batch insert
const insertStmt = DB.prepare(`
  INSERT INTO bands (name, event_id, venue_id, start_time, end_time)
  VALUES (?, ?, ?, ?, ?)
`)

await DB.batch([
  insertStmt.bind('Band A', eventId, venue1, '20:00', '21:00'),
  insertStmt.bind('Band B', eventId, venue2, '21:00', '22:00'),
  insertStmt.bind('Band C', eventId, venue3, '22:00', '23:00')
])
```

### Batch Updates

Never build dynamic WHERE clauses from user input:

```javascript
// ✅ CORRECT - Individual parameterized updates
for (const band of bands) {
  await DB.prepare('UPDATE bands SET name = ? WHERE id = ?')
    .bind(band.name, band.id)
    .run()
}

// ❌ WRONG - Dynamic WHERE clause
const ids = bands.map(b => b.id).join(',')
await DB.prepare(`UPDATE bands SET status = 1 WHERE id IN (${ids})`).run()
```

### Batch Deletes

Use prepared statements in loops or batch operations:

```javascript
// ✅ CORRECT - Parameterized batch delete
const deleteStmt = DB.prepare('DELETE FROM bands WHERE id = ?')

await DB.batch(
  bandIds.map(id => deleteStmt.bind(id))
)
```

## Column Names and Table Names

Column and table names cannot be parameterized. When dynamic, use **whitelisting**:

```javascript
// ✅ CORRECT - Whitelist validation
const ALLOWED_SORT_COLUMNS = ['name', 'start_time', 'venue_id']
const ALLOWED_SORT_ORDERS = ['ASC', 'DESC']

function getSortedBands(sortBy, order) {
  if (!ALLOWED_SORT_COLUMNS.includes(sortBy)) {
    throw new Error('Invalid sort column')
  }
  if (!ALLOWED_SORT_ORDERS.includes(order)) {
    throw new Error('Invalid sort order')
  }

  return DB.prepare(`
    SELECT * FROM bands
    ORDER BY ${sortBy} ${order}
  `).all()
}

// ❌ WRONG - No validation
const result = await DB.prepare(`
  SELECT * FROM bands ORDER BY ${req.query.sortBy}
`).all()
```

## Search Queries

Use LIKE with parameterized values:

```javascript
// ✅ CORRECT - Parameterized LIKE search
const searchTerm = `%${userInput}%`
const result = await DB.prepare('SELECT * FROM bands WHERE name LIKE ?')
  .bind(searchTerm)
  .all()

// ❌ WRONG - String interpolation
const result = await DB.prepare(`
  SELECT * FROM bands WHERE name LIKE '%${userInput}%'
`).all()
```

## JOIN Operations

JOINs are safe when table/column names are hardcoded:

```javascript
// ✅ SAFE - Hardcoded table/column names, parameterized values
const result = await DB.prepare(`
  SELECT b.*, v.name as venue_name
  FROM bands b
  INNER JOIN venues v ON b.venue_id = v.id
  WHERE b.event_id = ?
`).bind(eventId).all()
```

## Input Validation

Always validate input before database operations:

```javascript
function validateBandInput(data) {
  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Invalid band name')
  }
  if (data.start_time && !/^\d{2}:\d{2}$/.test(data.start_time)) {
    throw new Error('Invalid time format')
  }
  // ... more validation
  return true
}

export async function createBand(data) {
  validateBandInput(data) // Validate first

  return DB.prepare(`
    INSERT INTO bands (name, start_time) VALUES (?, ?)
  `).bind(data.name, data.start_time).run()
}
```

## Error Handling

Never expose SQL errors directly to users:

```javascript
try {
  const result = await DB.prepare('SELECT * FROM bands WHERE id = ?')
    .bind(bandId)
    .first()
} catch (error) {
  console.error('Database error:', error)

  // ✅ CORRECT - Generic user message
  return new Response(
    JSON.stringify({ error: 'Failed to fetch band' }),
    { status: 500 }
  )

  // ❌ WRONG - Expose SQL details
  // return new Response(error.message, { status: 500 })
}
```

## Security Checklist

Before deploying SQL code:

- [ ] All user inputs use `.bind()` with placeholders (`?`)
- [ ] Dynamic column/table names use whitelist validation
- [ ] Search queries parameterize LIKE values
- [ ] Bulk operations use batch + prepared statements
- [ ] Input validation happens before DB operations
- [ ] Error messages don't expose SQL internals
- [ ] No string concatenation or template literals for values

## References

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- Project file: `functions/api/admin/bands/bulk.js` - Example of safe bulk operations
