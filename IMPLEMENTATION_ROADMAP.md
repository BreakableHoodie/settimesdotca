# Implementation Roadmap

## SuperClaude Commands for Backend Development

**Last Updated:** 2025-10-25
**Purpose:** Practical guide for using SuperClaude commands to implement backend enhancements

**Target Users:** Non-technical event organizers
**Event Frequency:** 4-5 times per year (not annual)
**Priority:** User-friendly UI over technical features

---

## Recommended /sc Commands (Updated for Non-Technical Users)

### 🎯 Priority 1: Event Cloning (MOST CRITICAL)

```bash
# Design event cloning system
/ultrathink "Design event cloning system:
1. Clone event record (new name, date, slug)
2. Reuse existing venues (don't duplicate)
3. Clone all bands with new event_id
4. Preserve all time slots and assignments
5. Return new event ready for editing"

# Research patterns
/sc:research "event duplication best practices database"
/sc:research "data cloning with foreign key relationships SQLite"

# Generate endpoint (when ready)
/sc:generate api-endpoint \
  --path functions/api/admin/events/[id]/clone.js \
  --description "POST endpoint to clone event with all bands"
```

### 📊 Priority 2: Visual Bulk Operations

```bash
# Design UX for bulk operations
/sc:think-hard "Design visual bulk operations:
1. Checkbox selection for multiple bands
2. Action dropdown: Move venue, Delete, Change time
3. Confirm dialog with preview
4. Show conflicts before applying"

# Research UX patterns
/sc:research "checkbox selection patterns admin panels"
/sc:research "bulk edit UX best practices 2025"
```

### 🖼️ Priority 3: Image Upload

```bash
# Design drag-and-drop UX
/sc:business-panel "Image upload UX for non-technical users" \
  --experts "godin,doumont" \
  --focus "simplicity and error prevention"

# Research implementation
/sc:research "drag and drop file upload React best practices"
/sc:research "Cloudflare R2 direct upload from browser"
```

### 📱 Priority 4: Mobile Admin

```bash
# Design mobile-first admin
/sc:business-panel "Mobile admin panel design" \
  --experts "godin,doumont,meadows" \
  --focus "simplicity for touch interfaces"

# Research patterns
/sc:research "mobile admin panel best practices 2025"
/sc:research "touch-friendly UI patterns large buttons"
```

### 📚 Documentation (Already Complete)

```bash
# ✅ DONE: Load project context
/sc:load

# ✅ DONE: Generate API documentation
/sc:docs api --format openapi --output docs/api-spec.yaml

# ✅ DONE: Generate database ER diagram
/sc:docs database --format mermaid --output docs/DATABASE.md
```

---

## Phase 1: Foundation (Immediate)

### 1.1 Project Context & Memory

**Goal:** Establish persistent project knowledge

```bash
# Store architectural decisions
/sc:memory write "backend_architecture" "Cloudflare Workers + D1, multi-event via events table, RESTful API with middleware pattern"

# Store key patterns
/sc:memory write "api_patterns" "File-based routing in functions/, middleware for auth, cascade delete on events"

# Store future enhancements
/sc:memory write "roadmap" "Priority 1: Event cloning/templates, Priority 2: Visual admin improvements, Priority 3: Asset management (R2)"
```

**Why:** Serena MCP will remember context across sessions, reducing ramp-up time.

### 1.2 API Documentation Generation

**Goal:** Create OpenAPI spec for existing endpoints

```bash
# Generate API documentation
/sc:docs api --format openapi --output docs/api-spec.yaml

# Alternative: Generate markdown API docs
/sc:docs api --format md --output docs/API.md
```

**What This Creates:**

- Complete OpenAPI 3.0 specification
- Request/response schemas
- Authentication requirements
- Example requests

**Use Case:** Share with frontend developers, test with Postman/Insomnia

### 1.3 Database ER Diagram

**Goal:** Visual representation of data model

```bash
# Generate entity-relationship diagram
/sc:docs database --format erd --output docs/schema.png

# Or generate Mermaid diagram in markdown
/sc:docs database --format mermaid --output docs/DATABASE.md
```

