#!/usr/bin/env node
import { access, constants, readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()

const FILE_RULES = [
  {
    path: 'database/schema.sql',
    tables: ['events', 'venues', 'bands'],
  },
  {
    path: 'database/schema-v2.sql',
    tables: ['events', 'venues', 'band_profiles', 'performances'],
  },
]

async function ensureFile(rule) {
  const target = path.join(rootDir, rule.path)
  await access(target, constants.F_OK)
  const sql = await readFile(target, 'utf8')
  if (!sql.trim()) {
    throw new Error(`${rule.path} is empty`)
  }

  const missingTables = rule.tables.filter(table => !hasCreateTable(sql, table))
  if (missingTables.length) {
    throw new Error(
      `${rule.path} is missing required tables: ${missingTables.join(', ')}. ` +
        'Run the latest migrations and regenerate the schema file.'
    )
  }

  return { file: rule.path, tables: rule.tables.length }
}

function hasCreateTable(sql, table) {
  const pattern = new RegExp(`CREATE\\s+TABLE[^;]*\\b${table}\\b`, 'i')
  return pattern.test(sql)
}

async function main() {
  try {
    const summaries = []
    for (const rule of FILE_RULES) {
      summaries.push(await ensureFile(rule))
    }

    console.log('✅ Database schema validated:')
    for (const summary of summaries) {
      console.log(`  • ${summary.file} (${summary.tables} required tables present)`) 
    }
  } catch (error) {
    console.error('❌ Schema validation failed:')
    console.error(error.message)
    process.exit(1)
  }
}

main()
