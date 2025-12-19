/**
 * LLM Extractor Service
 * Uses OpenAI models for structured policy extraction
 * Implements hybrid GPT-4/3.5 approach for accuracy + speed
 */

const OpenAI = require('openai');
const config = require('../../config');
const logger = require('../../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * Policy extraction schema for structured output
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    metadata: {
      type: 'object',
      properties: {
        insurer: { type: 'string' },
        productName: { type: 'string' },
        policyNumber: { type: 'string' },
        insuredParties: { type: 'array', items: { type: 'string' } },
        propertyAddress: { type: 'string' },
        eircode: { type: 'string' },
        periodStart: { type: 'string' },
        periodEnd: { type: 'string' },
      },
    },
    coverages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['buildings', 'contents', 'liability', 'addon'] },
          limit: { type: 'string' },
          excess: { type: 'string' },
          subLimits: { type: 'array', items: { type: 'object' } },
          conditions: { type: 'array', items: { type: 'string' } },
          included: { type: 'boolean' },
          notes: { type: 'string' },
          citations: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    exclusions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          scope: { type: 'string', enum: ['general', 'buildings', 'contents', 'liability', 'specific'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          citations: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    conditions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: ['security', 'occupancy', 'maintenance', 'notification', 'other'] },
          citations: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          definition: { type: 'string' },
        },
      },
    },
    endorsements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          modifies: { type: 'string' },
          citations: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    summary: {
      type: 'object',
      properties: {
        keyPoints: { type: 'array', items: { type: 'string' } },
        totalBuildingsLimit: { type: 'string' },
        totalContentsLimit: { type: 'string' },
        annualPremium: { type: 'string' },
      },
    },
  },
};

/**
 * System prompt for policy extraction
 */
const EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance policy analyst specializing in Irish home and motor insurance. Your task is to extract structured information from insurance policy documents.

CRITICAL REQUIREMENTS:
1. Extract ALL coverages, exclusions, conditions, and endorsements
2. For each item, include citations with page numbers and exact quotes
3. Identify ALL monetary limits and excesses
4. Flag any unusual or noteworthy terms
5. Be thorough - missing an exclusion could lead to claim denial

OUTPUT FORMAT:
- Return valid JSON matching the provided schema
- Use null for unknown/missing fields, not empty strings
- Dates should be in ISO format (YYYY-MM-DD)
- Monetary values should include currency (€)
- Citations must include: pageNumber, snippet (exact quote), context

IRISH INSURANCE CONTEXT:
- Common insurers: Allianz, AXA, Aviva, Zurich, FBD, Liberty
- Eircode format: A65 F4E2
- Flood cover often excluded but available as endorsement
- Standard excess typically €250-€500
- Buildings sum insured typically covers rebuild cost, not market value`;

/**
 * Extract policy information using GPT-4 (high accuracy)
 */
async function extractWithGPT4(chunks, metadataHints = {}) {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Process chunks and merge results
    const extractionPromises = chunks.map((chunk, index) =>
      extractChunk(chunk, index, chunks.length, config.openai.extractionModel)
    );

    const chunkResults = await Promise.all(extractionPromises);

    // Merge all chunk extractions
    const merged = mergeExtractions(chunkResults);

    // Calculate total tokens
    tokensUsed = chunkResults.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

    // Validate and refine with GPT-4
    const validated = await validateExtraction(merged, metadataHints);

    logger.info(`LLM extraction completed in ${Date.now() - startTime}ms, tokens: ${tokensUsed}`);

    return {
      extraction: validated,
      tokensUsed,
      processingTimeMs: Date.now() - startTime,
      modelVersion: config.openai.extractionModel,
    };
  } catch (error) {
    logger.error('LLM extraction error:', error);
    throw new Error(`LLM extraction failed: ${error.message}`);
  }
}

/**
 * Extract a single chunk
 */
async function extractChunk(chunk, chunkIndex, totalChunks, model) {
  const userPrompt = `Extract insurance policy information from this document chunk (${chunkIndex + 1}/${totalChunks}).

Pages ${chunk.pageRange.start}-${chunk.pageRange.end}:

${chunk.text}

Extract all coverages, exclusions, conditions, and relevant information. Include page numbers in citations.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      chunkIndex,
      pageRange: chunk.pageRange,
      extraction: parsed,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    logger.error(`Chunk ${chunkIndex} extraction error:`, error);
    return {
      chunkIndex,
      pageRange: chunk.pageRange,
      extraction: {},
      error: error.message,
    };
  }
}

/**
 * Merge extractions from multiple chunks
 */
