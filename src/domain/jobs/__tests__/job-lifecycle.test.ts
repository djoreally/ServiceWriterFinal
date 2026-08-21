import {
  isValidJobTransition,
  normalizeJobStatus,
  transitionJobLifecycle,
} from '@/domain/jobs/job-lifecycle';

describe('job-lifecycle canonical engine', () => {
  it('normalizes legacy aliases', () => {
    expect(normalizeJobStatus('pending')).toBe('scheduled');
    expect(normalizeJobStatus('auto_assigned')).toBe('assigned');
    expect(normalizeJobStatus('on_site')).toBe('arrived');
    expect(normalizeJobStatus('canceled')).toBe('cancelled');
  });

  it('validates allowed transitions', () => {
    expect(isValidJobTransition('scheduled', 'assigned')).toBe(true);
    expect(isValidJobTransition('in_progress', 'completed')).toBe(true);
    expect(isValidJobTransition('scheduled', 'completed')).toBe(false);
  });

  it('returns structured transition results', () => {
    const ok = transitionJobLifecycle('scheduled', 'assigned', { updatedBy: 'u1' });
    expect(ok).toEqual({ ok: true, status: 'assigned', updatedBy: 'u1', reasonCode: undefined });

    const invalid = transitionJobLifecycle('scheduled', 'completed');
    expect(invalid.ok).toBe(false);
    if ("message" in invalid) expect(invalid.message).toContain('scheduled -> completed');
  });
});
