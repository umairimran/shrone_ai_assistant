import { config } from './config';

export async function testBackendConnection(): Promise<boolean> {
  try {
    console.log('🧪 Testing backend connection...');
    console.log('Backend URL:', config.backendUrl);
    
    const response = await fetch(`${config.backendUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Backend response status:', response.status);
    
    if (response.ok) {
      console.log('✅ Backend connection successful');
      return true;
    } else {
      console.error('❌ Backend connection failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ Backend connection error:', error);
    return false;
  }
}

export async function testDocumentsEndpoint(): Promise<boolean> {
  try {
    console.log('🧪 Testing documents endpoint...');
    
    const response = await fetch(`${config.backendUrl}/documents_by_category/Board%20and%20Committee%20Proceedings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Documents endpoint response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Documents endpoint successful, found', data.documents?.length || 0, 'documents');
      return true;
    } else {
      console.error('❌ Documents endpoint failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ Documents endpoint error:', error);
    return false;
  }
}
