export function parseOrigin(origin) {
  if (!origin) return { city: null, region: null };
  const [city, region] = origin.split(",").map((part) => part.trim());
  return { city: city || null, region: region || null };
}
