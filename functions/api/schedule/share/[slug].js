// Public API: Fetch a schedule share link snapshot
// GET /api/schedule/share/[slug]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const { DB } = env;
  const { slug } = params;

  if (!slug || !/^[a-zA-Z0-9]{1,16}$/.test(slug)) {
    return json({ error: "Invalid slug" }, 400);
  }

  try {
    // ON DELETE CASCADE on event_id means a deleted event also removes its share_links rows,
    // so a missing event naturally produces a 404 via the INNER JOIN returning no row.
    const row = await DB.prepare(
      `SELECT sl.slug, sl.event_slug, sl.performance_ids, sl.band_names, e.name AS event_name
       FROM share_links sl
       JOIN events e ON e.id = sl.event_id AND (e.is_published = 1 OR e.status = 'archived')
       WHERE sl.slug = ? AND sl.expires_at > datetime('now')`,
    )
      .bind(slug)
      .first();

    if (!row) {
      return json({ error: "Share link not found or expired" }, 404);
    }

    // Best-effort view counter — a counter failure must never break share
    // retrieval, but we log (not silently swallow) so write failures stay visible.
    // The import refetch (App.jsx adds ?import=1) re-fetches the same snapshot to
    // apply it after the preview already counted, so it must NOT count again —
    // only genuine preview views (SharePreviewPage, no flag) increment.
    const isImportRefetch = new URL(request.url).searchParams.get("import") === "1";
    if (!isImportRefetch) {
      try {
        await DB.prepare("UPDATE share_links SET view_count = view_count + 1 WHERE slug = ?").bind(slug).run();
      } catch (err) {
        console.error("Share link view-count increment failed:", slug, err);
      }
    }

    let performance_ids, band_names;
    try {
      performance_ids = JSON.parse(row.performance_ids);
      band_names = JSON.parse(row.band_names);
    } catch (_err) {
      console.error("Share link data is corrupted:", row.slug);
      return json({ error: "Share link data is corrupted" }, 500);
    }

    // Resolve set times and venues for the shared performances. `performance_ids`
    // is the snapshot taken when the link was created, so everything the preview
    // needs is recoverable without storing it twice.
    //
    // `performance_ids` and `band_names` are deliberately returned unchanged:
    // App.jsx re-fetches this endpoint with `?import=1` to APPLY a shared route
    // and reads those two fields. `bands` is purely additive.
    let bands = band_names.map((name, i) => ({
      performance_id: performance_ids[i] ?? null,
      name,
      start_time: null,
      end_time: null,
      venue: null,
      performance_date: null,
    }));

    if (performance_ids.length > 0) {
      // Bind ids as placeholders — never interpolate them into SQL. The array is
      // length-capped on the write path (MAX_PERFORMANCE_IDS in ../share.js).
      const placeholders = performance_ids.map(() => "?").join(",");
      const detail = await DB.prepare(
        `SELECT p.id AS performance_id, bp.name AS name, p.start_time, p.end_time,
                p.performance_date, v.name AS venue
         FROM performances p
         JOIN band_profiles bp ON bp.id = p.band_profile_id
         LEFT JOIN venues v ON v.id = p.venue_id
         WHERE p.id IN (${placeholders})`,
      )
        .bind(...performance_ids)
        .all();

      const byId = new Map((detail.results || []).map((r) => [r.performance_id, r]));
      // Fall back to the stored name when a performance has been removed from the
      // lineup since the link was shared — dropping it would make the list
      // disagree with the "N-stop route" count the page renders.
      bands = performance_ids.map((id, i) => {
        const found = byId.get(id);
        return {
          performance_id: id,
          name: found?.name ?? band_names[i] ?? "Unknown artist",
          start_time: found?.start_time ?? null,
          end_time: found?.end_time ?? null,
          venue: found?.venue ?? null,
          performance_date: found?.performance_date ?? null,
        };
      });
    }

    return json({
      slug: row.slug,
      event_slug: row.event_slug,
      event_name: row.event_name,
      performance_ids,
      band_names,
      bands,
    });
  } catch (err) {
    console.error("Share link fetch error:", err);
    return json({ error: "Failed to fetch share link" }, 500);
  }
}
