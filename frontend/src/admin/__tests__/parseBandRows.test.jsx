import { describe, expect, it } from 'vitest'
import { parseBandRows } from '../utils/parseBandRows'

describe('parseBandRows', () => {
  it('parses comma-separated lines into band rows', () => {
    const rows = parseBandRows('Alpha, 20:00, 21:00, The Hall, rock\nBeta, 21:00, 22:00, The Hall, jazz')
    expect(rows).toEqual([
      {
        name: 'Alpha',
        start_time: '20:00',
        end_time: '21:00',
        venue: 'The Hall',
        genre: 'rock',
      },
      {
        name: 'Beta',
        start_time: '21:00',
        end_time: '22:00',
        venue: 'The Hall',
        genre: 'jazz',
      },
    ])
  })

  it('trims whitespace and skips blank lines', () => {
    const rows = parseBandRows('  Solo Act , 18:00 , 19:00 , Park , folk \n\n   \n')
    expect(rows).toEqual([
      {
        name: 'Solo Act',
        start_time: '18:00',
        end_time: '19:00',
        venue: 'Park',
        genre: 'folk',
      },
    ])
  })

  it('skips lines with no band name', () => {
    const rows = parseBandRows(', 20:00, 21:00, Hall, rock\nReal Band, 21:00, 22:00, Hall, rock')
    expect(rows).toEqual([
      {
        name: 'Real Band',
        start_time: '21:00',
        end_time: '22:00',
        venue: 'Hall',
        genre: 'rock',
      },
    ])
  })

  it('tolerates missing trailing fields', () => {
    const rows = parseBandRows('Just A Name')
    expect(rows).toEqual([
      {
        name: 'Just A Name',
        start_time: '',
        end_time: '',
        venue: '',
        genre: '',
      },
    ])
  })
})
