/**
 * Markdown Parser for Conductor
 *
 * Handles YAML frontmatter and structured sections like task checkboxes.
 * Optimized for performance with early exits and efficient data structures.
 */

export interface ParsedMarkdown {
  readonly frontmatter: Record<string, unknown>;
  readonly content: string;
}

export interface TaskItem {
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  readonly description: string;
  readonly raw: string;
}

// Constants for YAML parsing
const YAML_SEPARATOR = ':';
const YAMLFRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const CHECKBOX_REGEX = /^\s*-\s*\[([ x~-])\]\s*(.+)$/;

// Type detection constants
const BOOLEAN_TRUE = 'true';
const BOOLEAN_FALSE = 'false';
const ARRAY_START = '[';
const ARRAY_END = ']';

// Status lookup map for O(1) access
const STATUS_MAP: Record<string, TaskItem['status']> = {
  ' ': 'pending',
  x: 'completed',
  '~': 'in_progress',
  '-': 'cancelled',
} as const;

/**
 * Convert string value to appropriate type (boolean, number, array, or string)
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  // Early exit for empty values
  if (trimmed === '') {
    return undefined;
  }

  // Boolean values
  if (trimmed === BOOLEAN_TRUE) return true;
  if (trimmed === BOOLEAN_FALSE) return false;

  // Numeric values (NaN check handles non-numeric strings)
  const numValue = Number(trimmed);
  if (!Number.isNaN(numValue) && trimmed !== '') return numValue;

  // Array values: [item1, item2]
  if (trimmed.startsWith(ARRAY_START) && trimmed.endsWith(ARRAY_END)) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean); // Remove empty items
  }

  // String values (remove surrounding quotes)
  return trimmed.replace(/^['"]|['"]$/g, '');
}

/**
 * Parse YAML frontmatter and remaining content from a Markdown string
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  const match = text.match(YAMLFRONTMATTER_REGEX);

  // Early exit: no frontmatter found
  if (!match) {
    return { frontmatter: {}, content: text };
  }

  const yamlStr = match[1];
  const content = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Use for loop instead of forEach for better performance and early exit capability
  const lines = yamlStr.split('\n');
  const lineCount = lines.length;

  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    const separatorIndex = line.indexOf(YAML_SEPARATOR);

    // Skip lines without separator
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const valueStr = line.slice(separatorIndex + 1);

    // Skip empty keys
    if (!key) {
      continue;
    }

    frontmatter[key] = parseYamlValue(valueStr);
  }

  return { frontmatter, content };
}

/**
 * Determine status from checkbox indicator character
 */
function getCheckboxStatus(indicator: string): TaskItem['status'] {
  return STATUS_MAP[indicator] || 'pending';
}

/**
 * Parse checkboxes from Markdown content
 *
 * Optimized to process content line-by-line without creating large arrays.
 */
export function parseCheckboxes(content: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  let startIndex = 0;
  const contentLength = content.length;

  // Process line-by-line without split() to avoid large array allocation
  while (startIndex < contentLength) {
    const newlineIndex = content.indexOf('\n', startIndex);

    // Extract line (handle last line without newline)
    const endIndex = newlineIndex === -1 ? contentLength : newlineIndex;
    const line = content.slice(startIndex, endIndex);

    // Early exit: skip lines too short to match pattern
    if (line.length > 5) {
      const match = line.match(CHECKBOX_REGEX);

      if (match) {
        const indicator = match[1];
        const description = match[2];

        tasks.push({
          status: getCheckboxStatus(indicator),
          description,
          raw: line,
        });
      }
    }

    // Move to next line
    startIndex = endIndex + 1;

    // Break if we've reached the end (no more newlines)
    if (newlineIndex === -1) {
      break;
    }
  }

  return tasks;
}
