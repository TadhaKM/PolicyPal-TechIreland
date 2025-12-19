/**
 * PDF Extractor Service
 * Handles PDF text extraction, layout understanding, and structure detection
 */

const pdfParse = require('pdf-parse');
const logger = require('../../utils/logger');

/**
 * Extract text and structure from a PDF buffer
 */
async function extractFromPdf(pdfBuffer) {
  try {
    const startTime = Date.now();

    // Parse PDF
    const data = await pdfParse(pdfBuffer, {
      // Custom page render function to capture page numbers
      pagerender: renderPage,
    });

    const result = {
      text: data.text,
      pageCount: data.numpages,
      metadata: {
        title: data.info?.Title || null,
        author: data.info?.Author || null,
        creator: data.info?.Creator || null,
        producer: data.info?.Producer || null,
        creationDate: data.info?.CreationDate || null,
      },
      pages: parsePages(data.text, data.numpages),
      isScanned: detectScannedPdf(data),
      processingTimeMs: Date.now() - startTime,
    };

    logger.info(`PDF extracted: ${data.numpages} pages in ${result.processingTimeMs}ms`);

    return result;
  } catch (error) {
    logger.error('PDF extraction error:', error);
    throw new Error(`Failed to extract PDF: ${error.message}`);
  }
}

/**
 * Custom page render function
 */
function renderPage(pageData) {
  return pageData.getTextContent().then((textContent) => {
    let lastY = null;
    let text = '';

    for (const item of textContent.items) {
      if (lastY !== item.transform[5]) {
        text += '\n';
      }
      text += item.str;
      lastY = item.transform[5];
    }

    return text;
  });
}

/**
 * Split extracted text into pages (heuristic-based)
 */
function parsePages(fullText, pageCount) {
  const pages = [];
  const lines = fullText.split('\n');
  const linesPerPage = Math.ceil(lines.length / pageCount);

  for (let i = 0; i < pageCount; i++) {
    const startLine = i * linesPerPage;
    const endLine = Math.min((i + 1) * linesPerPage, lines.length);
    const pageText = lines.slice(startLine, endLine).join('\n');

    pages.push({
      pageNumber: i + 1,
      text: pageText,
      lineCount: endLine - startLine,
    });
  }

  return pages;
}

/**
 * Detect if PDF is scanned (image-based) vs digitally native
 */
function detectScannedPdf(pdfData) {
  // Heuristic: if text content is very low compared to page count, likely scanned
  const charsPerPage = pdfData.text.length / pdfData.numpages;
  return charsPerPage < 100;
}

/**
 * Detect document sections based on headings and formatting
 */
function detectSections(pages) {
  const sections = [];
  const sectionPatterns = [
    /^(?:section|part|chapter)\s*(\d+|[ivxlc]+)/i,
    /^\d+\.\s+[A-Z]/,
    /^[A-Z][A-Z\s]+$/,
  ];

  const insuranceSectionKeywords = [
    'buildings',
    'contents',
    'liability',
    'personal possessions',
    'legal expenses',
    'home emergency',
    'accidental damage',
    'general conditions',
    'general exclusions',
    'definitions',
    'how to claim',
    'endorsements',
  ];

  for (const page of pages) {
    const lines = page.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check pattern matches
      const isHeading = sectionPatterns.some((pattern) => pattern.test(line));

      // Check insurance-specific keywords
      const isInsuranceSection = insuranceSectionKeywords.some((keyword) =>
        line.toLowerCase().includes(keyword)
      );

      if (isHeading || isInsuranceSection) {
        sections.push({
          title: line,
          pageNumber: page.pageNumber,
          lineIndex: i,
          type: isInsuranceSection ? 'coverage' : 'general',
        });
      }
    }
  }

  return sections;
}

/**
 * Extract tables from text (basic heuristic)
 */
function extractTables(text) {
  const tables = [];
  const lines = text.split('\n');

  let currentTable = null;
  let tableStartLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect table-like patterns (columns separated by multiple spaces or tabs)
    const hasMultipleColumns = (line.match(/\s{3,}/g) || []).length >= 2;
    const hasTabularData = /\d[\d,]*\s{3,}/.test(line);

    if (hasMultipleColumns || hasTabularData) {
      if (!currentTable) {
        currentTable = [];
        tableStartLine = i;
      }
      currentTable.push(line);
    } else if (currentTable && currentTable.length >= 2) {
      tables.push({
        startLine: tableStartLine,
        endLine: i - 1,
        rows: currentTable,
      });
      currentTable = null;
    } else {
      currentTable = null;
    }
  }

  return tables;
}

/**
 * Chunk document for LLM processing
 */
function chunkDocument(pages, maxChunkSize = 4000) {
  const chunks = [];
  let currentChunk = {
    text: '',
    pageRange: { start: 1, end: 1 },
    sections: [],
  };

  for (const page of pages) {
    const pageText = `\n--- Page ${page.pageNumber} ---\n${page.text}`;

    if (currentChunk.text.length + pageText.length > maxChunkSize) {
      // Save current chunk and start new one
      if (currentChunk.text.length > 0) {
        chunks.push(currentChunk);
      }

      currentChunk = {
        text: pageText,
        pageRange: { start: page.pageNumber, end: page.pageNumber },
        sections: [],
      };
    } else {
      currentChunk.text += pageText;
      currentChunk.pageRange.end = page.pageNumber;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.text.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Extract key metadata from first few pages
 */
function extractMetadataHints(pages) {
  const firstPages = pages.slice(0, 3).map((p) => p.text).join('\n');

  const hints = {
    possibleInsurer: null,
    possiblePolicyNumber: null,
    possibleAddress: null,
    possibleDates: [],
  };

  // Common Irish insurers
  const insurers = [
    'Allianz',
    'AXA',
    'Aviva',
    'Zurich',
    'FBD',
    'Liberty',
    'RSA',
    'Irish Life',
    'Bank of Ireland',
    'AIB',
  ];

  for (const insurer of insurers) {
    if (firstPages.toLowerCase().includes(insurer.toLowerCase())) {
      hints.possibleInsurer = insurer;
      break;
    }
  }

  // Policy number patterns
  const policyNumberMatch = firstPages.match(
    /(?:policy\s*(?:no|number|#)?[:.\s]*)?([A-Z]{2,4}[\d-]{6,15})/i
  );
  if (policyNumberMatch) {
    hints.possiblePolicyNumber = policyNumberMatch[1];
  }

  // Date patterns (DD/MM/YYYY or similar)
  const dateMatches = firstPages.match(
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g
  );
  if (dateMatches) {
    hints.possibleDates = dateMatches.slice(0, 5);
  }

  // Eircode pattern
  const eircodeMatch = firstPages.match(
    /\b([A-Z]\d{2}\s*[A-Z\d]{4})\b/i
  );
  if (eircodeMatch) {
    hints.possibleEircode = eircodeMatch[1].toUpperCase();
  }

  return hints;
}

module.exports = {
  extractFromPdf,
  detectSections,
  extractTables,
  chunkDocument,
  extractMetadataHints,
};
