# Documentation Index

**Last Updated**: November 11, 2025

---

## 🎯 Current Roadmap & Specs

**Main Roadmap**: [/ROADMAP_TO_DEMO.md](/ROADMAP_TO_DEMO.md)

- Production-ready demo by November 30, 2025
- 3-week sprint plan
- Clear definition of "done"

**Implementation Specs**: [/docs/specs/](/docs/specs/)

- Sprint 1.1: RBAC Implementation (2 days)
- Sprint 1.2: Event Management Complete (2 days)
- _More specs coming soon_

---

## 📚 Technical Documentation

### Core System

- **[BACKEND_FRAMEWORK.md](BACKEND_FRAMEWORK.md)** - Architecture patterns and conventions
- **[DATABASE.md](DATABASE.md)** - ER diagrams, schema, relationships
- **[D1_SETUP.md](D1_SETUP.md)** - Database setup and configuration
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Cloudflare Pages deployment guide

### Project Guide

- **[CLAUDE.md](CLAUDE.md)** - Project overview and AI assistant instructions
- **[SQL_SAFETY.md](SQL_SAFETY.md)** - SQL injection prevention guidelines
- **[SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md)** - Session timeout and auth

### Feature Specs

- **[BULK_OPERATIONS_SPEC.md](BULK_OPERATIONS_SPEC.md)** - Bulk operations implementation
- **[STATUS_SUBSCRIPTION_TESTS_2025_10_26.md](STATUS_SUBSCRIPTION_TESTS_2025_10_26.md)** - Subscription system status

### Future Vision

- **[GENERALIZATION_PLAN_FUTURE.md](GENERALIZATION_PLAN_FUTURE.md)** - Multi-org v2.0 vision (post-demo)

---

## 📁 Subdirectories

### [specs/](specs/)

Active implementation specifications for current sprints

- Cursor/Copilot-ready detailed specs
- Database schemas, API endpoints, frontend components
- Testing specifications and acceptance criteria

### [archive/](archive/)

Historical documents superseded or completed

- Old roadmaps (3 documents)
- Completed sprint specs (5 documents)
- Completed UX/feature docs (5 documents)
- Reference materials (2 documents)

### [admin/](admin/)

Admin panel documentation

### [frontend/](frontend/)

Frontend-specific documentation

---

## 🔍 Quick Reference

### For Development

1. Start here: `/ROADMAP_TO_DEMO.md`
2. Check sprint spec: `/docs/specs/SPRINT_*.md`
3. Reference: Technical docs above
4. Questions: Check `docs/archive/` for historical context

### For Deployment

1. Database setup: `D1_SETUP.md`
2. Deployment: `DEPLOYMENT.md`
3. Security: `SQL_SAFETY.md`, `SESSION_MANAGEMENT.md`

### For Architecture

1. Backend patterns: `BACKEND_FRAMEWORK.md`
2. Database design: `DATABASE.md`
3. Feature specs: Relevant spec files

---

## 📝 Documentation Standards

### File Naming

- Roadmaps: `ROADMAP_*.md` (root level)
- Specs: `SPRINT_*.md` or `WEEK_*.md` (in specs/)
- Technical: Descriptive names (e.g., `D1_SETUP.md`)
- Historical: Move to `archive/`

### Content Structure

- Clear title and metadata (duration, dependencies)
- Overview section
- Detailed specifications
- Acceptance criteria
- Implementation notes

### Maintenance

- Update this index when adding new docs
- Archive completed specs
- Keep technical docs up-to-date with code changes
- Reference the canonical roadmap: `/ROADMAP_TO_DEMO.md`

---

**For historical documents, see: [archive/README.md](archive/README.md)**
