/**
 * Rules Engine
 * Deterministic, explainable rule evaluation for policy guidance
 */

const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');
const crypto = require('crypto');

/**
 * Default ruleset (embedded, can be overridden by database)
 */
const DEFAULT_RULES = [
  // Flood Risk Rules
  {
    ruleId: 'FLOOD_001',
    name: 'High Flood Risk Without Coverage',
    category: 'risk',
    severity: 'high',
    condition: {
      and: [
        { field: 'risk.floodZone', operator: 'in', value: ['High', 'VeryHigh'] },
        { field: 'policy.hasFloodExclusion', operator: 'equals', value: true },
      ],
    },
    output: {
      gap: 'Flood risk not covered despite high-risk location',
      action: 'Request flood cover quote from your insurer or seek alternative provider',
      questions: [
        'Is flood cover excluded entirely or available via endorsement?',
        'What is the additional premium for flood coverage?',
      ],
    },
  },
  {
    ruleId: 'FLOOD_002',
    name: 'Moderate Flood Risk Warning',
    category: 'risk',
    severity: 'medium',
    condition: {
      and: [
        { field: 'risk.floodZone', operator: 'in', value: ['Medium', 'Moderate'] },
        { field: 'policy.hasFloodExclusion', operator: 'equals', value: true },
      ],
    },
    output: {
      gap: 'Property in moderate flood risk zone without flood coverage',
      action: 'Consider adding flood cover as a precaution',
      questions: ['What are the historical flood events in this area?'],
    },
  },

  // Crime Risk Rules
  {
    ruleId: 'CRIME_001',
    name: 'High Crime Area - Contents Coverage Check',
    category: 'risk',
    severity: 'high',
    condition: {
      and: [
        { field: 'risk.crimeRisk', operator: 'in', value: ['High', 'VeryHigh'] },
        {
          or: [
            { field: 'policy.contentsLimit', operator: 'lessThan', value: 50000 },
            { field: 'policy.hasSecurityRequirement', operator: 'equals', value: false },
          ],
        },
      ],
    },
    output: {
      gap: 'Contents coverage may be inadequate for high-crime area',
      action: 'Review contents limit and verify security requirements are met',
      questions: [
        'Does the policy require specific security measures?',
        'What is the single item limit for valuables?',
      ],
    },
  },

  // Coverage Gap Rules
  {
    ruleId: 'COV_001',
    name: 'Missing Liability Coverage',
    category: 'coverage',
    severity: 'high',
    condition: {
      and: [
        { field: 'policy.policyType', operator: 'equals', value: 'HOME' },
        { field: 'policy.hasLiabilityCoverage', operator: 'equals', value: false },
      ],
    },
    output: {
      gap: 'No public or occupier liability coverage detected',
      action: 'Verify liability coverage is included or add it separately',
      questions: ['Is liability cover included in the policy?'],
    },
  },
  {
    ruleId: 'COV_002',
    name: 'Buildings Sum Insured Check',
    category: 'coverage',
    severity: 'medium',
    condition: {
      and: [
        { field: 'policy.buildingsLimit', operator: 'lessThan', value: 200000 },
        { field: 'property.estimatedRebuildCost', operator: 'greaterThan', value: 200000 },
      ],
    },
    output: {
      gap: 'Buildings sum insured may be below rebuild cost',
      action: 'Get a rebuild cost assessment and update sum insured',
      questions: [
        'When was the buildings sum insured last reviewed?',
        'Does the policy include index linking?',
      ],
    },
  },
  {
    ruleId: 'COV_003',
    name: 'High Value Items Without Specified Cover',
    category: 'coverage',
    severity: 'medium',
    condition: {
      and: [
        { field: 'policy.singleItemLimit', operator: 'lessThan', value: 2000 },
        { field: 'user.hasHighValueItems', operator: 'equals', value: true },
      ],
    },
    output: {
      gap: 'Single item limit may not cover high-value possessions',
      action: 'List high-value items separately with your insurer',
      questions: [
        'What is the single article limit?',
        'What documentation is required for high-value items?',
      ],
    },
  },

  // Condition Rules
  {
    ruleId: 'COND_001',
    name: 'Unoccupancy Clause Check',
    category: 'conditions',
    severity: 'medium',
    condition: {
      and: [
        { field: 'policy.hasUnoccupancyClause', operator: 'equals', value: true },
        { field: 'policy.unoccupancyDays', operator: 'lessThan', value: 60 },
      ],
    },
    output: {
      gap: 'Short unoccupancy period may affect coverage during holidays',
      action: 'Notify insurer if property will be unoccupied for extended periods',
      questions: [
        'How many consecutive days can the property be unoccupied?',
        'What actions are required during extended absence?',
      ],
    },
  },
  {
    ruleId: 'COND_002',
    name: 'Security Requirements Not Met',
    category: 'conditions',
    severity: 'high',
    condition: {
      and: [
        { field: 'policy.hasSecurityRequirement', operator: 'equals', value: true },
        { field: 'property.securityCompliance', operator: 'equals', value: false },
      ],
    },
    output: {
      gap: 'Security requirements may not be met - could void coverage',
      action: 'Review and comply with all security requirements in the policy',
      questions: [
        'What specific security measures are required?',
        'Do all external doors have approved locks?',
      ],
    },
  },

  // Exclusion Warning Rules
  {
    ruleId: 'EXCL_001',
    name: 'Standard Exclusion - Gradual Damage',
    category: 'exclusions',
    severity: 'low',
    condition: {
      field: 'policy.hasGradualDamageExclusion',
      operator: 'equals',
      value: true,
    },
    output: {
      gap: 'Gradual damage (wear and tear, rot, rust) is excluded',
      action: 'Maintain property to prevent gradual deterioration',
      questions: [],
    },
  },
  {
    ruleId: 'EXCL_002',
    name: 'Subsidence Exclusion in Risk Area',
    category: 'exclusions',
    severity: 'high',
    condition: {
      and: [
        { field: 'risk.subsidenceRisk', operator: 'in', value: ['Medium', 'High'] },
        { field: 'policy.hasSubsidenceExclusion', operator: 'equals', value: true },
      ],
    },
    output: {
      gap: 'Subsidence excluded but property may be in risk area',
      action: 'Request subsidence cover or obtain geological survey',
      questions: ['Is subsidence, heave, or landslip covered?'],
    },
  },

  // Irish-Specific Rules
  {
    ruleId: 'IE_001',
    name: 'Storm Damage Excess Check',
    category: 'coverage',
    severity: 'low',
    condition: {
      and: [
        { field: 'risk.coastalProximity', operator: 'lessThan', value: 5 }, // km
        { field: 'policy.stormExcess', operator: 'greaterThan', value: 500 },
      ],
    },
    output: {
      gap: 'High storm excess for coastal property',
      action: 'Consider if storm excess is appropriate for location',
      questions: ['Is there a separate excess for storm damage?'],
    },
  },
  {
    ruleId: 'IE_002',
    name: 'Alternative Accommodation Limit',
    category: 'coverage',
    severity: 'low',
    condition: {
      field: 'policy.alternativeAccommodationLimit',
      operator: 'lessThan',
      value: 10000,
    },
    output: {
      gap: 'Alternative accommodation limit may be insufficient',
      action: 'Review if limit would cover temporary housing during major repairs',
      questions: ['What is the alternative accommodation limit and duration?'],
    },
  },
];

