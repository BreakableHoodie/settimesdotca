import { describe, it, expect } from 'vitest'
import { buildPickerFormData, buildEmptyPickerFormData } from '../pickerFormData'

const artist = {
  name: 'Test Band',
  genre: 'Rock',
  origin: 'Montreal, QC',
  origin_city: 'Montreal',
  origin_region: 'QC',
  contact_email: 'band@example.com',
  is_active: 1,
  description: 'A band',
  photo_url: 'https://example.com/photo.jpg',
  url: 'https://example.com',
  social_links: JSON.stringify({ website: 'https://example.com', instagram: '@band' }),
}

describe('buildPickerFormData', () => {
  it('never carries over venue_id from previous editing state', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.venue_id).toBe('')
  })

  it('never carries over start_time from previous editing state', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.start_time).toBe('')
  })

  it('never carries over end_time from previous editing state', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.end_time).toBe('')
  })

  it('never carries over duration from previous editing state', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.duration).toBe('')
  })

  it('never carries over performance_date from previous editing state', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.performance_date).toBe('')
  })

  it('clears id (not editing an existing performance)', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.id).toBeNull()
  })

  it('fills artist profile fields', () => {
    const result = buildPickerFormData(artist, '1')
    expect(result.name).toBe('Test Band')
    expect(result.genre).toBe('Rock')
    expect(result.origin_city).toBe('Montreal')
    expect(result.origin_region).toBe('QC')
    expect(result.contact_email).toBe('band@example.com')
    expect(result.instagram).toBe('@band')
  })

  it('sets event_id from the argument', () => {
    const result = buildPickerFormData(artist, '42')
    expect(result.event_id).toBe('42')
  })

  it('handles artist with no social_links gracefully', () => {
    const result = buildPickerFormData({ ...artist, social_links: null }, '1')
    expect(result.website).toBe('')
    expect(result.instagram).toBe('')
  })

  it('falls back to splitting origin string when origin_city is missing', () => {
    const result = buildPickerFormData({ ...artist, origin_city: '', origin_region: '' }, '1')
    expect(result.origin_city).toBe('Montreal')
    expect(result.origin_region).toBe('QC')
  })
})

describe('buildEmptyPickerFormData', () => {
  it('never carries over venue_id', () => {
    const result = buildEmptyPickerFormData('New Band', '1')
    expect(result.venue_id).toBe('')
  })

  it('never carries over start_time or end_time', () => {
    const result = buildEmptyPickerFormData('New Band', '1')
    expect(result.start_time).toBe('')
    expect(result.end_time).toBe('')
  })

  it('never carries over performance_date', () => {
    const result = buildEmptyPickerFormData('New Band', '1')
    expect(result.performance_date).toBe('')
  })

  it('sets the name from the argument', () => {
    const result = buildEmptyPickerFormData('New Festival Band', '1')
    expect(result.name).toBe('New Festival Band')
  })

  it('clears all profile fields', () => {
    const result = buildEmptyPickerFormData('New Band', '1')
    expect(result.genre).toBe('')
    expect(result.description).toBe('')
    expect(result.instagram).toBe('')
  })

  it('sets event_id from the argument', () => {
    const result = buildEmptyPickerFormData('New Band', '99')
    expect(result.event_id).toBe('99')
  })
})
