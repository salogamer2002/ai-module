/**
 * @author Muhammad Salman - AI Engineer
 * @date 2026-06-21
 * @reason Authentication middleware for the AI-Chatbot backend.
 *         Implements API key validation for all chatbot endpoints.
 *         Wire up JWT/session validation once iHealth repo access is granted.
 */

/**
 * Validate API key from request headers.
 * Checks the X-API-Key header or Authorization: Bearer <key> against CHATBOT_API_KEY.
 * Skips validation for health check endpoints.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function authenticateUser(req, res, next) {
  // Skip auth for health endpoints
  if (req.path === "/health" || req.path === "/api/health" || req.path === "/api/v1/chatbot/health") {
    return next();
  }

  const apiKey = process.env.CHATBOT_API_KEY;

  // If no API key is configured, allow passthrough (dev mode)
  if (!apiKey) {
    return next();
  }

  // Check X-API-Key header first, then Authorization: Bearer
  const providedKey =
    req.headers["x-api-key"] ||
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (!providedKey) {
    return res.status(401).json({
      error: "Authentication required. Provide X-API-Key header or Authorization: Bearer <key>.",
    });
  }

  // Constant-time comparison to prevent timing attacks
  const keyBuffer = Buffer.from(apiKey);
  const providedBuffer = Buffer.from(providedKey);

  if (keyBuffer.length !== providedBuffer.length || !require("crypto").timingSafeEqual(keyBuffer, providedBuffer)) {
    return res.status(403).json({ error: "Invalid API key." });
  }

  next();
}

/**
 * Authorize by role middleware (placeholder).
 * @param  {...string} roles - Allowed roles
 * @returns {function} Express middleware
 */
function authorizeRole(...roles) {
  return (req, res, next) => {
    // TODO: Check req.user.role against allowed roles when JWT is integrated
    // if (!req.user || !roles.includes(req.user.role)) {
    //   return res.status(403).json({ error: 'Insufficient permissions' });
    // }
    next();
  };
}

/**
 * Extract user ID from request (placeholder).
 * @param {object} req - Express request
 * @returns {string|null} User ID
 */
function getUserId(req) {
  // TODO: Extract from JWT payload after auth integration
  // return req.user?.id || null;
  return req.headers["x-user-id"] || req.query.userId || null;
}

module.exports = {
  authenticateUser,
  authorizeRole,
  getUserId,
};
