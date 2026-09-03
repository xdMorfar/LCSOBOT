# LCSO ERLC Discord Bot

Production-oriented Discord.js v14 bot and Express staff dashboard for a Liberty County Sheriff's Office roleplay community in Emergency Response: Liberty County.

## Included systems

- Deputy profiles, ranks, badges, join dates and roster management
- Promotions, demotions, promotion requests and configurable requirements
- Leave of Absence requests, approval/denial, automatic LOA role synchronization and history
- Verbal/written warnings, suspensions, terminations and infraction points
- Department guidelines with categories, database storage, search and auto-posting
- Moderation: kick, ban, unban, timeout and purge
- Activity: patrols, training, ride-alongs, events, monthly statistics and leaderboards
- Training requests, approvals, instructor assignment and completion logs
- Deputy application modal, private application ticket and accept/deny workflow
- Support, Internal Affairs, promotion, LOA and appeal ticket panels with HTML transcripts
- Internal Affairs investigations with case numbers, investigators and outcomes
- Dedicated Discord log channels for moderation, promotions, infractions, LOAs, training, activity, joins/leaves, tickets, commands, applications, investigations and guidelines
- Discord OAuth2 dashboard for personnel, discipline, promotions, LOAs, activity and configuration
- MongoDB persistence via Mongoose
- Rank-based command permissions plus Discord hierarchy/security checks
- Helmet, rate limiting, secure sessions, CSRF protection, environment validation and structured logging

## Runtime

- Node.js 24 LTS
- Discord.js v14
- MongoDB Atlas recommended
- Express 5 dashboard

## 1. Create the Discord application

1. Open the Discord Developer Portal and create/select your application.
2. Go to **Bot** and create the bot.
3. Copy the bot token into `DISCORD_TOKEN`.
4. Enable these privileged gateway intents under **Bot > Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent
5. Go to **General Information** and copy the Application ID into `DISCORD_CLIENT_ID`.
6. Go to **OAuth2** and copy/create the Client Secret for `DISCORD_CLIENT_SECRET`.
7. Add your callback URL under OAuth2 Redirects:
   - Local: `http://localhost:3000/auth/discord/callback`
   - Render: `https://YOUR-SERVICE.onrender.com/auth/discord/callback`
8. Invite the bot with the scopes `bot` and `applications.commands`.

Recommended bot permissions:

- View Channels
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Manage Roles
- Manage Channels
- Manage Messages
- Kick Members
- Ban Members
- Moderate Members

Keep the bot's Discord role above every department role it needs to assign/remove and above members it needs to moderate.

## 2. MongoDB Atlas

1. Create a MongoDB Atlas project and cluster.
2. Create a database user with a strong unique password.
3. Configure Network Access so the Render service can reach the cluster.
4. Copy the Node.js connection string and use it as `MONGO_URI`.

Example shape:

```text
mongodb+srv://USERNAME:PASSWORD@cluster.example.mongodb.net/lcso?retryWrites=true&w=majority
```

Do not commit the real URI.

## 3. Environment variables

Copy `.env.example` to `.env` for local development.

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_oauth_client_secret
DISCORD_GUILD_ID=your_discord_server_id
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback
MONGO_URI=your_mongodb_atlas_uri
SESSION_SECRET=a_long_random_secret
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

Generate a secure session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`DISCORD_CLIENT_ID` is used for both the bot application and OAuth2. You do not need a separate `CLIENT_ID` and `DISCORD_CLIENT_ID`.

## 4. Install and run locally

```bash
npm install
npm run deploy-commands
npm start
```

Guild command deployment is used by default so slash-command changes appear quickly. To deploy globally later:

```bash
npm run deploy-commands -- --global
```

Dashboard: `http://localhost:3000`

## 5. Initial Discord setup

Create the roles/channels/categories you want first. Then, as a Discord Administrator, use:

```text
/config role
/config channel
/config requirement
/config view
```

At minimum configure:

- Rank role for each LCSO rank you use
- LOA role
- Staff ticket role
- Internal Affairs role
- Ticket category
- Application category
- Internal Affairs category
- Guideline channel
- Each dedicated log channel you want

