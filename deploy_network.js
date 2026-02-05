#!/usr/bin/env node
/**
 * deploy_network.js - Despliegue del puente Cloudflare para RAULI-VISION
 * Arquitectura profesional: Cloudflare → espejo-backend (sin proxy intermedio)
 * El proxy no es necesario: Cloudflare aporta caché y Cuba funciona sin bloqueos.
 * Uso: node deploy_network.js
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname);
const INFRA = path.join(ROOT, 'infrastructure');
const DASHBOARD = path.join(ROOT, 'dashboard');
// Directo a espejo: más simple, menos fallos en Render, 1 solo servicio
const BACKEND_URL = 'https://espejo-backend.onrender.com';

function loadCloudflareToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const os = require('os');
  const home = os.homedir();
  const paths = [
    path.join(ROOT, 'credenciales.txt'),
    'C:\\dev\\credenciales.txt',
    path.join(home, 'credenciales.txt'),
    path.join(home, 'Desktop', 'credenciales.txt'),
    path.join(home, 'Escritorio', 'credenciales.txt'),
    path.join(home, 'OneDrive', 'RAUL - Personal', 'Escritorio', 'credenciales.txt'),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').replace(/\r/g, '');
        for (const line of content.split('\n')) {
          const m = line.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.+)$/i);
          if (m) {
            const t = m[1].trim().replace(/^["']|["']$/g, '');
            if (t && t.length > 10) return t;
          }
        }
      }
    } catch (_) {}
  }
  return '';
}

function log(msg, type = 'info') {
  const prefix = { info: '[INFO]', ok: '[OK]', err: '[ERROR]', warn: '[WARN]' }[type] || '[INFO]';
  console.log(`${prefix} ${msg}`);
}

function ensureWrangler() {
  log('Usando npx wrangler...');
  try {
    execSync('npx wrangler --version', { stdio: 'pipe', cwd: ROOT });
    log('wrangler disponible', 'ok');
  } catch {
    log('npx descargará wrangler al desplegar', 'info');
  }
}

function generateWorker() {
  log('Generando infrastructure/...');
  if (!fs.existsSync(INFRA)) fs.mkdirSync(INFRA, { recursive: true });

  const workerCode = `/**
 * Proxy inverso Cloudflare Worker - RAULI-VISION
 * Redirige a ${BACKEND_URL}
 */
const BACKEND = '${BACKEND_URL}';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const backendUrl = BACKEND + url.pathname + url.search;
    const modifiedRequest = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    const response = await fetch(modifiedRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: newHeaders });
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
`;
  fs.writeFileSync(path.join(INFRA, 'worker.js'), workerCode);

  const today = new Date().toISOString().slice(0, 10);
  const wranglerToml = `name = "puente-rauli-vision"
main = "worker.js"
compatibility_date = "${today}"
`;
  fs.writeFileSync(path.join(INFRA, 'wrangler.toml'), wranglerToml);
  log('worker.js y wrangler.toml creados', 'ok');
}

function deployAndCaptureUrl() {
  log('Desplegando a Cloudflare...');
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'deploy', '--dry-run=false'], {
      cwd: INFRA,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); process.stdout.write(d); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); process.stderr.write(d); });
    child.on('close', (code) => {
      const full = stdout + stderr;
      const match = full.match(/https:\/\/[^\s"')\]]+\.workers\.dev/);
      if (match) {
        const url = match[0].replace(/\/$/, '');
        resolve(url);
      } else if (code === 0) {
        resolve('https://puente-rauli-vision.workers.dev');
      } else {
        reject(new Error(`Deploy falló (código ${code}). ¿Ejecutaste wrangler login?`));
      }
    });
  });
}

function updateEnv(workerUrl) {
  const envPath = path.join(ROOT, '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const key = 'VITE_API_URL';
  const value = workerUrl;
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  } else {
    content = (content.trimEnd() + (content ? '\n' : '') + `${key}=${value}`).trimEnd() + '\n';
  }
  fs.writeFileSync(envPath, content.trimEnd() + '\n');
  log(`.env actualizado: VITE_API_URL=${value}`, 'ok');

  const dashboardEnv = path.join(DASHBOARD, '.env');
  if (fs.existsSync(DASHBOARD)) {
    let dash = fs.existsSync(dashboardEnv) ? fs.readFileSync(dashboardEnv, 'utf8') : '';
    if (new RegExp(`^${key}=`, 'm').test(dash)) {
      dash = dash.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
    } else {
      dash = (dash.trimEnd() + (dash ? '\n' : '') + `${key}=${value}`).trimEnd() + '\n';
    }
    fs.writeFileSync(dashboardEnv, dash.trimEnd() + '\n');
    log(`dashboard/.env actualizado`, 'ok');
  }
}

async function main() {
  console.log('\n=== deploy_network.js - RAULI-VISION (Puente Cuba) ===\n');
  const token = loadCloudflareToken();
  if (token) {
    process.env.CLOUDFLARE_API_TOKEN = token;
    log('Token Cloudflare cargado desde credenciales', 'ok');
  } else {
    log('CLOUDFLARE_API_TOKEN no encontrado. Usará fallback si deploy falla.', 'warn');
  }

  try {
    ensureWrangler();
    generateWorker();
    try {
      const workerUrl = await deployAndCaptureUrl();
      log(`Proxy desplegado: ${workerUrl}`, 'ok');
      updateEnv(workerUrl);
      console.log('\n=== ¡Listo! ===');
      console.log(`Proxy: ${workerUrl}`);
      console.log(`API:   ${workerUrl}/api/...`);
      console.log('\nRAULI-VISION se conectará por Cloudflare (funciona en Cuba).');
    } catch (deployErr) {
      log(`Cloudflare falló: ${deployErr.message}`, 'warn');
      log('Usando API directa (espejo-backend.onrender.com) como fallback', 'info');
      updateEnv(BACKEND_URL);
      console.log('\n=== Fallback aplicado ===');
      console.log(`API: ${BACKEND_URL}`);
    }
  } catch (err) {
    log(err.message, 'err');
    log('Configurando fallback directo...', 'info');
    updateEnv(BACKEND_URL);
  }
}

main();
