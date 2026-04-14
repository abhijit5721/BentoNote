# Meeting Assistant - Comprehensive Test Plan

This document outlines the test cases for the Meeting Assistant application, covering functional, edge-case, and security scenarios.

## 1. Authentication & Authorization
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| AUTH-01 | User clicks "Sign In" | Google OAuth popup appears and user can authenticate. |
| AUTH-02 | User signs out | User is logged out, history is cleared from view, and UI returns to signed-out state. |
| AUTH-03 | Unauthenticated user tries to view history | "Sign in Required" empty state is displayed. |
| AUTH-04 | Unauthenticated user tries to save a meeting | "Save to History" button is hidden or prompts for login. |
| AUTH-05 | Authenticated user views history | Only meetings belonging to the user's `uid` are fetched and displayed. |

## 2. Audio Recording & Live Feed
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| REC-01 | Start recording with microphone permissions granted | Timer starts, audio meter reacts to voice, and live transcript appears. |
| REC-02 | Start recording with microphone permissions denied | Graceful error message: "Microphone access denied or not available." |
| REC-03 | Change language dropdown before recording | Live transcript uses the newly selected language (e.g., Spanish). |
| REC-04 | Audio meter responsiveness | The 24-bar waveform visually fluctuates based on microphone input volume. |
| REC-05 | Stop recording | Timer stops, microphone stream is closed, and AI processing begins automatically. |
| REC-06 | Long recording session (> 1 hour) | Timer formats correctly (e.g., `65:00`), memory does not leak, browser does not crash. |

## 3. Text Input & AI Generation
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| AI-01 | Generate from valid text transcript | AI successfully generates Subject, Topics, MOM, Action Items, Sentiment, and Mind Map. |
| AI-02 | Generate from empty text | "Generate MOM" button is disabled. |
| AI-03 | Generate from non-English audio/text | AI detects the language and outputs the MOM, topics, and action items in that same language. |
| AI-04 | AI API timeout or failure | Graceful error message: "Failed to process audio. Please try again." |
| AI-05 | Ask AI a question about the meeting | AI responds accurately based on the meeting context. |
| AI-06 | Use Expert Persona (e.g., "Skeptical CFO") | AI responds in the tone and focus of the selected persona. |

## 4. Meeting History & Search
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| HIST-01 | Save a newly generated meeting | Meeting appears at the top of the History list. |
| HIST-02 | Delete a meeting from history | Meeting is removed from the list and deleted from Firestore. |
| HIST-03 | Search by exact subject match | Only the matching meeting is displayed. |
| HIST-04 | Search by keyword in transcript/MOM | Meetings containing the keyword in their content are displayed. |
| HIST-05 | Search with no matches | "No matches found" empty state is displayed. |
| HIST-06 | Click on a history item | App switches to "Assistant" view and loads the saved meeting details. |

## 5. Security & Firestore Rules
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| SEC-01 | User attempts to read another user's meeting | Firestore denies access (caught by `handleFirestoreError`). |
| SEC-02 | User attempts to modify `uid` of a meeting | Firestore denies update operation. |
| SEC-03 | User attempts to upgrade their own plan to 'pro' | Firestore denies update (plan is immutable by user). |
| SEC-04 | User creates a profile | Profile is created successfully with `plan: 'free'`. |

## 6. UI & Export
| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| UI-01 | Export MOM | Downloads a neatly formatted `.txt` or `.md` file containing the meeting notes. |
| UI-02 | Toggle Dark/Light mode | App theme switches correctly, including background gradients and text colors. |
| UI-03 | Mobile responsiveness | Bento grid collapses to a single column, recording UI scales down appropriately. |
| UI-04 | Mind Map rendering | D3/SVG mind map renders nodes and links without overlapping or breaking layout. |

## 7. End-to-End (E2E) User Journeys
These scenarios test the entire application flow from start to finish, simulating real-world usage.

| Test ID | Scenario | Steps to Execute | Expected Result |
|---------|----------|------------------|-----------------|
| E2E-01 | **The Complete Meeting Lifecycle (Happy Path)** | 1. Log in via Google.<br>2. Select "Record Audio" and click Start.<br>3. Speak for 30 seconds, observing the live meter and transcript.<br>4. Click Stop Recording.<br>5. Wait for AI generation.<br>6. Review Summary, Transcript, and Chat tabs.<br>7. Ask a custom question in the Chat tab.<br>8. Click "Save to History".<br>9. Navigate to History view and verify it appears.<br>10. Click "Export MOM" to download.<br>11. Log out. | The user can seamlessly transition from recording to reviewing, interacting with the AI, saving, and exporting without any UI glitches or data loss. |
| E2E-02 | **The Text-Only & Persona Workflow** | 1. Log in.<br>2. Select "Paste Transcript".<br>3. Paste a long, multi-speaker meeting transcript.<br>4. Click "Generate MOM".<br>5. Navigate to the Chat tab.<br>6. Click on the "Skeptical CFO" persona.<br>7. Verify the AI critiques the meeting from a financial perspective.<br>8. Save to history. | The app successfully bypasses the audio recording phase, processes the raw text, and the Expert Personas function correctly using the generated context. |
| E2E-03 | **The Multilingual Journey** | 1. Log in.<br>2. Go to "Record Audio" and select "Spanish" from the dropdown.<br>3. Record a 15-second message in Spanish.<br>4. Verify the live feed transcribes in Spanish.<br>5. Stop recording and wait for generation.<br>6. Verify the generated MOM, Action Items, and Sentiment labels are in Spanish.<br>7. Save to History.<br>8. Search for a Spanish keyword in the History search bar. | The entire pipeline (Live Feed -> Gemini Generation -> Database Storage -> Search) handles non-English languages flawlessly. |
| E2E-04 | **Error Recovery & Edge Cases** | 1. Deny microphone permissions and verify the error state.<br>2. Switch to Text mode and paste an empty string, verifying the Generate button is disabled.<br>3. Disconnect the internet and attempt to save a meeting.<br>4. Verify the `handleFirestoreError` catches the offline state and displays a user-friendly error. | The application does not crash under unexpected conditions. It provides clear, actionable feedback to the user and allows them to recover or try an alternative method. |
