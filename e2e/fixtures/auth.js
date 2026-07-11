import { test as base, expect } from '@playwright/test'
import { loadAdminStorageState } from '../helpers/auth-storage.js'

export const test = base.extend({
  context: async ({ _contextFactory, storageState }, use) => {
    const { context, close } = await _contextFactory()
    await loadAdminStorageState(context, storageState)
    await use(context)
    await close()
  },
})

export { expect }
