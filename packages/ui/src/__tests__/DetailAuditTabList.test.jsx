import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DetailAuditTabList from '../DetailAuditTabList.jsx'

describe('DetailAuditTabList', () => {
  it('renders the legacy Details/Audit details two-tab shape when `tabs` is omitted', () => {
    render(<DetailAuditTabList activeTab="details" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audit details' })).toBeInTheDocument()
  })

  it('respects custom detailsLabel/auditLabel overrides in the legacy shape', () => {
    render(
      <DetailAuditTabList
        activeTab="details"
        onChange={() => {}}
        detailsLabel="Template details"
        auditLabel="History"
      />,
    )
    expect(screen.getByRole('tab', { name: 'Template details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
  })

  it('renders an arbitrary N-tab shape when `tabs` is passed, ignoring legacy label props', () => {
    const tabs = [
      { value: 'wizard', label: 'Wizard' },
      { value: 'preview', label: 'Preview' },
      { value: 'audit', label: 'Audit details' },
    ]
    render(<DetailAuditTabList activeTab="wizard" onChange={() => {}} tabs={tabs} />)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Wizard' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audit details' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected="true" and others "false"', () => {
    render(<DetailAuditTabList activeTab="audit" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Audit details' })).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onChange with the clicked tab value', () => {
    const onChange = vi.fn()
    render(<DetailAuditTabList activeTab="details" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Audit details' }))
    expect(onChange).toHaveBeenCalledWith('audit')
  })

  it('calls onChange with a custom tab value from the `tabs` array', () => {
    const onChange = vi.fn()
    const tabs = [
      { value: 'overview', label: 'Overview' },
      { value: 'audit', label: 'Audit details' },
    ]
    render(<DetailAuditTabList activeTab="overview" onChange={onChange} tabs={tabs} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Audit details' }))
    expect(onChange).toHaveBeenCalledWith('audit')
  })
})
