import { getSupabaseAdmin } from './lib/supabase-admin.js'
import { printDatabaseSetupHelp } from './lib/resolve-database-url.js'

const LIMIT_PER_TABLE = Math.max(parseInt(process.env.ID_GEN_BACKFILL_LIMIT || '10', 10) || 10, 1)
const TABLE_BATCH = Math.max(parseInt(process.env.ID_GEN_BACKFILL_BATCH || '25', 10) || 25, 1)

async function rpcBatch(admin, cursor) {
  return admin.rpc('backfill_zero_usage_display_ids_batch', {
    p_limit_per_table: LIMIT_PER_TABLE,
    p_table_batch_size: TABLE_BATCH,
    p_after_target_table: cursor,
    p_only_zero_usage: true,
  })
}

async function main() {
  const { client: admin, error: configError } = getSupabaseAdmin()
  if (!admin) {
    console.error(configError)
    process.exit(1)
  }

  let cursor = null
  let batchNum = 0
  let grandIds = 0
  let grandTables = 0
  let grandSkippedEmpty = 0
  let grandSkippedMissing = 0

  console.log(
    `Backfilling display IDs via Supabase RPC (${LIMIT_PER_TABLE} per table, ${TABLE_BATCH} tables per batch)...`,
  )

  while (true) {
    batchNum += 1
    const { data, error } = await rpcBatch(admin, cursor)

    if (error) {
      if (/Could not find the function|schema cache/i.test(error.message)) {
        console.error('Backfill RPC not installed yet.')
        console.error('Run the migration once in Supabase SQL Editor:')
        console.error('  SQL/v154_id_generation_display_id_backfill_seed.sql')
        console.error('')
        console.error('Or, after fixing SUPABASE_DB_URL / SUPABASE_DB_PASSWORD:')
        console.error('  pnpm run admin:migrate-id-generation-display-id-backfill')
        process.exit(1)
      }
      console.error('Backfill failed:', error.message)
      process.exit(1)
    }

    const result = data || {}
    const created = Number(result.display_ids_created ?? 0)
    const tables = Number(result.tables_backfilled ?? 0)
    const skippedEmpty = Number(result.tables_skipped_empty ?? 0)
    const skippedMissing = Number(result.tables_skipped_missing ?? 0)
    const processed = Number(result.tables_processed ?? 0)

    grandIds += created
    grandTables += tables
    grandSkippedEmpty += skippedEmpty
    grandSkippedMissing += skippedMissing

    console.log(
      `Batch ${batchNum}: +${created} IDs across ${tables} tables`
      + ` (${processed} processed, ${skippedEmpty} empty, ${skippedMissing} missing)`,
    )

    if (!result.has_more || !result.last_target_table || processed === 0) {
      break
    }

    cursor = result.last_target_table
  }

  console.log('')
  console.log('Backfill complete.')
  console.log(`  Display IDs created: ${grandIds}`)
  console.log(`  Tables backfilled:   ${grandTables}`)
  console.log(`  Skipped (empty):     ${grandSkippedEmpty}`)
  console.log(`  Skipped (missing):   ${grandSkippedMissing}`)
  console.log('')
  console.log('Re-run to backfill more tables that still show 0% usage, or increase ID_GEN_BACKFILL_LIMIT.')
}

main().catch((error) => {
  console.error('Backfill failed:', error.message)
  printDatabaseSetupHelp()
  process.exit(1)
})
