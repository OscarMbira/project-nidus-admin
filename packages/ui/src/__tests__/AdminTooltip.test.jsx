import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminTooltip } from '../AdminTooltip.jsx'

describe('AdminTooltip', () => {
  it('renders children without a tooltip role when no label is passed', () => {
    render(
      <AdminTooltip>
        <button>Plain</button>
      </AdminTooltip>
    )
    expect(screen.getByRole('button', { name: 'Plain' })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the label on hover and hides it on mouse leave', () => {
    render(
      <AdminTooltip label="Delete user">
        <button>Trigger</button>
      </AdminTooltip>
    )
    const wrapper = screen.getByRole('button', { name: 'Trigger' }).parentElement

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Delete user')
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the label on focus and hides it on blur', () => {
    render(
      <AdminTooltip label="Edit user">
        <button>Trigger</button>
      </AdminTooltip>
    )
    const button = screen.getByRole('button', { name: 'Trigger' })

    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Edit user')
    fireEvent.blur(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
