# Shrone Chatbot Frontend

A production-ready React and Next.js 14 application that replicates the “Shrone Chatbot” experience with a document-aware chat interface, dark UI, and mocked APIs for chat, uploads, and document management.

## Prerequisites

- Node.js 18+
- npm 9+

If you are working from the mono-repo root with a Python virtualenv, activate it first:

```bash
source venv/bin/activate
```

## Getting Started

Install dependencies and start the development server:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Available Scripts

- `npm run dev` – Start the Next.js development server.
- `npm run build` – Create an optimized production build.
- `npm run start` – Start the production server after a build.
- `npm run lint` – Run ESLint with the configured ruleset.
- `npm run typecheck` – Type-check the project with TypeScript.
- `npm test` – Execute Jest + Testing Library tests.

## Mock API Layer

The `/app/api` directory contains mocked routes:

- `POST /api/chat` – Returns streaming-like token chunks based on the latest user prompt.
- `POST /api/upload` – Accepts file uploads and returns fabricated document metadata.
- `GET /api/documents` – Seeds the application with a sample document.

These handlers let the UI behave end-to-end without an external backend. To integrate a real service, replace the route implementations or point the front-end fetch calls inside `context/ChatContext.tsx` to your APIs.

## Customization

- **Branding & Colors:** Tailwind tokens live in `tailwind.config.ts` and global styles in `app/globals.css`.
- **Layout & Components:** Core UI components sit in `components/`. Update them to match branding or feature needs.
- **State Management:** Conversation logic is contained in `context/ChatContext.tsx`. Extend it to connect real-time transports or persistence layers.

## Testing

The `__tests__` folder includes lightweight Jest + Testing Library coverage for initial render, message sending (including typing simulation), and file upload flows.

Run the suite with:

```bash
npm test
```

## Deployment

Generate a production build with `npm run build`, then serve with `npm run start`. The mock API routes run server-side within Next.js, so deployment-ready platforms (Vercel, Netlify, Node servers) will work without extra configuration.
