# Bulk Operations Implementation Specification

**Created:** 2025-10-25
**For:** Cursor AI Implementation
**Feature:** Visual bulk operations for band scheduling admin panel

---

## Overview

Enable non-technical event organizers to select multiple bands (10-50 at a time) and perform bulk actions:

- **Move to venue** - Change venue for multiple bands
- **Change start time** - Adjust timing for multiple bands
- **Delete** - Remove multiple bands at once

**Key Requirements:**

- Error prevention through preview workflow
- Conflict detection (time overlaps)
- Transaction-safe execution (all-or-nothing)
- Mobile-responsive with touch-friendly targets
- Progressive disclosure UX pattern

---

## Architecture

### State Management (React)

```javascript
// BandsTab.jsx state
const [selectedBands, setSelectedBands] = useState(new Set());
const [bulkAction, setBulkAction] = useState(null); // 'move_venue' | 'change_time' | 'delete'
const [bulkParams, setBulkParams] = useState({}); // { venue_id: 5 } or { start_time: '20:00' }
const [previewData, setPreviewData] = useState(null);
const [showPreviewModal, setShowPreviewModal] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);
```

**Why Set?** O(1) lookup performance for checkbox rendering with 50+ bands.

### API Endpoints

**Preview Endpoint** (conflict detection):

```
POST /api/admin/bands/bulk-preview
{
  "band_ids": [1, 2, 3],
  "action": "move_venue",
  "venue_id": 5
}

Response:
{
  "success": true,
  "changes": [
    { "band_id": 1, "band_name": "Band A", "from_venue": "Venue 1", "to_venue": "Venue 2" }
  ],
  "conflicts": [
    { "band_id": 1, "message": "Overlaps with Band X at Venue 2 (20:00-21:00)", "severity": "error" }
  ]
}
```

**Execution Endpoint**:

```
PATCH /api/admin/bands/bulk
{
  "band_ids": [1, 2, 3],
  "action": "move_venue",
  "venue_id": 5,
  "ignore_conflicts": false
}

Response:
{
  "success": true,
  "updated": 3,
  "action": "move_venue"
}
```

---

## Component Structure

```
<BandsTab>
  {selectedBands.size > 0 && (
    <BulkActionBar />
  )}

  <BandTable>
    <thead>
      <tr>
        <th><Checkbox indeterminate={some selected} /></th>
        ...
      </tr>
    </thead>
    <tbody>
      {bands.map(band => (
        <tr className={selected ? 'bg-blue-900/30' : ''}>
          <td><Checkbox /></td>
          ...
        </tr>
      ))}
    </tbody>
  </BandTable>

  {showPreviewModal && <BulkPreviewModal />}
</BandsTab>
```

---

## Implementation Details

### 1. Backend API

#### File: `functions/api/admin/bands/bulk-preview.js`

