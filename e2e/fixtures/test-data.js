import { test as base } from './auth.js'
import * as factories from '../factories/index.js'

export const test = base.extend({
  factory: async ({}, use) => {
    await use(factories)
  },
})

export { expect } from '@playwright/test'
