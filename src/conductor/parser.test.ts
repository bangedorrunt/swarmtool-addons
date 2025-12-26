import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseCheckboxes } from './parser';

describe('Markdown Parser', () => {
  describe('parseMarkdown', () => {
    it('should parse simple frontmatter', () => {
      const md = `---
name: my-track
type: feature
priority: 1
tools: [git, bash]
---
# Content
Some text here.`;

      const { frontmatter, content } = parseMarkdown(md);

      expect(frontmatter.name).toBe('my-track');
      expect(frontmatter.type).toBe('feature');
      expect(frontmatter.priority).toBe(1);
      expect(frontmatter.tools).toEqual(['git', 'bash']);
      expect(content).toContain('# Content');
    });

    it('should return empty frontmatter if none present', () => {
      const md = '# No Frontmatter';
      const { frontmatter, content } = parseMarkdown(md);
      expect(frontmatter).toEqual({});
      expect(content).toBe(md);
    });

    describe('YAML value type parsing', () => {
      it('should parse boolean values', () => {
        const md = `---
enabled: true
disabled: false
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.enabled).toBe(true);
        expect(frontmatter.disabled).toBe(false);
      });

      it('should parse numeric values', () => {
        const md = `---
priority: 1
count: 42
decimal: 3.14
negative: -10
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.priority).toBe(1);
        expect(frontmatter.count).toBe(42);
        expect(frontmatter.decimal).toBe(3.14);
        expect(frontmatter.negative).toBe(-10);
      });

      it('should parse array values', () => {
        const md = `---
tags: [feature, enhancement, bug]
numbers: [1, 2, 3]
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.tags).toEqual(['feature', 'enhancement', 'bug']);
        expect(frontmatter.numbers).toEqual(['1', '2', '3']);
      });

      it('should parse array values with quoted items', () => {
        const md = `---
tags: ['feature', 'enhancement', 'bug']
items: ["item1", "item2", "item3"]
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.tags).toEqual(['feature', 'enhancement', 'bug']);
        expect(frontmatter.items).toEqual(['item1', 'item2', 'item3']);
      });

      it('should parse string values with quotes removed', () => {
        const md = `---
singleQuoted: 'value with spaces'
doubleQuoted: "another value"
unquoted: plain-text
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.singleQuoted).toBe('value with spaces');
        expect(frontmatter.doubleQuoted).toBe('another value');
        expect(frontmatter.unquoted).toBe('plain-text');
      });

      it('should handle empty values (undefined)', () => {
        const md = `---
emptyField: 
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.emptyField).toBeUndefined();
      });
    });

    describe('Edge cases and error handling', () => {
      it('should skip lines without separator', () => {
        const md = `---
name: valid
this line has no separator
another valid: value
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.name).toBe('valid');
        expect(frontmatter.another).toBe('value');
        expect(frontmatter['this line has no separator']).toBeUndefined();
      });

      it('should skip empty keys', () => {
        const md = `---
:value-only
name: has-key
:another-empty
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.name).toBe('has-key');
        expect(frontmatter['']).toBeUndefined();
      });

      it('should handle whitespace around keys and values', () => {
        const md = `---
  name  :  my-track  
  priority  :  1  
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.name).toBe('my-track');
        expect(frontmatter.priority).toBe(1);
      });

      it('should handle array with empty items filtered out', () => {
        const md = `---
tags: [item1, , item2, , item3]
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter.tags).toEqual(['item1', 'item2', 'item3']);
      });

      it('should return empty frontmatter for malformed YAML', () => {
        const md = `---
Not valid YAML structure
---
Content`;

        const { frontmatter } = parseMarkdown(md);

        expect(frontmatter).toEqual({});
      });
    });

    describe('Early exit behavior', () => {
      it('should exit early when no frontmatter regex matches', () => {
        const md = 'No frontmatter delimiter here';
        const result = parseMarkdown(md);

        expect(result.frontmatter).toEqual({});
        expect(result.content).toBe(md);
      });

      it('should handle empty string input', () => {
        const result = parseMarkdown('');

        expect(result.frontmatter).toEqual({});
        expect(result.content).toBe('');
      });
    });

    describe('Performance benchmarks', () => {
      it('should parse small frontmatter quickly', () => {
        const md = `---
name: test
type: feature
priority: 1
tools: [git, bash]
---
Content`;

        const start = performance.now();
        const result = parseMarkdown(md);
        const duration = performance.now() - start;

        expect(result.frontmatter.name).toBe('test');
        expect(duration).toBeLessThan(10); // Should complete in <10ms
      });

      it('should parse large frontmatter with many fields efficiently', () => {
        let yaml = '---\n';
        for (let i = 0; i < 50; i++) {
          yaml += `field${i}: value${i}\n`;
        }
        yaml += '---\nContent';

        const start = performance.now();
        const result = parseMarkdown(yaml);
        const duration = performance.now() - start;

        expect(Object.keys(result.frontmatter).length).toBe(50);
        expect(duration).toBeLessThan(20); // Should complete in <20ms for 50 fields
      });

      it('should parse frontmatter with arrays and types efficiently', () => {
        const md = `---
name: test
priority: 5
enabled: true
tags: [tag1, tag2, tag3, tag4, tag5]
items: [item1, item2, item3, item4, item5]
---
Content`;

        const start = performance.now();
        const result = parseMarkdown(md);
        const duration = performance.now() - start;

        expect(result.frontmatter.tags).toEqual(['tag1', 'tag2', 'tag3', 'tag4', 'tag5']);
        expect(duration).toBeLessThan(10); // Should complete in <10ms
      });
      });
  });
  });

  describe('parseCheckboxes', () => {
    it('should parse various checkbox states', () => {
      const content = `
- [ ] Task 1
- [x] Task 2
- [~] Task 3
- [-] Task 4
Not a task.
`;
      const tasks = parseCheckboxes(content);

      expect(tasks).toHaveLength(4);
      expect(tasks[0]).toEqual({ status: 'pending', description: 'Task 1', raw: '- [ ] Task 1' });
      expect(tasks[1]).toEqual({ status: 'completed', description: 'Task 2', raw: '- [x] Task 2' });
      expect(tasks[2]).toEqual({
        status: 'in_progress',
        description: 'Task 3',
        raw: '- [~] Task 3',
      });
      expect(tasks[3]).toEqual({ status: 'cancelled', description: 'Task 4', raw: '- [-] Task 4' });
    });

    describe('Status map coverage', () => {
      it('should map space to pending', () => {
        const content = '- [ ] Pending task';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].status).toBe('pending');
      });

      it('should map x to completed', () => {
        const content = '- [x] Completed task';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].status).toBe('completed');
      });

      it('should map ~ to in_progress', () => {
        const content = '- [~] In progress task';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].status).toBe('in_progress');
      });

      it('should map - to cancelled', () => {
        const content = '- [-] Cancelled task';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].status).toBe('cancelled');
      });

      it('should default to pending for unknown indicator', () => {
        const content = '- [?] Unknown status';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].status).toBe('pending');
      });
    });

    describe('Edge cases', () => {
      it('should handle checkboxes with extra whitespace', () => {
        const content = `  -   [  ]  Task with spaces  `;
        const tasks = parseCheckboxes(content);

        expect(tasks[0]).toEqual({
          status: 'pending',
          description: 'Task with spaces',
          raw: '  -   [  ]  Task with spaces  ',
        });
      });

      it('should handle empty descriptions', () => {
        const content = '- [ ] ';
        const tasks = parseCheckboxes(content);

        expect(tasks[0]).toEqual({
          status: 'pending',
          description: '',
          raw: '- [ ] ',
        });
      });

      it('should skip lines too short to match pattern (< 5 chars)', () => {
        const content = '- []\n- [x]';
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(0); // Both lines < 5 chars
      });

      it('should handle content with no checkboxes', () => {
        const content = `# Heading
Some text
More text`;
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(0);
      });

      it('should handle empty string input', () => {
        const tasks = parseCheckboxes('');

        expect(tasks).toHaveLength(0);
      });

      it('should handle mixed content with some checkboxes', () => {
        const content = `# Heading
- [ ] Task 1
Some text between
- [x] Task 2
More text
- [~] Task 3
End of file`;
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(3);
        expect(tasks[0].description).toBe('Task 1');
        expect(tasks[1].description).toBe('Task 2');
        expect(tasks[2].description).toBe('Task 3');
      });
    });

    describe('Line-by-line processing (memory optimization)', () => {
      it('should process last line without newline', () => {
        const content = '- [ ] Task 1';
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(1);
        expect(tasks[0].description).toBe('Task 1');
      });

      it('should handle content ending with newline', () => {
        const content = '- [ ] Task 1\n- [x] Task 2\n';
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(2);
      });

      it('should handle content without any newlines', () => {
        const content = '- [ ] Task 1- [x] Task 2'; // No newline, invalid format
        const tasks = parseCheckboxes(content);

        expect(tasks).toHaveLength(0); // Won't match because line is too long for first pattern
      });
    });

    describe('Performance benchmarks', () => {
      it('should parse small list of checkboxes quickly', () => {
        const content = `- [ ] Task 1
- [x] Task 2
- [~] Task 3`;
        const start = performance.now();
        const tasks = parseCheckboxes(content);
        const duration = performance.now() - start;

        expect(tasks).toHaveLength(3);
        expect(duration).toBeLessThan(10); // Should complete in <10ms
      });

      it('should parse large list of checkboxes efficiently (memory optimization test)', () => {
        let content = '';
        for (let i = 0; i < 100; i++) {
          const statuses = [' ', 'x', '~', '-'];
          const status = statuses[i % 4];
          content += `- [${status}] Task ${i}\n`;
        }

        const start = performance.now();
        const tasks = parseCheckboxes(content);
        const duration = performance.now() - start;

        expect(tasks).toHaveLength(100);
        expect(duration).toBeLessThan(20); // Should complete in <20ms for 100 checkboxes
      });

      it('should parse mixed content with few checkboxes efficiently', () => {
        let content = '# Heading\n';
        for (let i = 0; i < 50; i++) {
          content += `Paragraph line ${i}\n`;
        }
        content += '- [ ] Task 1\n- [x] Task 2\n';

        const start = performance.now();
        const tasks = parseCheckboxes(content);
        const duration = performance.now() - start;

        expect(tasks).toHaveLength(2);
        expect(duration).toBeLessThan(20); // Should complete in <20ms even with extra content
      });
    });

    describe('Characterization tests (preserving existing behavior)', () => {
      it('should preserve raw line including all whitespace', () => {
        const content = `   -   [  ]  Task description  `;
        const tasks = parseCheckboxes(content);

        expect(tasks[0].raw).toBe('   -   [  ]  Task description  ');
      });

      it('should handle tabs in checkbox format', () => {
        const content = `-\t[\t]\tTask with tabs`;
        const tasks = parseCheckboxes(content);

        expect(tasks[0].description).toBe('Task with tabs');
      });

      it('should handle multi-word descriptions', () => {
        const content = '- [x] This is a task with multiple words in the description';
        const tasks = parseCheckboxes(content);

        expect(tasks[0].description).toBe('This is a task with multiple words in the description');
      });
    });
  });

  describe('Integration tests', () => {
    it('should parse complete track spec with frontmatter and checkboxes', () => {
      const md = `---
name: user-auth
type: feature
priority: 2
tags: [security, auth]
---
# User Authentication Feature

## Implementation Plan

- [ ] Create user model
- [x] Design database schema
- [~] Implement password hashing
- [-] deprecated OAuth approach

## Testing

- [ ] Unit tests
- [ ] Integration tests
`;

      const { frontmatter, content } = parseMarkdown(md);
      const tasks = parseCheckboxes(content);

      expect(frontmatter.name).toBe('user-auth');
      expect(frontmatter.type).toBe('feature');
      expect(frontmatter.priority).toBe(2);
      expect(frontmatter.tags).toEqual(['security', 'auth']);

      expect(tasks).toHaveLength(6);
      expect(tasks[0].description).toBe('Create user model');
      expect(tasks[1].description).toBe('Design database schema');
      expect(tasks[2].description).toBe('Implement password hashing');
      expect(tasks[3].description).toBe('deprecated OAuth approach');
    });
  });
});
