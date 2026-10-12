import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  AdminMultiLineListInput,
  parseMultiLineValue,
  joinMultiLineValue,
} from '../AdminMultiLineListInput.jsx'

vi.mock('@nidus-admin/shared', () => ({
  useViewMode: vi.fn(() => ['list', vi.fn()]),
  getDisplayRowNumber: (index) => index + 1,
}))

import { useViewMode } from '@nidus-admin/shared'

describe('parseMultiLineValue / joinMultiLineValue', () => {
  it('parses and joins', () => {
    expect(parseMultiLineValue('a\n\nb')).toEqual(['a', 'b'])
    expect(joinMultiLineValue(['a', 'b'])).toBe('a\nb')
  })
})

describe('AdminMultiLineListInput', () => {
  beforeEach(() => {
    useViewMode.mockReturnValue(['list', vi.fn()])
  })

  it('adds a line and confirms delete', () => {
    const onChange = vi.fn()
    render(
      <AdminMultiLineListInput
        viewModeId="admin-test"
        value="One"
        onChange={onChange}
        ariaLabelPrefix="item"
      />
    )
    fireEvent.change(screen.getByLabelText('New item'), { target: { value: 'Two' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))
    expect(onChange).toHaveBeenCalledWith('One\nTwo')

    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
