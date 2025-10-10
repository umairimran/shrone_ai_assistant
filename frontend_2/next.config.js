/** @type {import('next').NextConfig} */
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
 
  // Allow all dev origins - NO MORE BLOCKING!
  allowedDevOrigins: [
    '3.81.163.149',
    'http://3.81.163.149',
    'http://3.81.163.149:3000',
    '34.229.232.41',
    'http://34.229.232.41',
    'http://34.229.232.41:3000',
  ],
  
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