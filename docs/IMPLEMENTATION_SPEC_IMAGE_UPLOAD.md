# Implementation Spec: Image Upload System

**Estimated Time**: 6-9 hours
**Complexity**: Medium
**Prerequisites**: R2 bucket created, API tokens generated

---

## Mission

Implement secure drag-and-drop image upload for event posters and band photos using Cloudflare R2 with presigned URLs.

---

## Implementation Phases

### Phase 1: R2 Bucket Setup (30 minutes)

#### 1.1 Create R2 Bucket

**Manual Steps** (Cloudflare Dashboard):
1. Navigate to R2 → Create bucket
2. Name: `event-images`
3. Location: Automatic
4. Click "Create bucket"

#### 1.2 Generate API Tokens

1. R2 → Manage R2 API Tokens
2. Create API Token
3. Permissions: Object Read & Write
4. TTL: No expiration
5. **Save** Access Key ID and Secret Access Key

#### 1.3 Configure CORS

Navigate to bucket → Settings → CORS Policy:

```json
[
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
]
```

#### 1.4 Update Environment Variables

**Add to `.dev.vars`**:
```env
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_ACCOUNT_ID=your_account_id
R2_BUCKET_NAME=event-images
```

**Add to Cloudflare Pages Settings** → Environment Variables:
- Production and Preview branches
- Same variables as above

#### 1.5 Update wrangler.toml

```toml
[[r2_buckets]]
binding = "IMAGES"
bucket_name = "event-images"
```

---

### Phase 2: Database Migration (15 minutes)

#### 2.1 Create Migration File

**File**: `migrations/legacy/20251112_add_event_posters.sql`

```sql
-- Add poster_url field to events table
ALTER TABLE events ADD COLUMN poster_url TEXT;

-- Index for filtering events with posters
CREATE INDEX IF NOT EXISTS idx_events_poster ON events(poster_url);
```

#### 2.2 Apply Migration

**Local Development**:
```bash
sqlite3 .wrangler/state/v3/d1/*.sqlite < migrations/legacy/20251112_add_event_posters.sql
```

**Production** (via Cloudflare Dashboard):
1. D1 → lwbc-database → Console
2. Paste migration SQL
3. Execute

---

### Phase 3: Backend API Implementation (2-3 hours)

#### 3.1 Install Dependencies

```bash
npm install --save aws4fetch
```

#### 3.2 Create Upload Endpoint

**File**: `functions/api/upload/presigned.js`

