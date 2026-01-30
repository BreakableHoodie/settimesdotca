// Test helpers for events API tests
export function createMockEvent(overrides = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    id: 1,
    slug: "summer-fest-2024",
    name: "Summer Music Festival 2024",
    date: tomorrow.toISOString().split("T")[0],
    description: "Annual multi-venue music festival",
    city: "portland",
    is_published: 1,
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

  const band = {
    id: 1,
    event_id: 1,
    venue_id: 1,
    name: "The Replacements",
    genre: "punk",
    start_time: "20:00",
    end_time: "21:00",
    description: "80s punk legends",
    origin: null,
    photo_url: null,
    social_links: null,
    ...overrides,
  };

  if (band.band_profile_id == null) {
    band.band_profile_id = band.id;
  }

  return band;
}

export function seedMockData(mockDB, events = [], venues = [], bands = []) {
  mockDB.data.events = events;
  mockDB.data.venues = venues;

  const profiles = new Map();
  const performances = [];

  bands.forEach((band) => {
    const profileId = band.band_profile_id ?? band.id;
    if (!profiles.has(profileId)) {
      profiles.set(profileId, {
        id: profileId,
        name: band.name,
        genre: band.genre,
        origin: band.origin,
        description: band.description,
        photo_url: band.photo_url,
        social_links: band.social_links,
      });
    }

    performances.push({
      id: band.performance_id ?? band.id,
      event_id: band.event_id,
      venue_id: band.venue_id,
      band_profile_id: profileId,
      start_time: band.start_time,
      end_time: band.end_time,
    });
  });

  mockDB.data.band_profiles = Array.from(profiles.values());
  mockDB.data.performances = performances;
}
