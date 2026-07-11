let seq = 0

export function testTag(prefix = 'TST') {
  seq += 1
  return `[TEST] ${prefix}-${Date.now()}-${seq}`
}

export function randomCode(length = 3) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let out = ''
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function randomEmail(domain = 'nidus-test.local') {
  return `test-${Date.now()}-${seq}@${domain}`
}

export function futureDate(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function pastDate(days = 30) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
