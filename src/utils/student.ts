/**
 * Checks whether a CUNET ID belongs to a freshman (first-year) student.
 * @param studentId - The CUNET ID to check (e.g. "69xxxxxx")
 * @returns true if the student ID starts with "69"
 */
export const isFreshman = (studentId: string): boolean => studentId.startsWith("69");

/**
 * Extracts/derives the CUNET student ID from a Chula email address.
 * @param email - The Chula email address (e.g. "69xxxxxxxx@student.chula.ac.th")
 * @returns the lowercased student ID
 */
export const deriveStudentId = (email: string): string =>
  (email.split("@")[0] || email).toLowerCase();
