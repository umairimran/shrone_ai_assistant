import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    documents: [
      {
        id: 'doc-1',
        name: "It's Sugar Lease - Lincoln Road 2",
        sizeMB: 1.8,
        type: 'pdf',
        status: 'uploaded'
      }
    ]
  });
}