```javascript
export async function onRequestPost(context) {
  const { request, env } = context;
  const { band_ids, action, ...params } = await request.json();

  // Validate inputs
  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
    });
  }

  const changes = [];
  const conflicts = [];

  // Get current band data
  const placeholders = band_ids.map(() => "?").join(",");
  const bands = await env.DB.prepare(
    `SELECT * FROM bands WHERE id IN (${placeholders})`,
  )
    .bind(...band_ids)
    .all();

  if (action === "move_venue") {
    const { venue_id } = params;

    // Build changes list
    for (const band of bands.results) {
      const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?")
        .bind(venue_id)
        .first();

      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_venue: band.venue_name,
        to_venue: venue.name,
      });
    }

    // Conflict detection: check for time overlaps at target venue
    for (const band of bands.results) {
      const overlaps = await env.DB.prepare(
        `
        SELECT name, start_time, end_time
        FROM bands
        WHERE venue_id = ?
          AND event_id = ?
          AND id NOT IN (${placeholders})
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND start_time < ?)
          )
      `,
      )
        .bind(
          venue_id,
          band.event_id,
          ...band_ids,
          band.end_time,
          band.start_time,
          band.start_time,
          band.end_time,
        )
        .all();

      overlaps.results.forEach((conflict) => {
        conflicts.push({
          band_id: band.id,
          message: `"${band.name}" overlaps with "${conflict.name}" at new venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error",
        });
      });
    }
  }

  // TODO: Add similar logic for 'change_time' and 'delete' actions

  return new Response(JSON.stringify({ success: true, changes, conflicts }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

#### File: `functions/api/admin/bands/bulk.js`

```javascript
export async function onRequestPatch(context) {
  const { request, env } = context;
  const { band_ids, action, ignore_conflicts, ...params } =
    await request.json();

  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
    });
  }

  try {
    let result;

    if (action === "move_venue") {
      const { venue_id } = params;

      // Build batch update statements (ATOMIC - all or nothing)
      const statements = band_ids.map((id) =>
        env.DB.prepare("UPDATE bands SET venue_id = ? WHERE id = ?").bind(
          venue_id,
          id,
        ),
      );

      result = await env.DB.batch(statements);
    } else if (action === "change_time") {
      const { start_time } = params;

      // Preserve duration when changing time
      const statements = band_ids.map((id) =>
        env.DB.prepare(
          `
          UPDATE bands
          SET start_time = ?,
              end_time = datetime(?, '+' ||
                (strftime('%s', end_time) - strftime('%s', start_time)) || ' seconds')
          WHERE id = ?
        `,
        ).bind(start_time, start_time, id),
      );

      result = await env.DB.batch(statements);
    } else if (action === "delete") {
      const placeholders = band_ids.map(() => "?").join(",");
      result = await env.DB.prepare(
        `DELETE FROM bands WHERE id IN (${placeholders})`,
      )
        .bind(...band_ids)
        .run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated: band_ids.length,
        action: action,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Bulk operation failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Database operation failed",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

---

### 2. React Components

#### Modified: `frontend/src/admin/BandsTab.jsx`

Add checkbox column and bulk operation state:

```javascript
import { useState, useEffect } from "react";
import BulkActionBar from "./BulkActionBar";
import BulkPreviewModal from "./BulkPreviewModal";

function BandsTab({ selectedEvent }) {
  // ... existing state ...

  // NEW: Bulk operation state
  const [selectedBands, setSelectedBands] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkParams, setBulkParams] = useState({});
  const [previewData, setPreviewData] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Clear selections when event changes
  useEffect(() => {
    setSelectedBands(new Set());
    setBulkAction(null);
  }, [selectedEvent]);

  // Selection handlers
  const handleSelectBand = (bandId, checked) => {
    setSelectedBands((prev) => {
      const next = new Set(prev);
      checked ? next.add(bandId) : next.delete(bandId);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectedBands(checked ? new Set(bands.map((b) => b.id)) : new Set());
  };

  // Bulk action workflow
  const handleBulkActionSubmit = async () => {
    try {
      const response = await fetch("/api/admin/bands/bulk-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": sessionStorage.getItem("adminPassword"),
        },
        body: JSON.stringify({
          band_ids: Array.from(selectedBands),
          action: bulkAction,
          ...bulkParams,
        }),
      });

      const preview = await response.json();
      setPreviewData(preview);
      setShowPreviewModal(true);
    } catch (error) {
      showToast("error", "Could not load preview. Check connection.");
    }
  };

  const handleConfirmBulk = async (ignoreConflicts) => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/admin/bands/bulk", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": sessionStorage.getItem("adminPassword"),
        },
        body: JSON.stringify({
          band_ids: Array.from(selectedBands),
          action: bulkAction,
          ignore_conflicts: ignoreConflicts,
          ...bulkParams,
        }),
      });

      const result = await response.json();

      if (result.success) {
        showToast("success", `Updated ${selectedBands.size} bands`);
        setSelectedBands(new Set());
        setBulkAction(null);
        setShowPreviewModal(false);
        loadBands(); // Refresh list
      } else {
        showToast("error", result.error || "Operation failed");
      }
    } catch (error) {
      showToast("error", `Failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelBulk = () => {
    setSelectedBands(new Set());
    setBulkAction(null);
    setBulkParams({});
    setPreviewData(null);
  };

  return (
    <div>
      {/* NEW: Bulk action bar */}
      {selectedBands.size > 0 && (
        <BulkActionBar
          count={selectedBands.size}
          action={bulkAction}
          params={bulkParams}
          venues={venues}
          onActionChange={setBulkAction}
          onParamsChange={setBulkParams}
          onSubmit={handleBulkActionSubmit}
          onCancel={handleCancelBulk}
        />
      )}

      {/* Modified table with checkboxes */}
      <div className="overflow-x-auto">
        <table className="w-full hidden md:table">
          <thead className="bg-gray-800">
            <tr>
              {/* NEW: Master checkbox */}
              <th className="p-3 text-left w-12">
                <input
                  type="checkbox"
                  className="w-5 h-5 cursor-pointer"
                  checked={
                    selectedBands.size === bands.length && bands.length > 0
                  }
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedBands.size > 0 &&
                        selectedBands.size < bands.length;
                    }
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Band Name</th>
              <th className="p-3 text-left">Venue</th>
              <th className="p-3 text-left">Start Time</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr
                key={band.id}
                className={
                  selectedBands.has(band.id)
                    ? "bg-blue-900/30"
                    : "hover:bg-gray-800/50"
                }
              >
                {/* NEW: Row checkbox */}
                <td className="p-3">
                  <input
                    type="checkbox"
                    className="w-5 h-5 cursor-pointer"
                    checked={selectedBands.has(band.id)}
                    onChange={(e) =>
                      handleSelectBand(band.id, e.target.checked)
                    }
                  />
                </td>
                <td className="p-3 text-white">{band.name}</td>
                <td className="p-3 text-gray-400">{band.venue_name}</td>
                <td className="p-3 text-gray-400">
                  {formatTime(band.start_time)}
                </td>
                <td className="p-3">
                  <button onClick={() => editBand(band)} className="btn-sm">
                    Edit
                  </button>
                  <button
                    onClick={() => deleteBand(band.id)}
                    className="btn-sm ml-2"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile: Card layout */}
        <div className="md:hidden space-y-3">
          {bands.map((band) => (
            <div
              key={band.id}
              className={`bg-gray-800 rounded-lg p-4 ${
                selectedBands.has(band.id) ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="w-6 h-6 mt-1 cursor-pointer"
                  checked={selectedBands.has(band.id)}
                  onChange={(e) => handleSelectBand(band.id, e.target.checked)}
                />
                <div className="flex-1">
                  <div className="text-white font-semibold">{band.name}</div>
                  <div className="text-gray-400 text-sm mt-1">
                    {band.venue_name} • {formatTime(band.start_time)}
                  </div>
                </div>
                <button onClick={() => editBand(band)} className="btn-icon">
                  ✏️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {showPreviewModal && (
        <BulkPreviewModal
          previewData={previewData}
          isProcessing={isProcessing}
          onConfirm={handleConfirmBulk}
          onCancel={() => setShowPreviewModal(false)}
        />
      )}
    </div>
  );
}
```

#### New: `frontend/src/admin/BulkActionBar.jsx`

```javascript
function BulkActionBar({
  count,
  action,
  params,
  venues,
  onActionChange,
  onParamsChange,
  onSubmit,
  onCancel,
}) {
  const isActionReady = () => {
    if (action === "move_venue") return params.venue_id != null;
    if (action === "change_time") return params.start_time != null;
    if (action === "delete") return true;
    return false;
  };

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-900 to-purple-900 p-3 mb-4 rounded-lg shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Selection count */}
        <div className="text-white font-semibold">
          {count} band{count !== 1 ? "s" : ""} selected
        </div>

        {/* Action selector (Step 1) */}
        {!action && (
          <select
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            onChange={(e) => onActionChange(e.target.value)}
            value=""
          >
            <option value="">Choose action...</option>
            <option value="move_venue">Move to venue</option>
            <option value="change_time">Change start time</option>
            <option value="delete">Delete bands</option>
          </select>
        )}

        {/* Action-specific forms (Step 2) */}
        {action === "move_venue" && (
          <select
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            value={params.venue_id || ""}
            onChange={(e) =>
              onParamsChange({ venue_id: parseInt(e.target.value) })
            }
          >
            <option value="">Select venue...</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        )}

        {action === "change_time" && (
          <input
            type="time"
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            value={params.start_time || ""}
            onChange={(e) => onParamsChange({ start_time: e.target.value })}
          />
        )}

        {action === "delete" && (
          <span className="text-orange-400">
            ⚠️ This will permanently delete {count} bands
          </span>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 md:ml-auto">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 md:flex-none"
          >
            Cancel
          </button>
          {action && (
            <button
              onClick={onSubmit}
              className={`flex-1 md:flex-none ${
                action === "delete" ? "btn-danger" : "btn-primary"
              }`}
              disabled={!isActionReady()}
            >
              Preview Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BulkActionBar;
```

#### New: `frontend/src/admin/BulkPreviewModal.jsx`

```javascript
function BulkPreviewModal({ previewData, isProcessing, onConfirm, onCancel }) {
  const { changes, conflicts } = previewData;
  const hasConflicts = conflicts && conflicts.length > 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-band-navy rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">Preview Changes</h3>
          <p className="text-gray-400 mt-1">
            Review what will change before applying
          </p>
        </div>

        {/* Changes list */}
        <div className="p-6">
          <h4 className="text-white font-semibold mb-3">
            ✓ {changes.length} bands will be updated
          </h4>
          <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
            {changes.map((change) => (
              <div key={change.band_id} className="bg-gray-800 p-3 rounded">
                <div className="text-white font-medium">{change.band_name}</div>
                <div className="text-sm text-gray-400">
                  {change.from_venue} → {change.to_venue}
                </div>
              </div>
            ))}
          </div>

          {/* Conflicts section */}
          {hasConflicts && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                ⚠️ {conflicts.length} conflict
                {conflicts.length !== 1 ? "s" : ""} detected
              </h4>
              <div className="space-y-2">
                {conflicts.map((conflict, idx) => (
                  <div key={idx} className="text-sm text-red-300">
                    • {conflict.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="btn-secondary"
            disabled={isProcessing}
          >
            Cancel
          </button>

          {hasConflicts ? (
            <button
              onClick={() => onConfirm(true)}
              className="btn-danger"
              disabled={isProcessing}
            >
              {isProcessing
                ? "Processing..."
                : "Apply Anyway (Override Conflicts)"}
            </button>
          ) : (
            <button
              onClick={() => onConfirm(false)}
              className="btn-primary"
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Apply Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BulkPreviewModal;
```

---

## Testing Checklist

### Unit Tests

- [ ] Set state management (add/remove/toggle)
- [ ] Indeterminate checkbox state calculation
- [ ] Conflict detection SQL query
- [ ] Batch execution atomicity

### Integration Tests

- [ ] Select all → deselect all flow
- [ ] Move venue with conflicts → preview → override
- [ ] Change time preserves duration
- [ ] Delete multiple bands → confirmation
- [ ] Network failure during preview
- [ ] Bands deleted by another user (404 handling)

### Mobile Tests

- [ ] Touch targets ≥ 44px
- [ ] Card layout on small screens
- [ ] Action bar stacks vertically
- [ ] Modal scrollable on mobile
- [ ] Test on iOS Safari
- [ ] Test on Android Chrome

### Edge Cases

- [ ] Empty selection (buttons disabled)
- [ ] All bands selected (master checkbox checked)
- [ ] Some bands selected (master checkbox indeterminate)
- [ ] Event filter change clears selections
- [ ] Cancel mid-action resets all state
- [ ] Optimistic UI update with rollback on error

---

## CSS Classes Needed

Add to `frontend/tailwind.config.js` or component styles:

```css
/* Bulk action bar */
.btn-secondary {
  @apply px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition;
}

.btn-primary {
  @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition;
}

.btn-danger {
  @apply px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition;
}

.btn-icon {
  @apply p-2 hover:bg-gray-700 rounded transition;
}

/* Touch targets for mobile */
@media (max-width: 768px) {
  input[type="checkbox"] {
    min-width: 44px;
    min-height: 44px;
  }
}
```

---

## Implementation Order (for Cursor)

1. **Backend API** (30 min)
   - Create `bulk-preview.js` endpoint
   - Create `bulk.js` endpoint
   - Test with Postman/curl

2. **State Management** (15 min)
   - Add state to `BandsTab.jsx`
   - Add selection handlers

3. **Table Checkboxes** (20 min)
   - Add checkbox column
   - Implement indeterminate master checkbox
   - Add row highlighting

4. **BulkActionBar** (30 min)
   - Create component
   - Implement progressive disclosure
   - Add action-specific forms

5. **BulkPreviewModal** (20 min)
   - Create modal component
   - Display changes and conflicts
   - Handle confirm/cancel

6. **Mobile Responsive** (20 min)
   - Card layout for small screens
   - Stack action bar vertically
   - Test touch targets

7. **Error Handling** (15 min)
   - Loading states
   - Network error recovery
   - Toast notifications

**Total Estimated Time: 2.5 hours**

---

## Key Decisions Made

1. **Use Set for selection state** - O(1) performance with 50+ bands
2. **D1 batch() for atomicity** - All changes succeed or all fail
3. **3-step progressive disclosure** - Select → Action → Preview (prevents errors)
4. **Conflict preview before execution** - Shows issues before damage done
5. **Mobile cards instead of table** - Better UX on touch devices
6. **Explicit conflict override** - Separate button for "Apply Anyway"

---

## Performance Considerations

- **Initial render:** 50 bands × checkbox = 50 DOM nodes (fast)
- **Selection toggle:** O(1) with Set (instant)
- **Preview API:** 1 round-trip to check conflicts (~100ms)
- **Batch update:** D1 batch() optimized for bulk operations (~200ms for 50 bands)

---

## Security Notes

- All endpoints use existing admin middleware (password + rate limiting)
- SQL injection prevented by parameterized queries
- Batch execution prevents partial updates on error
- Conflict detection runs before destructive actions

---

**Ready for Cursor Implementation** ✅

Hand this spec to Cursor with instruction:
"Implement bulk operations following this spec exactly. Start with backend API, then React components, then mobile responsive."
