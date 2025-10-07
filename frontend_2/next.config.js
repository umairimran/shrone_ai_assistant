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

  allowedDevOrigins: [
    'http://18.234.54.153:3000', // replace with your EC2 public IP
  ],
};

module.exports = nextConfig;