import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each suite boots its own server, database and Graph stand-in, so they
    // must not share a process — module-level state (the database handle, the
    // storage driver) is read once at import.
    pool: 'forks',
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    // Publishing waits on container polling, which is deliberately slow.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
