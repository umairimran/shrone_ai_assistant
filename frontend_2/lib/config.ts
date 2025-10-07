// Configuration utility for environment variables
export const config = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

// Debug function to check environment variables
export const debugConfig = () => {
  if (typeof window !== 'undefined') {
    console.log('🔍 Debug Config:');
    console.log('NEXT_PUBLIC_BACKEND_URL:', process.env.NEXT_PUBLIC_BACKEND_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('Backend URL:', config.backendUrl);
  }
};
