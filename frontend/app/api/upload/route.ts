import { NextResponse } from 'next/server';
import { UploadedDoc } from '@/lib/types';

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  const docs: UploadedDoc[] = files.map((file, index) => ({
    id: `doc-${Date.now()}-${index}`,
    name: file.name,
    sizeMB: Number((file.size / (1024 * 1024)).toFixed(1)),
    type: (file.name.split('.').pop() ?? 'pdf').toLowerCase() as UploadedDoc['type'],
    status: 'uploaded'
  }));

  return NextResponse.json({ docs });
}
