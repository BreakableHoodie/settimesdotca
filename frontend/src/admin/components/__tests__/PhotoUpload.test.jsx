import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PhotoUpload from '../PhotoUpload.jsx'

// #616: PhotoUpload gained an optional maxDimension prop that downscales
// client-side via canvas before upload. jsdom implements neither
// createImageBitmap nor a real 2D canvas context, so both are mocked here.
// Band-photo usages (BandForm.jsx) pass no maxDimension and must be
// byte-for-byte unaffected — that's the regression case these tests guard.

function jpegFile(name = 'photo.jpg') {
  // eslint-disable-next-line no-undef
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' })
}

function gifFile(name = 'anim.gif') {
  // eslint-disable-next-line no-undef
  return new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], name, { type: 'image/gif' })
}

function selectFile(file) {
  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('PhotoUpload', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, url: 'https://example.test/uploaded.jpg' }),
    })
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete global.createImageBitmap
  })

  it('band-photo usage (no maxDimension): uploads the original file unchanged to the default endpoint', async () => {
    render(<PhotoUpload currentPhoto={null} onPhotoChange={vi.fn()} bandId={42} bandName="The Testers" />)

    expect(screen.getByText(/Band Photo/)).toBeInTheDocument()
    expect(screen.getByText(/for The Testers/)).toBeInTheDocument()

    selectFile(jpegFile('band.jpg'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/bands/photos')

    const formData = options.body
    const uploaded = formData.get('photo')
    expect(uploaded.name).toBe('band.jpg')
    expect(uploaded.type).toBe('image/jpeg')
    expect(formData.get('band_id')).toBe('42')
  })

  it('poster usage: downscales a large image via canvas before upload (longest edge clamped, JPEG q0.82)', async () => {
    global.createImageBitmap = vi.fn().mockResolvedValue({ width: 3200, height: 2400, close: vi.fn() })
    const drawImage = vi.fn()
    // eslint-disable-next-line no-undef
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage })
    // eslint-disable-next-line no-undef
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
      // eslint-disable-next-line no-undef
      callback(new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' }))
    })

    render(
      <PhotoUpload
        currentPhoto={null}
        onPhotoChange={vi.fn()}
        uploadUrl="/api/admin/events/posters"
        fieldName="poster"
        entityIdField="event_id"
        entityId={7}
        label="Event Poster"
        maxDimension={1600}
      />
    )

    selectFile(jpegFile('huge-poster.png'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200) // 3200x2400 -> 1600x1200

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/events/posters')
    const formData = options.body
    const uploaded = formData.get('poster')
    // Downscaled + re-encoded as JPEG, renamed with a .jpg extension.
    expect(uploaded.type).toBe('image/jpeg')
    expect(uploaded.name).toBe('huge-poster.jpg')
    expect(formData.get('event_id')).toBe('7')
  })

  it('large original over the 5MB cap is downscaled under it and uploaded, not rejected up front (#643)', async () => {
    global.createImageBitmap = vi.fn().mockResolvedValue({ width: 5184, height: 3456, close: vi.fn() })
    // eslint-disable-next-line no-undef
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() })
    // eslint-disable-next-line no-undef
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
      // eslint-disable-next-line no-undef
      callback(new Blob(['tiny-downscaled-bytes'], { type: 'image/jpeg' }))
    })

    // 6MB original — over the 5MB cap; must reach the downscaler, not be blocked.
    const bigBytes = new Uint8Array(6 * 1024 * 1024)
    bigBytes.set([0xff, 0xd8, 0xff, 0xe0])
    // eslint-disable-next-line no-undef
    const bigFile = new File([bigBytes], 'huge-original.jpg', { type: 'image/jpeg' })

    render(
      <PhotoUpload
        currentPhoto={null}
        onPhotoChange={vi.fn()}
        bandId={9}
        bandName="Big Photo Band"
        maxDimension={1600}
      />
    )
    selectFile(bigFile)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/too large/i)).not.toBeInTheDocument()
    const uploaded = fetchMock.mock.calls[0][1].body.get('photo')
    expect(uploaded.type).toBe('image/jpeg')
  })

  it('skips downscaling for GIFs even when maxDimension is set', async () => {
    global.createImageBitmap = vi.fn().mockResolvedValue({ width: 3200, height: 2400, close: vi.fn() })
    // eslint-disable-next-line no-undef
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')

    render(
      <PhotoUpload
        currentPhoto={null}
        onPhotoChange={vi.fn()}
        uploadUrl="/api/admin/events/posters"
        fieldName="poster"
        maxDimension={1600}
      />
    )

    selectFile(gifFile('animated.gif'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(toBlobSpy).not.toHaveBeenCalled()
    expect(global.createImageBitmap).not.toHaveBeenCalled()

    const formData = fetchMock.mock.calls[0][1].body
    const uploaded = formData.get('poster')
    expect(uploaded.name).toBe('animated.gif')
    expect(uploaded.type).toBe('image/gif')
  })

  it('already-small image (below maxDimension) is uploaded without re-encoding', async () => {
    global.createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() })
    // eslint-disable-next-line no-undef
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')

    render(
      <PhotoUpload
        currentPhoto={null}
        onPhotoChange={vi.fn()}
        uploadUrl="/api/admin/events/posters"
        fieldName="poster"
        maxDimension={1600}
      />
    )

    selectFile(jpegFile('small.jpg'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(toBlobSpy).not.toHaveBeenCalled()

    const formData = fetchMock.mock.calls[0][1].body
    expect(formData.get('poster').name).toBe('small.jpg')
  })

  it('falls back to the original file if downscaling throws', async () => {
    global.createImageBitmap = vi.fn().mockRejectedValue(new Error('unsupported format'))

    render(
      <PhotoUpload
        currentPhoto={null}
        onPhotoChange={vi.fn()}
        uploadUrl="/api/admin/events/posters"
        fieldName="poster"
        maxDimension={1600}
      />
    )

    selectFile(jpegFile('weird.jpg'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const formData = fetchMock.mock.calls[0][1].body
    expect(formData.get('poster').name).toBe('weird.jpg')
  })
})
