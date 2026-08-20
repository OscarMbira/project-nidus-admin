import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminSidebarNavTreeRow } from '../AdminSidebarNavTreeRow.jsx'

describe('AdminSidebarNavTreeRow', () => {
  it('renders a connector dot beside nested admin nav links', () => {
    const { container } = render(
      <AdminSidebarNavTreeRow>
        <a href="/one">One</a>
      </AdminSidebarNavTreeRow>,
    )

    expect(screen.getByText('One')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"].rounded-full')).toBeTruthy()
  })
})