**What This Creates:**

- Visual diagram of tables and relationships
- FK constraints visualization
- Index documentation

---

## Phase 2: Priority 1 Features (Near-term)

**User Context:** Non-technical organizers running 4-5 events per year
**Key Need:** Quickly duplicate previous events and modify (not start from scratch)

### 2.1 Event Cloning/Duplication

**Goal:** Copy entire event (venues + bands) to create new event
**Why Critical:** With 4-5 events/year, starting fresh each time wastes hours

**Research Phase:**

```bash
# Research event cloning patterns
/sc:research "event duplication best practices database"
/sc:research "data cloning with foreign key relationships SQLite"
```

**Design Phase:**

```bash
# Use Sequential for design thinking
/ultrathink "Design event cloning system:
1. Clone event record (new name, date, slug)
2. Clone all venues (or reference existing?)
3. Clone all bands with new event_id
4. Preserve venue assignments and time slots
5. UI: 'Duplicate Event' button in admin panel
6. Decision: Share venues across events or duplicate?"
```

**Implementation Phase:**

```bash
# Generate clone endpoint
/sc:generate api-endpoint \
  --type cloudflare-function \
  --path functions/api/admin/events/[id]/clone.js \
  --description "POST endpoint to clone event with all bands and venues"

# Generate tests
/sc:test generate \
  --file functions/api/admin/events/[id]/clone.js \
  --coverage unit,integration
```

**Context Needed:**

- Clone event record with new slug (e.g., "vol-5" → "vol-6")
- Decision: Clone venues or reuse existing? (Recommend reuse)
- Clone all bands with updated event_id
- Preserve all time slots, venue assignments, URLs
- Return new event ID for immediate editing

**API Design:**

```javascript
// POST /api/admin/events/{id}/clone
{
  "newName": "Long Weekend Band Crawl Vol. 6",
  "newDate": "2025-09-15",
  "newSlug": "vol-6"
}

// Response: New event with all bands copied
{
  "success": true,
  "event": { id: 2, name: "...", ... },
  "clonedBands": 50,
  "message": "Event cloned successfully. Ready to edit."
}
```

### 2.2 Visual Bulk Operations (No CSV)

**Goal:** Select multiple bands in UI, change venue or delete
**Why Critical:** Non-technical users need visual selection, not file uploads

**Research Phase:**

```bash
# Research UI patterns for bulk operations
/sc:research "checkbox selection patterns admin panels"
/sc:research "bulk edit UX best practices 2025"
```

**Design Phase:**

```bash
# Use Sequential for UX design
/sc:think-hard "Design visual bulk operations:
1. Checkbox next to each band in schedule
2. Select multiple bands visually
3. Action dropdown: Move to venue, Delete, Change time
4. Confirm dialog with preview of changes
5. Show conflicts before applying"
```

**Implementation Phase:**

```bash
# Generate bulk update endpoint
/sc:generate api-endpoint \
  --type cloudflare-function \
  --path functions/api/admin/bands/bulk.js \
  --description "PATCH endpoint for bulk band operations (move venue, delete)"

# Generate tests
/sc:test generate \
  --file functions/api/admin/bands/bulk.js \
  --coverage unit,integration
```

**API Design:**

```javascript
// PATCH /api/admin/bands/bulk
{
  "band_ids": [1, 2, 3],
  "action": "update_venue",
  "venue_id": 5
}

// Response with conflicts
{
  "success": true,
  "updated": 3,
  "conflicts": [
    { band_id: 2, message: "Overlaps with Band X at 20:30" }
  ]
}
```

### 2.3 Simplified Band Entry

**Goal:** Add bands quickly without complex forms
**Why Critical:** Adding 50+ bands per event needs to be fast

**Research Phase:**

```bash
# Research quick entry patterns
/sc:research "spreadsheet-like data entry React"
/sc:research "keyboard shortcuts admin panels"
```

**Design Phase:**

