export function validatePassword(password) {
  const errors = []
  if (!password || password.length < 12) errors.push('At least 12 characters')
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter')
  if (!/[0-9]/.test(password)) errors.push('One number')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('One special character')
  return { valid: errors.length === 0, errors }
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
