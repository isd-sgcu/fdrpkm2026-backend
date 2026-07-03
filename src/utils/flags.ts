import { EventTime } from "@src/constants";

type EventMap = typeof EventTime;
type EventName = keyof EventMap;

/**
 * `now` and `events` are injectable so tests can pass a fixed Date and a
 * fake event map instead of mocking global Date / the constants module.
 *
 * @example
 * // in a test:
 * const fakeEvents = { foo: { start: new Date("2026-01-01"), end: new Date("2026-01-02") } };
 * isEventActive("foo", new Date("2026-01-01T12:00:00"), fakeEvents); // true
 */

/**
 * True once `now` is past the event's `end` time. Stays true forever after —
 * does not flip back if `end` is edited to a later date and `now` moves back
 * before it (that's `isEventActive` / `eventActiveStatus`'s job).
 *
 * @param eventName - key from `EventTime` in `src/constants.ts`
 * @param now - defaults to real current time; pass a fixed Date in tests
 * @param events - defaults to real `EventTime`; pass a fake map in tests
 */
export const isEventPassed = (
  eventName: EventName,
  now: Date = new Date(),
  events: EventMap = EventTime
): boolean => now >= events[eventName].end;

/**
 * True while `now` is within `windowMs` after the event's `start` — e.g. use
 * `isEventWithin("cu_firstdate_registration", 60 * 60 * 1000)` to check
 * "did registration open in the last hour". Note this only looks forward
 * from `start` and ignores `end`, so it can still be true after the event
 * has technically ended if `windowMs` is large enough.
 *
 * @param eventName - key from `EventTime` in `src/constants.ts`
 * @param windowMs - size of window after `start`, in milliseconds
 * @param now - defaults to real current time; pass a fixed Date in tests
 * @param events - defaults to real `EventTime`; pass a fake map in tests
 */
export const isEventWithin = (
  eventName: EventName,
  windowMs: number,
  now: Date = new Date(),
  events: EventMap = EventTime
): boolean => {
  const diff = now.getTime() - events[eventName].start.getTime();

  return diff >= 0 && diff <= windowMs;
};

/**
 * True only between the event's `start` and `end` (inclusive). Use this,
 * not `isEventPassed`, when you need "is registration open right now".
 *
 * @param eventName - key from `EventTime` in `src/constants.ts`
 * @param now - defaults to real current time; pass a fixed Date in tests
 * @param events - defaults to real `EventTime`; pass a fake map in tests
 */
export const isEventActive = (
  eventName: EventName,
  now: Date = new Date(),
  events: EventMap = EventTime
): boolean => {
  const { start, end } = events[eventName];

  return now >= start && now <= end;
};

/**
 * Same window check as `isEventActive` but returns which side of the
 * window `now` falls on, instead of a plain boolean — handy for UI copy
 * like "registration opens soon" vs "registration closed".
 *
 * @param eventName - key from `EventTime` in `src/constants.ts`
 * @param now - defaults to real current time; pass a fixed Date in tests
 * @param events - defaults to real `EventTime`; pass a fake map in tests
 */
export const eventActiveStatus = (
  eventName: EventName,
  now: Date = new Date(),
  events: EventMap = EventTime
): "not-started" | "active" | "ended" => {
  const { start, end } = events[eventName];

  if (now < start) return "not-started";
  if (now > end) return "ended";

  return "active";
};
