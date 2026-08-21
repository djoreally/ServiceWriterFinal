import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from './components/ThemeProvider';
import { AuthProvider } from '@packages/auth';

// Mock features module
jest.mock('@/config/features', () => ({
  features: {
    'example-feature': false,
  },
}));

// Mock mapbox module (uses import.meta.env)
jest.mock('@/lib/mapbox', () => ({
  requireMapboxToken: () => 'test-mapbox-token',
  getMapboxToken: () => 'test-mapbox-token',
}));

// Mock Supabase client — both the data client and the auth client export the
// same stub so AuthProvider's `authSupabase.auth` calls resolve in tests.
jest.mock('@/integrations/supabase/client', () => {
  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  return { supabase: client, authSupabase: client };
});


// Mock AIAssistant component (uses import.meta)
jest.mock('./components/ai/AIAssistant', () => ({
  AIAssistant: (): null => null,
}));

// Mock useServiceWorkerUpdate hook (uses import.meta)
jest.mock('./hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: (): void => {},
}));

// App imports startup navigation, which imports the Mapbox query boundary.
// Keep this smoke test independent from Vite-only `import.meta` configuration.
jest.mock('@/application/queries/mapbox', () => ({
  geocodeAddress: jest.fn(),
  reverseGeocode: jest.fn(),
}));

jest.mock('@/components/analytics/PostHogIdentity', () => ({
  PostHogIdentity: (): null => null,
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
  Toaster: (): null => null,
}));

// Import App AFTER mocks are set up
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <AuthProvider>
        <ThemeProvider defaultTheme="dark">
          <App />
        </ThemeProvider>
      </AuthProvider>
    );
    expect(container).toBeTruthy();
  });
});
