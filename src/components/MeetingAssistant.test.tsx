import { describe, it, expect } from 'vitest';
import { parseJSONResponse } from '../lib/gemini';

describe('MeetingAssistant Utility Functions', () => {
  describe('parseJSONResponse', () => {
    it('should parse a clean JSON string', () => {
      const input = '{"subject": "Test Meeting", "keyTopics": ["Topic 1"]}';
      const result = parseJSONResponse(input);
      expect(result).toEqual({
        subject: 'Test Meeting',
        keyTopics: ['Topic 1']
      });
    });

    it('should extract and parse JSON from markdown code blocks', () => {
      const input = `Here is the requested JSON:
\`\`\`json
{
  "subject": "Markdown Meeting",
  "keyTopics": ["Markdown"]
}
\`\`\`
Hope this helps!`;
      const result = parseJSONResponse(input);
      expect(result).toEqual({
        subject: 'Markdown Meeting',
        keyTopics: ['Markdown']
      });
    });

    it('should throw an error for invalid JSON', () => {
      const input = 'This is just a regular sentence with no JSON.';
      expect(() => parseJSONResponse(input)).toThrow();
    });

    it('should handle JSON with surrounding whitespace and text', () => {
      const input = 'Some text before { "subject": "Whitespace" } and some text after.';
      const result = parseJSONResponse(input);
      expect(result).toEqual({
        subject: 'Whitespace'
      });
    });
  });
});
