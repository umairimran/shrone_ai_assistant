import { config } from './config';

export async function testBackendConnection(): Promise<boolean> {
  try {
    console.log('🧪 [TEST] Testing backend connection...');
    console.log('🧪 [TEST] Backend URL:', config.backendUrl);
    
    const url = `${config.backendUrl}/health`;
    console.log('🧪 [TEST] Request URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🧪 [TEST] Backend response status:', response.status, response.statusText);
    console.log('🧪 [TEST] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const responseText = await response.text();
      console.log('🧪 [TEST] Response body:', responseText);
      console.log('✅ [TEST] Backend connection successful');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ [TEST] Backend connection failed:', response.status, response.statusText);
      console.error('❌ [TEST] Error response:', errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ [TEST] Backend connection error:', error);
    return false;
  }
}

export async function testDocumentsEndpoint(): Promise<boolean> {
  try {
    console.log('🧪 [TEST] Testing documents endpoint...');
    
    const url = `${config.backendUrl}/documents_by_category/Board%20and%20Committee%20Proceedings`;
    console.log('🧪 [TEST] Request URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🧪 [TEST] Documents endpoint response status:', response.status, response.statusText);
    console.log('🧪 [TEST] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log('🧪 [TEST] Raw response data:', JSON.stringify(data, null, 2));
      console.log('✅ [TEST] Documents endpoint successful, found', data.documents?.length || 0, 'documents');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ [TEST] Documents endpoint failed:', response.status, response.statusText);
      console.error('❌ [TEST] Error response:', errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ [TEST] Documents endpoint error:', error);
    return false;
  }
}
