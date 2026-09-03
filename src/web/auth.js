import passport from 'passport';
import passportDiscord from 'passport-discord';
const { Strategy: DiscordStrategy } = passportDiscord;
import { env } from '../config/env.js';

export function configurePassport() {
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  passport.use(new DiscordStrategy({
    clientID: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    callbackURL: env.DISCORD_CALLBACK_URL,
    scope: ['identify'],
    state: true,
  }, (_accessToken, _refreshToken, profile, done) => {
    done(null, {
      id: profile.id,
      username: profile.username,
      globalName: profile.global_name || profile.username,
      avatar: profile.avatar,
    });
  }));
  return passport;
}
