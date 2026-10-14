# SQL Safety Guidelines

This document outlines SQL safety practices implemented in the Long Weekend Band Crawl application to prevent SQL injection and ensure secure database operations.

## Parameterized Queries (Required)

**✅ ALWAYS use parameterized queries with `.bind()`:**

```javascript
// ✅ CORRECT - Parameterized query
const result = await DB.prepare("SELECT * FROM performances WHERE id = ?")
  .bind(performanceId)
  .first();

// ❌ WRONG - String concatenation (SQL injection risk)
const result = await DB.prepare(
  `SELECT * FROM performances WHERE id = ${performanceId}`,
).first();
```

## Multiple Parameters

Use multiple placeholders with `.bind()` in the same order:

```javascript
const result = await DB.prepare(
  `
  SELECT * FROM performances
  WHERE event_id = ?
  AND venue_id = ?
  AND start_time > ?
`,
)
  .bind(eventId, venueId, startTime)
  .all();
```

## Bulk Operations Safety

### Batch Inserts

Use transactions and parameterized queries for bulk inserts:

```javascript
// ✅ CORRECT - Safe batch insert
const insertStmt = DB.prepare(`
  INSERT INTO performances (band_profile_id, event_id, venue_id, start_time, end_time)
  VALUES (?, ?, ?, ?, ?)
`);

await DB.batch([
  // band_profile_id takes a band_profiles.id, never a band name
  insertStmt.bind(bandProfileIdA, eventId, venue1, "20:00", "21:00"),
  insertStmt.bind(bandProfileIdB, eventId, venue2, "21:00", "22:00"),
  insertStmt.bind(bandProfileIdC, eventId, venue3, "22:00", "23:00"),
]);
```

### Batch Updates

Never build dynamic WHERE clauses from user input:

```javascript
// ✅ CORRECT - Individual parameterized updates
for (const set of sets) {
  await DB.prepare("UPDATE performances SET start_time = ? WHERE id = ?")
    .bind(set.start_time, set.id)
    .run();
}

// ❌ WRONG - Dynamic WHERE clause
const ids = sets.map((s) => s.id).join(",");
await DB.prepare(`UPDATE performances SET is_cancelled = 1 WHERE id IN (${ids})`).run();
```

### Batch Deletes

Use prepared statements in loops or batch operations:

```javascript
// ✅ CORRECT - Parameterized batch delete
const deleteStmt = DB.prepare("DELETE FROM performances WHERE id = ?");

await DB.batch(performanceIds.map((id) => deleteStmt.bind(id)));
```

## Column Names and Table Names

Column and table names cannot be parameterized. When dynamic, use **whitelisting**:

```javascript
// ✅ CORRECT - Whitelist validation
const ALLOWED_SORT_COLUMNS = ["start_time", "end_time", "venue_id"];
const ALLOWED_SORT_ORDERS = ["ASC", "DESC"];

function getSortedPerformances(sortBy, order) {
  if (!ALLOWED_SORT_COLUMNS.includes(sortBy)) {
    throw new Error("Invalid sort column");
  }
  if (!ALLOWED_SORT_ORDERS.includes(order)) {
    throw new Error("Invalid sort order");
  }

  return DB.prepare(
    `
    SELECT * FROM performances
    ORDER BY ${sortBy} ${order}
  `,
  ).all();
}

// ❌ WRONG - No validation
const result = await DB.prepare(
  `
  SELECT * FROM performances ORDER BY ${req.query.sortBy}
`,
).all();
```

## Search Queries

Use LIKE with parameterized values:

```javascript
// ✅ CORRECT - Parameterized LIKE search
const searchTerm = `%${userInput}%`;
const result = await DB.prepare("SELECT * FROM band_profiles WHERE name LIKE ?")
  .bind(searchTerm)
  .all();

// ❌ WRONG - String interpolation
const result = await DB.prepare(
  `
  SELECT * FROM band_profiles WHERE name LIKE '%${userInput}%'
`,
).all();
```

## JOIN Operations

JOINs are safe when table/column names are hardcoded:

```javascript
// ✅ SAFE - Hardcoded table/column names, parameterized values
const result = await DB.prepare(
  `
  SELECT p.*, v.name as venue_name
  FROM performances p
  INNER JOIN venues v ON p.venue_id = v.id
  WHERE p.event_id = ?
`,
)
  .bind(eventId)
  .all();
```

## Input Validation

Always validate input before database operations:

```javascript
import { isValidTime } from "../utils/validation/datetime.js";

function validateSetInput(data) {
  // isValidTime checks the HH:MM shape AND the 0-23 / 0-59 ranges. It
  // returns { valid, error }, never a boolean: test .valid.
  // Never re-implement it with an inline regex (see CLAUDE.md, #1089).
  if (data.start_time && !isValidTime(data.start_time).valid) {
    throw new Error("Invalid time");
  }
  // ... more validation
  return true;
}

export async function updateSetTime(DB, performanceId, data) {
  validateSetInput(data); // Validate first

  return DB.prepare("UPDATE performances SET start_time = ? WHERE id = ?")
    .bind(data.start_time, performanceId)
    .run();
}
```

## Error Handling

Never expose SQL errors directly to users:

```javascript
try {
  const result = await DB.prepare("SELECT * FROM band_profiles WHERE id = ?")
    .bind(bandProfileId)
    .first();
} catch (error) {
  console.error("Database error:", error);

  // ✅ CORRECT - Generic user message
  return new Response(JSON.stringify({ error: "Failed to fetch band" }), {
    status: 500,
  });

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
