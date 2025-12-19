# PolicyPal Backend

AI-powered insurance policy analysis backend for the PolicyPal platform.

## Features

- **Document Processing Pipeline**: PDF text extraction with LLM-powered analysis
- **Hybrid Intelligence**: Combines GPT-4 extraction with deterministic rules engine
- **Government Data Integration**: Flood maps, crime statistics, coastal erosion data
- **Async Job Processing**: BullMQ-based queue for background analysis
- **RESTful API**: Complete API for policy management and analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  Express.js + Authentication + Rate Limiting + Validation       │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Policies    │     │      Jobs       │     │      Risk       │
│   Controller  │     │    Controller   │     │    Controller   │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Services Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Document   │  │   Rules     │  │   Risk Data Service     │  │
│  │  Pipeline   │  │   Engine    │  │   (Flood, Crime, etc.)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ PostgreSQL  │  │    Redis    │  │      S3 Storage         │  │
│  │  (Prisma)   │  │  (BullMQ)   │  │      (PDFs)             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- OpenAI API key
- AWS S3 (or compatible) bucket

## Installation

```bash
# Clone the repository
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
# Required: DATABASE_URL, REDIS_URL, JWT_SECRET, OPENAI_API_KEY, S3 credentials

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed the database (optional)
npm run db:seed
```

## Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start

# Run the analysis worker (separate process)
npm run worker

# Development worker (with hot reload)
npm run dev:worker
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register a new user |
| POST | `/auth/login` | Authenticate user |
| POST | `/auth/logout` | Logout user |
| POST | `/auth/change-password` | Change password |
| GET | `/me` | Get current user profile |
| PATCH | `/me` | Update profile |

### Policies

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/policies/upload` | Upload a policy PDF |
| GET | `/policies` | List user policies |
| GET | `/policies/:id` | Get policy details |
| GET | `/policies/:id/dashboard` | Get dashboard data |
| POST | `/policies/:id/reanalyze` | Re-run analysis |
| DELETE | `/policies/:id` | Delete policy |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs/:id` | Get job status |

### Risk Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/risk/flood` | Get flood risk for coordinates |
| GET | `/risk/crime` | Get crime statistics |
| GET | `/risk/all` | Get all risk data |
| GET | `/risk/geocode` | Geocode an address |

## Dashboard JSON Contract

Response from `GET /policies/:id/dashboard`:

```json
{
  "dashboard": {
    "summary": {
      "policyId": "uuid",
      "insurer": "Allianz",
      "productName": "Home Insurance Plus",
      "policyNumber": "HI-12345678",
      "period": { "start": "2025-01-01", "end": "2026-01-01" },
      "address": "123 Main Street, Dublin 2, D02 AB12",
      "keyPoints": ["Buildings covered to €350,000", "Contents limit €75,000"]
    },
    "coverageBreakdown": [
      {
        "name": "Buildings",
        "type": "buildings",
        "limit": "€350,000",
        "excess": "€250",
        "included": true,
        "citations": [{ "pageNumber": 5, "snippet": "..." }]
      }
    ],
    "exclusions": [
      {
        "title": "Flood Damage",
        "description": "Loss or damage caused by flood is excluded",
        "scope": "general",
        "severity": "high",
        "citations": [{ "pageNumber": 12, "snippet": "..." }]
      }
    ],
    "riskRadar": [
      {
        "riskType": "flood",
        "level": "High",
        "explanation": "Property is in a high flood risk zone"
      }
    ],
    "actions": [
      {
        "actionText": "Request flood cover quote",
        "priority": 1,
        "ruleId": "FLOOD_001"
      }
    ],
    "questions": [
      {
        "questionText": "Is flood cover available via endorsement?",
        "ruleId": "FLOOD_001"
      }
    ],
    "metadata": {
      "extractionVersion": "gpt-4-1106-preview",
      "rulesetVersion": "default_v1",
      "analyzedAt": "2025-01-15T10:30:00Z"
    }
  }
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes |
| `S3_BUCKET` | S3 bucket name | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

## Database Schema

See `prisma/schema.prisma` for the complete data model including:

- Users (with plan tiers)
- Policies (with status tracking)
- PolicyExtracts (versioned LLM extractions)
- RiskAssessments (versioned risk checks)
- GuidanceRuns (versioned rules output)
- Jobs (async processing)
- Rulesets (versioned rule configurations)
- AuditLogs (security audit trail)

## Rules Engine

The rules engine evaluates deterministic rules against policy facts and risk data:

```javascript
{
  ruleId: "FLOOD_001",
  name: "High Flood Risk Without Coverage",
  condition: {
    and: [
      { field: "risk.floodZone", operator: "in", value: ["High", "VeryHigh"] },
      { field: "policy.hasFloodExclusion", operator: "equals", value: true }
    ]
  },
  output: {
    gap: "Flood risk not covered",
    action: "Request flood cover quote",
    questions: ["Is flood cover available via endorsement?"]
  }
}
```

## Security

- JWT-based authentication
- Rate limiting (general, auth, upload)
- Helmet security headers
- Request sanitization
- File validation (PDF magic bytes)
- Encrypted storage (S3 SSE)
- Audit logging

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Open Prisma Studio
npm run db:studio
```

## License

MIT
