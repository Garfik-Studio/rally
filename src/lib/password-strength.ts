// Isomorphic (client + server safe) — no big word lists here, see password-policy.ts for that.

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const SIMILARITY_THRESHOLD = 0.7;

/** Same idea as Django's UserAttributeSimilarityValidator: split each attribute into parts and compare. */
function attributeParts(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((part) => part.length >= 3);
}

export function isTooSimilarToAttributes(password: string, attributes: string[]): boolean {
  const pw = password.toLowerCase();
  if (!pw) return false;
  return attributes.some((attr) =>
    attributeParts(attr).some((part) => pw.includes(part) || part.includes(pw) || similarity(pw, part) >= SIMILARITY_THRESHOLD)
  );
}

export function isEntirelyNumeric(password: string): boolean {
  return /^\d+$/.test(password);
}

export function hasRequiredCharacterMix(password: string): boolean {
  return /[a-zA-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password);
}

export type PasswordScore = { score: 0 | 1 | 2 | 3 | 4; label: string; hints: string[] };

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];

/** Cheap live heuristic for UI feedback. The authoritative checks (common-password list, exact
 * similarity match) run server-side in password-policy.ts and surface on submit. */
export function scorePassword(password: string, attributes: string[] = []): PasswordScore {
  const hints: string[] = [];
  let points = 0;

  if (password.length >= 8) points++;
  else hints.push("At least 8 characters");
  if (password.length >= 12) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  else hints.push("Mix upper and lower case");
  if (/\d/.test(password)) points++;
  else hints.push("Include a number");
  if (/[^a-zA-Z0-9]/.test(password)) points++;
  else hints.push("Include a symbol");

  if (isEntirelyNumeric(password)) {
    points = 0;
    hints.unshift("Can't be only numbers");
  }
  if (isTooSimilarToAttributes(password, attributes)) {
    points = Math.min(points, 1);
    hints.unshift("Too similar to your name or email");
  }

  const score = Math.min(4, points) as PasswordScore["score"];
  return { score, label: LABELS[score], hints };
}
