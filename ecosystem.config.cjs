module.exports = {
  apps: [
    {
      name: 'mnilab-laundry-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
    {
      name: 'mnilab-laundry-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
