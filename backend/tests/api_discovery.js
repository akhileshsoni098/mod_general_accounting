const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');

// 1. Inspect Mounted Express Routes
const mountedRoutes = [];
function extractRoutes(stack, prefix = '') {
  stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      const p = (prefix + layer.route.path).replace(/\/\//g, '/');
      mountedRoutes.push({
        method: methods,
        path: p,
        mounted: true
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      let subPrefix = prefix;
      if (layer.regexp) {
        const match = layer.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace('^\\/', '/')
          .replace(/\\\//g, '/')
          .replace('\\/?$', '')
          .replace('(?=\\/|$)', '')
          .replace('^', '');
        subPrefix = (prefix + match).replace(/\/\//g, '/');
      }
      extractRoutes(layer.handle.stack, subPrefix);
    }
  });
}
extractRoutes(app._router.stack);

// 2. Inspect All Route Files in backend/src/routes
const routesDir = path.resolve(__dirname, '../src/routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

const fileRoutes = [];
routeFiles.forEach(file => {
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const m = line.match(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/i);
    if (m) {
      fileRoutes.push({
        file,
        method: m[1].toUpperCase(),
        subPath: m[2],
        line: idx + 1,
        fullLine: line.trim()
      });
    }
  });
});

const outPath = path.resolve(__dirname, 'api_inventory.json');
fs.writeFileSync(outPath, JSON.stringify({
  mountedCount: mountedRoutes.length,
  fileRouteCount: fileRoutes.length,
  mountedRoutes,
  fileRoutes
}, null, 2), 'utf8');

console.log('API Inventory written to:', outPath);
console.log('Mounted count:', mountedRoutes.length);
console.log('File route count:', fileRoutes.length);
