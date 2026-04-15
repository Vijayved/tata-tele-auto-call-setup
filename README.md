# WATI + Tata Tele Smartflo Bridge

WhatsApp campaign ka "Book Test" button click hone par automatic call trigger hota hai Tata Tele Smartflo ke through.

## Flow

```
Patient clicks "Book Test" on WhatsApp
        ↓
WATI webhook fires → POST /wati-webhook
        ↓
Server validates + extracts phone number
        ↓
Tata Tele Click-to-Call API triggered
        ↓
Agent ka phone ring hota hai (pehle)
        ↓
Agent pick karta hai
        ↓
Patient ka phone ring hota hai (auto)
        ↓
Bridge call connected ✅
```

## Quick Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd wati-tatatele-bridge
npm install
```

### 2. Configure .env

```bash
cp .env.example .env
nano .env   # Fill in your actual values
```

### 3. Run

```bash
# Development
node index.js

# Production (with PM2)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Configure WATI Webhook

In WATI Dashboard → Connectors → Webhooks → Add Webhook:
- URL: `https://your-domain.com/wati-webhook`
- Events: `messageReceived`

### 5. Test

```bash
# Health check
curl https://your-domain.com/health

# Manual test call
curl -X POST https://your-domain.com/test-call \
  -H "Content-Type: application/json" \
  -d '{"patient_number": "91XXXXXXXXXX"}'

# View stats
curl https://your-domain.com/stats

# View recent logs
curl https://your-domain.com/logs?limit=10
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Server health check |
| POST | /wati-webhook | WATI webhook receiver (main) |
| POST | /call-status | Tata Tele call status callback |
| GET | /stats | Call statistics |
| GET | /logs | Recent call logs |
| POST | /test-call | Manual test call trigger |

## Features

- Round-robin agent selection (multiple agents supported)
- Duplicate click prevention (configurable debounce window)
- Business hours check (IST timezone)
- Phone number validation (Indian mobile format)
- Retry logic with exponential backoff
- File-based call logging (no database needed)
- Winston logging (console + file)
- PM2 production config

## File Structure

```
wati-tatatele-bridge/
├── index.js              # Main server + routes
├── webhookHandler.js     # WATI webhook validation & parsing
├── agentManager.js       # Round-robin agent selection
├── callService.js        # Tata Tele API calls + retry
├── callStore.js          # File-based call logging
├── logger.js             # Winston logger config
├── ecosystem.config.js   # PM2 production config
├── .env.example          # Environment variables template
├── .gitignore
├── package.json
└── README.md
```
