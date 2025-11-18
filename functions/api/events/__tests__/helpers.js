// Test helpers for events API tests
export function createMockEvent(overrides = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    id: 1,
    slug: "long-weekend-2024",
    name: "Long Weekend Band Crawl 2024",
    date: tomorrow.toISOString().split("T")[0],
    description: "The annual multi-venue music festival",
    city: "portland",
    published: true,
    ...overrides,
  };
}

export function createMockVenue(overrides = {}) {
  return {
    id: 1,
    event_id: 1,
    name: "The Analog Cafe",
    address: "720 SE Hawthorne Blvd",
    city: "portland",
    ...overrides,
  };
}

export function createMockBand(overrides = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    id: 1,
    event_id: 1,
    venue_id: 1,
    name: "The Replacements",
    genre: "punk",
    start_time: "20:00",
    end_time: "21:00",
    description: "80s punk legends",
    ...overrides,
  };
}

export function seedMockData(mockDB, events = [], venues = [], bands = []) {
  mockDB.data.events = events;
  mockDB.data.venues = venues;
  mockDB.data.bands = bands;
}

