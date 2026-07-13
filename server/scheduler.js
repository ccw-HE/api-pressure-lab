export function createMinuteSchedule({ rpm, jitterSeconds = 0, now = Date.now() }) {
  const count = Math.max(1, Math.round(Number(rpm) || 1));
  const jitterMs = Math.max(0, Number(jitterSeconds) || 0) * 1000;
  const offsets = [];

  for (let i = 0; i < count; i += 1) {
    const base = Math.random() * 60000;
    const jitter = jitterMs ? (Math.random() * 2 - 1) * jitterMs : 0;
    offsets.push(Math.max(0, Math.min(59999, Math.round(base + jitter))));
  }

  offsets.sort((a, b) => a - b);
  return offsets.map((offset) => now + offset);
}

export function estimateRpm(events, windowMs = 60000, now = Date.now()) {
  const start = now - windowMs;
  return events.filter((time) => time >= start && time <= now).length;
}
