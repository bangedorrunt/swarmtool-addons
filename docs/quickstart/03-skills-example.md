# Skills Example

Create a complete working skill to see the full structure in action. This guide shows you how to write an effective SKILL.md file with proper YAML frontmatter and markdown instructions.

## Step 1: Create Directory Structure

Skills are organized in directories with a specific structure:

```bash
mkdir -p .opencode/skills/csv-processor/{scripts,references,assets}
```

This creates:

```
.opencode/skills/
└── csv-processor/
    ├── SKILL.md          # Required: Main skill file with frontmatter + instructions
    ├── scripts/          # Optional: Executable code (Python, Bash, etc.)
    ├── references/       # Optional: Documentation loaded as needed
    └── assets/          # Optional: Templates, images, fonts used in output
```

### Auto-Discovery Locations

Skills automatically discover from three locations:

| Location | Scope | Example Use |
|----------|-------|-------------|
| `.opencode/skills/` | Project-specific | Business logic, company policies, internal tools |
| `.claude/skills/` | Workspace | Team standards, project conventions |
| `skills/` | Generic | Reusable across projects |

**No configuration needed**—skills load automatically from these directories.

## Step 2: Write YAML Frontmatter

Every SKILL.md starts with **YAML frontmatter** containing required metadata:

```yaml
---
name: csv-processor
description: Process and transform CSV files with robust error handling. Use when working with CSV data including: parsing with quoted fields, handling malformed rows, converting to JSON, filtering data, or formatting output. Supports custom delimiters and encoding detection.
---

# CSV Processor
```

### Frontmatter Fields Explained

| Field | Required | Description | Constraints |
|-------|-----------|-------------|--------------|
| `name` | ✅ Yes | Skill identifier | Lowercase, hyphens only, max 64 chars |
| `description` | ✅ Yes | When-to-use trigger text | Max 1024 chars, should start with "Use when..." |
| `tags` | ❌ Optional | Search keywords | Comma-separated list |
| `tools` | ❌ Optional | Required tools | Comma-separated list |

### Best Practices for Descriptions

The `description` field is the **primary trigger** for skill activation. Claude reads this to decide when to use your skill.

✅ **Good description:**
```yaml
description: Process CSV files with error handling. Use when Claude needs to: (1) Parse CSV with quoted fields, (2) Handle malformed rows, (3) Convert to JSON, (4) Filter data, or (5) Format output.
```

❌ **Bad description:**
```yaml
description: CSV processing
```

**Why good descriptions matter:**
- Include specific contexts: "Use when working with X for..."
- List common scenarios: "Use when Claude needs to..."
- Keep it scannable: bullet points or numbered lists
- Be comprehensive but concise

## Step 3: Write Markdown Body

The markdown body contains instructions for Claude when the skill is active:

```markdown
# CSV Processor

**Core insight**: CSV parsing is error-prone. Always validate structure before processing.

## Quick Start

Parse a CSV with automatic delimiter detection:

```python
import csv

with open('data.csv', 'r', newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row)
```

## Common Operations

### Convert CSV to JSON

```python
import csv
import json

def csv_to_json(csv_path, json_path):
    """Convert CSV file to JSON array."""
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        data = [row for row in reader]

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
```

### Filter Rows

```python
def filter_csv(csv_path, output_path, column, value):
    """Filter rows where column equals value."""
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        filtered = [row for row in reader if row[column] == value]

    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
        writer.writeheader()
        writer.writerows(filtered)
```

## Error Handling

Always handle these CSV edge cases:

- **Encoding issues**: Use `utf-8-sig` to skip BOM
- **Quoted fields**: Enable `quoting=csv.QUOTE_MINIMAL` for safety
- **Empty rows**: Check `if not row` before processing
- **Missing columns**: Use `fieldnames` parameter to validate schema

```python
# Robust parsing with error handling
import csv

try:
    with open('data.csv', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, skipinitialspace=True)
        for row in reader:
            if not row:  # Skip empty rows
                continue
            if 'required_column' not in row:
                print(f"Warning: Missing column in row {reader.line_num}")
            # Process row
except FileNotFoundError:
    print(f"Error: File not found")
except csv.Error as e:
    print(f"CSV parsing error: {e}")
```

## Guidelines

- Always specify `encoding='utf-8-sig'` to handle BOM markers
- Use `DictReader` for column-based access, `reader` for positional
- Validate input CSV structure before transformation
- Handle empty rows gracefully (they're common in exports)
- Quote fields only when necessary to avoid bloat
- Preserve original headers unless explicitly changing schema
```

