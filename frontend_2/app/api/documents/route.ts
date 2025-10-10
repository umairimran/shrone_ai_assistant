import { NextResponse } from 'next/server';

const rawBackendUrl =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const backendUrl = rawBackendUrl.replace(/\/$/, '');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category parameter is required' },
        { status: 400 }
      );
    }

    // Call the backend documents_by_category endpoint
    const response = await fetch(`${backendUrl}/documents_by_category/${encodeURIComponent(category)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend documents API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch documents from backend' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Transform the backend response to match frontend expectations
    const transformedDocuments = data.documents.map((doc: any) => ({
      id: doc.id || `doc-${Date.now()}-${Math.random()}`,
      name: doc.filename || doc.document_name || 'Unknown Document',
      filename: doc.filename || doc.document_name,
      sizeMB: 0, // Size not available from backend
      type: doc.filename ? doc.filename.split('.').pop()?.toLowerCase() || 'pdf' : 'pdf',
      status: 'uploaded',
      title: doc.title || doc.document_name || doc.filename || 'Unknown Document',
      category: category,
      uploadedAt: new Date().toISOString(), // Not available from backend
      source_file: doc.source_file,
      // Pass through date/year so the UI can group by year folders correctly
      issueDate: doc.issued_date || doc.issue_date || doc.issueDate || null,
      year: (doc.year !== undefined && doc.year !== null) ? String(doc.year) : undefined,
      // Pass through version information
      version: doc.version || 1,
      is_current: doc.is_current !== false
    }));
    
    return NextResponse.json({
      documents: transformedDocuments,
      total: transformedDocuments.length,
      category: category
    });
  } catch (error) {
    console.error('Documents API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
