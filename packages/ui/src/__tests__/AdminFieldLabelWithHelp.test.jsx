/**
 * Admin field-level help (Admin rule 23, monorepo v1345 slice 6): label + scope + text helpers.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@nidus-admin/shared', () => ({ getAdminDb: () => ({}) }))

import { AdminFieldLabelWithHelp, partitionAdminLabelChildren } from '../fieldHelp/AdminFieldLabelWithHelp.jsx'
import { AdminFieldHelpScope } from '../fieldHelp/AdminFieldHelpScope.jsx'
import { buildAdminHelpRules, parseAdminHelpText, resolveAdminHelpTokens } from '../fieldHelp/adminFieldHelp.js'

const ROW = { title: 'Rule name', purpose: 'A short name for the rule.', examples: 'Escalate failed payments', format_notes: 'Dates show as {date_format}.', extra_notes: null }
const loader = vi.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, k === 'admin.alert_rules.name' ? ROW : null])))

describe('Admin field help', () => {
  it('shows ⓘ and the help card when a row exists, with rules read from the field', async () => {
    render(
      <AdminFieldHelpScope loader={loader}>
        <AdminFieldLabelWithHelp helpKey="admin.alert_rules.name" htmlFor="name">Name</AdminFieldLabelWithHelp>
        <input id="name" required maxLength={80} />
      </AdminFieldHelpScope>,
    )
    const button = await screen.findByRole('button', { name: 'Help: Rule name' })
    fireEvent.click(button)
    const card = await screen.findByRole('dialog')
    expect(card).toHaveTextContent('A short name for the rule.')
    expect(card).toHaveTextContent('Required.')
    expect(card).toHaveTextContent('Up to 80 characters.')
    expect(card).toHaveTextContent('Dates show as D MMM YYYY.')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('renders a plain label with no ⓘ when there is no help row', async () => {
    render(
      <AdminFieldHelpScope loader={loader}>
        <AdminFieldLabelWithHelp helpKey="admin.alert_rules.unknown" htmlFor="x">Other</AdminFieldLabelWithHelp>
        <input id="x" />
      </AdminFieldHelpScope>,
    )
    await waitFor(() => expect(loader).toHaveBeenCalled())
    expect(screen.getByText('Other').tagName).toBe('LABEL')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('text helpers: tokens, bullet lists, rules', () => {
    expect(resolveAdminHelpTokens('Use {example_date} ({date_format})')).toBe('Use 15 Mar 2027 (D MMM YYYY)')
    expect(parseAdminHelpText('One\n- a\n- b')).toEqual([{ type: 'p', text: 'One' }, { type: 'ul', items: ['a', 'b'] }])
    expect(buildAdminHelpRules({ required: false, options: ['Select…', 'Low', 'High'] })).toEqual(['Optional.', 'Choose from: Low, High.'])
    expect(partitionAdminLabelChildren(['Name', <input key="i" />]).mode).toBe('stacked')
  })
})
