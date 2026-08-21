const chain = () => {
  const value = {
    data: null,
    error: null,
    count: 0,
    select: jest.fn(() => value),
    insert: jest.fn(() => value),
    update: jest.fn(() => value),
    delete: jest.fn(() => value),
    eq: jest.fn(() => value),
    neq: jest.fn(() => value),
    in: jest.fn(() => value),
    ilike: jest.fn(() => value),
    order: jest.fn(() => value),
    limit: jest.fn(() => value),
    maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    single: jest.fn(async () => ({ data: null, error: null })),
    then: (resolve) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  };
  return value;
};

const supabase = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithPassword: jest.fn(),
    signInWithOtp: jest.fn(),
    signOut: jest.fn(),
  },
  from: jest.fn(() => chain()),
  rpc: jest.fn(async () => ({ data: null, error: null })),
  functions: { invoke: jest.fn(async () => ({ data: null, error: null })) },
  channel: jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), unsubscribe: jest.fn() })),
};

module.exports = { supabase, authSupabase: supabase };
