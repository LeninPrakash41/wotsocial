export function safeParseJSON<T>(text: string): T {
  if (!text || typeof text !== 'string') {
    throw new Error("Empty or non-string response received from AI model.");
  }

  // 1. Remove markdown code block markers
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // 2. Try direct parsing first
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // Continue to depth-balanced extractor
  }

  // 3. Depth-balanced outer JSON extractor (handles string literals & escapes correctly)
  const startObj = cleaned.indexOf('{');
  const startArr = cleaned.indexOf('[');

  let startIdx = -1;
  let isArray = false;

  if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
    startIdx = startObj;
    isArray = false;
  } else if (startArr !== -1) {
    startIdx = startArr;
    isArray = true;
  }

  if (startIdx !== -1) {
    const openChar = isArray ? '[' : '{';
    const closeChar = isArray ? ']' : '}';
    let depth = 0;
    let endIdx = -1;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < cleaned.length; i++) {
      const char = cleaned[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === openChar) {
          depth++;
        } else if (char === closeChar) {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      const candidate = cleaned.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch (e) {
        // Fall back to regex scan if depth extraction fails on edge cases
      }
    }
  }

  // 4. Regex fallback: non-greedy matching first, then greedy
  const matches = cleaned.match(/\{[\s\S]*?\}|\[[\s\S]*?\]/g) || cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/g);
  if (matches) {
    for (const match of matches) {
      try {
        return JSON.parse(match) as T;
      } catch (e) {
        // Continue loop
      }
    }
  }

  throw new Error(`Failed to parse valid JSON from AI response.\nRaw Text Snippet: ${cleaned.substring(0, 300)}`);
}
