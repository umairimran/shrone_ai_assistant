// Configuration utility for environment variables
export const config = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

// Debug function to check environment variables
export const debugConfig = () => {
  console.log('🔍 [CONFIG] Debug Config:');
  console.log('🔍 [CONFIG] NEXT_PUBLIC_BACKEND_URL:', process.env.NEXT_PUBLIC_BACKEND_URL);
  console.log('🔍 [CONFIG] NODE_ENV:', process.env.NODE_ENV);
  console.log('🔍 [CONFIG] Backend URL:', config.backendUrl);
  console.log('🔍 [CONFIG] Is Development:', config.isDevelopment);
  console.log('🔍 [CONFIG] Is Production:', config.isProduction);
};