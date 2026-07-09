module.exports = {
  apps: [
    {
      name: 'http-switcher',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
