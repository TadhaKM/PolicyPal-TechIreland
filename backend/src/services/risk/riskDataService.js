/**
 * Risk Data Integration Service
 * Integrates with government datasets for flood, crime, and other risk data
 */

const { prisma } = require('../../config/database');
const { getRedisClient } = require('../../config/redis');
const logger = require('../../utils/logger');

// Cache TTL in seconds
const CACHE_TTL = 24 * 60 * 60; // 24 hours

/**
 * Geocode an address to lat/lon
 * Uses OpenStreetMap Nominatim (free) or could use Google/Here
 */
async function geocodeAddress(address, eircode = null) {
  const cacheKey = `geocode:${eircode || address}`;

  try {
    // Check cache first
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build query - prefer eircode for Ireland
    const query = eircode
      ? `${eircode}, Ireland`
      : `${address}, Ireland`;

    // Use Nominatim API (free, rate-limited)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
          q: query,
          format: 'json',
          limit: '1',
          countrycodes: 'ie',
        }),
      {
        headers: {
          'User-Agent': 'PolicyPal/1.0 (insurance policy analysis)',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      displayName: data[0].display_name,
      confidence: data[0].importance || 0.5,
      source: 'nominatim',
    };

    // Cache the result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Get flood risk data for a location
 * Uses OPW (Office of Public Works) flood maps data
 */
async function getFloodRisk(latitude, longitude) {
  const cacheKey = `flood:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // In production, this would query OPW flood maps API or a cached copy
    // For now, we simulate based on location patterns

    // Check if near known flood-prone areas (simplified)
    const floodProneAreas = [
      { name: 'Shannon Basin', lat: 52.8, lon: -8.5, radius: 50 },
      { name: 'Cork City', lat: 51.9, lon: -8.5, radius: 10 },
      { name: 'Galway Bay', lat: 53.27, lon: -9.05, radius: 15 },
      { name: 'Dublin Coastal', lat: 53.35, lon: -6.1, radius: 5 },
    ];

    let zone = 'Low';
    let nearestArea = null;

    for (const area of floodProneAreas) {
      const distance = calculateDistance(latitude, longitude, area.lat, area.lon);
      if (distance < area.radius) {
        zone = distance < area.radius / 2 ? 'High' : 'Medium';
        nearestArea = area.name;
        break;
      }
    }

    // Get dataset version
    const datasetMeta = await getDatasetVersion('flood');

    const result = {
      zone,
      probability: zone === 'High' ? 0.75 : zone === 'Medium' ? 0.35 : 0.05,
      nearestFloodArea: nearestArea,
      fluvialtRisk: zone !== 'Low',
      coastalRisk: longitude < -9 || (latitude > 53 && longitude < -6),
      datasetVersion: datasetMeta?.version || 'opw_2024_v1',
      retrievedAt: new Date().toISOString(),
      source: 'OPW Flood Maps (simulated)',
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Flood risk lookup error:', error);
    return {
      zone: 'Unknown',
      error: error.message,
    };
  }
}

/**
 * Get crime statistics for an area
 * Uses CSO (Central Statistics Office) crime data
 */
async function getCrimeStats(latitude, longitude, eircode = null) {
  const cacheKey = `crime:${eircode || `${latitude.toFixed(3)}:${longitude.toFixed(3)}`}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // In production, this would query CSO API or a cached copy
    // Simplified simulation based on urban/rural classification

    // Urban areas (higher crime generally)
    const urbanAreas = [
      { name: 'Dublin', lat: 53.35, lon: -6.26, radius: 20, factor: 1.5 },
      { name: 'Cork', lat: 51.9, lon: -8.47, radius: 10, factor: 1.3 },
      { name: 'Galway', lat: 53.27, lon: -9.05, radius: 8, factor: 1.2 },
      { name: 'Limerick', lat: 52.67, lon: -8.63, radius: 8, factor: 1.4 },
    ];

    let level = 'Low';
    let factor = 1.0;
    let area = 'Rural';

    for (const urban of urbanAreas) {
      const distance = calculateDistance(latitude, longitude, urban.lat, urban.lon);
      if (distance < urban.radius) {
        area = urban.name;
        factor = urban.factor * (1 - distance / urban.radius);
        if (factor > 1.3) level = 'High';
        else if (factor > 1.1) level = 'Medium';
        break;
      }
    }

    const datasetMeta = await getDatasetVersion('crime');

    const result = {
      level,
      area,
      burglaryRate: Math.round(factor * 150), // per 100k population (simulated)
      theftRate: Math.round(factor * 250),
      criminalDamageRate: Math.round(factor * 100),
      datasetVersion: datasetMeta?.version || 'cso_2024_q3',
      retrievedAt: new Date().toISOString(),
      source: 'CSO Crime Statistics (simulated)',
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Crime stats lookup error:', error);
    return {
      level: 'Unknown',
      error: error.message,
    };
  }
}

/**
 * Get coastal erosion risk
 */
async function getCoastalRisk(latitude, longitude) {
  const cacheKey = `coastal:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate distance to coast (simplified - assumes coast is roughly at western/eastern edges)
    // In production, would use actual coastline GeoJSON

    let distanceToCoast = 999;
    let coastDirection = null;

    // Simplified: check if near any coast
    // West coast roughly at -10 longitude
    // East coast roughly at -6 longitude
    if (longitude < -9.5) {
      distanceToCoast = Math.abs(longitude - (-10)) * 85; // Rough km per degree
      coastDirection = 'West';
    } else if (longitude > -6.5 && latitude > 52 && latitude < 54) {
      distanceToCoast = Math.abs(longitude - (-5.5)) * 85;
      coastDirection = 'East';
    }

    const result = {
      distanceKm: Math.round(distanceToCoast),
      direction: coastDirection,
      erosionRisk: distanceToCoast < 1 ? 'High' : distanceToCoast < 5 ? 'Medium' : 'Low',
      stormSurgeRisk: distanceToCoast < 2,
      datasetVersion: 'gsi_coastal_2023',
      source: 'GSI Coastal Data (simulated)',
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Coastal risk lookup error:', error);
    return {
      distanceKm: null,
      error: error.message,
    };
  }
}

/**
 * Get subsidence/ground stability risk
 */
async function getSubsidenceRisk(latitude, longitude) {
  const cacheKey = `subsidence:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Simplified - in production would use GSI geological data
    // Some areas in Ireland have karst limestone (sinkhole risk)

    const karstAreas = [
      { name: 'The Burren', lat: 53.05, lon: -9.0, radius: 20 },
      { name: 'Marble Arch', lat: 54.25, lon: -7.8, radius: 10 },
    ];

    let level = 'Low';
    let reason = null;

    for (const karst of karstAreas) {
      const distance = calculateDistance(latitude, longitude, karst.lat, karst.lon);
      if (distance < karst.radius) {
        level = distance < karst.radius / 2 ? 'Medium' : 'Low';
        reason = `Near ${karst.name} karst region`;
        break;
      }
    }

    const result = {
      level,
      reason,
      geologyType: 'Unknown', // Would come from GSI data
      historicalEvents: 0,
      datasetVersion: 'gsi_geology_2023',
      source: 'GSI Geological Survey (simulated)',
    };

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    logger.error('Subsidence risk lookup error:', error);
    return {
      level: 'Unknown',
      error: error.message,
    };
  }
}

