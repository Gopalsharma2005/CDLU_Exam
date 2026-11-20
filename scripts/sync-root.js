const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'client', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('[sync-root] client/dist does not exist. Run build first.');
  process.exit(1);
}

// 1. Copy assets directory
const distAssets = path.join(distDir, 'assets');
const rootAssets = path.join(rootDir, 'assets');
if (fs.existsSync(distAssets)) {
  if (fs.existsSync(rootAssets)) fs.rmSync(rootAssets, { recursive: true, force: true });
  fs.cpSync(distAssets, rootAssets, { recursive: true });
  console.log('[sync-root] Synced assets folder to root.');
}

// 2. Copy static files (logo, icons, favicon)
const staticFiles = ['cdlu-logo.png', 'favicon.svg', 'icons.svg'];
for (const file of staticFiles) {
  const src = path.join(distDir, file);
  const dest = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[sync-root] Synced ${file} to root.`);
  }
}

// 3. Find CSS and JS assets in dist
const assetFiles = fs.readdirSync(distAssets);
const cssFileName = assetFiles.find((f) => f.endsWith('.css'));
const jsFileName = assetFiles.find((f) => f.endsWith('.js'));

if (!cssFileName || !jsFileName) {
  console.error('[sync-root] Could not find CSS or JS bundle in client/dist/assets');
  process.exit(1);
}

const cssContent = fs.readFileSync(path.join(distAssets, cssFileName), 'utf8');
let jsContent = fs.readFileSync(path.join(distAssets, jsFileName), 'utf8');

// Embed logo as base64 so it renders 100% reliably even with file:// restrictions
const logoPath = path.join(rootDir, 'cdlu-logo.png');
if (fs.existsSync(logoPath)) {
  const logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  // Replace both "./cdlu-logo.png" and "/cdlu-logo.png" with the data URI
  jsContent = jsContent.replaceAll('./cdlu-logo.png', logoBase64);
  jsContent = jsContent.replaceAll('/cdlu-logo.png', logoBase64);
}

// 4. Build completely self-contained pages (runs directly via file://, double-click, or web server)
const createStandaloneHtml = (title, description) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <style>
${cssContent}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${jsContent}
    </script>
  </body>
</html>
`;

const studentHtml = createStandaloneHtml(
  'CDLU Digital Examination Portal',
  'Chaudhary Devi Lal University, Sirsa - Secure Digital Examination Portal'
);
const adminHtml = createStandaloneHtml(
  'CDLU Admin Examination Portal',
  'Chaudhary Devi Lal University, Sirsa - Authorized Administrator Portal'
);

fs.writeFileSync(path.join(rootDir, 'index.html'), studentHtml, 'utf8');
fs.writeFileSync(path.join(rootDir, 'admin.html'), adminHtml, 'utf8');
console.log('[sync-root] Generated standalone index.html and admin.html.');
