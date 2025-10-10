/** @type {import('next').NextConfig} */

// =====================================================
// LOAD SINGLE POINT CONFIGURATION FROM config.json
// =====================================================
const fs = require('fs');
const path = require('path');

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    const configFile = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configFile);
  } catch (error) {
    console.warn('Warning: Could not load config.json:', error.message);
    return { current_ec2_ip: 'localhost', backend_port: '8000', frontend_port: '3000' };
  }
}

const config = loadConfig();
const CURRENT_IP = config.current_ec2_ip || 'localhost';
const FRONTEND_PORT = config.frontend_port || '3000';
const BACKEND_PORT = config.backend_port || '8000';

console.log(`🌐 Next.js loaded configuration: IP=${CURRENT_IP}, Ports=${FRONTEND_PORT}/${BACKEND_PORT}`);

// Automatically generate allowed origins from config.json
const AUTO_ALLOWED_ORIGINS = [
  CURRENT_IP,
  `http://${CURRENT_IP}`,
  `https://${CURRENT_IP}`,
  `http://${CURRENT_IP}:${FRONTEND_PORT}`,
  `https://${CURRENT_IP}:${FRONTEND_PORT}`,
  `http://${CURRENT_IP}:${BACKEND_PORT}`,
  `https://${CURRENT_IP}:${BACKEND_PORT}`,
  'localhost',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
];

console.log('🔒 CORS configured for:', CURRENT_IP);

const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle react-pdf canvas dependencies
    config.resolve.alias.canvas = false;
    
    // Configure file loader for PDFs
    config.module.rules.push({
      test: /\.pdf$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/files/',
          outputPath: 'static/files/',
        },
      },
    });

    // Handle worker files
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]',
      },
    });

    return config;
  },
  
  // Experimental features for better SSR handling
  experimental: {
    esmExternals: 'loose',
  },
  
  // Handle external dependencies
  transpilePackages: ['react-pdf'],
 
  // AUTOMATIC CORS FROM config.json - Just change IP in config.json!
  allowedDevOrigins: AUTO_ALLOWED_ORIGINS,
  
  // Additional headers for CORS
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With,Content-Type,Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;