/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.app.json" }],
  },
  moduleNameMapper: {
    "^@/config/features$": "<rootDir>/src/test/mocks/features.js",
    "^@/integrations/supabase/client$": "<rootDir>/src/test/mocks/supabaseClient.js",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@packages/(.*)$": "<rootDir>/src/packages/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  clearMocks: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
