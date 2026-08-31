const { getFakeBackend } = require("../journeys/fakeBackend");

const handler = {
  get(_target, prop) {
    const backend = getFakeBackend();
    const value = backend[prop];
    if (typeof value === "function") return value.bind(backend);
    return value;
  },
};

const supabase = new Proxy({}, handler);

module.exports = {
  supabase,
  productionSupabase: supabase,
  authSupabase: supabase,
  SUPABASE_URL_RESOLVED: "http://localhost:54321",
  SUPABASE_PUBLISHABLE_KEY_RESOLVED: "test-anon-key",
  SUPABASE_PROJECT_ID_RESOLVED: "test-project",
  AUTH_SUPABASE_URL_RESOLVED: "http://localhost:54321",
  AUTH_SUPABASE_PUBLISHABLE_KEY_RESOLVED: "test-anon-key",
  AUTH_SUPABASE_PROJECT_ID_RESOLVED: "test-project",
};