### Writing Guidelines

When writing the markdown body:

1. **Use imperative/infinitive form**: "Parse CSV" not "Parses CSV"
2. **Start with a core insight**: Memorable one-liner explaining the skill's purpose
3. **Include practical examples**: Real code snippets showing common patterns
4. **Add guidelines section**: Best practices and gotchas
5. **Keep under 500 lines**: Progressive disclosure for large skills (see Step 5)

## Step 4: Add Optional Bundled Resources

Skills can include optional bundled resources for complex scenarios:

### Scripts (`scripts/`)

Executable code for repetitive operations:

```bash
# scripts/convert-csv-to-json.py
#!/usr/bin/env python3
import csv
import json
import sys

def csv_to_json(csv_path, json_path):
    """Convert CSV file to JSON array."""
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        data = [row for row in reader]

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    csv_to_json(sys.argv[1], sys.argv[2])
```

**When to use scripts:**
- Same code gets rewritten repeatedly
- Deterministic reliability is critical
- Performance matters

### References (`references/`)

Documentation loaded on-demand:

```markdown
<!-- references/api-spec.md -->
# CSV API Reference

## Reader Options

| Option | Default | Description |
|--------|---------|-------------|
| `delimiter` | `,` | Field separator |
| `quotechar` | `"` | Quote character |
| `skipinitialspace` | `False` | Skip space after delimiter |

## Writer Options

| Option | Default | Description |
|--------|---------|-------------|
| `quoting` | `QUOTE_MINIMAL` | When to quote fields |
| `lineterminator` | `\r\n` | Line ending character |
```

**When to use references:**
- Large documentation files (>10k words)
- Context-specific information
- Variant-specific details

### Assets (`assets/`)

Files used in output (not loaded into context):

```
assets/
├── template.csv     # CSV template with headers
└── schema.json     # Expected column schema
```

**When to use assets:**
- Templates for output files
- Images, fonts, icons
- Boilerplate code copied as-is

## Step 5: Progressive Disclosure for Large Skills

Keep SKILL.md under 500 lines. Use progressive disclosure for complex skills:

```markdown
# PDF Processing

## Quick start

Extract text with pdfplumber:
```python
import pdfplumber

with pdfplumber.open('document.pdf') as pdf:
    text = pdf.pages[0].extract_text()
    print(text)
```

## Advanced features

- **Form filling**: See [FORMS.md](FORMS.md) for complete guide
- **API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
- **Examples**: See [EXAMPLES.md](EXAMPLES.md) for common patterns
```

Claude loads FORMS.md, REFERENCE.md, or EXAMPLES.md only when needed.

### Progressive Disclosure Patterns

**Pattern 1: High-level guide with references**

```markdown
# PDF Processing

## Quick start
[code example]

## Advanced features
- **Form filling**: See [FORMS.md](FORMS.md)
- **API reference**: See [REFERENCE.md](REFERENCE.md)
```

**Pattern 2: Domain-specific organization**

```markdown
# BigQuery Queries

## Quick start
[code example]

## Domain-specific guides
- **Finance metrics**: See [references/finance.md](references/finance.md)
- **Sales data**: See [references/sales.md](references/sales.md)
- **Product analytics**: See [references/product.md](references/product.md)
```

**Pattern 3: Conditional details**

```markdown
# DOCX Processing

## Creating documents
Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents
For simple edits, modify XML directly.

**For tracked changes**: See [REDLINING.md](REDLINING.md)
**For OOXML details**: See [OOXML.md](OOXML.md)
```

## Complete Working Example

Here's the complete `csv-processor` skill:

```markdown
---
name: csv-processor
description: Process and transform CSV files with robust error handling. Use when working with CSV data including: parsing with quoted fields, handling malformed rows, converting to JSON, filtering data, or formatting output. Supports custom delimiters and encoding detection.
---

# CSV Processor

**Core insight**: CSV parsing is error-prone. Always validate structure before processing.

## Quick Start

Parse a CSV with automatic delimiter detection:

```python
import csv

with open('data.csv', 'r', newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row)
```

## Common Operations

### Convert CSV to JSON

```python
import csv
import json

def csv_to_json(csv_path, json_path):
    """Convert CSV file to JSON array."""
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        data = [row for row in reader]

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
```

### Filter Rows

