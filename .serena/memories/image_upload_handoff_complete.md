# Image Upload System - Handoff to Cursor Complete

**Date**: November 12, 2025
**Status**: Ready for Cursor implementation
**Next**: User completes Phase 1 → Cursor implements Phases 2-5

## What Was Completed

### Design & Planning ✅
- Full system architecture documented
- R2 vs Cloudflare Images evaluated (chose R2 for MVP)
- Security model defined (presigned URLs, 1-hour expiry)
- Cost analysis completed (~$0.02/month)
- Database schema changes identified

### Documentation Created ✅
1. **claudedocs/image-upload-system-design.md** - Architecture and decisions
2. **docs/IMPLEMENTATION_SPEC_IMAGE_UPLOAD.md** - Detailed technical spec
3. **docs/CURSOR_TASK_IMAGE_UPLOAD.md** - Cursor handoff document

### Code Examples Provided ✅
- Complete presigned URL endpoint (`functions/api/upload/presigned.js`)
- Full ImageUploader React component (300 lines with drag-and-drop)
- Database migration SQL
- Integration examples for EventWizard and BandForm

## Handoff Instructions

### Step 1: User Must Complete Phase 1 (30 minutes)

**Manual R2 Setup**:
1. Create R2 bucket `lwbc-images` in Cloudflare dashboard
2. Generate API tokens (Access Key ID + Secret)
3. Configure CORS policy (provided in task doc)
4. Add environment variables to `.dev.vars` and Cloudflare Pages
5. Update `wrangler.toml` with R2 binding

**User must confirm Phase 1 complete before Cursor starts.**

### Step 2: Hand Off to Cursor

**Exact instruction to give Cursor**:
```
Implement image upload system following the specification in 
docs/CURSOR_TASK_IMAGE_UPLOAD.md. Complete Phases 2-5 after 
Phase 1 R2 setup is confirmed complete. Estimated time: 6-9 hours.
```

## Implementation Phases (Cursor)

- **Phase 2**: Database migration (15 min) - Add events.poster_url
- **Phase 3**: Backend API (2-3 hours) - Presigned URL endpoint
- **Phase 4**: Frontend component (3-4 hours) - ImageUploader.jsx
- **Phase 5**: Testing (1-2 hours) - Manual + mobile testing

## What Cursor Will Build

**Backend**:
- `/api/upload/presigned` endpoint (generates signed R2 URLs)
- Update events/bands endpoints for new image fields
- Install aws4fetch dependency

**Frontend**:
- ImageUploader.jsx component with drag-and-drop
- Integration into EventWizard (event posters)
- Integration into BandsTab (band photos)

**Database**:
- Add events.poster_url field via migration

**Testing**:
- Manual test checklist (upload, errors, mobile)
- Verification commands

## Success Criteria

- [ ] Event organizers can upload posters via drag-and-drop
- [ ] Band photos uploadable via drag-and-drop
- [ ] Images display on public site
- [ ] Mobile upload works (iOS Safari, Android Chrome)
- [ ] 5MB size limit enforced
- [ ] JPEG/PNG/WebP only
- [ ] Upload completes in <10 seconds

## After Cursor Completes

**Review checklist**:
1. Test upload flow end-to-end
2. Verify images display correctly
3. Test error cases (oversized, wrong type)
4. Test on mobile devices
5. Verify CORS from all domains
6. Check database entries

**Documentation updates**:
- Update `docs/CLAUDE.md` with new feature
- Update `docs/DATABASE.md` with poster_url field

## Files Created

1. `docs/CURSOR_TASK_IMAGE_UPLOAD.md` - Cursor instructions
2. `claudedocs/image-upload-system-design.md` - Architecture
3. `docs/IMPLEMENTATION_SPEC_IMAGE_UPLOAD.md` - Technical spec

## Architecture Summary

```
Browser → Request presigned URL → Pages Function generates signed URL
       ↓
Browser uploads directly to R2 (no server processing)
       ↓
Database updated with final R2 URL via existing endpoints
       ↓
Public site displays images from R2
```

**Storage**: R2 bucket `lwbc-images` (private, presigned URLs only)
**Upload**: Direct browser → R2 via presigned PUT URLs
**Security**: JWT auth, 1-hour expiry, file validation
**Cost**: ~$0.02/month (negligible)

---

**Status**: Handoff Complete → Awaiting User Phase 1 Completion
