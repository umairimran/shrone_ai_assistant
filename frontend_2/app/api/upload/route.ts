import { NextResponse } from 'next/server';
import { UploadedDoc } from '@/lib/types';

function getDocTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'doc':
    case 'docx':
      return 'word';
    case 'txt':
      return 'text';
    case 'xls':
    case 'xlsx':
      return 'excel';
    case 'ppt':
    case 'pptx':
      return 'powerpoint';
    default:
      return 'pdf'; // Default fallback
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const metadataString = formData.get('metadata') as string;
    
    // Parse metadata if provided
    let metadata = null;
    if (metadataString) {
      try {
        metadata = JSON.parse(metadataString);
      } catch (error) {
        console.warn('Failed to parse metadata:', error);
      }
    }

    const docs: UploadedDoc[] = files.map((file, index) => ({
      id: `doc-${Date.now()}-${index}`,
      name: file.name,
      sizeMB: Number((file.size / (1024 * 1024)).toFixed(1)),
      type: getDocTypeFromFileName(file.name),
      status: 'uploaded',
      // Add metadata if provided
      ...(metadata && {
        title: metadata.title,
        version: metadata.version,
        issueDate: metadata.issueDate,
        category: metadata.category,
        uploadedAt: new Date().toISOString()
      })
    }));

    return NextResponse.json({ docs });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
