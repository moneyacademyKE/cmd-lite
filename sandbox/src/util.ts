// Sandbox utilities

/**
 * Truncates a string to a maximum number of user-perceived characters (grapheme clusters).
 * Uses native Intl.Segmenter to ensure emojis (including ZWJ sequences) and multi-line strings (LF/CRLF)
 * are not split into corrupt or incomplete code units.
 * 
 * @param str The string to truncate.
 * @param maxLength The maximum number of graphemes allowed. Must be non-negative.
 * @returns The truncated string with an ellipsis ("...") appended if it exceeds maxLength, or the original string.
 * @throws Error if maxLength is negative.
 */
export function truncateString(str: string, maxLength: number): string {
  if (maxLength < 0) {
    throw new Error("maxLength must be non-negative");
  }

  // Segment the input string into graphemes using standard Intl.Segmenter
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(str), (s) => s.segment);

  // If the total number of graphemes is less than or equal to maxLength, return original string
  if (segments.length <= maxLength) {
    return str;
  }

  // Slice at maxLength and append ellipsis
  return segments.slice(0, maxLength).join("") + "...";
}

/**
 * Sanitizes a file path by standardizing Windows backslashes to forward slashes,
 * collapsing duplicate slashes, and trimming trailing slashes except for root paths (e.g., "/" or "C:/").
 * 
 * @param p The path string to sanitize.
 * @returns The sanitized path.
 */
export function sanitizePath(p: string): string {
  // Convert all Windows backslashes to POSIX forward slashes
  let sanitized = p.replace(/\\/g, "/");

  // Replace duplicate path separators with a single forward slash
  sanitized = sanitized.replace(/\/+/g, "/");

  // Determine if the path is a root path that requires preserving the trailing slash.
  // This matches POSIX root ("/") and Windows drive root ("C:/", "d:/", etc.)
  const isRoot = sanitized === "/" || /^[a-zA-Z]:\/$/.test(sanitized);

  if (isRoot) {
    return sanitized;
  }

  // Trim trailing slashes for non-root paths
  if (sanitized.endsWith("/") && sanitized.length > 1) {
    sanitized = sanitized.slice(0, -1);
  }

  return sanitized;
}

