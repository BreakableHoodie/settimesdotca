import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventWizard from '../EventWizard'

vi.mock('../../utils/adminApi', () => ({
  eventsApi: {
    createWizard: vi.fn(),
  },
}))

function renderWizard() {
  return render(<EventWizard onComplete={vi.fn()} onCancel={vi.fn()} />)
}

function advanceToVenuesStep() {
  renderWizard()

  fireEvent.change(screen.getByLabelText(/Event Name/i), {
    target: { value: 'Late Night Crawl' },
  })
  fireEvent.change(screen.getByLabelText(/Event Date/i), {
    target: { value: '2026-08-03' },
  })

  fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
}

describe('EventWizard', () => {
  it('keeps added venues visible when moving between steps', () => {
    advanceToVenuesStep()

    fireEvent.change(screen.getByPlaceholderText(/Venue name/i), {
      target: { value: 'Crystal Ballroom' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Address/i), {
      target: { value: '1332 W Burnside St' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Venue/i }))

    expect(screen.getByText('Crystal Ballroom')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))

    expect(screen.getByText('Crystal Ballroom')).toBeInTheDocument()
    expect(screen.getByText('1332 W Burnside St')).toBeInTheDocument()
  })

  it('keeps added bands visible when moving away from and back to the bands step', () => {
    advanceToVenuesStep()

    fireEvent.change(screen.getByPlaceholderText(/Venue name/i), {
      target: { value: 'Main Stage' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add Venue/i }))

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    fireEvent.change(screen.getByPlaceholderText(/Band name/i), {
      target: { value: 'The Headliners' },
    })
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: screen.getByRole('option', { name: 'Main Stage' }).getAttribute('value') },
    })
    fireEvent.change(screen.getByPlaceholderText(/Start time/i), {
      target: { value: '20:00' },
    })
    fireEvent.change(screen.getByPlaceholderText(/End time/i), {
      target: { value: '21:00' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Band/i }))

    expect(screen.getByText('The Headliners')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }))

    expect(screen.getByText('The Headliners')).toBeInTheDocument()
    expect(screen.getByText(/8:00 PM - 9:00 PM/i)).toBeInTheDocument()
  })
})