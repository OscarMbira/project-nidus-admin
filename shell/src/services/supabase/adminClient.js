import { getAdminDb, getPublicDb, getSimDb } from '@nidus-admin/shared'

export const adminDb = getAdminDb()
export const publicDb = getPublicDb()
export const simDb = getSimDb()

export default adminDb