/**
 * Get all risk data for a location
 */
async function getAllRiskData(latitude, longitude, eircode = null) {
  const startTime = Date.now();

  const [flood, crime, coastal, subsidence] = await Promise.all([
    getFloodRisk(latitude, longitude),
    getCrimeStats(latitude, longitude, eircode),
    getCoastalRisk(latitude, longitude),
    getSubsidenceRisk(latitude, longitude),
  ]);

  return {
    flood,
    crime,
    coastal,
    subsidence,
    location: {
      latitude,
      longitude,
      eircode,
    },
    processingTimeMs: Date.now() - startTime,
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get dataset version from database
 */
async function getDatasetVersion(datasetType) {
  try {
    return await prisma.datasetMetadata.findFirst({
      where: {
        datasetType,
        isActive: true,
      },
      orderBy: { retrievedAt: 'desc' },
    });
  } catch (error) {
    logger.warn(`Could not get dataset version for ${datasetType}`);
    return null;
  }
}

/**
 * Update dataset metadata (called by scheduled job)
 */
async function updateDatasetMetadata(datasetType, version, sourceUrl, recordCount = null) {
  try {
    // Deactivate previous versions
    await prisma.datasetMetadata.updateMany({
      where: { datasetType },
      data: { isActive: false },
    });

    // Create new version
    return await prisma.datasetMetadata.create({
      data: {
        datasetType,
        version,
        sourceUrl,
        recordCount,
        retrievedAt: new Date(),
        isActive: true,
      },
    });
  } catch (error) {
    logger.error('Failed to update dataset metadata:', error);
    throw error;
  }
}

module.exports = {
  geocodeAddress,
  getFloodRisk,
  getCrimeStats,
  getCoastalRisk,
  getSubsidenceRisk,
  getAllRiskData,
  updateDatasetMetadata,
};
