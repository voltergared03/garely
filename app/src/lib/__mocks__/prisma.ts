// Used by `vi.mock('@/lib/prisma')` in unit tests: a deep mock of the Prisma
// client so route/lib tests run without a database.
//
// Excluded from the production tsconfig (see tsconfig "exclude"), so the build
// never depends on the test-only `vitest-mock-extended` devDependency.
import { mockDeep } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

export const prisma = mockDeep<PrismaClient>();
