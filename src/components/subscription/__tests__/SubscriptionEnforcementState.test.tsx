import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubscriptionEnforcementState } from '../SubscriptionEnforcementState';

describe('SubscriptionEnforcementState', () => {
  it('renders feature-specific copy for upgrade_required state', () => {
    render(
      <MemoryRouter>
        <SubscriptionEnforcementState
          feature="has_marketing_automation"
          requiredPlanLabel="Business"
          scenario="upgrade_required"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Marketing automation is plan-gated/i)).toBeInTheDocument();
    expect(screen.getByText(/Automated follow-ups and campaign scheduling/i)).toBeInTheDocument();
  });

  it('renders downgrade message when scenario is downgraded', () => {
    render(
      <MemoryRouter>
        <SubscriptionEnforcementState
          feature="has_ai_assistant"
          requiredPlanLabel="Pro"
          scenario="downgraded"
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/plan changed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upgrade to Pro/i })).toBeInTheDocument();
  });
});
