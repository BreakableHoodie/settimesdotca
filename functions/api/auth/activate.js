export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  let token;
  try {
    const body = await request.json();
    token = body?.token;
  } catch (_error) {
    token = null;
  }

  if (!token || typeof token !== "string") {
    return new Response(
      JSON.stringify({
        error: "Invalid token",
        message: "Activation token is required",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const user = await DB.prepare(
      `
      SELECT id, email, first_name, last_name, is_active,
             activation_token_expires_at, activated_at
      FROM users
      WHERE activation_token = ?
    `
    )
      .bind(token)
      .first();

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Invalid or expired token",
          message:
            "This activation link is invalid or has expired. Please request a new one.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (
      user.activation_token_expires_at &&
      new Date(user.activation_token_expires_at) < new Date()
    ) {
      return new Response(
        JSON.stringify({
          error: "Activation link expired",
          message: "This activation link has expired. Please request a new one.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (user.is_active === 1 && user.activated_at) {
      return new Response(
        JSON.stringify({
          error: "Already activated",
          message: "This account has already been activated. You can log in.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await DB.prepare(
      `
      UPDATE users
      SET is_active = 1,
          activated_at = datetime('now'),
          activation_token = NULL,
          activation_token_expires_at = NULL
      WHERE id = ?
    `
    )
      .bind(user.id)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account activated successfully. You can now log in.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Account activation error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to activate account",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
