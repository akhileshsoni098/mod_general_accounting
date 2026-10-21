const fs = require('fs');
const path = require('path');

const pagesDir = path.resolve(__dirname, '../../frontend/src/pages');
const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

const pageInventory = [];

pageFiles.forEach(file => {
  const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
  
  // Extract forms
  const forms = [];
  const formMatches = [...content.matchAll(/<form[^>]*onSubmit=\{([^}]+)\}[^>]*>/g)];
  formMatches.forEach(m => forms.push(m[1]));
  
  // Extract buttons
  const buttons = [];
  const btnMatches = [...content.matchAll(/<button[^>]*onClick=\{([^}]+)\}[^>]*>([\s\S]*?)<\/button>/g)];
  btnMatches.forEach(m => {
    const handler = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    if (text) {
      buttons.push({ text: text.slice(0, 40), handler });
    }
  });

  // Extract api calls
  const apiCalls = new Set();
  const apiMatches = [...content.matchAll(/([a-zA-Z0-9]+Api\.[a-zA-Z0-9]+)\(/g)];
  apiMatches.forEach(m => apiCalls.add(m[1]));

  // Extract tabs
  const tabMatches = [...content.matchAll(/activeTab\s*===\s*['"]([^'"]+)['"]/g)];
  const tabs = [...new Set(tabMatches.map(m => m[1]))];

  pageInventory.push({
    file,
    formsCount: forms.length,
    forms,
    buttonsCount: buttons.length,
    sampleButtons: buttons.slice(0, 10),
    apiCalls: [...apiCalls],
    tabs
  });
});

const outPath = path.resolve(__dirname, 'frontend_inventory.json');
fs.writeFileSync(outPath, JSON.stringify(pageInventory, null, 2), 'utf8');
console.log('Frontend inventory written to:', outPath);
console.log('Total pages analyzed:', pageInventory.length);
