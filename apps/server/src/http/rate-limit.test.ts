import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

function setup(maxRequests = 2, windowMs = 60_000) {
  let timestamp = 0;
  const limiter = createRateLimiter({
    windowMs,
    maxRequests,
    now: () => timestamp,
  });
  return {
    limiter,
    advance(ms: number) {
      timestamp += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows requests up to the limit and blocks the next one', () => {
    const { limiter } = setup(2);

    expect(limiter.track('1.1.1.1')).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(limiter.track('1.1.1.1')).toEqual({ limited: false, retryAfterSeconds: 0 });

    expect(limiter.track('1.1.1.1')).toEqual({ limited: true, retryAfterSeconds: 60 });
  });

  it('reports when the blocking entry leaves the window', () => {
    const { limiter, advance } = setup(2);

    limiter.track('1.1.1.1');
    limiter.track('1.1.1.1');
    limiter.track('1.1.1.1');

    advance(20_000);
    expect(limiter.track('1.1.1.1')).toEqual({ limited: true, retryAfterSeconds: 40 });

    advance(40_000);
    expect(limiter.track('1.1.1.1')).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it('counts each ip separately', () => {
    const { limiter } = setup(1);

    limiter.track('1.1.1.1');
    expect(limiter.track('1.1.1.1').limited).toBe(true);
    expect(limiter.track('2.2.2.2')).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it('lets older entries roll off while the window slides', () => {
    const { limiter, advance } = setup(2);

    limiter.track('1.1.1.1');
    limiter.track('1.1.1.1');
    advance(30_000);
    expect(limiter.track('1.1.1.1')).toEqual({ limited: true, retryAfterSeconds: 30 });

    advance(30_000);
    expect(limiter.track('1.1.1.1')).toEqual({ limited: false, retryAfterSeconds: 0 });
  });

  it('never reports a retry below one second', () => {
    const { limiter, advance } = setup(1, 500);

    limiter.track('1.1.1.1');
    advance(250);
    expect(limiter.track('1.1.1.1')).toEqual({ limited: true, retryAfterSeconds: 1 });
  });
});
