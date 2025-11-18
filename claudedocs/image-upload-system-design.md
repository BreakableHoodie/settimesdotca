# Image Upload System Design

**Created**: November 12, 2025
**Status**: Design Phase
**Priority**: High (Priority 1 feature)

---

## Executive Summary

Implement drag-and-drop image upload system for event posters and band photos using Cloudflare R2 storage with presigned URLs for secure direct browser uploads.

**Key Benefits**:
- Visual engagement for event attendees
- No server processing (direct browser → R2)
- Secure (presigned URLs, 1-hour expiry)
- Simple architecture (no image transformation service needed for MVP)

---

## Architecture Overview

### Components

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │ ──(1)──→│ Pages Func   │         │     R2      │
│  (React UI) │         │ /api/upload  │         │   Bucket    │
│             │ ←──(2)──│              │         │             │
│             │         └──────────────┘         │             │
│             │                                  │             │
│             │ ──────(3) PUT with file───────→ │             │
│             │ ←────(4) 200 OK─────────────────│             │
│             │                                  │             │
│             │         ┌──────────────┐         │             │
│             │ ──(5)──→│ Pages Func   │         │             │
│             │         │ /api/admin/  │         │             │
│             │         │  bands/[id]  │         │             │
│             │         └──────────────┘         │             │
│             │                ↓                 │             │
│             │         ┌──────────────┐         │             │
│             │         │  D1 Database │         │             │
│             │         │ (photo_url)  │         │             │
│             │         └──────────────┘         └─────────────┘
```

**Flow**:
1. Frontend requests presigned URL for upload
2. Backend generates presigned PUT URL (1-hour expiry)
3. Frontend uploads file directly to R2 using presigned URL
4. R2 returns success response
5. Frontend updates database with R2 URL via existing band/event endpoints

---

## Database Schema Changes

### Events Table (NEW FIELD)

```sql
-- Add poster_url field to events table
ALTER TABLE events ADD COLUMN poster_url TEXT;

