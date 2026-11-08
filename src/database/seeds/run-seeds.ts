import 'reflect-metadata';
import dataSource from '../data-source';
import { seedAll } from './seed-runner';

async function main(): Promise<void> {
  const skipDemo = process.env.SEED_SKIP_DEMO === 'true';
  await dataSource.initialize();
  try {
    const summary = await seedAll(dataSource, { demoUsers: !skipDemo });

    console.log(
      `Seeded roles=${summary.roles} places=${summary.places} contacts=${summary.externalContacts} demoUsers=${summary.demoUsers}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
