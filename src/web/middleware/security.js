import crypto from 'crypto';

/**
 * Adds basic security headers to dashboard responses.
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
}

/**
 * Creates a CSRF token for the current session.
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
 * createApp.js expects an export named csrfToken.
 * This uses the same middleware as attachCsrf.
 */
export const csrfToken = attachCsrf;

/**
 * Checks CSRF token for forms / dashboard actions.
 */
export function verifyCsrf(req, res, next) {
  const sessionToken = req.session?.csrfToken;

  const suppliedToken =
    req.body?._csrf ||
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'] ||
    req.query?._csrf;

  if (!sessionToken || !suppliedToken) {
    return res.status(403).json({
      success: false,
      message: 'Missing CSRF token.'
    });
  }

  const sessionBuffer = Buffer.from(String(sessionToken));
  const suppliedBuffer = Buffer.from(String(suppliedToken));

  if (
    sessionBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(sessionBuffer, suppliedBuffer)
  ) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token.'
    });
  }

  next();
}

/**
 * Requires the user to be logged in through Discord OAuth.
 */
export function ensureAuthenticated(req, res, next) {
  const authenticated =
    typeof req.isAuthenticated === 'function'
      ? req.isAuthenticated()
      : Boolean(req.user);

  if (authenticated && req.user) {
    return next();
  }

  if (req.accepts('html')) {
    return res.redirect('/auth/discord');
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required.'
  });
}

/**
 * Alias used by some parts of the dashboard.
 */
export const requireAuth = ensureAuthenticated;

/**
 * Requires access to the configured Discord guild.
 *
 * The exact user object can differ depending on how OAuth is implemented,
 * so this supports several common properties.
 */
export function ensureGuildAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const accessFlags = [
    req.user.guildAccess,
    req.user.inGuild,
    req.user.isGuildMember
  ];

  if (accessFlags.includes(true)) {
    return next();
  }

  /*
   * If the OAuth layer does not attach a guild-access property,
   * allow the request to continue so the app's later permission/database
   * checks can handle authorization.
   */
  if (accessFlags.every(value => value === undefined)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'You do not have access to this Discord server.'
  });
}

/**
 * Requires administrator permission for dashboard routes.
 */
export function ensureWebAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const permissions = Array.isArray(req.user.permissions)
    ? req.user.permissions
    : [];

  const isAdmin =
    req.user.isAdmin === true ||
    req.user.webAdmin === true ||
    req.user.admin === true ||
    permissions.includes('ADMIN') ||
    permissions.includes('ADMINISTRATOR');

  if (isAdmin) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Administrator permission required.'
  });
}

/**
 * LCSO rank hierarchy.
 */
const WEB_RANKS = [
  'Cadet',
  'Deputy Sheriff',
  'Senior Deputy',
  'Corporal',
  'Sergeant',
  'Lieutenant',
  'Captain',
  'Assistant Sheriff',
  'Undersheriff',
  'Sheriff'
];

/**
 * Requires a specified LCSO rank or higher.
 *
 * Usage:
 * router.get('/example', ensureWebRank('Sergeant'), handler);
 */
export function ensureWebRank(requiredRank) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    const userRank =
      req.user.rank ||
      req.user.deputy?.rank ||
      req.user.profile?.rank;

    const requiredIndex = WEB_RANKS.indexOf(requiredRank);
    const userIndex = WEB_RANKS.indexOf(userRank);

    if (requiredIndex === -1) {
      return res.status(500).json({
        success: false,
        message: `Unknown required rank: ${requiredRank}`
      });
    }

    if (userIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'Your LCSO rank could not be verified.'
      });
    }

    if (userIndex >= requiredIndex) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `${requiredRank} or higher is required.`
    });
  };
}
