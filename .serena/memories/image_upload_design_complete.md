# Image Upload System - Design Phase Complete

**Date**: November 12, 2025
**Status**: Design and planning complete, ready for implementation
**Priority**: High (Priority 1 feature)

## Completed Work

### Research Phase ✅
- Cloudflare R2 presigned URL patterns researched
- CORS configuration requirements documented
- Security best practices identified
- Cost analysis completed (~$0.02/month)
- Alternative (Cloudflare Images) evaluated and deferred for MVP

### Architecture Design ✅
- System architecture diagram created
- Database schema changes identified (events.poster_url)
- API endpoint design completed (/api/upload/presigned)
- File organization structure defined
- Security model documented (1-hour presigned URL expiry)

### Implementation Spec ✅
- 5-phase implementation plan created
- Estimated time: 6-9 hours total
- Detailed code examples provided
- Testing checklist prepared
- Troubleshooting guide included

## Key Architectural Decisions

**Storage**: Cloudflare R2 (not Cloudflare Images for MVP)
- Rationale: Simple, cost-effective, sufficient for MVP
- Future: Consider Cloudflare Images if transformation needs arise

**Upload Pattern**: Direct browser → R2 via presigned URLs
- Benefits: No server processing, secure, fast
- Flow: Frontend → presigned URL → direct upload → database update

**File Organization**:
```
lwbc-images/
├── events/{slug}/poster.{ext}
├── bands/{id}/photo.{ext}
└── temp/ (24h cleanup)
```

**Security**:
- Private bucket (presigned URLs only)
- JWT auth required for URL generation
- 1-hour URL expiry
- File type whitelist (JPEG/PNG/WebP)
- 5MB size limit

## Documentation Created

1. **claudedocs/image-upload-system-design.md**
   - Full architectural design
   - Cost analysis and alternatives
   - Risk assessment and mitigations
   - Success criteria

2. **docs/IMPLEMENTATION_SPEC_IMAGE_UPLOAD.md**
   - Step-by-step implementation guide
   - Phase-by-phase breakdown (5 phases)
   - Complete code examples
   - Testing checklist
   - Troubleshooting guide

## Implementation Phases

### Phase 1: R2 Setup (30 min)
- Create bucket in Cloudflare dashboard
- Generate API tokens
- Configure CORS
- Update environment variables

### Phase 2: Database Migration (15 min)
- Add events.poster_url field
- Create migration file
- Apply to local and production

### Phase 3: Backend API (2-3 hours)
- Install aws4fetch dependency
- Implement /api/upload/presigned endpoint
- Update events/bands endpoints for new fields
- Write unit tests

### Phase 4: Frontend Component (3-4 hours)
- Create ImageUploader.jsx component
- Implement drag-and-drop logic
- Add upload progress tracking
- Integrate into EventWizard and BandForm

### Phase 5: Testing (1-2 hours)
- Manual testing (upload flow, error cases)
- Mobile testing (iOS Safari, Android Chrome)
- CORS validation
- Automated tests

## Next Steps

Ready to begin implementation. Choose approach:

**Option A: Start Implementation Now**
- Begin with Phase 1 (R2 setup)
- Continue through Phase 5 systematically
- Estimated completion: 6-9 hours

**Option B: Handoff to Cursor**
- Use IMPLEMENTATION_SPEC_IMAGE_UPLOAD.md as guide
- Cursor follows phase-by-phase instructions
- Review and test after completion

**Option C: Wait for User Direction**
- User may have other priorities
- Design and spec are complete for future use

## Files to Reference

- **Design**: `claudedocs/image-upload-system-design.md`
- **Implementation Guide**: `docs/IMPLEMENTATION_SPEC_IMAGE_UPLOAD.md`
- **Current Schema**: `database/schema-v2.sql`
- **Docs to Update**: `docs/CLAUDE.md`, `docs/DATABASE.md`

## Environment Variables Needed

```env
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ACCOUNT_ID=...
R2_BUCKET_NAME=lwbc-images
```

## Success Criteria

- [ ] Event posters uploadable via drag-and-drop
- [ ] Band photos uploadable via drag-and-drop
- [ ] Images display on public site
- [ ] Mobile upload functional
- [ ] Max 5MB enforced
- [ ] Upload completes in <10 seconds

---

**Status**: Design Complete → Ready for Implementation
**Next**: Await user decision on implementation approach
