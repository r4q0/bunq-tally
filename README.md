# bunq Tally

AI-powered receipt splitting. Scan receipts, assign items to contacts, generate bunq payment links, and notify via WhatsApp — all from one app.

## Features

- **Receipt OCR** — Upload a photo; Claude AI extracts merchant, date, items, categories and totals
- **Smart splitting** — Assign line items to contacts with weighted cost distribution
- **bunq payment links** — Auto-generate payment requests per contact via the bunq API
- **WhatsApp notifications** — Send split amounts directly via OpenWA
- **Budget tracking** — Set per-category budgets and monitor spending over time
- **Spending insights** — Dashboard, timeline and budget status endpoints

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 12, PHP 8.2+ |
| Frontend | React 18, TypeScript, Tailwind CSS v4 |
| Build | Vite 7, Laravel Vite Plugin |
| AI | Anthropic Claude API (receipt OCR) |
| Payments | bunq PHP SDK |
| WhatsApp | OpenWA (self-hosted) |
| Database | SQLite (default) |

## Requirements

- PHP 8.2+
- Composer
- Node.js 20+
- A bunq API key (production or sandbox)
- An Anthropic API key
- OpenWA running locally or on the network (optional — app works without it)

## Installation

```bash
# 1. Clone and install dependencies
git clone <repo-url> bunq-tally
cd bunq-tally
composer install
npm install

# 2. Environment
cp .env.example .env
php artisan key:generate

# 3. Database
php artisan migrate

# 4. Build frontend
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in the following:

```env
APP_URL=http://127.0.0.1:8000

# bunq
BUNQ_ENV=production                  # or sandbox
BUNQ_API_KEY=your-bunq-api-key
BUNQ_MONETARY_ACCOUNT_ID=            # leave blank to use primary account

# Anthropic Claude (receipt scanning)
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_MODEL=claude-opus-4-5

# OpenWA (WhatsApp — optional)
OPENWA_URL=http://127.0.0.1:2785
OPENWA_API_KEY=your-openwa-api-key
OPENWA_SESSION_ID=your-session-id
```

### bunq Setup (one-time)

Register your API key with bunq and generate the context file:

```bash
php artisan bunq:setup
```

This saves an API context to `storage/app/bunq_context.json`. You only need to run this once. If you hit a 429 rate limit, the command will automatically retry.

## Running

### Development

```bash
# All-in-one (PHP server + queue + logs + Vite)
composer run dev

# Or individually
php artisan serve --host=0.0.0.0 --port=8000
npm run dev
```

### Access from other devices on the same network

1. Find your local IP — run `ipconfig` and look for the IPv4 address under your WiFi adapter (e.g. `192.168.1.50`)
2. Start Laravel bound to all interfaces:
   ```bash
   php artisan serve --host=0.0.0.0 --port=8000
   ```
3. Set in `.env`:
   ```env
   APP_URL=http://192.168.1.50:8000
   VITE_DEV_SERVER_URL=http://192.168.1.50:5173
   ```
4. Set `server.host` in `vite.config.js` to your IP (e.g. `'192.168.1.50'`)
5. Open `http://192.168.1.50:8000` on any device on the network

### Production Build

```bash
npm run build
php artisan serve --host=0.0.0.0 --port=8000
```

## API Reference

### Contacts
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/contacts` | List all contacts |
| POST | `/api/contacts` | Create a contact |
| PATCH | `/api/contacts/{id}` | Update a contact |
| DELETE | `/api/contacts/{id}` | Delete a contact |

### Receipts
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/receipts` | List all receipts |
| GET | `/api/receipts/{id}` | Get receipt with items and splits |
| POST | `/api/receipts/{id}/allocations` | Save item-to-contact allocations |
| POST | `/api/receipts/{id}/split` | Generate payment requests from allocations |
| GET | `/api/receipts/{id}/status` | Poll payment status for all splits |

### AI Scanning
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/claude/scan` | Upload receipt image for OCR parsing |

### Payments
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/payment-requests` | Create a bunq payment request |
| POST | `/api/payment-requests/{id}/sync` | Manually sync payment status |
| POST | `/api/bunq/webhook` | bunq webhook receiver |

### WhatsApp
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/whatsapp/send-text` | Send a WhatsApp text message |

### Insights & Budgets
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/insights/dashboard` | Spending dashboard summary |
| GET | `/api/insights/timeline` | Spending over time |
| GET | `/api/insights/budgets` | Budget utilisation |
| GET | `/api/budgets` | List category budgets |
| POST | `/api/budgets` | Create a budget |
| PATCH | `/api/budgets/{id}` | Update a budget |
| DELETE | `/api/budgets/{id}` | Delete a budget |

## OpenWA Setup

OpenWA is a self-hosted WhatsApp gateway. Install and run it separately:

```bash
cd ~/OpenWA
npm start
```

To make it accessible on the network, set `DOMAIN=0.0.0.0` in OpenWA's `.env`. The dashboard runs on port `2886`, the API on port `2785`.

Scan the QR code once via the dashboard (`http://<your-ip>:2886`), then set `OPENWA_SESSION_ID` in the bunq Tally `.env`.

## Windows / XAMPP Notes

The bunq SDK requires OpenSSL to generate key pairs. On Windows with XAMPP, `openssl_pkey_new()` can fail to find `openssl.cnf`. This project includes a vendor patch that fixes this automatically:

```bash
php artisan bunq:patch-keypair
```

This is also wired into `composer.json`'s `post-autoload-dump` hook so it re-applies after every `composer install`.

## Credits

Built with love by [Bilal Noah Kerkeni](https://www.linkedin.com/in/kerkeni/) (project lead), [Charalampos Efthymiadis](https://www.linkedin.com/in/charalampos-efthymiadis-181831251/), [Eesti Raud](https://www.linkedin.com/in/eesti-raud-8b5b45389/) and [Josef Pulkrábek](https://www.linkedin.com/in/josef-pulkr%C3%A1bek-638a433a3/).

## License

MIT
