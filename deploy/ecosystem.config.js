/**
 * PM2 — mantém o Next.js rodando no VPS e o reinicia junto com o servidor.
 *
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "full-hub",
      // server.js do build standalone, executado a partir da raiz do projeto.
      script: ".next/standalone/server.js",
      cwd: "/var/www/full-hub",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        // Escuta apenas em localhost: quem fala com a internet é o Nginx.
        HOSTNAME: "127.0.0.1",
        PORT: 3000,
      },
      max_memory_restart: "512M",
      autorestart: true,
      error_file: "/var/log/full-hub/error.log",
      out_file: "/var/log/full-hub/out.log",
      time: true,
    },
  ],
};
