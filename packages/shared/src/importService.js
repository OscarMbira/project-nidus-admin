export const IMPORT_SCHEMAS = {
  'public.users': {
    label: 'Platform Users',
    table: 'public.users',
    mode: 'create_update',
    rpcCreate: null,
    rpcUpdate: null,
    fields: [
      { key: 'email', label: 'Email', required: true, type: 'email' },
      { key: 'full_name', label: 'Full Name', required: true, type: 'text' },
    ],
  },
  'public.accounts': {
    label: 'Organisations',
    table: 'public.accounts',
    mode: 'create_update',
    fields: [
      { key: 'account_name', label: 'Account Name', required: true, type: 'text' },
    ],
  },
  'admin.support_tickets': {
    label: 'Support Tickets',
    table: 'admin.support_tickets',
    mode: 'create',
    fields: [
      { key: 'subject', label: 'Subject', required: true, type: 'text' },
      { key: 'category', label: 'Category', required: false, type: 'text' },
      { key: 'priority', label: 'Priority', required: false, type: 'text' },
    ],
  },
  'sim.scenarios': {
    label: 'Simulator Scenarios',
    table: 'sim.scenarios',
    mode: 'create_update',
    fields: [
      { key: 'name', label: 'Name', required: true, type: 'text' },
      { key: 'difficulty_level', label: 'Difficulty', required: false, type: 'text' },
    ],
  },
  'admin.admin_users': {
    label: 'Admin Users (Bulk Invite)',
    table: 'admin.admin_users',
    mode: 'invite',
    rpc: 'invite_admin_user',
    fields: [
      { key: 'email', label: 'Email', required: true, type: 'email' },
      { key: 'role', label: 'Role', required: true, type: 'text' },
    ],
  },
  'admin.feature_flags': {
    label: 'Feature Flags',
    table: 'admin.feature_flags',
    mode: 'create',
    fields: [
      { key: 'flag_key', label: 'Flag Key', required: true, type: 'text' },
      { key: 'flag_name', label: 'Flag Name', required: true, type: 'text' },
      { key: 'applies_to', label: 'Applies To', required: false, type: 'text' },
    ],
  },
}

function splitCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

export function parseCSV(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { headers: [], rows: [], errors: ['CSV file is empty'] }
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase())
  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i])
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${values.length}`)
      continue
    }
    const row = {}
    headers.forEach((header, index) => {
      row[header] = values[index]
    })
    row.__rowNumber = i + 1
    rows.push(row)
  }

  return { headers, rows, errors }
}

export function validateImportRows(rows, schema) {
  const valid = []
  const invalid = []

  for (const row of rows) {
    const rowErrors = []
    for (const field of schema.fields) {
      const value = row[field.key]
      if (field.required && !String(value ?? '').trim()) {
        rowErrors.push(`${field.label} is required`)
      }
      if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        rowErrors.push(`${field.label} must be a valid email`)
      }
    }
    if (rowErrors.length) {
      invalid.push({ row, errors: rowErrors })
    } else {
      valid.push(row)
    }
  }

  return { valid, invalid }
}

export function generateErrorReport(invalidRows) {
  const headers = ['row_number', 'errors', ...Object.keys(invalidRows[0]?.row || {}).filter((key) => !key.startsWith('__'))]
  const csv = [
    headers.join(','),
    ...invalidRows.map(({ row, errors }) => [
      row.__rowNumber,
      JSON.stringify(errors.join('; ')),
      ...headers.slice(2).map((key) => JSON.stringify(row[key] ?? '')),
    ].join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `import_errors_${Date.now()}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
