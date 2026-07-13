import { describe, expect, it } from 'vitest';
import { createMinuteSchedule } from '../server/scheduler.js';

describe('rpm scheduler', () => {
  it('creates the requested number of send slots inside one minute', () => {
    const now = 100000;
    const slots = createMinuteSchedule({ rpm: 10, jitterSeconds: 5, now });
    expect(slots).toHaveLength(10);
    expect(slots.every((slot) => slot >= now && slot < now + 60000)).toBe(true);
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
  });
});