/**
 * Evaluate a single condition
 */
function evaluateCondition(condition, facts) {
  if (condition.and) {
    return condition.and.every((c) => evaluateCondition(c, facts));
  }

  if (condition.or) {
    return condition.or.some((c) => evaluateCondition(c, facts));
  }

  const { field, operator, value } = condition;
  const fieldValue = getNestedValue(facts, field);

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'notEquals':
      return fieldValue !== value;
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'notIn':
      return Array.isArray(value) && !value.includes(fieldValue);
    case 'lessThan':
      return typeof fieldValue === 'number' && fieldValue < value;
    case 'greaterThan':
      return typeof fieldValue === 'number' && fieldValue > value;
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(value.toLowerCase());
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    default:
      logger.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Get nested object value by dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Run all rules against facts
 */
function evaluateRules(rules, facts) {
  const results = {
    gaps: [],
    actions: [],
    questions: [],
    rulesTriggered: [],
    rulesEvaluated: rules.length,
  };

  for (const rule of rules) {
    try {
      const triggered = evaluateCondition(rule.condition, facts);

      if (triggered) {
        results.rulesTriggered.push(rule.ruleId);

        // Add gap
        if (rule.output.gap) {
          results.gaps.push({
            id: `gap_${rule.ruleId}`,
            ruleId: rule.ruleId,
            severity: rule.severity,
            category: rule.category,
            title: rule.name,
            description: rule.output.gap,
            evidence: buildEvidence(rule.condition, facts),
          });
        }

        // Add action
        if (rule.output.action) {
          results.actions.push({
            id: `action_${rule.ruleId}`,
            ruleId: rule.ruleId,
            priority: severityToPriority(rule.severity),
            text: rule.output.action,
            category: rule.category,
          });
        }

        // Add questions
        if (rule.output.questions?.length > 0) {
          for (const question of rule.output.questions) {
            results.questions.push({
              id: `q_${rule.ruleId}_${results.questions.length}`,
              ruleId: rule.ruleId,
              text: question,
              category: rule.category,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error evaluating rule ${rule.ruleId}:`, error);
    }
  }

  // Deduplicate questions
  const seenQuestions = new Set();
  results.questions = results.questions.filter((q) => {
    if (seenQuestions.has(q.text)) return false;
    seenQuestions.add(q.text);
    return true;
  });

  return results;
}

/**
 * Build evidence object for a triggered rule
 */
function buildEvidence(condition, facts) {
  const evidence = [];

  function extractFields(cond) {
    if (cond.and) {
      cond.and.forEach(extractFields);
    } else if (cond.or) {
      cond.or.forEach(extractFields);
    } else if (cond.field) {
      const value = getNestedValue(facts, cond.field);
      evidence.push({
        field: cond.field,
        expectedOperator: cond.operator,
        expectedValue: cond.value,
        actualValue: value,
      });
    }
  }

  extractFields(condition);
  return evidence;
}

/**
 * Convert severity to priority
 */
function severityToPriority(severity) {
  switch (severity) {
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
    default:
      return 4;
  }
}

/**
 * Build facts object from policy extraction and risk data
 */
function buildFacts(extraction, riskData = {}, userProfile = {}) {
  const facts = {
    policy: {
      policyType: extraction.metadata?.policyType || 'HOME',
      buildingsLimit: parseMonetaryValue(extraction.coverages?.find((c) => c.type === 'buildings')?.limit),
      contentsLimit: parseMonetaryValue(extraction.coverages?.find((c) => c.type === 'contents')?.limit),
      singleItemLimit: findSingleItemLimit(extraction.coverages),
      hasLiabilityCoverage: extraction.coverages?.some((c) => c.type === 'liability'),
      hasFloodExclusion: hasExclusion(extraction.exclusions, 'flood'),
      hasSubsidenceExclusion: hasExclusion(extraction.exclusions, 'subsidence'),
      hasGradualDamageExclusion: hasExclusion(extraction.exclusions, 'gradual'),
      hasSecurityRequirement: hasCondition(extraction.conditions, 'security'),
      hasUnoccupancyClause: hasCondition(extraction.conditions, 'unoccup'),
      unoccupancyDays: findUnoccupancyDays(extraction.conditions),
      stormExcess: findExcess(extraction.coverages, 'storm'),
      alternativeAccommodationLimit: findSubLimit(extraction.coverages, 'alternative accommodation'),
    },
    risk: {
      floodZone: riskData.flood?.zone || 'Unknown',
      crimeRisk: riskData.crime?.level || 'Unknown',
      subsidenceRisk: riskData.subsidence?.level || 'Unknown',
      coastalProximity: riskData.coastal?.distanceKm || 999,
    },
    property: {
      estimatedRebuildCost: userProfile.estimatedRebuildCost || null,
      securityCompliance: userProfile.securityCompliance ?? true,
    },
    user: {
      hasHighValueItems: userProfile.hasHighValueItems || false,
    },
  };

  return facts;
}

/**
 * Parse monetary value from string
 */
function parseMonetaryValue(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;

  const cleaned = value.replace(/[€,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Check if exclusion exists
 */
function hasExclusion(exclusions, keyword) {
  if (!exclusions) return false;
  return exclusions.some(
    (e) =>
      e.title?.toLowerCase().includes(keyword) ||
      e.description?.toLowerCase().includes(keyword)
  );
}

/**
 * Check if condition exists
 */
function hasCondition(conditions, keyword) {
  if (!conditions) return false;
  return conditions.some(
    (c) =>
      c.title?.toLowerCase().includes(keyword) ||
      c.description?.toLowerCase().includes(keyword)
  );
}

/**
 * Find single item limit
 */
function findSingleItemLimit(coverages) {
  if (!coverages) return null;

  for (const coverage of coverages) {
    if (coverage.subLimits) {
      const singleItem = coverage.subLimits.find((s) =>
        s.name?.toLowerCase().includes('single') ||
        s.name?.toLowerCase().includes('item')
      );
      if (singleItem) {
        return parseMonetaryValue(singleItem.limit);
      }
    }
  }
  return null;
}

/**
 * Find unoccupancy days limit
 */
function findUnoccupancyDays(conditions) {
  if (!conditions) return 60; // Default assumption

  for (const condition of conditions) {
    const match = condition.description?.match(/(\d+)\s*(?:consecutive\s*)?days?/i);
    if (match && condition.title?.toLowerCase().includes('unoccup')) {
      return parseInt(match[1], 10);
    }
  }
  return 60;
}

/**
 * Find excess amount
 */
function findExcess(coverages, type) {
  if (!coverages) return null;

  for (const coverage of coverages) {
    if (coverage.name?.toLowerCase().includes(type)) {
      return parseMonetaryValue(coverage.excess);
    }
    if (coverage.excess && type === 'standard') {
      return parseMonetaryValue(coverage.excess);
    }
  }
  return null;
}

/**
 * Find sub-limit
 */
function findSubLimit(coverages, name) {
  if (!coverages) return null;

  for (const coverage of coverages) {
    if (coverage.subLimits) {
      const subLimit = coverage.subLimits.find((s) =>
        s.name?.toLowerCase().includes(name.toLowerCase())
      );
      if (subLimit) {
        return parseMonetaryValue(subLimit.limit);
      }
    }
  }
  return null;
}

/**
 * Calculate inputs hash for determinism verification
 */
function calculateInputsHash(facts) {
  const serialized = JSON.stringify(facts, Object.keys(facts).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex').substring(0, 16);
}

/**
 * Get active ruleset from database or use default
 */
async function getActiveRuleset() {
  try {
    const ruleset = await prisma.ruleset.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (ruleset) {
      return {
        version: ruleset.version,
        rules: ruleset.rulesJson,
      };
    }
  } catch (error) {
    logger.warn('Could not fetch ruleset from database, using default');
  }

  return {
    version: 'default_v1',
    rules: DEFAULT_RULES,
  };
}

/**
 * Main function: Run rules engine
 */
async function runRulesEngine(extraction, riskData = {}, userProfile = {}) {
  const startTime = Date.now();

  // Get ruleset
  const { version: rulesetVersion, rules } = await getActiveRuleset();

  // Build facts
  const facts = buildFacts(extraction, riskData, userProfile);
  const inputsHash = calculateInputsHash(facts);

  // Evaluate rules
  const results = evaluateRules(rules, facts);

  // Sort by priority
  results.gaps.sort((a, b) => severityToPriority(a.severity) - severityToPriority(b.severity));
  results.actions.sort((a, b) => a.priority - b.priority);

  logger.info(`Rules engine completed: ${results.rulesTriggered.length}/${results.rulesEvaluated} rules triggered`);

  return {
    ...results,
    rulesetVersion,
    inputsHash,
    processingTimeMs: Date.now() - startTime,
  };
}

module.exports = {
  runRulesEngine,
  evaluateRules,
  buildFacts,
  getActiveRuleset,
  DEFAULT_RULES,
};
