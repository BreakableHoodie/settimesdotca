import { useState, useEffect, useCallback, useMemo } from 'react'
import { venuesApi } from '../utils/adminApi'
import { FIELD_LIMITS } from '../utils/validation'

/**
 * VenuesTab - Manage venues (create, edit, delete)
 *
 * Features:
 * - List all venues with name, address, band count
 * - Add new venue form
 * - Edit venue (inline edit)
 * - Delete venue (disabled if bands exist with tooltip)
 * - Mobile-responsive cards
 */
export default function VenuesTab({ showToast, readOnly = false }) {
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
    phone: '',
    contact_email: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const loadVenues = useCallback(async () => {
    try {
      setLoading(true)
      const result = await venuesApi.getAll()
      setVenues(result.venues || [])
    } catch (err) {
      showToast('Failed to load venues: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadVenues()
  }, [loadVenues])

  const resetForm = () => {
    setFormData({
      name: '',
      address_line1: '',
      address_line2: '',
      city: '',
      region: '',
      postal_code: '',
      country: '',
      phone: '',
      contact_email: '',
    })
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleAdd = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await venuesApi.create(formData)
      showToast('Venue added successfully!', 'success')
      resetForm()
      loadVenues()
    } catch (err) {
      showToast('Failed to add venue: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await venuesApi.update(editingId, formData)
      showToast('Venue updated successfully!', 'success')
      resetForm()
      loadVenues()
    } catch (err) {
      showToast('Failed to update venue: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (venueId, venueName, bandCount) => {
    if (bandCount > 0) {
      showToast(`Cannot delete venue with ${bandCount} band(s). Remove bands first.`, 'error')
      return
    }

    if (!window.confirm(`Are you sure you want to delete "${venueName}"?`)) {
      return
    }

    try {
      await venuesApi.delete(venueId)
      showToast('Venue deleted successfully!', 'success')
      loadVenues()
    } catch (err) {
      showToast('Failed to delete venue: ' + err.message, 'error')
    }
  }

  const startEdit = venue => {
    setEditingId(venue.id)
    setFormData({
      name: venue.name,
      address_line1: venue.address_line1 || venue.address || '',
      address_line2: venue.address_line2 || '',
      city: venue.city || '',
      region: venue.region || '',
      postal_code: venue.postal_code || '',
      country: venue.country || '',
      phone: venue.phone || '',
      contact_email: venue.contact_email || '',
    })
    setShowAddForm(false)
  }

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const formatAddress = venue => {
    if (!venue) return ''
    const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(', ')
    const line2 = [venue.city, venue.region].filter(Boolean).join(', ')
    const line3 = [venue.postal_code, venue.country].filter(Boolean).join(' ').trim()
    return [line1, line2, line3].filter(Boolean).join(', ') || venue.address || ''
  }

  const regionSuggestions = [
    'AB',
    'BC',
    'MB',
    'NB',
    'NL',
    'NS',
    'NT',
    'NU',
    'ON',
    'PE',
    'QC',
    'SK',
    'YT',
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'IA',
    'ID',
    'IL',
    'IN',
    'KS',
    'KY',
    'LA',
    'MA',
    'MD',
    'ME',
    'MI',
    'MN',
    'MO',
    'MS',
    'MT',
    'NC',
    'ND',
    'NE',
    'NH',
    'NJ',
    'NM',
    'NV',
    'NY',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VA',
    'VT',
    'WA',
    'WI',
    'WV',
    'WY',
  ]

  const countrySuggestions = ['Canada', 'United States']

  const filteredVenues = useMemo(() => {
    if (!searchTerm.trim()) return venues
    const query = searchTerm.trim().toLowerCase()
    return venues.filter(venue => {
      const addressText = formatAddress(venue).toLowerCase()
      return (
        venue.name?.toLowerCase().includes(query) ||
        addressText.includes(query) ||
        venue.city?.toLowerCase().includes(query) ||
        venue.region?.toLowerCase().includes(query) ||
        venue.contact_email?.toLowerCase().includes(query) ||
        venue.phone?.toLowerCase().includes(query)
      )
    })
  }, [venues, searchTerm])

  const sortedVenues = useMemo(() => {
    if (!sortConfig.key) return filteredVenues
    const direction = sortConfig.direction === 'asc' ? 1 : -1
    return [...filteredVenues].sort((a, b) => {
      if (sortConfig.key === 'band_count') {
        return ((a.band_count || 0) - (b.band_count || 0)) * direction
      }
      if (sortConfig.key === 'address') {
        const aVal = formatAddress(a).toLowerCase()
        const bVal = formatAddress(b).toLowerCase()
        return aVal.localeCompare(bVal) * direction
      }
      const aVal = (a[sortConfig.key] || '').toLowerCase()
      const bVal = (b[sortConfig.key] || '').toLowerCase()
      return aVal.localeCompare(bVal) * direction
    })
  }, [filteredVenues, sortConfig])

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const SortIcon = ({ col }) => (
    <span className="ml-1 inline-block w-4">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </span>
  )

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-band-orange text-lg">Loading venues...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Venues</h2>
          <p className="text-sm text-white/70 mt-1">Manage venues and locations for your events.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search name, city, phone, email"
            className="min-h-[44px] px-3 py-2 rounded bg-band-navy text-white border border-white/10 focus:border-band-orange focus:outline-none w-56"
          />
          {!showAddForm && !editingId && !readOnly && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 min-h-[44px] bg-band-orange text-white rounded hover:bg-orange-600 transition-colors"
            >
              + Add Venue
            </button>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && !readOnly && (
        <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">{editingId ? 'Edit Venue' : 'Add New Venue'}</h3>

          <form onSubmit={editingId ? handleUpdate : handleAdd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="venue-name" className="block text-white mb-2 text-sm">
                  Venue Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  required
                  minLength={FIELD_LIMITS.venueName.min}
                  maxLength={FIELD_LIMITS.venueName.max}
                  placeholder="The Rock Bar"
                />
                <span className="text-xs text-white/50 mt-1">
                  {formData.name.length}/{FIELD_LIMITS.venueName.max}
                </span>
              </div>

              <div>
                <label htmlFor="venue-address-line1" className="block text-white mb-2 text-sm">
                  Address Line 1
                </label>
                <input
                  id="venue-address-line1"
                  type="text"
                  name="address_line1"
                  value={formData.address_line1}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueAddressLine1.max}
                  placeholder="123 Main St"
                />
                <span className="text-xs text-white/50 mt-1">
                  {formData.address_line1.length}/{FIELD_LIMITS.venueAddressLine1.max}
                </span>
              </div>

              <div>
                <label htmlFor="venue-address-line2" className="block text-white mb-2 text-sm">
                  Address Line 2 <span className="text-xs text-white/50">(optional)</span>
                </label>
                <input
                  id="venue-address-line2"
                  type="text"
                  name="address_line2"
                  value={formData.address_line2}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueAddressLine2.max}
                  placeholder="Suite 200"
                />
              </div>

              <div>
                <label htmlFor="venue-city" className="block text-white mb-2 text-sm">
                  City
                </label>
                <input
                  id="venue-city"
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueCity.max}
                  placeholder="Waterloo"
                />
              </div>

              <div>
                <label htmlFor="venue-region" className="block text-white mb-2 text-sm">
                  Province/State
                </label>
                <input
                  id="venue-region"
                  type="text"
                  name="region"
                  value={formData.region}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueRegion.max}
                  placeholder="ON"
                  list="venue-region-list"
                />
                <datalist id="venue-region-list">
                  {regionSuggestions.map(region => (
                    <option key={region} value={region} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="venue-postal" className="block text-white mb-2 text-sm">
                  Postal Code
                </label>
                <input
                  id="venue-postal"
                  type="text"
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venuePostal.max}
                  placeholder="N2L 3G1"
                  pattern="(?:\\d{5}(?:-\\d{4})?|[A-Za-z]\\d[A-Za-z][ ]?\\d[A-Za-z]\\d)"
                  title="Use a valid US ZIP or Canadian postal code"
                />
              </div>

              <div>
                <label htmlFor="venue-country" className="block text-white mb-2 text-sm">
                  Country
                </label>
                <input
                  id="venue-country"
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueCountry.max}
                  placeholder="Canada"
                  list="venue-country-list"
                />
                <datalist id="venue-country-list">
                  {countrySuggestions.map(country => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="venue-phone" className="block text-white mb-2 text-sm">
                  Phone <span className="text-xs text-white/50">(optional)</span>
                </label>
                <input
                  id="venue-phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venuePhone.max}
                  placeholder="+1 519 555 1234"
                  pattern="^[+]?[-()\\d\\s.]{7,20}$"
                  title="Use a valid phone number"
                />
              </div>

              <div>
                <label htmlFor="venue-contact-email" className="block text-white mb-2 text-sm">
                  Contact Email <span className="text-xs text-white/50">(optional)</span>
                </label>
                <input
                  id="venue-contact-email"
                  type="email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueContactEmail.max}
                  placeholder="hello@venue.com"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 min-h-[44px] bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Venue' : 'Add Venue'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 min-h-[44px] bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Venues List */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {filteredVenues.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            {venues.length === 0 ? 'No venues yet. Add your first venue to get started!' : 'No venues match your filters.'}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-navy/50 border-b border-band-orange/20">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                      onClick={() => handleSort('name')}
                    >
                      Name <SortIcon col="name" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                      onClick={() => handleSort('address')}
                    >
                      Address <SortIcon col="address" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                      onClick={() => handleSort('phone')}
                    >
                      Phone <SortIcon col="phone" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-white font-semibold cursor-pointer hover:text-band-orange"
                      onClick={() => handleSort('contact_email')}
                    >
                      Contact <SortIcon col="contact_email" />
                    </th>
                    <th
                      className="px-4 py-3 text-center text-white font-semibold cursor-pointer hover:text-band-orange"
                      onClick={() => handleSort('band_count')}
                    >
                      Bands <SortIcon col="band_count" />
                    </th>
                    {!readOnly && <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {sortedVenues.map(venue => {
                    const hasBands = (venue.band_count || 0) > 0
                    return (
                      <tr key={venue.id} className="hover:bg-band-navy/30 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{venue.name}</td>
                        <td className="px-4 py-3 text-white/70">{formatAddress(venue) || '-'}</td>
                        <td className="px-4 py-3 text-white/70">{venue.phone || '-'}</td>
                        <td className="px-4 py-3 text-white/70">{venue.contact_email || '-'}</td>
                        <td className="px-4 py-3 text-center text-white/70">{venue.band_count || 0}</td>
                        {!readOnly && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => startEdit(venue)}
                                className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                              >
                                Edit
                              </button>
                              <div className="relative group">
                                <button
                                  onClick={() => handleDelete(venue.id, venue.name, venue.band_count)}
                                  disabled={hasBands}
                                  className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Delete
                                </button>
                                {hasBands && (
                                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                                    Cannot delete: {venue.band_count} band(s) assigned to this venue
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-band-orange/10">
              {sortedVenues.map(venue => {
                const hasBands = (venue.band_count || 0) > 0
                return (
                  <div key={venue.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{venue.name}</h3>
                        <p className="text-white/70 text-sm">{formatAddress(venue) || 'No address'}</p>
                        <p className="text-white/50 text-xs mt-1">
                          {venue.phone || 'No phone'} · {venue.contact_email || 'No email'}
                        </p>
                      </div>
                      <div className="text-white/50 text-sm">
                        {venue.band_count || 0} band{venue.band_count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => startEdit(venue)}
                          className="flex-1 px-3 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(venue.id, venue.name, venue.band_count)}
                          disabled={hasBands}
                          className="flex-1 px-3 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={hasBands ? `Cannot delete: ${venue.band_count} band(s) assigned` : 'Delete venue'}
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {hasBands && (
                      <p className="text-xs text-yellow-400">
                        Note: Cannot delete while {venue.band_count} band(s) are assigned to this venue
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
