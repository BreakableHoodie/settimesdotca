// The "two-factor authentication was turned on" notice (#1318). Fire-and-forget:
// the enrolment has already committed, so nothing here may fail or alter the
// response. The returned promise never rejects.

import { isEmailConfigured, sendEmail } from "./email.js";
import { buildMfaEnabledEmail } from "./emailTemplates.js";

export function notifyMfaEnabled(env, { to, recipientName, ipAddress, isReEnrolment }) {
  if (!to || !isEmailConfigured(env)) {
    return Promise.resolve();
  }
  return (async () => {
    const message = buildMfaEnabledEmail({
      recipientName,
      enabledAt: new Date(),
      ipAddress,
      isReEnrolment,
    });
    const result = await sendEmail(env, { to, ...message });
    if (!result?.delivered) {
      console.warn("[MFA Enable] Enrolment notice not delivered:", result?.reason);
    }
  })().catch((error) => {
    console.error("[MFA Enable] Failed to send enrolment notice:", error?.message || error);
  });
}

// Hand the send to the platform when it offers waitUntil, so the Worker stays
// alive after the response; otherwise (tests, local) let the caller await it.
export async function dispatchNotice(context, promise) {
  if (typeof context.waitUntil === "function") {
    context.waitUntil(promise);
    return;
  }
  await promise;
}
