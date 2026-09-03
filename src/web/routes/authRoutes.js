import { Router } from 'express';
import passport from 'passport';
import { verifyCsrf } from '../middleware/security.js';

export function authRoutes() {
  const router = Router();
  router.get('/discord', passport.authenticate('discord'));
  router.get('/discord/callback', passport.authenticate('discord', { failureRedirect: '/?login=failed' }), (_req, res) => res.redirect('/dashboard'));
  router.post('/logout', verifyCsrf, (req, res, next) => {
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy(() => res.redirect('/'));
    });
  });
  return router;
}
