export const JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const JOIN_CODE_LENGTH = 6;
export const MAX_JOIN_CODE_ATTEMPTS = 10;

/**
 * Generate a random 6-character join code (A-Z + 0-9).
 * Uniqueness must be enforced by the caller (either via DB
 * `onConflictDoNothing` retry or a pre-insert SELECT check).
 */
export const generateJoinCode = (): string => {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
};