```python
def filter_csv(csv_path, output_path, column, value):
    """Filter rows where column equals value."""
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        filtered = [row for row in reader if row[column] == value]

    with open(output_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
        writer.writeheader()
        writer.writerows(filtered)
```

## Error Handling

Always handle these CSV edge cases:

- **Encoding issues**: Use `utf-8-sig` to skip BOM
- **Quoted fields**: Enable `quoting=csv.QUOTE_MINIMAL` for safety
- **Empty rows**: Check `if not row` before processing
- **Missing columns**: Use `fieldnames` parameter to validate schema

```python
import csv

try:
    with open('data.csv', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, skipinitialspace=True)
        for row in reader:
            if not row:  # Skip empty rows
                continue
            if 'required_column' not in row:
                print(f"Warning: Missing column in row {reader.line_num}")
            # Process row
except FileNotFoundError:
    print(f"Error: File not found")
except csv.Error as e:
    print(f"CSV parsing error: {e}")
```

## Guidelines

- Always specify `encoding='utf-8-sig'` to handle BOM markers
- Use `DictReader` for column-based access, `reader` for positional
- Validate input CSV structure before transformation
- Handle empty rows gracefully (they're common in exports)
- Quote fields only when necessary to avoid bloat
- Preserve original headers unless explicitly changing schema
```

## Common Mistakes

### ❌ Wrong: Vague description

```yaml
---
name: csv-tool
description: Handle CSV files
---
```

**Fix:** Be specific about when to use the skill.

```yaml
---
name: csv-processor
description: Process CSV files with robust error handling. Use when Claude needs to: (1) Parse CSV with quoted fields, (2) Handle malformed rows, (3) Convert to JSON, (4) Filter data, or (5) Format output.
---
```

### ❌ Wrong: Missing encoding handling

```python
with open('data.csv', 'r') as f:  # ❌ May fail on BOM
    reader = csv.DictReader(f)
```

**Fix:** Always specify encoding.

```python
with open('data.csv', 'r', encoding='utf-8-sig') as f:  # ✅ Robust
    reader = csv.DictReader(f)
```

### ❌ Wrong: Not handling empty rows

```python
for row in reader:
    process(row)  # ❌ Fails on empty rows
```

**Fix:** Skip empty rows explicitly.

```python
for row in reader:
    if not row:  # ✅ Skip empty rows
        continue
    process(row)
```

### ❌ Wrong: Excessive context in SKILL.md

```markdown
---
name: csv-processor
description: Process CSV files
---

# CSV Processor

**Core insight**: CSV parsing is error-prone.

## Quick start
[10 lines of code]

## Detailed explanation
[200 lines explaining CSV history, standards, RFC 4180...]

## More examples
[300 lines more...]

## Edge cases
[200 lines...]
```

**Fix:** Use progressive disclosure. Move detailed content to references/.

```markdown
---
name: csv-processor
description: Process CSV files
---

# CSV Processor

**Core insight**: CSV parsing is error-prone. Always validate structure first.

## Quick start
[10 lines of code]

## Advanced features
- **RFC 4180 spec**: See [references/rfc4180.md](references/rfc4180.md)
- **Edge cases**: See [references/edge-cases.md](references/edge-cases.md)
- **Examples**: See [references/examples.md](references/examples.md)
```

## Summary

Key takeaways for effective skills:

1. **Frontmatter matters**: `name` and `description` are how skills get triggered
2. **Keep it concise**: Only add context Claude doesn't already have
3. **Progressive disclosure**: Put core instructions in SKILL.md, details in references/
4. **Test skills**: Try them on real tasks to identify gaps
5. **Iterate**: Improve based on actual usage patterns

## What's Next?

- **[04-complete-plugin.md](./04-complete-plugin.md)** - Put it all together into a complete skill injection plugin

## Reference

- **[skill-creator](../../packages/opencode-swarm-plugin/global-skills/skill-creator/SKILL.md)** - Meta-skill for creating skills
- **[testing-patterns](../../packages/opencode-swarm-plugin/global-skills/testing-patterns/SKILL.md)** - Reference for formatting patterns

## Troubleshooting

**"Skill not loading"**
- Verify directory name matches `name` field
- Check YAML frontmatter is valid (use https://yaml-online-parser.appspot.com/)
- Ensure SKILL.md is in correct auto-discovery location

**"Claude ignores my skill"**
- Check `description` field is descriptive enough
- Verify skill name uses lowercase and hyphens only
- Test description by asking: "Use [skill description] to..."
