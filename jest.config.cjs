/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.app.json" }],
  },
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/src/test/mocks/styleMock.js",
    "^@/server/(.*)$": "<rootDir>/apps/web-next/src/server/$1",
    "^@/components/analytics/PostHogIdentity$": "<rootDir>/src/test/mocks/PostHogIdentity.tsx",
    "^@/config/features$": "<rootDir>/src/test/mocks/features.js",
    "^@/integrations/supabase/client$": "<rootDir>/src/test/mocks/supabaseClient.js",
    ".*/integrations/supabase/client$": "<rootDir>/src/test/mocks/supabaseClient.js",
    "^@/lib/nextApiClient$": "<rootDir>/src/test/mocks/nextApiClient.js",
    "^@/lib/mapbox$": "<rootDir>/src/test/mocks/mapbox.js",
    "^@/lib/security/audit$": "<rootDir>/src/test/mocks/audit.js",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@packages/(.*)$": "<rootDir>/src/packages/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  clearMocks: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
