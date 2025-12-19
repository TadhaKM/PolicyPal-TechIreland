/**
 * Database Seed Script
 * Populates initial data for development/testing
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test users
  const hashedPassword = await bcrypt.hash('TestPassword123', 12);

  const freeUser = await prisma.user.upsert({
    where: { email: 'free@example.com' },
    update: {},
    create: {
      email: 'free@example.com',
      hashedPassword,
      firstName: 'Free',
      lastName: 'User',
      plan: 'FREE',
    },
  });

  const premiumUser = await prisma.user.upsert({
    where: { email: 'premium@example.com' },
    update: {},
    create: {
      email: 'premium@example.com',
      hashedPassword,
      firstName: 'Premium',
      lastName: 'User',
      plan: 'PREMIUM',
    },
  });

  console.log('Created users:', { freeUser: freeUser.email, premiumUser: premiumUser.email });

  // Create default ruleset
  const defaultRuleset = await prisma.ruleset.upsert({
    where: { version: 'default_v1' },
    update: {},
    create: {
      version: 'default_v1',
      name: 'Default Irish Home Insurance Rules',
      description: 'Initial ruleset for Irish home insurance policy analysis',
      isActive: true,
      rulesJson: [
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
            questions: ['Is flood cover excluded entirely or available via endorsement?'],
          },
        },
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
      ],
      createdBy: 'system',
    },
  });

  console.log('Created ruleset:', defaultRuleset.version);

  // Create dataset metadata entries
  const datasets = [
    {
      datasetType: 'flood',
      version: 'opw_2024_v1',
      sourceUrl: 'https://www.floodinfo.ie/',
      license: 'Government Open Data',
    },
    {
      datasetType: 'crime',
      version: 'cso_2024_q3',
      sourceUrl: 'https://data.cso.ie/',
      license: 'CSO Open Data',
    },
    {
      datasetType: 'coastal',
      version: 'gsi_coastal_2023',
      sourceUrl: 'https://www.gsi.ie/',
      license: 'GSI Open Data',
    },
  ];

  for (const dataset of datasets) {
    await prisma.datasetMetadata.upsert({
      where: {
        datasetType_version: {
          datasetType: dataset.datasetType,
          version: dataset.version,
        },
      },
      update: {},
      create: {
        ...dataset,
        retrievedAt: new Date(),
        isActive: true,
      },
    });
  }

  console.log('Created dataset metadata entries');

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