The first Sheriff/command staff member can use Discord Administrator permission to bootstrap configuration even before they have a Deputy database profile.

## 6. Render deployment

Because this project includes an Express/OAuth2 dashboard, deploy it as a **Web Service**, not only a Background Worker.

1. Push this folder to a private GitHub repository.
2. In Render choose **New > Web Service** and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Health check path: `/health`
6. Add all production environment variables from `.env.example` in Render.
7. Set:
   - `NODE_ENV=production`
   - `DISCORD_CALLBACK_URL=https://YOUR-SERVICE.onrender.com/auth/discord/callback`
8. Do not upload your `.env` file to GitHub.
9. Add the exact Render callback URL to the Discord Developer Portal OAuth2 redirect list.
10. Run `npm run deploy-commands` locally once using the production IDs, or temporarily use the Render Shell if your plan provides it.

### Important Render note

A Discord bot needs an always-running process. A Render Web Service is correct for this combined bot + dashboard architecture because the dashboard needs a public HTTP endpoint. If your Render plan sleeps the Web Service when there is no incoming HTTP traffic, the Discord bot will also disconnect while the service sleeps. Use an always-on Render instance for reliable 24/7 operation.

## Command overview

### Personnel

- `/deputy add`
- `/deputy remove`
- `/deputy view`
- `/deputy list`
- `/promotion promote`
- `/promotion demote`
- `/promotion request`
- `/promotion review`
- `/promotion history`

### LOA / discipline

- `/loa request`
- `/loa approve`
- `/loa deny`
- `/loa list`
- `/warn`
- `/infraction add`
- `/infraction remove`
- `/infraction list`
- `/infractions`

### Guidelines

- `/guideline create`
- `/guideline edit`
- `/guideline remove`
- `/guideline view`
- `/guideline search`

### Moderation

- `/kick`
- `/ban`
- `/unban`
- `/timeout`
- `/purge`
- `/appeal submit`
- `/appeal review`
- `/appeal list`

### Activity / training

- `/activity add`
- `/activity stats`
- `/activity leaderboard`
- `/training request`
- `/training approve`
- `/training complete`
- `/training list`

### Applications / tickets / IA

- `/application panel`
- `/application review`
- `/application list`
- `/ticket panel`
- `/ticket close`
- `/ticket list`
- `/investigation open`
- `/investigation assign`
- `/investigation close`
- `/investigation view`
- `/investigation list`

### System

- `/config channel`
- `/config role`
- `/config requirement`
- `/config view`
- `/help`

## Rank permissions

Rank order:

1. Cadet
2. Deputy Sheriff
3. Senior Deputy
4. Corporal
5. Sergeant
6. Lieutenant
7. Captain
8. Assistant Sheriff
9. Undersheriff
10. Sheriff

The bot checks the Deputy profile in MongoDB for rank-based actions. Discord Administrators bypass rank checks for bootstrap and emergency administration. Discord role hierarchy is also checked for moderation actions.

## Security notes

- Never commit `.env`.
- Rotate the Discord token immediately if it is ever exposed.
- Use a unique MongoDB database password.
- Keep the bot role below roles it should never be able to manage.
- Dashboard sessions are stored in MongoDB and use secure cookies in production.
- POST forms use a per-session CSRF token.
- Dashboard access is verified against live Discord guild membership and LCSO rank.
- The bot deliberately does not log secret environment values.

## Project structure

```text
src/
  bot/
    commands/
      moderation/
      operations/
      staff/
      system/
    events/
    handlers/
  config/
  database/
    models/
  services/
  utils/
  web/
    middleware/
    public/
    routes/
    views/
scripts/
```

## Troubleshooting

**Slash commands do not appear:** run `npm run deploy-commands` and confirm `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID`.

**Bot cannot assign roles:** move the bot's highest role above the configured LCSO rank and LOA roles.

**OAuth says invalid redirect:** the `DISCORD_CALLBACK_URL` environment value and the OAuth2 redirect registered in Discord must match exactly.

**Dashboard says access denied:** your Discord account must be in the configured guild and have at least the required LCSO rank, or Discord Administrator where applicable.

**MongoDB connection fails:** verify Atlas credentials, database user permissions, connection string, and network access settings.
