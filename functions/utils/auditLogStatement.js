export function auditLogStatement(env, userId, action, resourceType, resourceId, details, ipAddress) {
  return env.DB.prepare(
    `
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).bind(
    userId,
    action,
    resourceType || null,
    resourceId || null,
    details ? JSON.stringify(details) : null,
    ipAddress || "unknown",
  );
}
