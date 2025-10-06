import process from 'process';
import { NextResponse } from 'next/server';

interface AskRequestBody {
  question: string;
  category: string;
  top_k?: number;
}

const rawBackendUrl =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const backendUrl = rawBackendUrl.replace(/\/$/, '');

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AskRequestBody;
    const question = body.question?.trim();
    const category = body.category?.trim();

    if (!question || !category) {
      return NextResponse.json({ error: 'Question and category are required.' }, { status: 400 });
    }

    const qaResponse = await fetch(`${backendUrl}/v1/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question, category, top_k: body.top_k ?? 1 }),
      cache: 'no-store'
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('QA service error', qaResponse.status, errorText);
      const status = qaResponse.status >= 400 && qaResponse.status < 500 ? 400 : 502;
      return NextResponse.json({ error: 'Failed to fetch answer from QA service.' }, { status });
    }

    const data = await qaResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat route error', error);
    return NextResponse.json({ error: 'Failed to contact QA service.' }, { status: 500 });
  }
}
