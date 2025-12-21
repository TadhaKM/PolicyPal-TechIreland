# PolicyPal

AI-powered insurance policy analysis that makes your coverage crystal clear.

## Overview

PolicyPal helps you understand your insurance policies by analyzing PDFs and providing clear, actionable insights. Upload any insurance policy and get:

- **Coverage Breakdown** - Visual charts showing what's covered and limits
- **Risk Assessment** - Location-based risk analysis (flood, crime, coastal)
- **Coverage Gaps** - Identifies what's NOT covered that should be
- **Exclusions Analysis** - Highlights important exclusions by severity
- **Recommended Actions** - Prioritized steps to improve your coverage
- **Broker Questions** - Smart questions to ask your insurance provider

## Features

- Upload PDF policies for instant AI analysis
- Interactive dashboard with Chart.js visualizations
- No signup required - analyze policies immediately
- Works offline with demo mode
- Deployable to Vercel or run locally


## Project Structure

```
PolicyPal/
├── index.html          # Main frontend
├── css/styles.css      # Styling
├── js/main.js          # Frontend JavaScript + Charts
├── assets/logo.svg     # Logo
├── samples/            # Sample policy for testing
│   └── sample-policy.html
├── api/                # Vercel serverless functions
│   ├── analyze.js      # Policy analysis endpoint
│   ├── demo.js         # Demo dashboard endpoint
│   └── health.js       # Health check
├── backend-simple/     # Local Node.js backend
│   ├── server.js       # Express server with Claude API
│   └── package.json
└── vercel.json         # Vercel configuration
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Analyze policy PDF text |
| `/api/demo` | GET | Get demo dashboard data |
| `/api/health` | GET | Health check |

## Testing with Sample Policy

1. Open `samples/sample-policy.html` in browser
2. Print to PDF (Ctrl+P / Cmd+P)
3. Upload the PDF to PolicyPal
4. View the analysis dashboard with charts

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Charts**: Chart.js
- **PDF Parsing**: PDF.js (client-side)
- **Backend**: Node.js / Express
- **AI**: Claude API (Anthropic)
- **Deployment**: Vercel Serverless Functions

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Claude API key |

## License

MIT
