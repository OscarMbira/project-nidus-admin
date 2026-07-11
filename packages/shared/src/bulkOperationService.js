export async function executeBulkOperation({
  items = [],
  operation,
  onProgress,
  signal,
}) {
  const succeeded = []
  const failed = []
  const errors = []

  for (let index = 0; index < items.length; index += 1) {
    if (signal?.aborted) break
    const item = items[index]
    try {
      const result = await operation(item, index)
      if (result?.error) {
        failed.push(item)
        errors.push({ item, error: result.error })
      } else {
        succeeded.push(item)
      }
    } catch (error) {
      failed.push(item)
      errors.push({ item, error: error?.message || String(error) })
    }
    onProgress?.({ current: index + 1, total: items.length, item })
  }

  return { succeeded, failed, errors, cancelled: Boolean(signal?.aborted) }
}
