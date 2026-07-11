import QRCode from 'qrcode'
import { adminDb } from './supabase/adminClient.js'

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const APP_NAME = 'Nidus Console'

function base32Encode(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let result = ''
  for (let i = 0; i < bits.length; i += 5) {
    result += BASE32_CHARS[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  }
  return result
}

function base32Decode(str) {
  let bits = ''
  for (const c of str.toUpperCase().replace(/=+$/, '')) {
    const idx = BASE32_CHARS.indexOf(c)
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0')
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

async function hmacSha1(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

async function computeTotp(secret, timeStep) {
  const key = base32Decode(secret)
  const time = new DataView(new ArrayBuffer(8))
  time.setUint32(4, timeStep)
  const hmac = await hmacSha1(key, time.buffer)
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000
  return code.toString().padStart(6, '0')
}

export function generateTotpSecret(email) {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  const secret = base32Encode(bytes)
  const otpauth = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(APP_NAME)}&algorithm=SHA1&digits=6&period=30`
  return { secret, otpauth }
}

export async function generateQrDataUrl(otpauth) {
  return QRCode.toDataURL(otpauth, { width: 200, margin: 2, color: { dark: '#e5e7eb', light: '#111827' } })
}

export async function verifyTotpCode(secret, token) {
  const cleanToken = String(token).replace(/\s/g, '')
  const timeStep = Math.floor(Date.now() / 1000 / 30)
  for (let i = -1; i <= 1; i++) {
    if (await computeTotp(secret, timeStep + i) === cleanToken) return true
  }
  return false
}

export function generateBackupCodes(count = 10) {
  const codes = []
  for (let i = 0; i < count; i++) {
    const part = crypto.getRandomValues(new Uint32Array(2))
    codes.push(`${part[0].toString(36)}-${part[1].toString(36)}`.toUpperCase().slice(0, 9))
  }
  return codes
}

async function hashCode(code) {
  const data = new TextEncoder().encode(code)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function saveBackupCodes(adminUserId, plainCodes) {
  const hashed = await Promise.all(
    plainCodes.map(async (code) => ({ hash: await hashCode(code), used_at: null })),
  )
  await adminDb.from('admin_users').update({ backup_codes: hashed }).eq('id', adminUserId)
  return plainCodes
}

export async function verifyBackupCode(adminUserId, code) {
  const { data } = await adminDb.from('admin_users').select('backup_codes').eq('id', adminUserId).single()
  if (!data?.backup_codes?.length) return false
  const inputHash = await hashCode(code)
  const codes = [...data.backup_codes]
  const idx = codes.findIndex((c) => c.hash === inputHash && !c.used_at)
  if (idx < 0) return false
  codes[idx] = { ...codes[idx], used_at: new Date().toISOString() }
  await adminDb.from('admin_users').update({ backup_codes: codes }).eq('id', adminUserId)
  return true
}

export async function saveTotpSecret(adminUserId, secret) {
  return adminDb.from('admin_users').update({
    totp_secret: secret,
    is_2fa_configured: true,
  }).eq('id', adminUserId)
}

export async function getTotpSecret(adminUserId) {
  const { data } = await adminDb.from('admin_users').select('totp_secret').eq('id', adminUserId).single()
  return data?.totp_secret || null
}