-- Migration: database/migrations/20251112_add_event_posters.sql
```

### Band Profiles Table (EXISTS)

```sql
-- band_profiles.photo_url already exists (line 32 in schema-v2.sql)
-- No migration needed
```

---

## R2 Configuration

### Bucket Setup

**Bucket Name**: `event-images`
**Region**: Auto (Cloudflare selects optimal)
**Access**: Private (presigned URLs only)

### CORS Configuration

```json
{
  "AllowedOrigins": [
    "https://lwbc.dredre.net",
    "https://dev.longweekend-bandcrawl.pages.dev",
    "http://localhost:8788"
  ],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

### File Organization

```
event-images/
├── events/
│   ├── {event-slug}/
│   │   └── poster.{ext}       # e.g., vol-5/poster.webp
├── bands/
│   ├── {band-id}/
│   │   └── photo.{ext}        # e.g., 42/photo.webp
└── temp/                      # Cleanup after 24h
    └── {upload-id}.{ext}
```

---

## API Endpoints

### 1. Generate Presigned URL

**Endpoint**: `POST /api/upload/presigned`
**Auth**: Required (JWT)
**Rate Limit**: 10 requests/minute

**Request**:
```json
{
  "type": "event" | "band",
  "entityId": "vol-5" | "42",
  "filename": "poster.jpg",
  "contentType": "image/jpeg"
}
```

**Response**:
```json
{
  "uploadUrl": "https://event-images.cloudflare.com/events/vol-5/poster.webp?X-Amz-Signature=...",
  "expiresIn": 3600,
  "finalUrl": "https://event-images.cloudflare.com/events/vol-5/poster.webp"
}
```

**Validation**:
- File types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 5MB (enforced client-side + R2 bucket policy)
- Filename sanitization: alphanumeric + hyphens only

### 2. Existing Update Endpoints (Modified)

**Events**: `PUT /api/admin/events/{id}`
**Bands**: `PUT /api/admin/bands/{id}`

Add `poster_url` / `photo_url` to accepted fields.

---

## Frontend Components

### ImageUploader Component

**Location**: `frontend/src/admin/components/ImageUploader.jsx`

**Features**:
- Drag-and-drop zone with file picker fallback
- Image preview before upload
- Upload progress indicator
- Error handling with retry
- Image requirements display (max 5MB, JPG/PNG/WebP)

**Props**:
```jsx
<ImageUploader
  type="event" | "band"
  entityId={eventSlug | bandId}
  currentImageUrl={existingUrl}
  onUploadSuccess={(url) => handleImageUpdate(url)}
  onUploadError={(error) => showError(error)}
  maxSizeMB={5}
  acceptedFormats={['image/jpeg', 'image/png', 'image/webp']}
/>
```

**UI States**:
1. Empty: Drag-and-drop prompt
2. Hover: Highlighted drop zone
3. Selected: Image preview with upload button
4. Uploading: Progress bar (0-100%)
5. Success: Uploaded image with replace option
6. Error: Error message with retry button

### Integration Points

**EventWizard.jsx** (Step 2):
```jsx
<ImageUploader
  type="event"
  entityId={eventData.slug}
  onUploadSuccess={(url) => setEventData({...eventData, poster_url: url})}
/>
```

**BandForm.jsx**:
```jsx
<ImageUploader
  type="band"
  entityId={bandProfile.id}
  currentImageUrl={bandProfile.photo_url}
  onUploadSuccess={(url) => updateBandPhoto(url)}
/>
```

---

## Security Considerations

### Presigned URL Generation

**aws4fetch Pattern** (Cloudflare Workers compatible):
```javascript
import { AwsClient } from 'aws4fetch'

const r2 = new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  service: 'r2'
})

const url = await r2.sign(
  new Request(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`, {
    method: 'PUT',
    headers: {
      'X-Amz-Expires': '3600' // 1 hour expiry
    }
  })
)
```

### Security Checklist

- [x] Presigned URLs expire in 1 hour (max 7 days, using 1hr for security)
- [x] Private bucket (no public access)
- [x] JWT authentication required for presigned URL generation
- [x] File type validation (MIME type whitelist)
- [x] File size limits (5MB client + server enforcement)
- [x] Filename sanitization (prevent path traversal)
- [x] CORS restricted to known origins only
- [x] Rate limiting on presigned URL endpoint (10/min)

---

## Image Optimization Strategy

### MVP Approach (Client-Side Only)

**Why**: Keep architecture simple, leverage modern browsers

**Browser Optimization**:
1. File input accepts: `image/jpeg,image/png,image/webp`
2. Preview uses `<img>` for instant display
3. Upload as-is to R2 (no server transformation)

**Future Enhancement** (Post-MVP):
- Cloudflare Images for automatic variants
- WebP conversion server-side
- Responsive image srcset generation
- Thumbnail generation

### Recommended Client Guidelines

Display in UI:
- **Max dimensions**: 1920x1080 (Full HD)
- **Max file size**: 5MB
- **Formats**: JPEG, PNG, WebP (recommend WebP)
- **Aspect ratio**: 16:9 for events, 1:1 for bands

---

## Implementation Phases

### Phase 1: R2 Setup (30 min)
- [x] Research complete
- [ ] Create R2 bucket in Cloudflare dashboard
- [ ] Generate API tokens (Access Key ID + Secret)
- [ ] Configure CORS policy
- [ ] Test bucket access with wrangler

### Phase 2: Backend API (2-3 hours)
- [ ] Database migration (add events.poster_url)
- [ ] Install aws4fetch dependency
- [ ] Implement /api/upload/presigned endpoint
- [ ] Add R2 binding to wrangler.toml
- [ ] Update events/bands endpoints for new fields
- [ ] Write unit tests for presigned URL generation

### Phase 3: Frontend Component (3-4 hours)
- [ ] Create ImageUploader.jsx component
- [ ] Implement drag-and-drop logic
- [ ] Add upload progress tracking
- [ ] Style with TailwindCSS (match theme)
- [ ] Integrate into EventWizard
- [ ] Integrate into BandForm
- [ ] Add error handling and retry logic

### Phase 4: Testing (1-2 hours)
- [ ] Manual test: Upload event poster
- [ ] Manual test: Upload band photo
- [ ] Test error cases (oversized, wrong type, expired URL)
- [ ] Test CORS from dev/prod domains
- [ ] Verify uploaded images display correctly
- [ ] Test mobile upload flow
- [ ] Load testing (concurrent uploads)

**Total Estimated Time**: 6-9 hours

---

## Environment Variables

Add to `.dev.vars` and Cloudflare Pages settings:

```env
# R2 Credentials
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ACCOUNT_ID=...
R2_BUCKET_NAME=event-images
```

---

## Cost Analysis

### R2 Pricing (Pay-as-you-go)

**Storage**: $0.015 per GB/month
**Class A Operations** (PUT): $4.50 per million
**Class B Operations** (GET): $0.36 per million

### Estimated Costs (100 events/year, 500 bands)

**Storage**:
- 100 event posters × 2MB = 200MB
- 500 band photos × 1MB = 500MB
- Total: 700MB = $0.01/month

**Operations**:
- Uploads: 600/year = $0.00/month
- Views: 10K/month = $0.004/month

**Total**: ~$0.02/month (negligible)

---

## Alternative Considerations

### Cloudflare Images vs R2

| Feature | R2 | Cloudflare Images |
|---------|----|--------------------|
| Storage | ✅ Simple | ✅ + Transformations |
| Pricing | $0.015/GB | $5/month (100K images) |
| Variants | ❌ Manual | ✅ Automatic (100 variants) |
| CDN | ✅ Global | ✅ Global |
| MVP Ready | ✅ Yes | ⚠️ Overkill for MVP |

**Decision**: Use R2 for MVP, consider Cloudflare Images if transformation needs arise.

---

## Success Criteria

### Must Have
- [ ] Event organizers can upload event posters (drag-and-drop)
- [ ] Band profile photos can be uploaded
- [ ] Images display correctly on public site
- [ ] Upload works on mobile Safari and Chrome
- [ ] Max 5MB file size enforced
- [ ] Uploads complete in <10 seconds

### Nice to Have
- [ ] Image preview before upload
- [ ] Upload progress indicator
- [ ] Replace existing image functionality
- [ ] Delete image option
- [ ] Multiple image upload (future: gallery)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file uploads fail | High | Client-side compression, clear size limits |
| CORS misconfiguration | High | Test all origins thoroughly, document config |
| Presigned URL expiry | Medium | 1-hour expiry, clear error messaging |
| Storage costs grow | Low | Monitor usage, implement cleanup cron |
| Security: URL tampering | High | aws4fetch signature validation |

---

## Documentation Updates

Files to update after implementation:

1. **docs/CLAUDE.md**: Add image upload to features list
2. **docs/DATABASE.md**: Document new events.poster_url field
3. **docs/BACKEND_FRAMEWORK.md**: Document /api/upload endpoints
4. **README.md**: Update feature list

---

## Next Steps

1. **Create R2 bucket**: Manual setup in Cloudflare dashboard
2. **Generate implementation spec**: Detailed coding instructions
3. **Database migration**: Add events.poster_url field
4. **Backend implementation**: Presigned URL endpoint
5. **Frontend component**: ImageUploader with drag-and-drop
6. **Integration**: Wire up to existing admin UI
7. **Testing**: Manual + automated tests

---

**Status**: Design Complete → Ready for Implementation Spec
