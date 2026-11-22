/**
 * v1351 parity (Admin rule 24) — AdminDateInput: fixed D MMM YYYY / 24-hour / Monday-first, type or pick.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminDateInput } from '../AdminDateInput.jsx'
import { parseTypedDate, formatDateTimeValue } from '../adminDateInputUtils.js'

describe('AdminDateInput', () => {
  it('shows dates as D MMM YYYY and times in 24-hour', () => {
    render(<AdminDateInput value="2026-09-08" onChange={() => {}} aria-label="From" />)
    expect(screen.getByLabelText('From')).toHaveValue('8 Sep 2026')
    expect(formatDateTimeValue('2026-09-08T14:30')).toBe('8 Sep 2026 14:30')
  })

  it('reads typed dates day-first and stores ISO for an event-style handler', () => {
    const onChange = vi.fn()
    render(<AdminDateInput value="" onChange={onChange} eventStyle name="from" aria-label="From" />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '8/9/2026' } })
    expect(onChange.mock.calls.at(-1)[0].target).toMatchObject({ value: '2026-09-08', name: 'from' })
    expect(parseTypedDate('Sep 8, 2026')).toBe('2026-09-08')
  })

  it('opens a Monday-first calendar and picks a day', () => {
    const onChange = vi.fn()
    render(<AdminDateInput value="2026-09-08" onChange={onChange} aria-label="From" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent(/^M/)
    fireEvent.click(screen.getByRole('button', { name: '15 Sep 2026' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-09-15')
  })

  it('flags text that is not a date', () => {
    const onChange = vi.fn()
    render(<AdminDateInput value="" onChange={onChange} aria-label="From" />)
    const box = screen.getByLabelText('From')
    fireEvent.change(box, { target: { value: '31/2/2026' } })
    fireEvent.blur(box)
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })
})
