import crypto from 'crypto';

/**
 * Makes sure every dashboard session has a CSRF token.
 * The token is also exposed to templates through res.locals.csrfToken.
 */
export function attachCsrf(req, res, next) {
  if (!req.session) {
    return res.status(500).json({
      success: false,
      message: 'Session middleware is not initialized.'
    });
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/**
 * Verifies CSRF tokens on state-changing dashboard requests.
 */
export function verifyCsrf(req, res, next) {
  if (!req.session?.csrfToken) {
    return res.status(403).json({
      success: false,
      message: 'Missing CSRF session token.'
    });
  }

  const suppliedToken =
    req.body?._csrf ||
    req.headers['x-csrf-token'] ||
    req.query?._csrf;

  if (!suppliedToken || suppliedToken !== req.session.csrfToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token.'
    });
  }

  next();
}

/**
 * Basic security headers for the dashboard.
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
}

/**
 * Requires a logged-in Discord dashboard session.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  next();
}
