// Admin event editing endpoint
// PUT /api/admin/events/{id}/edit
// Body: { name, date, slug }
// Returns: { success: true, event: {...} } or error

import { checkPermission, auditLog } from "../../_middleware.js"
import { getClientIP } from "../../../../utils/request.js"

export async function onRequestPut(context) {
  const { request, env, params } = context
  const { DB } = env
  const eventId = params.id
  const ipAddress = getClientIP(request)

  try {
    const auth = await checkPermission(context, "editor")
    if (auth.error) {
      return auth.response
    }

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Invalid event ID'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { name, date, slug, ticket_link } = body

    // Validation
    if (!name || !date || !slug) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: 'Name, date, and slug are required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate ticket_link URL if provided
    if (ticket_link && !ticket_link.match(/^https?:\/\//)) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: 'Ticket link must be a valid URL starting with http:// or https://'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if event exists
    const existingEvent = await DB.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).bind(eventId).first()

    if (!existingEvent) {
      return new Response(
        JSON.stringify({
          error: 'Not found',
          message: 'Event not found'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if slug is already taken by another event
    if (slug !== existingEvent.slug) {
      const slugCheck = await DB.prepare(
        'SELECT id FROM events WHERE slug = ? AND id != ?'
      ).bind(slug, eventId).first()

      if (slugCheck) {
        return new Response(
          JSON.stringify({
            error: 'Conflict',
            message: 'An event with this slug already exists'
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Update event
    const result = await DB.prepare(
      `
      UPDATE events
      SET name = ?, date = ?, slug = ?, ticket_link = ?
      WHERE id = ?
      RETURNING *
    `
    )
      .bind(name, date, slug, ticket_link || null, eventId)
      .first()

    await auditLog(
      env,
      auth.user.userId,
      "event.updated",
      "event",
      eventId,
      {
        name,
        date,
        slug,
        ticket_link: ticket_link || null,
      },
      ipAddress
    )

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: 'Event updated successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Event edit error:', error)
    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Failed to update event'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
