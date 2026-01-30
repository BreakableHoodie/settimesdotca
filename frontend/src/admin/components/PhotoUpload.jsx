/* eslint-env browser */
import { useState, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faTrash, faSpinner, faImage } from '@fortawesome/free-solid-svg-icons'
import { getAdminFormDataHeaders } from '../../utils/adminApi'

/**
 * PhotoUpload Component
 *
 * Reusable component for uploading band photos with:
 * - Drag and drop support
 * - Image preview
 * - File validation
 * - Progress indication
 * - R2 bucket integration
 *
 * @param {Object} props
 * @param {string} props.currentPhoto - Current photo URL (if exists)
 * @param {Function} props.onPhotoChange - Callback when photo is uploaded/removed
 * @param {number} props.bandId - Optional band ID to associate with upload
 * @param {string} props.bandName - Optional band name for display
 */
export default function PhotoUpload({ currentPhoto, onPhotoChange, bandId = null, bandName = '' }) {
  const [preview, setPreview] = useState(currentPhoto || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

  const validateFile = file => {
    if (!file) {
      return 'No file selected'
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF'
    }

    return null
  }

  const handleFileUpload = async file => {
    setError(null)

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)

    try {
      // Create preview
      // eslint-disable-next-line no-undef
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result)
      }
      reader.readAsDataURL(file)

      // Upload to API
      // eslint-disable-next-line no-undef
      const formData = new FormData()
      formData.append('photo', file)
      if (bandId) {
        formData.append('band_id', bandId.toString())
      }

      const response = await fetch('/api/admin/bands/photos', {
        method: 'POST',
        headers: getAdminFormDataHeaders(),
        credentials: 'include',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // Update parent component with new photo URL
      if (onPhotoChange) {
        onPhotoChange(data.url)
      }

      setPreview(data.url)
    } catch (err) {
      console.error('Photo upload error:', err)
      setError(err.message || 'Failed to upload photo')
      setPreview(currentPhoto || null)
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = e => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDrop = e => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDrag = e => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove this photo?')) {
      return
    }

    setPreview(null)
    if (onPhotoChange) {
      onPhotoChange(null)
    }

    // Note: We don't delete from R2 immediately in case they cancel the form
    // The cleanup can be handled by a separate job for orphaned photos
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-3">
      <label className="block text-white font-medium">Band Photo {bandName && `for ${bandName}`}</label>

      {/* Upload area */}
      <div
        className={`
          relative border-2 border-dashed rounded-lg overflow-hidden
          transition-all duration-200
          ${dragActive ? 'border-band-orange bg-band-orange/10' : 'border-white/20'}
          ${preview ? 'h-64' : 'h-48'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {preview ? (
          /* Preview */
          <div className="relative h-full w-full group">
            <img src={preview} alt="Band profile" className="w-full h-full object-cover" />

            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleClick}
                disabled={uploading}
                className="min-h-[44px] bg-band-orange hover:bg-band-orange/90 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faUpload} />
                Change Photo
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="min-h-[44px] bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faTrash} />
                Remove
              </button>
            </div>

            {/* Loading overlay */}
            {uploading && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <FontAwesomeIcon icon={faSpinner} spin className="text-white text-3xl" />
              </div>
            )}
          </div>
        ) : (
          /* Upload prompt */
          <div
            className="h-full flex flex-col items-center justify-center p-8 cursor-pointer hover:bg-white/5 transition"
            onClick={handleClick}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick()
              }
            }}
            role="button"
            tabIndex={0}
          >
            <FontAwesomeIcon
              icon={uploading ? faSpinner : faImage}
              className={`text-white/50 text-5xl mb-4 ${uploading ? 'animate-spin' : ''}`}
            />
            <p className="text-white/70 text-center mb-2">
              {uploading ? 'Uploading...' : 'Drop photo here or click to browse'}
            </p>
            <p className="text-white/50 text-sm text-center">JPEG, PNG, WebP, or GIF (max 5MB)</p>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}

      {/* Help text */}
      <p className="text-white/50 text-xs">
        Recommended: Square images work best for band profile photos. Minimum 400×400px for good quality.
      </p>
    </div>
  )
}
