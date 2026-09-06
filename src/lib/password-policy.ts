import commonPasswords from "./common-passwords.json";
import { hasRequiredCharacterMix, isEntirelyNumeric, isTooSimilarToAttributes } from "./password-strength";

// ~9.8k passwords from a public breach-derived top-10000 list (SecLists' Pwdb_top-10000),
// same role as Django's CommonPasswordValidator's bundled list.
const COMMON_PASSWORDS = new Set(commonPasswords as string[]);

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Server-side password policy, modeled on Django's password_validation validators:
 * MinimumLengthValidator, NumericPasswordValidator, CommonPasswordValidator,
 * AlphaNumericPasswordValidator, UserAttributeSimilarityValidator.
 *
 * `attributes` are the user's own name/email etc. — pass whatever is known at the call site.
 * Throws a single Error joining every failing rule's message.
 */
export function validatePassword(password: string, attributes: string[] = []): void {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (isEntirelyNumeric(password)) errors.push("Password can't be entirely numeric.");
  if (!hasRequiredCharacterMix(password)) errors.push("Password must contain a letter, a number, and a special character.");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push("This password is too common.");
  if (isTooSimilarToAttributes(password, attributes)) errors.push("Password is too similar to your name or email.");

  if (errors.length) throw new Error(errors.join(" "));
}
