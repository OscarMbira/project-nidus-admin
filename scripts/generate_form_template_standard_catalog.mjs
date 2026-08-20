/**
 * Generate Admin standard form-field catalog from monorepo v759 seeds.
 * Run from Admin repo: node scripts/generate_form_template_standard_catalog.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adminRoot = path.resolve(__dirname, '..')
const monoSeed = path.resolve(adminRoot, '..', 'project-nidus', 'SQL', 'v759_form_template_field_seeds_expanded.sql')
const outPath = path.join(adminRoot, 'packages', 'shared', 'src', 'formTemplateStandardFieldsCatalog.json')

const txt = fs.readFileSync(monoSeed, 'utf8')
const catalog = {}
const re = /\('(F\d+)',\s*'(\{.*?})'::jsonb\)/gs
let m
while ((m = re.exec(txt))) {
  const code = m[1]
  if (catalog[code]) continue
  const schema = JSON.parse(m[2])
  catalog[code] = {
    title: schema.title || code,
    sections: (schema.sections || []).map((sec, sIdx) => ({
      key: sec.key || `section_${sIdx + 1}`,
      title: sec.title || `Section ${sIdx + 1}`,
      fields: (sec.fields || []).map((f, fIdx) => {
        const out = {
          key: f.key || `field_${fIdx + 1}`,
          label: f.label || f.key || `Field ${fIdx + 1}`,
          type: f.type || 'text',
          required: Boolean(f.required),
        }
        if (Array.isArray(f.options) && f.options.length) out.options = f.options
        if (f.help) out.help = String(f.help)
        if (f.sample != null && String(f.sample).trim() !== '') out.sample = String(f.sample)
        return out
      }),
    })),
  }
}

fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2))
console.log(`Wrote ${outPath} (${Object.keys(catalog).length} templates)`)
