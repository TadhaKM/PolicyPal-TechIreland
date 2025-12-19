/**
 * Storage Service
 * Handles S3-compatible object storage for PDFs and artifacts
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize S3 client
const s3Client = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  ...(config.s3.endpoint && { endpoint: config.s3.endpoint }),
});

const BUCKET = config.s3.bucket;

/**
 * Generate a unique key for storing a file
 */
function generateKey(userId, filename, type = 'policies') {
  const ext = filename.split('.').pop();
  const uniqueId = uuidv4();
  const date = new Date().toISOString().split('T')[0];
  return `${type}/${userId}/${date}/${uniqueId}.${ext}`;
}

/**
 * Upload a file to S3
 */
async function uploadFile(buffer, key, contentType = 'application/pdf') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    });

    await s3Client.send(command);

    logger.info(`File uploaded: ${key}`);

    return {
      key,
      url: `s3://${BUCKET}/${key}`,
    };
  } catch (error) {
    logger.error('S3 upload error:', error);
    throw new Error('Failed to upload file to storage');
  }
}

/**
 * Get a file from S3
 */
async function getFile(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);
    const chunks = [];

    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    logger.error('S3 get error:', error);
    throw new Error('Failed to retrieve file from storage');
  }
}

/**
 * Delete a file from S3
 */
async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    logger.info(`File deleted: ${key}`);
  } catch (error) {
    logger.error('S3 delete error:', error);
    throw new Error('Failed to delete file from storage');
  }
}

/**
 * Check if a file exists
 */
async function fileExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Generate a presigned URL for downloading
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error('S3 presigned URL error:', error);
    throw new Error('Failed to generate download URL');
  }
}

/**
 * Generate a presigned URL for uploading
 */
async function getUploadPresignedUrl(key, contentType = 'application/pdf', expiresIn = 3600) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error('S3 upload presigned URL error:', error);
    throw new Error('Failed to generate upload URL');
  }
}

/**
 * Extract the key from an S3 URL
 */
function getKeyFromUrl(url) {
  if (url.startsWith('s3://')) {
    return url.replace(`s3://${BUCKET}/`, '');
  }
  return url;
}

module.exports = {
  generateKey,
  uploadFile,
  getFile,
  deleteFile,
  fileExists,
  getPresignedUrl,
  getUploadPresignedUrl,
  getKeyFromUrl,
};
