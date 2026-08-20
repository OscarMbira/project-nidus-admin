import { describe, it, expect } from 'vitest'
import { DEFAULT_NAV_SECTIONS } from '../defaultAdminNav.js'

describe('defaultAdminNav — Global Templates level-first (v188 + subsections)', () => {
  const section = () => DEFAULT_NAV_SECTIONS.find((s) => s.id === 'global-templates')

  it('has a top-level Global Templates section with the library item as a flat group', () => {
    const s = section()
    expect(s).toBeTruthy()
    expect(s.label).toBe('Global Templates')
    const paths = s.groups.flatMap((g) => g.items.map((i) => i.path))
    expect(paths).toContain('/content/global-template-library')
  })

  it('clusters Portfolio, Programme, and Project template groups under a Templates subsection', () => {
    const s = section()
    const templates = s.subsections.find((sub) => sub.label === 'Templates')
    expect(templates).toBeTruthy()

    const labels = templates.groups.map((g) => g.label)
    expect(labels).toEqual(['Portfolio', 'Programme', 'Project'])

    const portfolio = templates.groups.find((g) => g.label === 'Portfolio')
    expect(portfolio.items.map((i) => i.label)).toEqual(['Standards-Based', 'Structured', 'Agile'])
    expect(portfolio.items.every((i) => i.path.includes('methodology='))).toBe(true)
    expect(portfolio.items.some((i) => i.path.includes('domain=portfolio_template'))).toBe(true)

    const project = templates.groups.find((g) => g.label === 'Project')
    expect(project.items).toHaveLength(3)
    expect(project.items.some((i) => i.path.includes('domain=project_template&methodology=standards_based'))).toBe(true)
  })

  it('clusters Forms · Standards-Based/Structured/Agile under a Forms subsection with phase/stage leaves', () => {
    const s = section()
    const forms = s.subsections.find((sub) => sub.label === 'Forms')
    expect(forms).toBeTruthy()

    const standardsBased = forms.groups.find((g) => g.label === 'Standards-Based')
    const structured = forms.groups.find((g) => g.label === 'Structured')
    const agile = forms.groups.find((g) => g.label === 'Agile')
    expect(standardsBased).toBeTruthy()
    expect(structured).toBeTruthy()
    expect(agile).toBeTruthy()
    expect(standardsBased.items).toHaveLength(5)
    expect(structured.items).toHaveLength(7)
    expect(agile.items).toHaveLength(5)
    expect(standardsBased.items[0].path).toContain('domain=form_template&methodology=standards_based')
    expect(structured.items.some((i) => i.path.includes('category=Starting+Up'))).toBe(true)
    expect(agile.items.some((i) => i.path.includes('category=Backlog'))).toBe(true)
  })

  it('clusters Content Coverage and Process Docs methodology groups under their own subsections', () => {
    const s = section()
    const subsectionLabels = s.subsections.map((sub) => sub.label)
    expect(subsectionLabels).toEqual(['Templates', 'Forms', 'Content Coverage', 'Process Docs'])

    const defaultContent = s.subsections.find((sub) => sub.label === 'Content Coverage')
    expect(defaultContent.groups.map((g) => g.label)).toEqual(['Standards-Based', 'Structured', 'Agile'])
    const defaultPmbok = defaultContent.groups.find((g) => g.label === 'Standards-Based')
    expect(defaultPmbok.items.some((i) => i.path.includes('/content/default-content-library'))).toBe(true)
    expect(defaultPmbok.items.some((i) => i.path.includes('methodology=standards_based'))).toBe(true)

    const processDocs = s.subsections.find((sub) => sub.label === 'Process Docs')
    expect(processDocs.groups.map((g) => g.label)).toEqual(['Standards-Based', 'Structured', 'Agile'])
    const processAgile = processDocs.groups.find((g) => g.label === 'Agile')
    expect(processAgile.items).toHaveLength(5)
    expect(processAgile.items.every((i) => i.path.includes('domain=process_template&methodology=agile'))).toBe(true)
  })

  it('does not keep the old flat "X · Methodology" group labels or legacy Agile-only category leaf', () => {
    const s = section()
    const allGroupLabels = [
      ...s.groups.map((g) => g.label),
      ...s.subsections.flatMap((sub) => sub.groups.map((g) => g.label)),
    ]
    expect(allGroupLabels).not.toContain('Forms · Standards-Based')
    expect(allGroupLabels).not.toContain('Portfolio Templates')
    expect(allGroupLabels.find((l) => l === 'Forms')).toBeFalsy()

    const allPaths = [
      ...s.groups.flatMap((g) => g.items.map((i) => i.path)),
      ...s.subsections.flatMap((sub) => sub.groups.flatMap((g) => g.items.map((i) => i.path))),
    ]
    expect(allPaths.some((p) => p.includes('domain=form_template&category=Agile') && !p.includes('methodology='))).toBe(false)
  })

  it('does not keep Global Template Library under Content & Localization', () => {
    const content = DEFAULT_NAV_SECTIONS.find((s) => s.id === 'content-localization')
    expect(content).toBeTruthy()
    const contentPaths = content.groups
      .find((g) => g.label === 'Content')
      ?.items.map((i) => i.path) || []
    expect(contentPaths).not.toContain('/content/global-template-library')
  })
})
