# SubSync - Reddit Subscription Transfer

A lightweight Docker application built with Bun that allows you to transfer subreddit subscriptions between Reddit accounts.

## Features

- **Dual OAuth Authentication**: Securely connect two Reddit accounts
- **Subscription Management**: View and select subscriptions from source account
- **Rate-Limited Transfers**: Respects Reddit's API limits (100 requests/minute)
- **Real-time Progress**: Live transfer progress with detailed logging
- **Error Handling**: Robust error handling for failed subscriptions
- **Docker Ready**: Containerized for easy deployment

## Prerequisites

1. **Reddit Application**: Create a Reddit app at https://www.reddit.com/prefs/apps

   - Choose "script" as the application type
   - Set redirect URI to `http://localhost:3000/auth/callback`
   - Note down your client ID and secret

2. **Bun Runtime**: Install Bun from https://bun.sh

## Setup

1. **Clone and setup**:

   ```bash
   cd reddit-transfer-app
   bun install
   ```

2. **Environment Configuration**:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Reddit app credentials:

   ```env
   REDDIT_CLIENT_ID=your_reddit_client_id
   REDDIT_CLIENT_SECRET=your_reddit_client_secret
   REDDIT_REDIRECT_URI=http://localhost:3000/auth/callback
   SESSION_SECRET=your_random_session_secret
   PORT=3000
   NODE_ENV=development
   ```

## Development

Start the development server:

```bash
bun run dev
```

Open http://localhost:3000 in your browser.

## Production Deployment

### Using Docker

1. **Build the image**:

   ```bash
   bun run docker:build
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

### Manual Production

1. **Build the application**:

   ```bash
   bun run build
   ```

2. **Start production server**:
   ```bash
   bun run start
   ```

## Usage

1. **Connect Accounts**:

   - Click "Connect Source Account" to authenticate the account you want to copy from
   - Click "Connect Target Account" to authenticate the account you want to copy to
     \*Note - make sure you log out with the source account and login with the target account if you're using the same browser

2. **Load Subscriptions**:

   - Click "Load Subscriptions" to fetch all subreddits from the source account
   - Select which subreddits you want to transfer

3. **Transfer**:
   - Click "Start Transfer" to begin the subscription transfer
   - Monitor progress in real-time with detailed logs

## API Endpoints

- `GET /` - Main application interface
- `GET /auth/login?type=source|target` - OAuth login flow
- `GET /auth/callback` - OAuth callback handler
- `GET /api/status` - Check authentication status
- `GET /api/subscriptions` - Fetch source account subscriptions
- `POST /api/transfer` - Start subscription transfer
- `GET /api/transfer/:id` - Check transfer progress

## Technical Details

### Security Features

- HTTP-only session cookies
- Non-root Docker user
- Environment variable configuration
- CSRF protection via OAuth state parameters

### Error Handling

- Automatic token refresh
- Graceful handling of private/deleted subreddits
- Progress recovery and resumption
- Detailed error logging

## Troubleshooting

### Common Issues

1. **OAuth Errors**: Verify your Reddit app settings and redirect URI
2. **Private Subreddits**: Some subreddits may fail if the target account doesn't have access

### Logs

Check application logs for detailed error information:

```bash
docker-compose logs -f reddit-transfer-app
```

## Privacy & Account Separation

### How Accounts Are Kept Separate

- **Independent OAuth Sessions**: Each account authenticates separately with Reddit
- **Separate API Tokens**: Source and target accounts use different access tokens
- **No Cross-Contamination**: The app acts as an independent intermediary without linking credentials

### What Reddit Can See

**Reddit CANNOT directly see that accounts are connected** because:

- Each account makes independent API calls using its own tokens
- No shared identifiers or linking information is sent to Reddit
- The app doesn't expose any connection between the accounts in API requests

**Reddit MIGHT be able to correlate accounts through:**

- **IP Address**: Both accounts authenticate from the same IP address
- **Timing Patterns**: Rapid subscription additions to the target account shortly after source account activity
- **Subscription Overlap**: Target account suddenly subscribing to many of the same subreddits

### Privacy Best Practices

For maximum privacy, consider:

- Using different networks (VPN, mobile vs WiFi) for each account
- Adding delays between authentication and transfers
- Using separate browser sessions or incognito mode

## License

MIT License

## Disclaimer

This application is not affiliated with Reddit Inc. Use responsibly and in accordance with Reddit's Terms of Service and API guidelines.