function mergeExtractions(chunkResults) {
  const merged = {
    metadata: {},
    coverages: [],
    exclusions: [],
    conditions: [],
    definitions: [],
    endorsements: [],
    summary: { keyPoints: [] },
  };

  for (const result of chunkResults) {
    if (result.error || !result.extraction) continue;

    const ext = result.extraction;

    // Merge metadata (prefer non-null values)
    if (ext.metadata) {
      for (const [key, value] of Object.entries(ext.metadata)) {
        if (value && !merged.metadata[key]) {
          merged.metadata[key] = value;
        }
      }
    }

    // Merge arrays (deduplicate by title/name)
    if (ext.coverages) {
      merged.coverages.push(...ext.coverages);
    }
    if (ext.exclusions) {
      merged.exclusions.push(...ext.exclusions);
    }
    if (ext.conditions) {
      merged.conditions.push(...ext.conditions);
    }
    if (ext.definitions) {
      merged.definitions.push(...ext.definitions);
    }
    if (ext.endorsements) {
      merged.endorsements.push(...ext.endorsements);
    }
    if (ext.summary?.keyPoints) {
      merged.summary.keyPoints.push(...ext.summary.keyPoints);
    }
  }

  // Deduplicate arrays
  merged.coverages = deduplicateByField(merged.coverages, 'name');
  merged.exclusions = deduplicateByField(merged.exclusions, 'title');
  merged.conditions = deduplicateByField(merged.conditions, 'title');
  merged.definitions = deduplicateByField(merged.definitions, 'term');
  merged.endorsements = deduplicateByField(merged.endorsements, 'title');
  merged.summary.keyPoints = [...new Set(merged.summary.keyPoints)];

  return merged;
}

/**
 * Deduplicate array by a specific field
 */
function deduplicateByField(array, field) {
  const seen = new Set();
  return array.filter((item) => {
    const key = item[field]?.toLowerCase();
    if (key && seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Validate and refine extraction using GPT-4
 */
async function validateExtraction(extraction, hints = {}) {
  const validationPrompt = `Review and validate this insurance policy extraction. Fix any errors and fill in missing information based on context.

Current extraction:
${JSON.stringify(extraction, null, 2)}

Metadata hints from document:
${JSON.stringify(hints, null, 2)}

Tasks:
1. Verify all monetary values are correctly formatted
2. Ensure all citations have page numbers
3. Check exclusion severity ratings are appropriate
4. Add any obvious missing coverages (buildings, contents, liability are standard)
5. Validate dates are in ISO format

Return the corrected extraction as JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.extractionModel,
      messages: [
        { role: 'system', content: 'You are an insurance policy validation expert. Return only valid JSON.' },
        { role: 'user', content: validationPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4000,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.warn('Validation failed, using unvalidated extraction:', error.message);
    return extraction;
  }
}

/**
 * Generate confidence scores for extracted fields
 */
function calculateConfidence(extraction) {
  const confidence = {
    overall: 0.8,
    fields: {},
  };

  // Check metadata completeness
  const metadataFields = ['insurer', 'policyNumber', 'propertyAddress', 'periodStart', 'periodEnd'];
  const filledMetadata = metadataFields.filter(
    (f) => extraction.metadata?.[f]
  ).length;
  confidence.fields.metadata = filledMetadata / metadataFields.length;

  // Check coverage completeness (expect at least buildings + contents)
  const hasBuildingsCoverage = extraction.coverages?.some(
    (c) => c.type === 'buildings' || c.name?.toLowerCase().includes('building')
  );
  const hasContentsCoverage = extraction.coverages?.some(
    (c) => c.type === 'contents' || c.name?.toLowerCase().includes('content')
  );
  confidence.fields.coverages = (hasBuildingsCoverage ? 0.5 : 0) + (hasContentsCoverage ? 0.5 : 0);

  // Check if exclusions have citations
  const exclusionsWithCitations =
    extraction.exclusions?.filter((e) => e.citations?.length > 0).length || 0;
  const totalExclusions = extraction.exclusions?.length || 1;
  confidence.fields.exclusions = exclusionsWithCitations / totalExclusions;

  // Calculate overall confidence
  const fieldScores = Object.values(confidence.fields);
  confidence.overall = fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length;

  // Flag if needs review
  confidence.needsReview = confidence.overall < 0.7;

  return confidence;
}

/**
 * Quick extraction using GPT-3.5 (for candidate generation)
 */
async function quickExtract(text, maxTokens = 2000) {
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.validationModel,
      messages: [
        {
          role: 'system',
          content: 'Extract key insurance policy information. Return JSON with: insurer, policyNumber, coverages (list), exclusions (list), totalLimit.',
        },
        { role: 'user', content: text.substring(0, 8000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: maxTokens,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.error('Quick extraction error:', error);
    return null;
  }
}

module.exports = {
  extractWithGPT4,
  quickExtract,
  calculateConfidence,
  EXTRACTION_SCHEMA,
};
