import { definePrismaConfig } from 'prisma/config';
import { defineConfig } from '@prisma/orm-mongo/config';

// Offline emission only: no database URL, initialization or schema synchronization.
export default definePrismaConfig({
  orm: defineConfig({ contract: './src/persistence/prisma/contract.ts', output: './src/persistence/prisma/generated' }),
});
