export function parseOrigin(origin) {
  if (!origin) return { city: '', region: '' };
  const [city, region] = origin.split(',').map(part => part.trim());
  return { city: city || '', region: region || '' };
}
