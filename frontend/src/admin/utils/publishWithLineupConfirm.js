/**
 * Publishing an event, with the empty-lineup confirmation.
 *
 * `POST /api/admin/events/:id/publish` is the only route that checks whether an
 * event has a lineup before making it public. It rejects an empty one with
 * `code: "EMPTY_LINEUP"`, which is *not* a hard error -- "Lineup TBA" is a
 * supported published state (announcing an event before booking completes, to
 * start accruing SEO runway). The override exists so a human can say yes
 * deliberately.
 *
 * This lives in one place because two call sites need it and they used to
 * disagree (#821): the Events-list publish toggle asked, while saving the edit
 * form with status "published" went through PATCH, which has no lineup check at
 * all -- so the same transition prompted or didn't depending on which control
 * you used. Duplicating the confirm would have let the copy and the retry drift
 * apart again.
 *
 * Detection is on the machine-readable `code`, never `err.message` text, so it
 * survives copy changes to the server's message.
 */

/**
 * @param {object} eventsApi - the adminApi events client (injected for testing)
 * @param {{id: number|string, name: string}} event
 * @param {object} [options]
 * @param {(message: string) => boolean} [options.confirm] - defaults to window.confirm
 * @returns {Promise<{published: boolean, cancelled?: boolean, emptyLineup?: boolean}>}
 *   `cancelled: true` means the user declined the empty-lineup prompt -- the
 *   event is untouched and this is NOT an error. Any other failure throws.
 */
export async function publishWithLineupConfirm(eventsApi, event, options = {}) {
  const confirm = options.confirm || (typeof window !== 'undefined' ? window.confirm.bind(window) : () => false)

  try {
    await eventsApi.setPublishState(event.id, true)
    return { published: true }
  } catch (err) {
    if (err?.details?.code !== 'EMPTY_LINEUP') {
      throw err
    }

    const confirmed = confirm(
      `"${event.name}" has no bands yet. Publishing now will make the event page public immediately, showing "Lineup TBA" until a lineup is added. Continue?`
    )
    if (!confirmed) {
      return { published: false, cancelled: true }
    }

    await eventsApi.setPublishState(event.id, true, { allowEmptyLineup: true })
    return { published: true, emptyLineup: true }
  }
}
