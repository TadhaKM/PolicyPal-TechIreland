/**
 * Demo Dashboard API - Vercel Serverless Function
 * Returns mock dashboard data for demonstration
 */

const MOCK_EXTRACTION = {
  metadata: {
    insurer: 'Allianz Ireland',
    productName: 'Home Insurance Plus',
    policyNumber: 'HI-2025-78432',
    propertyAddress: '42 Oakwood Drive, Blackrock, Co. Dublin',
    eircode: 'A94 T8F2',
    periodStart: '2025-01-01',
    periodEnd: '2026-01-01',
  },
  coverages: [
    { name: 'Buildings', type: 'buildings', limit: '€450,000', excess: '€250', included: true },
    { name: 'Contents', type: 'contents', limit: '€75,000', excess: '€250', included: true },
    { name: 'Public Liability', type: 'liability', limit: '€2,600,000', included: true },
    { name: 'Alternative Accommodation', type: 'addon', limit: '€25,000', included: true },
  ],
  exclusions: [
    { title: 'Flood Damage', severity: 'high', description: 'Loss or damage caused by flood is excluded', scope: 'general' },
    { title: 'Gradual Deterioration', severity: 'low', description: 'Wear and tear, rot, rust excluded', scope: 'general' },
    { title: 'Unoccupancy over 60 days', severity: 'medium', description: 'Cover limited if unoccupied 60+ days', scope: 'general' },
    { title: 'Business Use', severity: 'medium', description: 'Business equipment or stock not covered', scope: 'contents' },
  ],
  summary: {
    keyPoints: [
      'Buildings covered to €450,000 (rebuild cost)',
      'Contents limit €75,000 with €3,000 single article limit',
      'Public liability cover of €2.6 million included',
      'Flood damage is excluded - consider requesting cover',
      '60-day unoccupancy restriction applies',
    ],
  },
};

const MOCK_RISK_DATA = {
  flood: { zone: 'Medium', nearestFloodArea: 'River Liffey Basin', datasetVersion: 'opw_2024_v1' },
  crime: { level: 'Medium', area: 'Dublin South', burglaryRate: 185, datasetVersion: 'cso_2024_q3' },
  coastal: { distanceKm: 12, erosionRisk: 'Low' },
  subsidence: { level: 'Low', geologyType: 'Limestone' },
};

function runRulesEngine(extraction, riskData) {
  const gaps = [];
  const actions = [];
  const questions = [];

  // Flood risk rule
  const hasFloodExclusion = extraction.exclusions?.some(e => e.title?.toLowerCase().includes('flood'));
  if (hasFloodExclusion && ['Medium', 'High'].includes(riskData.flood?.zone)) {
    gaps.push({
      severity: 'high',
      title: 'Flood Risk Without Coverage',
      description: `Property in ${riskData.flood.zone} flood zone but flood damage is excluded`,
    });
    actions.push({ priority: 1, text: 'Request a flood cover quote from your insurer' });
    questions.push({ text: 'Is flood cover available as an optional endorsement?' });
  }

  // Security rule
  actions.push({ priority: 2, text: 'Verify all security requirements are met to avoid claim rejection' });

  // Unoccupancy rule
  const hasUnoccupancy = extraction.exclusions?.some(e => e.title?.toLowerCase().includes('unoccup'));
  if (hasUnoccupancy) {
    actions.push({ priority: 3, text: 'Notify insurer if property will be unoccupied for extended periods' });
    questions.push({ text: 'Can the unoccupancy period be extended if needed?' });
  }

  questions.push({ text: 'Do you have items worth more than the single article limit?' });

  return { gaps, actions, questions };
}

export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guidance = runRulesEngine(MOCK_EXTRACTION, MOCK_RISK_DATA);

  const dashboard = {
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
      },
      {
        riskType: 'crime',
        level: MOCK_RISK_DATA.crime.level,
        explanation: `${MOCK_RISK_DATA.crime.area} - Burglary rate: ${MOCK_RISK_DATA.crime.burglaryRate}/100k`,
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
      extractionModel: 'demo-data',
      rulesetVersion: 'v1.0.0',
      analyzedAt: new Date().toISOString(),
    },
  };

  res.status(200).json({ dashboard });
}
