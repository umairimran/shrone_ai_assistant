import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatProvider } from '@/context/ChatContext';
import { ChatPageContent } from '@/app/chat/page';

const renderChat = () =>
  render(
    <ChatProvider>
      <ChatPageContent />
    </ChatProvider>
  );

declare const global: typeof globalThis & { fetch: jest.Mock };

describe('Shrone Chatbot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn();
  });

  it('renders initial messages and document tag', () => {
    renderChat();
    expect(screen.getByText('Shrone Chatbot')).toBeInTheDocument();
    expect(screen.getByText("hello there sir how are you")).toBeInTheDocument();
    expect(screen.getByText("Hello! I’m here to assist you. How can I help you today?")).toBeInTheDocument();
    expect(screen.getByText('It_s_Sugar_Lease_Lincoln_Road_2')).toBeInTheDocument();
  });

  it('sends a message and shows typing indicator', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tokens: [' I', ' can', ' assist', ' you.'] })
    });

    renderChat();

    const textarea = screen.getByPlaceholderText('Ask something about the document…');
    fireEvent.change(textarea, { target: { value: 'What is the base rent?' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/chat');

    expect(await screen.findByText('Assistant is typing')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByText('Assistant is typing')).not.toBeInTheDocument()
    );

    expect(screen.getByText('What is the base rent?')).toBeInTheDocument();
    expect(screen.getByText(/assist you\./i)).toBeInTheDocument();
  });

  it('uploads a file and adds it to the list', async () => {
    global.fetch.mockImplementation((input: RequestInfo) => {
      if (typeof input === 'string' && input.includes('/api/upload')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            docs: [
              {
                id: 'doc-2',
                name: 'lease.pdf',
                sizeMB: 1.2,
                type: 'pdf',
                status: 'uploaded'
              }
            ]
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ tokens: [''] })
      });
    });

    const { container } = renderChat();
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File(['dummy content'], 'lease.pdf', { type: 'application/pdf' });

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] }
    });

    await waitFor(() => expect(screen.getByText('lease.pdf')).toBeInTheDocument());
    expect(screen.getByText('uploaded')).toBeInTheDocument();
  });
});
