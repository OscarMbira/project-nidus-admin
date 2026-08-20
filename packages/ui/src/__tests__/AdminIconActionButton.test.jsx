import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminIconActionButton } from '../AdminIconActionButton.jsx'

describe('AdminIconActionButton', () => {
  it('renders the Eye icon, blue color classes, and title/aria-label for the view variant', () => {
    render(<AdminIconActionButton variant="view" label="View user" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'View user' })
    expect(button).toHaveAttribute('title', 'View user')
    expect(button.className).toContain('text-blue-600')
    expect(button.querySelector('svg')).toHaveClass('lucide-eye')
  })

  it('renders the Pencil icon and amber color classes for the edit variant', () => {
    render(<AdminIconActionButton variant="edit" label="Edit user" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Edit user' })
    expect(button.className).toContain('text-amber-600')
    expect(button.querySelector('svg')).toHaveClass('lucide-pencil')
  })

  it('renders the Trash2 icon and red color classes for the delete variant', () => {
    render(<AdminIconActionButton variant="delete" label="Delete user" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Delete user' })
    expect(button.className).toContain('text-red-600')
    expect(button.querySelector('svg')).toHaveClass('lucide-trash-2')
  })

  it('never renders visible text alongside the icon', () => {
    render(<AdminIconActionButton variant="view" label="View user" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'View user' }).textContent).toBe('')
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<AdminIconActionButton variant="view" label="View user" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'View user' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for an unknown variant', () => {
    const { container } = render(<AdminIconActionButton variant="bogus" label="Nope" onClick={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('respects the disabled prop', () => {
    render(<AdminIconActionButton variant="delete" label="Delete user" onClick={() => {}} disabled />)
    expect(screen.getByRole('button', { name: 'Delete user' })).toBeDisabled()
  })

  it('shows a tooltip with the label text on hover, and hides it on mouse leave', () => {
    render(<AdminIconActionButton variant="view" label="View user" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'View user' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(button.parentElement)
    expect(screen.getByRole('tooltip')).toHaveTextContent('View user')

    fireEvent.mouseLeave(button.parentElement)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip on keyboard focus', () => {
    render(<AdminIconActionButton variant="edit" label="Edit user" onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Edit user' })

    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Edit user')

    fireEvent.blur(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
