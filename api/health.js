/**
 * Health Check API - Vercel Serverless Function
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(200).json({
    status: 'healthy',
    version: '1.0.0',
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY,
  });
}
