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
 * Alias expected by createApp.js.
 */
export const csrfToken = attachCsrf;

/**
 * Checks CSRF tokens on dashboard actions.
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

  if (req.accepts?.('html')) {
    return res.redirect('/auth/discord');
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required.'
  });
}

/**
 * Alias used by some routes.
 */
export const requireAuth = ensureAuthenticated;

/**
 * Requires the logged-in Discord account to belong to the configured guild.
 *
 * Usage:
 * ensureGuildAccess(client)
 */
export function ensureGuildAccess(client) {
  return async function guildAccessMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      const guildId = process.env.DISCORD_GUILD_ID;

      if (!guildId) {
        console.error('[Security] DISCORD_GUILD_ID is missing.');

        return res.status(500).json({
          success: false,
          message: 'Discord server is not configured.'
        });
      }

      let guild = client?.guilds?.cache?.get(guildId);

      if (!guild && client?.guilds?.fetch) {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!guild) {
        console.error(
          `[Security] Could not access configured guild: ${guildId}`
        );

        return res.status(500).json({
          success: false,
          message: 'Configured Discord server could not be found.'
        });
      }

      const discordId =
        req.user.id ||
        req.user.discordId ||
        req.user.discord_id;

      if (!discordId) {
        return res.status(403).json({
          success: false,
          message: 'Unable to identify your Discord account.'
        });
      }

      const member = await guild.members.fetch(discordId).catch(() => null);

      if (!member) {
        return res.status(403).json({
          success: false,
          message: 'You must be a member of the LCSO Discord server.'
        });
      }

      req.discordMember = member;

      next();
    } catch (error) {
      console.error('[Security] Guild access check failed:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to verify Discord server access.'
      });
    }
  };
}

/**
 * Requires dashboard admin permissions.
 *
 * Can be used as:
 * ensureWebAdmin
 * or
 * ensureWebAdmin()
 */
export function ensureWebAdmin(req, res, next) {
  if (arguments.length === 0) {
    return function adminMiddleware(innerReq, innerRes, innerNext) {
      return ensureWebAdmin(innerReq, innerRes, innerNext);
    };
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  const permissions = Array.isArray(req.user.permissions)
    ? req.user.permissions
    : [];

  const memberPermissions = req.discordMember?.permissions;

  const isAdmin =
    req.user.isAdmin === true ||
    req.user.webAdmin === true ||
    req.user.admin === true ||
    permissions.includes('ADMIN') ||
    permissions.includes('ADMINISTRATOR') ||
    memberPermissions?.has?.('Administrator');

  if (isAdmin) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Administrator permission required.'
  });
}

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
 * Example:
 * ensureWebRank('Sergeant')
 */
export function ensureWebRank(requiredRank) {
  return function rankMiddleware(req, res, next) {
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
      console.error(
        `[Security] Unknown required dashboard rank: ${requiredRank}`
      );

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