```bash
# Use business panel for UX decisions
/sc:business-panel "Quick band entry UX" \
  --experts "doumont,godin" \
  --focus "simplicity for non-technical users"
```

**Implementation Approach:**

- Single-line entry: "Band Name | Venue | 20:00-21:00"
- Tab to next field, Enter to save and create new
- Venue dropdown with autocomplete
- Time picker with common slots (20:00, 20:30, 21:00...)
- Immediate save (no submit button)
- Show conflicts inline as red highlight

---

## Phase 3: Priority 2 Features (Medium-term)

**User Context:** Build confidence with basic features before advanced ones

### 3.1 Drag-and-Drop Image Upload (R2)

**Goal:** Add event posters and band photos without technical knowledge
**Why Critical:** Visual elements make events more engaging for attendees

**Research Phase:**

```bash
# Research drag-and-drop patterns
/sc:research "drag and drop file upload React best practices"
/sc:research "Cloudflare R2 direct upload from browser"
/sc:research "image preview before upload UX patterns"
```

**Design Phase:**

```bash
# Use business panel for UX decisions
/sc:business-panel "Image upload UX for non-technical users" \
  --experts "godin,doumont" \
  --focus "simplicity and error prevention"

# Use Sequential for implementation design
/sc:think-hard "Drag-and-drop implementation:
1. Drop zone: Drag poster image anywhere on event page
2. Instant preview before save
3. Auto-resize to web-friendly size (max 2MB)
4. One-click replace if wrong image
5. No manual file paths or URLs to manage"
```

**Implementation Phase:**

```bash
# Generate migration for image URLs
/sc:generate migration \
  --description "Add image_url column to events table"

# Generate upload endpoint with R2
/sc:generate api-endpoint \
  --path functions/api/admin/upload.js \
  --description "POST multipart upload with auto-resize to R2"

# Configure R2 bucket in wrangler.toml
# (Manual step: Add R2 binding in Cloudflare dashboard)
```

**Context Needed:**

- R2 bucket: `bandcrawl-assets`
- Public URL pattern: `https://assets.yourdomain.com/{event-slug}/poster.jpg`
- Auto-resize: Max 1200px width, WebP format for performance
- Validation: PNG/JPG only, max 10MB upload size

### 3.2 Mobile-Optimized Admin Panel

**Goal:** Manage events from phone/tablet
**Why Critical:** Non-technical users often work from mobile devices

**Research Phase:**

```bash
# Research mobile-first admin patterns
/sc:research "mobile admin panel best practices 2025"
/sc:research "touch-friendly UI patterns large buttons"
/sc:research "progressive web app offline capabilities"
```

**Design Phase:**

```bash
# Use business panel for mobile UX
/sc:business-panel "Mobile admin panel design" \
  --experts "godin,doumont,meadows" \
  --focus "simplicity for touch interfaces"
```

**Implementation Approach:**

- Large touch targets (min 44px buttons)
- Swipe gestures for common actions (swipe band to delete)
- Bottom nav bar (thumb-friendly)
- Offline mode with PWA (edit while no internet)
- Auto-save everything (no save buttons needed)

### 3.3 Event Preview Mode

**Goal:** See what attendees will see before publishing
**Why Critical:** Confidence to publish without errors

**Implementation Phase:**

```bash
# Generate preview endpoint
/sc:generate api-endpoint \
  --path functions/api/admin/events/[id]/preview.js \
  --description "GET preview of unpublished event"
```

**Features:**

- "Preview as Attendee" button in admin
- Shows exact attendee experience
- Highlights what's missing (bands without times, etc.)
- One-click publish when ready

---

## Phase 4: Priority 3 Features (Long-term)

### 4.1 Automated Tasks (Cron Triggers)

**Research Phase:**

```bash
/sc:research "Cloudflare Cron Triggers examples"
/sc:research "Database maintenance automation patterns"
```

**Implementation Phase:**

```bash
# Generate scheduled cleanup function
/sc:generate cloudflare-function \
  --type scheduled \
  --path functions/scheduled/cleanup.js \
  --description "Daily cleanup: archive old events, trim logs"

# Update wrangler.toml with cron config
/sc:edit wrangler.toml \
  --add "triggers.crons = ['0 2 * * *']"
```

