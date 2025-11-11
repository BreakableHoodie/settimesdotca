import { useState } from 'react'
import { eventsApi, venuesApi, bandsApi } from '../utils/adminApi'

const STEPS = ['basics', 'venues', 'bands', 'publish']

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
        <label htmlFor="event-name" className="block text-white mb-2 text-sm">Event Name *</label>
        <input
          id="event-name"
          type="text"
          value={eventData.name}
          onChange={e => handleNameChange(e.target.value)}
          className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          placeholder="Long Weekend Band Crawl Vol. 6"
          required
        />
      </div>

      <div>
        <label htmlFor="event-date" className="block text-white mb-2 text-sm">Event Date *</label>
        <input
          id="event-date"
          type="date"
          value={eventData.date}
          onChange={e => handleChange('date', e.target.value)}
          className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          required
        />
      </div>

      <div>
        <label htmlFor="event-slug" className="block text-white mb-2 text-sm">URL Slug *</label>
        <input
          id="event-slug"
          type="text"
          value={eventData.slug}
          onChange={e => handleChange('slug', e.target.value)}
          className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          placeholder="vol-6"
          required
        />
        <p className="text-gray-400 text-xs mt-1">This will be used in the URL: /events/{eventData.slug}</p>
      </div>

      <div>
        <label htmlFor="event-description" className="block text-white mb-2 text-sm">Description</label>
        <textarea
          id="event-description"
          value={eventData.description}
          onChange={e => handleChange('description', e.target.value)}
          className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          rows={3}
          placeholder="Describe your event..."
        />
      </div>
    </div>
  )
}

// Step 2: Venues
function VenuesStep({ eventData, onChange }) {
  const [venues, setVenues] = useState([])
  const [newVenue, setNewVenue] = useState({ name: '', address: '' })

  const handleAddVenue = () => {
    if (!newVenue.name.trim()) return

    const venue = {
      id: Date.now(), // Temporary ID
      name: newVenue.name.trim(),
      address: newVenue.address.trim(),
    }

    setVenues(prev => [...prev, venue])
    onChange(prev => ({
      ...prev,
      venues: [...prev.venues, venue],
    }))
    setNewVenue({ name: '', address: '' })
  }

  const handleRemoveVenue = venueId => {
    setVenues(prev => prev.filter(v => v.id !== venueId))
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
          <div key={venue.id} className="bg-band-navy rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-white font-medium">{venue.name}</div>
              {venue.address && <div className="text-gray-400 text-sm">{venue.address}</div>}
            </div>
            <button onClick={() => handleRemoveVenue(venue.id)} className="text-red-400 hover:text-red-300">
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
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            placeholder="Venue name"
          />
          <input
            type="text"
            value={newVenue.address}
            onChange={e => setNewVenue(prev => ({ ...prev, address: e.target.value }))}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            placeholder="Address (optional)"
          />
          <button
            type="button"
            onClick={handleAddVenue}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600"
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
  const [bands, setBands] = useState([])
  const [newBand, setNewBand] = useState({
    name: '',
    venueId: '',
    startTime: '',
    endTime: '',
    url: '',
  })

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

    setBands(prev => [...prev, band])
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
    setBands(prev => prev.filter(b => b.id !== bandId))
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
            <div key={band.id} className="bg-band-navy rounded p-3 flex justify-between items-center">
              <div>
                <div className="text-white font-medium">{band.name}</div>
                <div className="text-gray-400 text-sm">
                  {venue?.name} • {band.startTime} - {band.endTime}
                </div>
              </div>
              <button onClick={() => handleRemoveBand(band.id)} className="text-red-400 hover:text-red-300">
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
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            placeholder="Band name"
          />

          <select
            value={newBand.venueId}
            onChange={e => setNewBand(prev => ({ ...prev, venueId: e.target.value }))}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
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
              className="px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="Start time"
            />
            <input
              type="time"
              value={newBand.endTime}
              onChange={e => setNewBand(prev => ({ ...prev, endTime: e.target.value }))}
              className="px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="End time"
            />
          </div>

          <input
            type="url"
            value={newBand.url}
            onChange={e => setNewBand(prev => ({ ...prev, url: e.target.value }))}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            placeholder="Band website/social media (optional)"
          />

          <button
            type="button"
            onClick={handleAddBand}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600"
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

      <div className="bg-band-navy rounded p-4 space-y-3">
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

export default function EventWizard({ onComplete, onCancel }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [eventData, setEventData] = useState({
    name: '',
    date: '',
    slug: '',
    description: '',
    venues: [],
    bands: [],
  })
  const [loading, setLoading] = useState(false)

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

    try {
      // Create event
      const event = await eventsApi.create({
        name: eventData.name,
        date: eventData.date,
        slug: eventData.slug,
        description: eventData.description,
      })

      // Create venues
      for (const venue of eventData.venues) {
        await venuesApi.create({
          name: venue.name,
          address: venue.address,
          event_id: event.id,
        })
      }

      // Create bands
      for (const band of eventData.bands) {
        await bandsApi.create({
          name: band.name,
          venue_id: band.venueId,
          start_time: band.startTime,
          end_time: band.endTime,
          url: band.url,
          event_id: event.id,
        })
      }

      onComplete(event)
    } catch (error) {
      console.error('Failed to create event:', error)
      alert('Failed to create event. Please try again.')
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
    <div className="bg-band-purple rounded-lg p-6">
      {/* Progress indicator */}
      <div className="flex justify-between mb-8">
        {STEPS.map((step, idx) => (
          <div
            key={step}
            className={`flex-1 text-center ${
              idx === currentStep
                ? 'text-band-orange font-bold'
                : idx < currentStep
                  ? 'text-green-400'
                  : 'text-gray-500'
            }`}
          >
            <div className="text-sm capitalize">{step}</div>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div className="mb-6">{stepComponents[STEPS[currentStep]]}</div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={currentStep === 0 ? onCancel : handleBack}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Publishing...' : 'Publish Event'}
          </button>
        )}
      </div>
    </div>
  )
}
