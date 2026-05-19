import { useEffect, useState } from 'react'
import { eventsApi } from '../utils/adminApi'
import { formatTimeRange } from '../utils/timeFormat'

const STEPS = ['basics', 'venues', 'bands', 'publish']
const DEFAULT_EVENT_DATA = {
  name: '',
  date: '',
  slug: '',
  description: '',
  venues: [],
  bands: [],
}

function normalizeEventData(initialEventData) {
  return {
    ...DEFAULT_EVENT_DATA,
    ...initialEventData,
    venues: Array.isArray(initialEventData?.venues) ? initialEventData.venues : [],
    bands: Array.isArray(initialEventData?.bands) ? initialEventData.bands : [],
  }
}

// Step 1: Event Basics
function BasicsStep({ eventData, onChange }) {
  const handleChange = (field, value) => {
    onChange(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // Auto-generate slug from name
  const generateSlug = name => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = name => {
    handleChange('name', name)
    handleChange('slug', generateSlug(name))
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Event Basics</h3>

      <div>
        <label htmlFor="event-name" className="block text-white mb-2 text-sm">
          Event Name *
        </label>
        <input
          id="event-name"
          type="text"
          value={eventData.name}
          onChange={e => handleNameChange(e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
          placeholder="Long Weekend Band Crawl Vol. 6"
          required
        />
      </div>

      <div>
        <label htmlFor="event-date" className="block text-white mb-2 text-sm">
          Event Date *
        </label>
        <input
          id="event-date"
          type="date"
          value={eventData.date}
          onChange={e => handleChange('date', e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
          required
        />
      </div>

      <div>
        <label htmlFor="event-slug" className="block text-white mb-2 text-sm">
          URL Slug *
        </label>
        <input
          id="event-slug"
          type="text"
          value={eventData.slug}
          onChange={e => handleChange('slug', e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
          placeholder="vol-6"
          required
        />
        <p className="text-gray-400 text-xs mt-1">This will be used in the URL: /events/{eventData.slug}</p>
      </div>

      <div>
        <label htmlFor="event-description" className="block text-white mb-2 text-sm">
          Description
        </label>
        <textarea
          id="event-description"
          value={eventData.description}
          onChange={e => handleChange('description', e.target.value)}
          className="w-full min-h-[96px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
          rows={3}
          placeholder="Describe your event..."
        />
      </div>
    </div>
  )
}

// Step 2: Venues
function VenuesStep({ eventData, onChange }) {
  const [newVenue, setNewVenue] = useState({ name: '', address: '' })
  const venues = Array.isArray(eventData?.venues) ? eventData.venues : []

  const handleAddVenue = () => {
    if (!newVenue.name.trim()) return

    const venue = {
      id: Date.now(), // Temporary ID
      name: newVenue.name.trim(),
      address: newVenue.address.trim(),
    }

    onChange(prev => ({
      ...prev,
      venues: [...prev.venues, venue],
    }))
    setNewVenue({ name: '', address: '' })
  }

  const handleRemoveVenue = venueId => {
    onChange(prev => ({
      ...prev,
      venues: prev.venues.filter(v => v.id !== venueId),
    }))
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Venues</h3>

      <div className="space-y-3">
        {venues.map(venue => (
          <div key={venue.id} className="bg-bg-navy rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-white font-medium">{venue.name}</div>
              {venue.address && <div className="text-gray-400 text-sm">{venue.address}</div>}
            </div>
            <button
              type="button"
              onClick={() => handleRemoveVenue(venue.id)}
              className="text-red-400 hover:text-red-300 min-h-[44px] px-2"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-600 pt-4">
        <h4 className="text-white font-medium mb-3">Add New Venue</h4>
        <div className="space-y-3">
          <input
            type="text"
            value={newVenue.name}
            onChange={e => setNewVenue(prev => ({ ...prev, name: e.target.value }))}
            className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
            placeholder="Venue name"
          />
          <input
            type="text"
            value={newVenue.address}
            onChange={e => setNewVenue(prev => ({ ...prev, address: e.target.value }))}
            className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
            placeholder="Address (optional)"
          />
          <button
            type="button"
            onClick={handleAddVenue}
            className="min-h-[44px] px-4 py-2 bg-accent-500 text-bg-navy rounded hover:bg-accent-600"
          >
            Add Venue
          </button>
        </div>
      </div>
    </div>
  )
}

// Step 3: Bands
function BandsStep({ eventData, onChange }) {
  const [newBand, setNewBand] = useState({
    name: '',
    venueId: '',
    startTime: '',
    endTime: '',
    url: '',
  })
  const bands = Array.isArray(eventData?.bands) ? eventData.bands : []

  const handleAddBand = () => {
    if (!newBand.name.trim() || !newBand.venueId || !newBand.startTime || !newBand.endTime) return

    const band = {
      id: Date.now(), // Temporary ID
      name: newBand.name.trim(),
      venueId: parseInt(newBand.venueId),
      startTime: newBand.startTime,
      endTime: newBand.endTime,
      url: newBand.url.trim(),
    }

    onChange(prev => ({
      ...prev,
      bands: [...prev.bands, band],
    }))
    setNewBand({
      name: '',
      venueId: '',
      startTime: '',
      endTime: '',
      url: '',
    })
  }

  const handleRemoveBand = bandId => {
    onChange(prev => ({
      ...prev,
      bands: prev.bands.filter(b => b.id !== bandId),
    }))
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Bands</h3>

      <div className="space-y-3">
        {bands.map(band => {
          const venue = eventData.venues.find(v => v.id === band.venueId)
          return (
            <div key={band.id} className="bg-bg-navy rounded p-3 flex justify-between items-center">
              <div>
                <div className="text-white font-medium">{band.name}</div>
                <div className="text-gray-400 text-sm">
                  {venue?.name} • {formatTimeRange(band.startTime, band.endTime)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveBand(band.id)}
                className="text-red-400 hover:text-red-300 min-h-[44px] px-2"
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-600 pt-4">
        <h4 className="text-white font-medium mb-3">Add New Band</h4>
        <div className="space-y-3">
          <input
            type="text"
            value={newBand.name}
            onChange={e => setNewBand(prev => ({ ...prev, name: e.target.value }))}
            className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
            placeholder="Band name"
          />

          <select
            value={newBand.venueId}
            onChange={e => setNewBand(prev => ({ ...prev, venueId: e.target.value }))}
            className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
          >
            <option value="">Select venue</option>
            {eventData.venues.map(venue => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="time"
              value={newBand.startTime}
              onChange={e => setNewBand(prev => ({ ...prev, startTime: e.target.value }))}
              className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
              placeholder="Start time"
            />
            <input
              type="time"
              value={newBand.endTime}
              onChange={e => setNewBand(prev => ({ ...prev, endTime: e.target.value }))}
              className="min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
              placeholder="End time"
            />
          </div>

          <input
            type="url"
            value={newBand.url}
            onChange={e => setNewBand(prev => ({ ...prev, url: e.target.value }))}
            className="w-full min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-hidden"
            placeholder="Band website/social media (optional)"
          />

          <button
            type="button"
            onClick={handleAddBand}
            className="min-h-[44px] px-4 py-2 bg-accent-500 text-bg-navy rounded hover:bg-accent-600"
          >
            Add Band
          </button>
        </div>
      </div>
    </div>
  )
}

// Step 4: Publish
function PublishStep({ eventData }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white mb-4">Review & Publish</h3>

      <div className="bg-bg-navy rounded p-4 space-y-3">
        <div>
          <span className="text-gray-400 text-sm">Event Name:</span>
          <div className="text-white font-medium">{eventData.name}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Date:</span>
          <div className="text-white">{eventData.date}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">URL:</span>
          <div className="text-white">/events/{eventData.slug}</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Venues:</span>
          <div className="text-white">{eventData.venues.length} venue(s)</div>
        </div>

        <div>
          <span className="text-gray-400 text-sm">Bands:</span>
          <div className="text-white">{eventData.bands.length} band(s)</div>
        </div>
      </div>

      <div className="bg-green-900/30 border border-green-600 rounded p-4">
        <p className="text-green-200 text-sm">
          <strong>Ready to publish!</strong> Your event will be visible to the public once published.
        </p>
      </div>
    </div>
  )
}

export default function EventWizard({ onComplete, onCancel, initialEventData, initialStep = 0, onDraftChange }) {
  const [currentStep, setCurrentStep] = useState(() => initialStep)
  const [eventData, setEventData] = useState(() => normalizeEventData(initialEventData))
  const [loading, setLoading] = useState(false)
  const [publishError, setPublishError] = useState(null)

  useEffect(() => {
    onDraftChange?.({
      currentStep,
      eventData,
    })
  }, [currentStep, eventData, onDraftChange])

  const stepComponents = {
    basics: <BasicsStep eventData={eventData} onChange={setEventData} />,
    venues: <VenuesStep eventData={eventData} onChange={setEventData} />,
    bands: <BandsStep eventData={eventData} onChange={setEventData} />,
    publish: <PublishStep eventData={eventData} />,
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handlePublish = async () => {
    setLoading(true)
    setPublishError(null)

    // Map temp local venue IDs to 0-based indices for the wizard endpoint
    const venueIndexMap = Object.fromEntries(eventData.venues.map((v, i) => [v.id, i]))

    // Pre-flight: detect bands referencing a venue that was removed before publishing
    const staleBand = eventData.bands.find(b => venueIndexMap[b.venueId] === undefined)
    if (staleBand) {
      setPublishError(
        `Band "${staleBand.name}" references a venue that was removed. Please go back and fix the band's venue assignment.`
      )
      setLoading(false)
      return
    }

    try {
      const { event } = await eventsApi.createWizard({
        event: {
          name: eventData.name,
          date: eventData.date,
          slug: eventData.slug,
          description: eventData.description,
        },
        venues: eventData.venues.map(v => ({ name: v.name, address: v.address })),
        bands: eventData.bands.map(b => ({
          name: b.name,
          venueIndex: venueIndexMap[b.venueId],
          startTime: b.startTime,
          endTime: b.endTime,
          url: b.url,
        })),
      })

      onComplete(event)
    } catch (error) {
      console.error('Failed to create event:', error)
      setPublishError(error?.message || 'Failed to create event. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0: // basics
        return eventData.name && eventData.date && eventData.slug
      case 1: // venues
        return eventData.venues.length > 0
      case 2: // bands
        return eventData.bands.length > 0
      default:
        return true
    }
  }

  return (
    <div className="bg-bg-purple rounded-lg p-6">
      {/* Progress indicator */}
      <div className="flex justify-between mb-8" role="list" aria-label="Wizard steps">
        {STEPS.map((step, idx) => (
          <div
            key={step}
            role="listitem"
            aria-current={idx === currentStep ? 'step' : undefined}
            className={`flex-1 text-center ${
              idx === currentStep ? 'text-accent-400 font-bold' : idx < currentStep ? 'text-green-400' : 'text-gray-500'
            }`}
          >
            <div className="text-sm capitalize">{step}</div>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div className="mb-6">
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]}
        </span>
        {stepComponents[STEPS[currentStep]]}
      </div>

      {publishError && (
        <div role="alert" className="mb-4 bg-red-900/50 border border-red-600 text-red-200 p-3 rounded text-sm">
          {publishError}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between">
        <button
          onClick={currentStep === 0 ? onCancel : handleBack}
          className="min-h-[44px] px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="min-h-[44px] px-4 py-2 bg-accent-500 text-bg-navy rounded hover:bg-accent-600 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Publishing...' : 'Publish Event'}
          </button>
        )}
      </div>
    </div>
  )
}