```javascript
import { AwsClient } from 'aws4fetch'

/**
 * Generate presigned URL for direct R2 upload
 *
 * POST /api/upload/presigned
 * Auth: Required (JWT)
 * Rate Limit: 10 requests/minute
 */
export async function onRequestPost({ request, env }) {
  try {
    // 1. Verify authentication
    const user = request.user
    if (!user || user.role === 'viewer') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. Parse and validate request
    const body = await request.json()
    const { type, entityId, filename, contentType } = body

    // Validation
    const validTypes = ['event', 'band']
    const validContentTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({
        error: 'Invalid type',
        message: 'Type must be "event" or "band"'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!validContentTypes.includes(contentType)) {
      return new Response(JSON.stringify({
        error: 'Invalid content type',
        message: 'Only JPEG, PNG, and WebP images are allowed'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!entityId || !filename) {
      return new Response(JSON.stringify({
        error: 'Missing fields',
        message: 'entityId and filename are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 3. Sanitize filename
    const ext = filename.split('.').pop().toLowerCase()
    const sanitizedFilename = `${type === 'event' ? 'poster' : 'photo'}.${ext}`

    // 4. Generate R2 key
    const key = `${type}s/${entityId}/${sanitizedFilename}`

    // 5. Create AWS client for R2
    const r2 = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto'
    })

    // 6. Generate presigned URL
    const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`

    const signedRequest = await r2.sign(
      new Request(url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        }
      }),
      {
        aws: {
          signQuery: true,
          allHeaders: false,
        },
        expiresIn: 3600 // 1 hour
      }
    )

    // 7. Return presigned URL
    const uploadUrl = signedRequest.url
    const finalUrl = `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`

    return new Response(JSON.stringify({
      uploadUrl,
      expiresIn: 3600,
      finalUrl,
      key
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Presigned URL generation failed:', error)
    return new Response(JSON.stringify({
      error: 'Upload preparation failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```

#### 3.3 Update Events Endpoint

**File**: `functions/api/admin/events/[id].js`

**Add to PUT handler** (line ~45, in body parsing):
```javascript
const {
  name,
  date,
  slug,
  is_published,
  poster_url  // NEW: Add poster_url
} = await request.json()
```

**Add to UPDATE query** (line ~70):
```javascript
const updates = []
const params = []

if (name !== undefined) {
  updates.push('name = ?')
  params.push(name)
}
if (date !== undefined) {
  updates.push('date = ?')
  params.push(date)
}
if (slug !== undefined) {
  updates.push('slug = ?')
  params.push(slug)
}
if (is_published !== undefined) {
  updates.push('is_published = ?')
  params.push(is_published ? 1 : 0)
}
// NEW: Add poster_url handling
if (poster_url !== undefined) {
  updates.push('poster_url = ?')
  params.push(poster_url)
}
```

#### 3.4 Update Bands Endpoint

**File**: `functions/api/admin/bands/[id].js`

Similar changes as events endpoint for `photo_url` field.

---

### Phase 4: Frontend Component (3-4 hours)

#### 4.1 Create ImageUploader Component

**File**: `frontend/src/admin/components/ImageUploader.jsx`

```jsx
import { useState, useRef } from 'react'

/**
 * Drag-and-drop image uploader for R2
 *
 * @param {Object} props
 * @param {'event'|'band'} props.type - Upload type
 * @param {string} props.entityId - Event slug or band ID
 * @param {string} props.currentImageUrl - Existing image URL
 * @param {function} props.onUploadSuccess - Callback with final URL
 * @param {function} props.onUploadError - Error callback
 * @param {number} props.maxSizeMB - Max file size in MB (default: 5)
 */
export default function ImageUploader({
  type,
  entityId,
  currentImageUrl,
  onUploadSuccess,
  onUploadError,
  maxSizeMB = 5
}) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [preview, setPreview] = useState(currentImageUrl || null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const inputRef = useRef(null)
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (file) => {
    setError(null)

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed')
      return
    }

    // Validate file size
    if (file.size > maxSizeBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`)
      return
    }

    // Set preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result)
      setSelectedFile(file)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      // Step 1: Get presigned URL
      const presignedResponse = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          entityId,
          filename: selectedFile.name,
          contentType: selectedFile.type
        })
      })

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json()
        throw new Error(errorData.message || 'Failed to prepare upload')
      }

      const { uploadUrl, finalUrl } = await presignedResponse.json()
      setProgress(25)

      // Step 2: Upload to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': selectedFile.type,
        },
        body: selectedFile
      })

      if (!uploadResponse.ok) {
        throw new Error('Upload to storage failed')
      }

      setProgress(100)

      // Step 3: Callback with final URL
      onUploadSuccess(finalUrl)

    } catch (err) {
      setError(err.message)
      onUploadError && onUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    setSelectedFile(null)
    setPreview(currentImageUrl || null)
    setProgress(0)
    setError(null)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-orange-500 bg-orange-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="hidden"
        />

        {preview ? (
          /* Image Preview */
          <div className="space-y-4">
            <img
              src={preview}
              alt="Preview"
              className="max-h-64 mx-auto rounded-lg shadow-md"
            />
            <div className="flex gap-2 justify-center">
              {selectedFile && !uploading && (
                <button
                  onClick={handleUpload}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Upload Image
                </button>
              )}
              <button
                onClick={handleRemove}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                {selectedFile ? 'Cancel' : 'Replace'}
              </button>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="space-y-2">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-sm text-gray-600">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-orange-600 hover:text-orange-700 font-medium"
              >
                Click to upload
              </button>
              {' or drag and drop'}
            </div>
            <p className="text-xs text-gray-500">
              JPEG, PNG, or WebP up to {maxSizeMB}MB
            </p>
            <p className="text-xs text-gray-500">
              Recommended: 1920x1080 for events, 1:1 for bands
            </p>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 text-center">
            Uploading... {progress}%
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
```

#### 4.2 Integrate into EventWizard

**File**: `frontend/src/admin/EventWizard.jsx`

**Add import**:
```javascript
import ImageUploader from './components/ImageUploader'
```

**Add to Step 2** (after basic fields):
```jsx
{/* Event Poster */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Event Poster
  </label>
  <ImageUploader
    type="event"
    entityId={eventData.slug}
    currentImageUrl={eventData.poster_url}
    onUploadSuccess={(url) => {
      setEventData({ ...eventData, poster_url: url })
    }}
    onUploadError={(error) => {
      console.error('Upload failed:', error)
    }}
  />
</div>
```

#### 4.3 Integrate into BandForm

**File**: `frontend/src/admin/components/BandForm.jsx`

Similar integration as EventWizard:

```jsx
<ImageUploader
  type="band"
  entityId={bandProfile.id}
  currentImageUrl={bandProfile.photo_url}
  onUploadSuccess={async (url) => {
    // Update band profile
    await updateBandProfile({ ...bandProfile, photo_url: url })
  }}
  onUploadError={(error) => {
    setError(error.message)
  }}
/>
```

---

### Phase 5: Testing (1-2 hours)

#### 5.1 Manual Testing Checklist

**Event Poster Upload**:
- [ ] Drag-and-drop JPEG image
- [ ] Select PNG via file picker
- [ ] Upload WebP image
- [ ] Preview displays correctly
- [ ] Upload progress shows 0 → 100%
- [ ] Final URL saved to database
- [ ] Image displays on public event page

**Band Photo Upload**:
- [ ] Upload via drag-and-drop
- [ ] Replace existing photo
- [ ] Preview before upload
- [ ] Upload success updates UI immediately

**Error Handling**:
- [ ] Oversized file (>5MB) shows error
- [ ] Wrong file type (PDF) shows error
- [ ] Expired presigned URL shows retry option
- [ ] Network error shows clear message

**Security**:
- [ ] Viewer role cannot upload (401 error)
- [ ] Invalid type rejected (400 error)
- [ ] Presigned URL expires after 1 hour
- [ ] CORS allows localhost:8788
- [ ] CORS allows dev.longweekend-bandcrawl.pages.dev

**Mobile Testing**:
- [ ] Upload works on iOS Safari
- [ ] Upload works on Android Chrome
- [ ] Touch to select file works
- [ ] Preview responsive on mobile

#### 5.2 Automated Tests

**File**: `functions/api/upload/__tests__/presigned.test.js`

```javascript
import { describe, it, expect } from 'vitest'
import { onRequestPost } from '../presigned.js'

describe('Presigned URL Generation', () => {
  it('generates presigned URL for valid event upload', async () => {
    const mockEnv = {
      R2_ACCESS_KEY_ID: 'test-key',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      R2_ACCOUNT_ID: 'test-account',
      R2_BUCKET_NAME: 'test-bucket'
    }

    const request = new Request('https://example.com/api/upload/presigned', {
      method: 'POST',
      body: JSON.stringify({
        type: 'event',
        entityId: 'vol-5',
        filename: 'poster.jpg',
        contentType: 'image/jpeg'
      })
    })
    request.user = { id: 1, role: 'admin' }

    const response = await onRequestPost({ request, env: mockEnv })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('uploadUrl')
    expect(data).toHaveProperty('finalUrl')
    expect(data.expiresIn).toBe(3600)
  })

  it('rejects invalid file type', async () => {
    // Test implementation
  })

  it('requires authentication', async () => {
    // Test implementation
  })
})
```

---

## Success Criteria

### Must Pass
- [ ] R2 bucket created with CORS configured
- [ ] Presigned URL endpoint returns valid signed URLs
- [ ] ImageUploader component displays drag-and-drop zone
- [ ] Upload flow completes successfully (presigned URL → R2 upload → database update)
- [ ] Uploaded images display on public site
- [ ] File type validation works (JPEG/PNG/WebP only)
- [ ] File size validation works (5MB max)
- [ ] Authentication required for presigned URLs
- [ ] Mobile upload works on iOS and Android

### Nice to Have
- [ ] Upload progress indicator functional
- [ ] Error messages are user-friendly
- [ ] Image preview before upload
- [ ] Replace image functionality
- [ ] Automated tests for presigned URL generation

---

## Troubleshooting

### Common Issues

**CORS Error "Access-Control-Allow-Origin"**:
- Verify CORS config in R2 bucket settings
- Check origin matches exactly (https:// vs http://)
- Test from correct domain (localhost:8788, not 127.0.0.1)

**Presigned URL "SignatureDoesNotMatch"**:
- Verify R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are correct
- Check aws4fetch is signing with correct region ('auto')
- Ensure Content-Type header matches in presigned request and actual upload

**Upload Times Out**:
- Check file size (<5MB)
- Verify network connectivity
- Test with smaller file first
- Check browser console for errors

**Image Not Displaying**:
- Verify finalUrl is saved to database correctly
- Check R2 bucket permissions (private bucket needs presigned GETs)
- Test direct R2 URL in browser
- Check CORS for GET requests

---

## Code Examples

### Test Upload with curl

```bash
# 1. Get presigned URL
curl -X POST https://lwbc.dredre.net/api/upload/presigned \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_JWT" \
  -d '{
    "type": "event",
    "entityId": "vol-5",
    "filename": "poster.jpg",
    "contentType": "image/jpeg"
  }'

# 2. Upload to presigned URL
curl -X PUT "PRESIGNED_URL_FROM_ABOVE" \
  -H "Content-Type: image/jpeg" \
  --data-binary @poster.jpg
```

### Verify in Database

```sql
-- Check event poster URL
SELECT id, name, poster_url FROM events WHERE slug = 'vol-5';

-- Check band photo URL
SELECT id, name, photo_url FROM band_profiles WHERE id = 42;
```

---

## Next Actions

After implementation:
1. Update `docs/CLAUDE.md` with image upload feature
2. Update `docs/DATABASE.md` with new events.poster_url field
3. Document R2 setup in deployment guide
4. Add image upload to user guide
5. Consider future enhancement: Cloudflare Images for transformations

---

**Ready for Implementation**: Follow phases sequentially for systematic completion.