### 4.2 Email Notifications (Cloudflare Email Workers)

**Research Phase:**

```bash
/sc:research "Cloudflare Email Workers setup"
/sc:research "Transactional email best practices"
/sc:research "Email template design patterns"
```

**Implementation Phase:**

```bash
# Generate email service module
/sc:generate module \
  --path functions/utils/email.js \
  --description "Email sending utilities with templates"

# Generate password reset email endpoint
/sc:generate api-endpoint \
  --path functions/api/admin/auth/reset-email.js \
  --description "Send password reset email with secure token"
```

### 4.3 Multi-Tenancy

**Strategic Decision Phase:**

```bash
# Use business panel for major architectural decision
/sc:business-panel "Multi-tenancy architecture" \
  --experts "porter,taleb,meadows" \
  --mode debate \
  --focus "Subdomain-based vs path-based routing, shared vs isolated databases"

# Deep architectural analysis
/ultrathink "Multi-tenancy architecture:
1. Isolation model: Shared DB with org_id FK vs separate databases
2. Routing: Subdomain (nashville.bandcrawl.com) vs path (/nashville/)
3. Authentication: Per-org passwords vs unified admin
4. Data migration: How to move single-tenant to multi-tenant
5. Backwards compatibility: Must support existing single-tenant deployments"
```

**Implementation Phase:**

```bash
# Generate organizations table migration
/sc:generate migration \
  --description "Create organizations table and add org_id to events"

# Generate organization management endpoints
/sc:generate api-endpoint \
  --path functions/api/admin/organizations.js \
  --description "CRUD for organization management"

# Update middleware for org-aware auth
/sc:refactor functions/api/admin/_middleware.js \
  --change "Add organization resolution from subdomain/path"
```

---

## Recommended SuperClaude Workflows

### Daily Development Workflow

```bash
# 1. Start session
/sc:load

# 2. Check project state
/sc:status

# 3. Plan work
/sc:plan "Implement CSV import endpoint"

# 4. Execute (with TodoWrite for tracking)
# Claude will automatically track progress

# 5. Test
/sc:test --file functions/api/admin/import.js

# 6. Review
/sc:review --focus security,performance

# 7. Save session
/sc:save
```

### Feature Implementation Workflow

```bash
# 1. Research
/sc:research "{feature} best practices"

# 2. Design
/sc:think-hard "Design {feature} implementation"

# 3. Review existing code
/sc:analyze architecture {relevant-file.js}

# 4. Generate code
/sc:generate {type} --path {path}

# 5. Generate tests
/sc:test generate --file {file}

# 6. Review changes
/sc:review --focus {domain}

# 7. Document
/sc:docs {target} --output docs/
```

### Debugging Workflow

```bash
# 1. Reproduce issue
/sc:debug "Rate limiting not working for IP X.X.X.X"

# 2. Analyze code flow
/sc:trace functions/api/admin/_middleware.js \
  --function checkRateLimit

# 3. Generate test for bug
/sc:test generate \
  --file functions/api/admin/_middleware.js \
  --focus "Rate limiting with edge cases"

# 4. Fix and verify
# (Claude implements fix)

# 5. Validate fix
/sc:test --file functions/api/admin/_middleware.js
```

---

## Tool Selection Guide

### When to Use Each MCP Server

| Task | Tool | Reason |
|------|------|--------|
| Research best practices | Tavily MCP | Real-time web search |
| Complex design decisions | Sequential MCP | Multi-step reasoning |
| Official Cloudflare docs | Context7 MCP | Curated documentation |
| Bulk refactoring | Morphllm MCP | Pattern-based edits |
| Symbol operations | Serena MCP | Semantic understanding |
| Browser testing | Playwright MCP | E2E validation |
| Session persistence | Serena MCP | Project memory |

### Workflow Examples

**Complex Feature Design:**

