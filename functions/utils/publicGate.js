const ENABLE_VALUES = new Set(["true", "1", "yes", "on"]);

export function isPublicDataEnabled(env) {
  const value = env?.PUBLIC_DATA_PUBLISH_ENABLED;
  if (value === undefined || value === null || value === "") {
    return true;
  }
  return ENABLE_VALUES.has(String(value).toLowerCase());
}

export function getPublicDataGateResponse(env) {
  if (isPublicDataEnabled(env)) {
    return null;
  }

  return new Response(
    JSON.stringify({
      error: "Public data is not yet published",
      message: "Event data will be available once publishing is enabled.",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "3600",
      },
    },
  );
}
