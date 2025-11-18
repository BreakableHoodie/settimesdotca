/**
 * Historical Event Data Import Script
 * Fetches event data from TicketScene URLs and populates the database
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const eventUrls = [
  'https://ticketscene.ca/events/55263/', // Volume 14 - Oct 12, 2025
  'https://ticketscene.ca/events/53281/',
  'https://ticketscene.ca/events/51379/',
  'https://ticketscene.ca/events/45243/',
  'https://ticketscene.ca/events/50533/',
  'https://ticketscene.ca/events/49329/',
  'https://ticketscene.ca/events/48517/',
  'https://ticketscene.ca/events/47573/',
  'https://ticketscene.ca/events/46772/',
  'https://ticketscene.ca/events/45872/',
]

async function fetchEventData(url) {
  console.log(`Fetching: ${url}`)
  const response = await fetch(url)
  const html = await response.text()

  // Extract event name (e.g., "LONG WEEKEND BAND CRAWL - VOLUME 14")
  const nameMatch = html.match(/LONG WEEKEND BAND CRAWL[^<\n]*/i)
  const name = nameMatch ? nameMatch[0].trim() : null

  // Extract date - try multiple patterns
  // Pattern 1: "Sunday, August 3, 2025" (from <p><strong>)
  let dateMatch = html.match(/<strong>(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+([A-Za-z]+\s+\d+,\s+\d{4})<\/strong>/i)
  // Pattern 2: "SUNDAY OCTOBER 12, 2025" (all caps)
  if (!dateMatch) {
    dateMatch = html.match(/(?:SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+([A-Z]+\s+\d+,\s+\d{4})/i)
  }
  const dateStr = dateMatch ? dateMatch[1] : null
  const date = dateStr ? new Date(dateStr) : null

  // Extract venues (lines starting with "- " followed by venue name and address)
  const venuesSection = html.match(/Participating venues:[\s\S]*?(?=All tickets|Tickets available|NOTE:|Thank you)/i)
  const venues = []
  if (venuesSection) {
    const venueMatches = venuesSection[0].matchAll(/- ([^(]+)\(([^)]+)\)/g)
    for (const match of venueMatches) {
      venues.push({
        name: match[1].trim(),
        address: match[2].trim()
      })
    }
  }

  // Extract bands (after "Featuring:" line until "Participating venues:")
  const featuringMatch = html.match(/Featuring:\s*([^]+?)(?=Participating venues:|All tickets|Tickets available)/i)
  let bands = []
  if (featuringMatch) {
    // Split by commas and clean up
    bands = featuringMatch[1]
      .replace(/\n/g, ' ')
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0 && b.length < 100) // Filter out very long strings
  }

  return {
    url,
    name,
    date: date ? date.toISOString().split('T')[0] : null,
    venues,
    bands,
    is_published: true // Historical events are already published
  }
}

async function generateSqlInserts(events) {
  const sql = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const eventNum = i + 1

    if (!event.name || !event.date) {
      console.warn(`Skipping event ${event.url} - missing name or date`)
      continue
    }

    // Insert event
    // Generate slug from name
    const slug = event.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)

    sql.push(`-- Event: ${event.name}`)
    sql.push(`INSERT OR IGNORE INTO events (name, date, slug, is_published) VALUES (`)
    sql.push(`  '${event.name.replace(/'/g, "''")}',`)
    sql.push(`  '${event.date}',`)
    sql.push(`  '${slug}',`)
    sql.push(`  1`)
    sql.push(`);`)
    sql.push(``)

    // Insert venues and get their IDs
    for (let v = 0; v < event.venues.length; v++) {
      const venue = event.venues[v]
      sql.push(`INSERT OR IGNORE INTO venues (name, address) VALUES (`)
      sql.push(`  '${venue.name.replace(/'/g, "''")}',`)
      sql.push(`  '${venue.address.replace(/'/g, "''")}'`)
      sql.push(`);`)
    }
    sql.push(``)

    // Insert performers (bands)
    for (let b = 0; b < event.bands.length; b++) {
      const band = event.bands[b]
      sql.push(`INSERT OR IGNORE INTO performers (name) VALUES (`)
      sql.push(`  '${band.replace(/'/g, "''")}'`)
      sql.push(`);`)
    }
    sql.push(``)
    sql.push(`-- End of ${event.name}`)
    sql.push(``)
  }

  return sql.join('\n')
}

async function main() {
  console.log('🎸 Fetching historical Long Weekend Band Crawl events...\n')

  const events = []
  for (const url of eventUrls) {
    try {
      const eventData = await fetchEventData(url)
      events.push(eventData)
      console.log(`✅ ${eventData.name || 'Unknown Event'}`)
      console.log(`   Date: ${eventData.date || 'Unknown'}`)
      console.log(`   Venues: ${eventData.venues.length}`)
      console.log(`   Bands: ${eventData.bands.length}\n`)
    } catch (error) {
      console.error(`❌ Failed to fetch ${url}: ${error.message}\n`)
    }
  }

  console.log('\n📝 Generating SQL...\n')
  const sql = await generateSqlInserts(events)

  // Write to file
  const outputPath = path.join(__dirname, '..', 'database', 'historical-events.sql')

  fs.writeFileSync(outputPath, sql)
  console.log(`✅ SQL written to: ${outputPath}`)
  console.log(`\n🚀 To import, run: wrangler d1 execute bandcrawl-db --local --file=database/historical-events.sql`)
  console.log(`\nEvents processed: ${events.length}`)
  console.log(`Events with complete data: ${events.filter(e => e.name && e.date).length}`)
}

main().catch(console.error)
