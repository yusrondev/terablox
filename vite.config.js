import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    host: true,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save-presets' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const fileContent = `export const CUSTOM_PRESETS = ${JSON.stringify(data.presets, null, 2)};\n`;
              const filePath = path.resolve(__dirname, 'src/custom-presets.js');
              fs.writeFileSync(filePath, fileContent, 'utf-8');
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  }
});
