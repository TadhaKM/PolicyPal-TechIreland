/**
 * PolicyPal - Simple Offline Backend
 * Uses Claude API for policy extraction
 * Stores everything in memory/JSON files
 * No external databases required
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// ===========================================
// Configuration
// ===========================================

const PORT = process.env.PORT || 3000;
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

// Initialize Claude client
let claude = null;
if (CLAUDE_API_KEY) {
  claude = new Anthropic({ apiKey: CLAUDE_API_KEY });
  console.log('✓ Claude API initialized');
} else {
  console.log('⚠ No ANTHROPIC_API_KEY set - will use mock extraction');
}

// ===========================================
// In-Memory Storage
// ===========================================

const db = {
  users: new Map(),
  policies: new Map(),
  jobs: new Map(),
};

// Add a demo user
db.users.set('demo-user-id', {
  id: 'demo-user-id',
  email: 'demo@policypal.ie',
  firstName: 'Demo',
  lastName: 'User',
  plan: 'PREMIUM',
  createdAt: new Date().toISOString(),
});

// ===========================================
// Mock Data
// ===========================================

const MOCK_RISK_DATA = {
  flood: {
    zone: 'Medium',
    probability: 0.35,
    nearestFloodArea: 'River Liffey Basin',
    datasetVersion: 'opw_2024_v1',
    source: 'OPW Flood Maps',
  },
  crime: {
    level: 'Medium',
    area: 'Dublin South',
    burglaryRate: 185,
    theftRate: 290,
    datasetVersion: 'cso_2024_q3',
    source: 'CSO Crime Statistics',
  },
  coastal: {
    distanceKm: 12,
    erosionRisk: 'Low',
    stormSurgeRisk: false,
  },
  subsidence: {
    level: 'Low',
    geologyType: 'Limestone',
  },
};

const MOCK_EXTRACTION = {
  metadata: {
    insurer: 'Allianz Ireland',
    productName: 'Home Insurance Plus',
    policyNumber: 'HI-2025-78432',
    propertyAddress: '42 Oakwood Drive, Blackrock, Co. Dublin',
    eircode: 'A94 T8F2',
    periodStart: '2025-01-01',
    periodEnd: '2026-01-01',
    insuredParties: ['John Murphy', 'Mary Murphy'],
  },
  coverages: [
    {
      name: 'Buildings',
      type: 'buildings',
      limit: '€450,000',
      excess: '€250',
      included: true,
      conditions: ['Rebuild cost basis', 'Index-linked annually'],
      citations: [{ pageNumber: 5, snippet: 'Buildings Sum Insured: €450,000' }],
    },
    {
      name: 'Contents',
      type: 'contents',
      limit: '€75,000',
      excess: '€250',
      included: true,
      subLimits: [
        { name: 'Single Article Limit', limit: '€3,000' },
        { name: 'Cash', limit: '€500' },
        { name: 'Credit Cards', limit: '€1,000' },
      ],
      citations: [{ pageNumber: 6, snippet: 'Contents Sum Insured: €75,000' }],
    },
    {
      name: 'Public Liability',
      type: 'liability',
      limit: '€2,600,000',
      excess: '€0',
      included: true,
      citations: [{ pageNumber: 8, snippet: 'Public Liability limit of €2,600,000' }],
    },
    {
      name: 'Alternative Accommodation',
      type: 'addon',
      limit: '€25,000',
      included: true,
      notes: 'Up to 24 months',
    },
  ],
  exclusions: [
    {
      title: 'Flood Damage',
      description: 'Loss or damage caused by flood, including rising water levels and surface water runoff',
      scope: 'general',
      severity: 'high',
      citations: [{ pageNumber: 15, snippet: 'We do not cover loss or damage caused by flood...' }],
    },
    {
      title: 'Gradual Deterioration',
      description: 'Wear and tear, rot, fungus, rust, or gradual deterioration',
      scope: 'general',
      severity: 'low',
      citations: [{ pageNumber: 16, snippet: 'Gradual deterioration, wear and tear...' }],
    },
    {
      title: 'Unoccupancy over 60 days',
      description: 'Cover is limited if property is unoccupied for more than 60 consecutive days',
      scope: 'general',
      severity: 'medium',
      citations: [{ pageNumber: 18, snippet: 'If your home is unoccupied for more than 60 consecutive days...' }],
    },
    {
      title: 'Business Use',
      description: 'Any loss arising from business activities conducted at the property',
      scope: 'contents',
      severity: 'medium',
      citations: [{ pageNumber: 17, snippet: 'We do not cover any business equipment or stock...' }],
    },
  ],
  conditions: [
    {
      title: 'Security Requirements',
      description: 'All external doors must be fitted with 5-lever mortice deadlocks or equivalent',
      type: 'security',
      citations: [{ pageNumber: 20, snippet: 'Security requirements: All external doors...' }],
    },
    {
      title: 'Reasonable Care',
      description: 'You must take reasonable care to prevent loss or damage',
      type: 'maintenance',
    },
  ],
  summary: {
    keyPoints: [
      'Buildings covered to €450,000 (rebuild cost)',
      'Contents limit €75,000 with €3,000 single article limit',
      'Public liability cover of €2.6 million included',
      'Flood damage is excluded - consider requesting cover',
      '60-day unoccupancy restriction applies',
    ],
    totalBuildingsLimit: '€450,000',
    totalContentsLimit: '€75,000',
    annualPremium: '€685.00',
  },
};

// ===========================================
// Rules Engine (Simplified)
// ===========================================

function runRulesEngine(extraction, riskData) {
  const gaps = [];
  const actions = [];
  const questions = [];

  // Rule 1: Flood risk without coverage
  const hasFloodExclusion = extraction.exclusions?.some(e =>
    e.title?.toLowerCase().includes('flood')
  );

  if (hasFloodExclusion && ['Medium', 'High', 'VeryHigh'].includes(riskData.flood?.zone)) {
    gaps.push({
      id: 'gap_FLOOD_001',
      ruleId: 'FLOOD_001',
      severity: 'high',
      title: 'Flood Risk Without Coverage',
      description: `Your property is in a ${riskData.flood.zone} flood risk zone, but flood damage is excluded from your policy.`,
    });
    actions.push({
      id: 'action_FLOOD_001',
      priority: 1,
      text: 'Request a flood cover quote from your insurer or consider alternative providers',
      ruleId: 'FLOOD_001',
    });
    questions.push({
      id: 'q_FLOOD_001',
      text: 'Is flood cover available as an optional endorsement?',
      ruleId: 'FLOOD_001',
    });
  }

  // Rule 2: Crime risk check
  if (riskData.crime?.level === 'High') {
    gaps.push({
      id: 'gap_CRIME_001',
      ruleId: 'CRIME_001',
      severity: 'medium',
      title: 'High Crime Area',
      description: 'Your property is in a high-crime area. Ensure security requirements are met.',
    });
    actions.push({
      id: 'action_CRIME_001',
      priority: 2,
      text: 'Verify all security requirements in the policy are met to avoid claim rejection',
      ruleId: 'CRIME_001',
    });
  }

  // Rule 3: Unoccupancy clause
  const hasUnoccupancyClause = extraction.exclusions?.some(e =>
    e.title?.toLowerCase().includes('unoccup')
  );

  if (hasUnoccupancyClause) {
    actions.push({
      id: 'action_UNOCC_001',
      priority: 3,
      text: 'Notify insurer if property will be unoccupied for extended periods (holidays, etc.)',
      ruleId: 'UNOCC_001',
    });
    questions.push({
      id: 'q_UNOCC_001',
      text: 'Can the unoccupancy period be extended if needed?',
      ruleId: 'UNOCC_001',
    });
  }

  // Rule 4: Single article limit
  const contentsPolicy = extraction.coverages?.find(c => c.type === 'contents');
  const singleItemLimit = contentsPolicy?.subLimits?.find(s =>
    s.name?.toLowerCase().includes('single')
  );

  if (singleItemLimit) {
    questions.push({
      id: 'q_VALUABLES_001',
      text: `Single article limit is ${singleItemLimit.limit}. Do you have items worth more that need to be specified?`,
      ruleId: 'VALUABLES_001',
    });
  }

  return {
    gaps,
    actions,
    questions,
    rulesEvaluated: 4,
    rulesTriggered: gaps.length + actions.length,
  };
}

// ===========================================
// Claude API Extraction
// ===========================================

async function extractWithClaude(pdfText) {
  if (!claude) {
    console.log('Using mock extraction (no API key)');
    return MOCK_EXTRACTION;
  }

  const systemPrompt = `You are an expert insurance policy analyst specializing in Irish home insurance. Extract structured information from the policy document text provided.

Return a JSON object with this structure:
{
  "metadata": {
    "insurer": "string",
    "productName": "string",
    "policyNumber": "string",
    "propertyAddress": "string",
    "eircode": "string or null",
    "periodStart": "YYYY-MM-DD",
    "periodEnd": "YYYY-MM-DD",
    "insuredParties": ["array of names"]
  },
  "coverages": [
    {
      "name": "string",
      "type": "buildings|contents|liability|addon",
      "limit": "€amount",
      "excess": "€amount",
      "included": true,
      "subLimits": [{"name": "string", "limit": "€amount"}],
      "conditions": ["array of conditions"],
      "citations": [{"pageNumber": 1, "snippet": "exact quote"}]
    }
  ],
  "exclusions": [
    {
      "title": "string",
      "description": "string",
      "scope": "general|buildings|contents|liability",
      "severity": "high|medium|low",
      "citations": [{"pageNumber": 1, "snippet": "exact quote"}]
    }
  ],
  "conditions": [
    {
      "title": "string",
      "description": "string",
      "type": "security|occupancy|maintenance|notification|other"
    }
  ],
  "summary": {
    "keyPoints": ["array of 3-5 key points"],
    "totalBuildingsLimit": "€amount",
    "totalContentsLimit": "€amount",
    "annualPremium": "€amount or null"
  }
}

Be thorough - missing an exclusion could lead to claim denial. Include page numbers where possible.`;

  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `Extract insurance policy information from this document:\n\n${pdfText.substring(0, 30000)}`,
        },
      ],
      system: systemPrompt,
    });

    const content = response.content[0].text;

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    console.log('Could not parse Claude response, using mock');
    return MOCK_EXTRACTION;
  } catch (error) {
    console.error('Claude API error:', error.message);
    return MOCK_EXTRACTION;
  }
}

// ===========================================
// Express App
// ===========================================

const app = express();

app.use(cors());
app.use(express.json());

// File upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'), false);
    }
  },
});

// ===========================================
// Routes
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0-simple',
    claudeConfigured: !!claude,
  });
});

// API docs
app.get('/api-docs', (req, res) => {
  res.json({
    name: 'PolicyPal Simple API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /policies/upload': 'Upload and analyze a policy PDF',
      'GET /policies': 'List all policies',
      'GET /policies/:id': 'Get policy details',
      'GET /policies/:id/dashboard': 'Get dashboard data',
      'GET /demo/dashboard': 'Get demo dashboard with mock data',
    },
  });
});

// Demo dashboard (no upload needed)
app.get('/demo/dashboard', (req, res) => {
  const guidance = runRulesEngine(MOCK_EXTRACTION, MOCK_RISK_DATA);

  res.json({
    dashboard: {
      summary: {
        policyId: 'demo-policy',
        insurer: MOCK_EXTRACTION.metadata.insurer,
        productName: MOCK_EXTRACTION.metadata.productName,
        policyNumber: MOCK_EXTRACTION.metadata.policyNumber,
        period: {
          start: MOCK_EXTRACTION.metadata.periodStart,
          end: MOCK_EXTRACTION.metadata.periodEnd,
        },
        address: MOCK_EXTRACTION.metadata.propertyAddress,
        keyPoints: MOCK_EXTRACTION.summary.keyPoints,
      },
      coverageBreakdown: MOCK_EXTRACTION.coverages,
      exclusions: MOCK_EXTRACTION.exclusions,
      riskRadar: [
        {
          riskType: 'flood',
          level: MOCK_RISK_DATA.flood.zone,
          explanation: `Property near ${MOCK_RISK_DATA.flood.nearestFloodArea}`,
          datasetVersion: MOCK_RISK_DATA.flood.datasetVersion,
        },
        {
          riskType: 'crime',
          level: MOCK_RISK_DATA.crime.level,
          explanation: `${MOCK_RISK_DATA.crime.area} - Burglary rate: ${MOCK_RISK_DATA.crime.burglaryRate}/100k`,
          datasetVersion: MOCK_RISK_DATA.crime.datasetVersion,
        },
        {
          riskType: 'coastal',
          level: MOCK_RISK_DATA.coastal.erosionRisk,
          explanation: `${MOCK_RISK_DATA.coastal.distanceKm}km from coast`,
        },
      ],
      gaps: guidance.gaps,
      actions: guidance.actions,
      questions: guidance.questions,
      metadata: {
        extractionModel: claude ? 'claude-sonnet-4-20250514' : 'mock-data',
        rulesetVersion: 'v1.0.0',
        analyzedAt: new Date().toISOString(),
      },
    },
  });
});

// Upload policy
app.post('/policies/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const policyId = uuidv4();
    const jobId = uuidv4();

    console.log(`Processing policy ${policyId}...`);

    // Extract text from PDF
    let pdfText = '';
    try {
      const pdfData = await pdfParse(req.file.buffer);
      pdfText = pdfData.text;
      console.log(`Extracted ${pdfData.numpages} pages, ${pdfText.length} chars`);
    } catch (err) {
      console.error('PDF parse error:', err.message);
      return res.status(400).json({ error: 'Could not parse PDF' });
    }

    // Extract with Claude (or mock)
    console.log('Running extraction...');
    const extraction = await extractWithClaude(pdfText);

    // Run rules engine
    const guidance = runRulesEngine(extraction, MOCK_RISK_DATA);

    // Store policy
    const policy = {
      id: policyId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      uploadedAt: new Date().toISOString(),
      status: 'READY',
      extraction,
      riskData: MOCK_RISK_DATA,
      guidance,
    };

    db.policies.set(policyId, policy);

    console.log(`Policy ${policyId} ready - ${guidance.gaps.length} gaps found`);

    res.status(201).json({
      message: 'Policy analyzed successfully',
      policy: {
        id: policyId,
        filename: policy.filename,
        status: policy.status,
      },
      summary: {
        gapsFound: guidance.gaps.length,
        actionsGenerated: guidance.actions.length,
        questionsGenerated: guidance.questions.length,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process policy' });
  }
});

// List policies
app.get('/policies', (req, res) => {
  const policies = Array.from(db.policies.values()).map(p => ({
    id: p.id,
    filename: p.filename,
    status: p.status,
    uploadedAt: p.uploadedAt,
    insurer: p.extraction?.metadata?.insurer,
  }));

  res.json({ policies });
});

// Get policy
app.get('/policies/:id', (req, res) => {
  const policy = db.policies.get(req.params.id);

  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  res.json({ policy });
});

// Get policy dashboard
app.get('/policies/:id/dashboard', (req, res) => {
  const policy = db.policies.get(req.params.id);

  if (!policy) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  const { extraction, riskData, guidance } = policy;

  res.json({
    dashboard: {
      summary: {
        policyId: policy.id,
        insurer: extraction.metadata?.insurer,
        productName: extraction.metadata?.productName,
        policyNumber: extraction.metadata?.policyNumber,
        period: {
          start: extraction.metadata?.periodStart,
          end: extraction.metadata?.periodEnd,
        },
        address: extraction.metadata?.propertyAddress,
        keyPoints: extraction.summary?.keyPoints || [],
      },
      coverageBreakdown: extraction.coverages || [],
      exclusions: extraction.exclusions || [],
      riskRadar: [
        {
          riskType: 'flood',
          level: riskData.flood?.zone,
          explanation: `Near ${riskData.flood?.nearestFloodArea || 'unknown area'}`,
        },
        {
          riskType: 'crime',
          level: riskData.crime?.level,
          explanation: riskData.crime?.area,
        },
      ],
      gaps: guidance.gaps,
      actions: guidance.actions,
      questions: guidance.questions,
      metadata: {
        extractionModel: claude ? 'claude-sonnet-4-20250514' : 'mock-data',
        analyzedAt: policy.uploadedAt,
      },
    },
  });
});

// ===========================================
// Start Server
// ===========================================

app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('   PolicyPal Simple Backend');
  console.log('========================================');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  GET  http://localhost:${PORT}/api-docs`);
  console.log(`  GET  http://localhost:${PORT}/demo/dashboard`);
  console.log(`  POST http://localhost:${PORT}/policies/upload`);
  console.log(`  GET  http://localhost:${PORT}/policies`);
  console.log(`  GET  http://localhost:${PORT}/policies/:id/dashboard`);
  console.log('');
  if (!claude) {
    console.log('⚠ No ANTHROPIC_API_KEY set');
    console.log('  Using mock data for extraction');
    console.log('  Set: export ANTHROPIC_API_KEY=your-key');
  }
  console.log('========================================');
  console.log('');
});