```bash
/sc:research "feature best practices"  # Tavily
    ↓
/sc:think-hard "design considerations"  # Sequential
    ↓
/sc:generate api-endpoint --path ...    # Code generation
    ↓
/sc:test generate --file ...            # Test generation
    ↓
/sc:memory write "pattern_name" "..."   # Serena (save for future)
```

**Large-scale Refactoring:**

```bash
/sc:analyze architecture {file}         # Understand current
    ↓
/sc:refactor {file} --pattern "..."     # Morphllm (bulk changes)
    ↓
/sc:test --coverage {file}              # Validate changes
    ↓
/sc:review --focus regression           # Code review agent
```

---

## Common Commands Reference

### Project Management

```bash
/sc:load                          # Load project context
/sc:save                          # Save session state
/sc:status                        # Check project health
/sc:plan "{task description}"     # Create task plan
```

### Code Generation

```bash
/sc:generate api-endpoint --path {path}
/sc:generate migration --description "{desc}"
/sc:generate test --file {file}
/sc:generate config --type {type}
```

### Analysis & Research

```bash
/sc:research "{query}"
/sc:analyze architecture {file}
/sc:think-hard "{complex design problem}"
/ultrathink "{critical system design}"
```

### Testing & Quality

```bash
/sc:test --file {file}
/sc:test generate --file {file}
/sc:review --focus {domain}
/sc:audit security {file}
```

### Documentation

```bash
/sc:docs api --format openapi
/sc:docs database --format erd
/sc:index . --type structure
```

### Memory & Context

```bash
/sc:memory write "{name}" "{content}"
/sc:memory read "{name}"
/sc:memory list
```

---

## Success Metrics

Track these to measure backend maturity:

### Code Quality

- [ ] All API endpoints have tests (target: 80% coverage)
- [ ] All endpoints have OpenAPI documentation
- [ ] Security audit passes (no critical issues)
- [ ] Performance audit passes (P95 < 200ms)

### Feature Completeness

- [ ] CSV import/export implemented
- [ ] Event templates working
- [ ] Bulk operations available
- [ ] Asset management (R2) integrated
- [ ] Analytics dashboard live

### Operational Excellence

- [ ] Automated backups configured
- [ ] Cron cleanup jobs running
- [ ] Email notifications working
- [ ] Monitoring alerts set up
- [ ] Runbook documentation complete

### Developer Experience

- [ ] API documentation complete
- [ ] Local development setup < 10 minutes
- [ ] CI/CD pipeline automated
- [ ] Error messages actionable
- [ ] Logs structured and searchable

---

## Resources

### Official Documentation

- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Project Files

- `BACKEND_FRAMEWORK.md` - Architecture and patterns
- `D1_SETUP.md` - Database setup guide
- `CLAUDE.md` - Project overview
- `README.md` - User-facing documentation

### SuperClaude Framework

- `~/.claude/RULES.md` - Behavioral rules
- `~/.claude/FLAGS.md` - Mode activation flags
- `~/.claude/MCP_*.md` - MCP server documentation

---

## Next Steps

**Immediate (This Week):**

1. Run `/sc:load` to establish project context
2. Run `/sc:docs api --format openapi` to document existing API
3. Run `/sc:test generate` for critical endpoints (auth, schedule)
4. Review `BACKEND_FRAMEWORK.md` for architecture understanding

**Short-term (This Month):**

1. Implement CSV import/export (Priority 1.1)
2. Add event templates (Priority 1.2)
3. Create bulk operations (Priority 1.3)
4. Set up automated tests in CI

**Medium-term (Next 3 Months):**

1. Integrate R2 for asset management (Priority 2.1)
2. Add privacy-preserving analytics (Priority 2.2)
3. Implement email notifications (Priority 2.3)
4. Set up automated cleanup jobs

**Long-term (Next 6 Months):**

1. Multi-tenancy support (Priority 3.3)
2. Advanced admin dashboard
3. Mobile app API support
4. Public API with rate limiting

---

**End of Implementation Roadmap**

For additional guidance, use SuperClaude commands or refer to `BACKEND_FRAMEWORK.md`.
