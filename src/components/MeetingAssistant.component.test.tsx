import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MeetingAssistant } from './MeetingAssistant';

// Mock Firebase
vi.mock('@/src/lib/firebase', () => ({
  auth: {
    onAuthStateChanged: vi.fn((cb) => {
      cb({ uid: '123', email: 'test@example.com' }); // Mock logged in user
      return () => {};
    }),
    signOut: vi.fn(),
  },
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    LIST: 'list',
    WRITE: 'write',
    DELETE: 'delete'
  }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    cb({ docs: [] }); // Empty history
    return () => {};
  }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() }))
  }
}));

// Mock Gemini
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            subject: "Mocked Meeting",
            keyTopics: ["Mocking"],
            transcript: "Speaker A: Hello",
            mom: "Mocked MOM",
            actionPoints: ["Do something"],
            sentiment: [],
            mindMap: { nodes: [], links: [] }
          })
        })
      };
    }
  };
});

describe('MeetingAssistant Component', () => {
  it('renders the main UI elements', async () => {
    render(<MeetingAssistant />);
    
    // Check for main tabs
    expect(screen.getByText('Record')).toBeInTheDocument();
    expect(screen.getByText('Transcript')).toBeInTheDocument();
    
    // Check for history toggle
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('handles empty transcript submission correctly', async () => {
    render(<MeetingAssistant />);
    
    // Switch to Paste Transcript mode
    fireEvent.click(screen.getByText('Transcript'));
    
    // The generate button should be disabled when transcript is empty
    const generateBtn = screen.getByText('Generate MOM');
    expect(generateBtn).toBeDisabled();
  });
});
