import { env } from "@src/config";

/**
 * Checks whether a CUNET ID belongs to a freshman (first-year) student.
 * Always true when `DISABLE_FRESHMAN_GATE` is set (staging testing escape
 * hatch — see src/config/env.ts) so QA can exercise freshman-only flows
 * with any test studentId.
 * @param studentId - The CUNET ID to check (e.g. "69xxxxxx")
 * @returns true if the student ID starts with "69", or the gate is disabled
 */
export const isFreshman = (studentId: string): boolean =>
  env.DISABLE_FRESHMAN_GATE || studentId.startsWith("69");

/**
 * Extracts/derives the CUNET student ID from a Chula email address.
 * @param email - The Chula email address (e.g. "69xxxxxxxx@student.chula.ac.th")
 * @returns the lowercased student ID
 */
export const deriveStudentId = (email: string): string =>
  (email.split("@")[0] || email).toLowerCase();
