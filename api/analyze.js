/**
 * Policy Analysis API - Vercel Serverless Function
 * Analyzes uploaded PDF using Claude API
 */

import Anthropic from '@anthropic-ai/sdk';

// In-memory storage (resets on cold start - for demo purposes)
const policies = new Map();

// Mock risk data
const MOCK_RISK_DATA = {
  flood: { zone: 'Medium', nearestFloodArea: 'River Liffey Basin', datasetVersion: 'opw_2024_v1' },
  crime: { level: 'Medium', area: 'Dublin South', burglaryRate: 185, datasetVersion: 'cso_2024_q3' },
  coastal: { distanceKm: 12, erosionRisk: 'Low' },
};

// Mock extraction for when API key not available
const MOCK_EXTRACTION = {
  metadata: {
    insurer: 'Sample Insurance Co.',
    productName: 'Home Insurance',
    policyNumber: 'DEMO-12345',
    propertyAddress: 'Sample Address, Dublin',
    periodStart: '2025-01-01',
    periodEnd: '2026-01-01',
  },
  coverages: [
    { name: 'Buildings', type: 'buildings', limit: '€400,000', excess: '€250', included: true },
    { name: 'Contents', type: 'contents', limit: '€50,000', excess: '€250', included: true },
    { name: 'Public Liability', type: 'liability', limit: '€2,000,000', included: true },
  ],
  exclusions: [
    { title: 'Flood Damage', severity: 'high', description: 'Flood damage is excluded', scope: 'general' },
    { title: 'Wear and Tear', severity: 'low', description: 'Gradual deterioration excluded', scope: 'general' },
  ],
  summary: {
    keyPoints: [
      'Buildings covered to €400,000',
      'Contents limit €50,000',
      'Flood damage excluded',
    ],
  },
};

function runRulesEngine(extraction, riskData) {
  const gaps = [];
  const actions = [];
  const questions = [];

  const hasFloodExclusion = extraction.exclusions?.some(e =>
    e.title?.toLowerCase().includes('flood')
  );

  if (hasFloodExclusion && ['Medium', 'High'].includes(riskData.flood?.zone)) {
    gaps.push({
      severity: 'high',
      title: 'Flood Risk Without Coverage',
      description: `Property in ${riskData.flood.zone} flood zone but flood is excluded`,
    });
    actions.push({ priority: 1, text: 'Request flood cover quote from your insurer' });
    questions.push({ text: 'Is flood cover available as an endorsement?' });
  }

  actions.push({ priority: 2, text: 'Verify security requirements are met' });
  questions.push({ text: 'Are there items exceeding the single article limit?' });

  return { gaps, actions, questions };
}

async function extractWithClaude(pdfText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('No ANTHROPIC_API_KEY - using mock extraction');
    return MOCK_EXTRACTION;
  }

  const claude = new Anthropic({ apiKey });

  const systemPrompt = `You are an insurance policy analyst. Extract structured information from the policy text.
Return JSON with: metadata (insurer, productName, policyNumber, propertyAddress, periodStart, periodEnd),
coverages (array with name, type, limit, excess, included),
exclusions (array with title, severity, description, scope),
summary (keyPoints array).`;

  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: `Extract policy info:\n\n${pdfText.substring(0, 25000)}` }],
      system: systemPrompt,
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return MOCK_EXTRACTION;
  } catch (error) {
    console.error('Claude API error:', error.message);
    return MOCK_EXTRACTION;
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - retrieve a policy
  if (req.method === 'GET') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Policy ID required' });
    }

    const policy = policies.get(id);
    if (!policy) {
      // Return demo data if policy not found
      const guidance = runRulesEngine(MOCK_EXTRACTION, MOCK_RISK_DATA);
      return res.status(200).json({
        dashboard: {
          summary: {
            policyId: id,
            insurer: MOCK_EXTRACTION.metadata.insurer,
            productName: MOCK_EXTRACTION.metadata.productName,
            policyNumber: MOCK_EXTRACTION.metadata.policyNumber,
            period: { start: MOCK_EXTRACTION.metadata.periodStart, end: MOCK_EXTRACTION.metadata.periodEnd },
            address: MOCK_EXTRACTION.metadata.propertyAddress,
            keyPoints: MOCK_EXTRACTION.summary.keyPoints,
          },
          coverageBreakdown: MOCK_EXTRACTION.coverages,
          exclusions: MOCK_EXTRACTION.exclusions,
          riskRadar: [
            { riskType: 'flood', level: MOCK_RISK_DATA.flood.zone, explanation: 'Near ' + MOCK_RISK_DATA.flood.nearestFloodArea },
            { riskType: 'crime', level: MOCK_RISK_DATA.crime.level, explanation: MOCK_RISK_DATA.crime.area },
          ],
          gaps: guidance.gaps,
          actions: guidance.actions,
          questions: guidance.questions,
          metadata: { extractionModel: 'demo', analyzedAt: new Date().toISOString() },
        },
      });
    }

    return res.status(200).json({ dashboard: policy.dashboard });
  }

  // POST - analyze new policy
  if (req.method === 'POST') {
    try {
      const { pdfText, filename } = req.body;

      if (!pdfText) {
        return res.status(400).json({ error: 'PDF text required' });
      }

      const policyId = 'policy-' + Date.now();

      // Extract with Claude
      const extraction = await extractWithClaude(pdfText);
      const guidance = runRulesEngine(extraction, MOCK_RISK_DATA);

      const dashboard = {
        summary: {
          policyId,
          insurer: extraction.metadata?.insurer || 'Unknown',
          productName: extraction.metadata?.productName || 'Policy',
          policyNumber: extraction.metadata?.policyNumber || 'N/A',
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
          { riskType: 'flood', level: MOCK_RISK_DATA.flood.zone, explanation: 'Near ' + MOCK_RISK_DATA.flood.nearestFloodArea },
          { riskType: 'crime', level: MOCK_RISK_DATA.crime.level, explanation: MOCK_RISK_DATA.crime.area },
        ],
        gaps: guidance.gaps,
        actions: guidance.actions,
        questions: guidance.questions,
        metadata: {
          extractionModel: process.env.ANTHROPIC_API_KEY ? 'claude-sonnet-4-20250514' : 'demo',
          analyzedAt: new Date().toISOString(),
        },
      };

      // Store in memory
      policies.set(policyId, { dashboard, filename });

      return res.status(200).json({
        success: true,
        policyId,
        dashboard,
      });
    } catch (error) {
      console.error('Analysis error:', error);
      return res.status(500).json({ error: 'Analysis failed: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
