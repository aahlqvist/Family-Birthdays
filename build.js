#!/usr/bin/env node
'use strict';

// Compiles family-birthdays-source.jsx into the <!-- App --> <script> block
// of index.html, using the same pipeline that was previously done by hand:
//   1. Strip import lines (named imports from "react" become a
//      `const { ... } = React;` destructure, since React is a global here).
//   2. Strip the `export default` prefix off the App function.
//   3. Run Babel (classic JSX runtime + optional chaining, nullish
//      coalescing, logical assignment) to get plain React.createElement calls.
//   4. Splice the result into index.html between the existing markers,
//      followed by the ReactDOM.createRoot(...).render(...) call.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SOURCE_FILE = path.join(ROOT, 'family-birthdays-source.jsx');
const HTML_FILE = path.join(ROOT, 'index.html');

const APP_MARKER_START = '  <!-- App -->\n  <script>\n';
const APP_MARKER_END = '\n  </script>\n</body>\n</html>';

function stripImportsAndExport(source) {
  const withoutImports = source
    .split('\n')
    .map(line => {
      const namedReactImport = line.match(
        /^import\s*\{\s*([^}]+?)\s*\}\s*from\s*['"]react['"];?\s*$/
      );
      if (namedReactImport) return `const { ${namedReactImport[1]} } = React;`;
      if (/^import\s.+;?\s*$/.test(line)) return null; // drop other imports
      return line;
    })
    .filter(line => line !== null)
    .join('\n');

  return withoutImports.replace(/^export default\s+/m, '');
}

function compile(source) {
  let babel;
  try {
    babel = require('@babel/core');
  } catch (err) {
    console.error('Missing Babel dependencies. Run `npm install` first.');
    process.exit(1);
  }

  const { code } = babel.transformSync(source, {
    filename: 'family-birthdays-source.jsx',
    babelrc: false,
    configFile: false,
    generatorOpts: { jsescOption: { minimal: true } },
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }],
      '@babel/plugin-transform-optional-chaining',
      '@babel/plugin-transform-nullish-coalescing-operator',
      '@babel/plugin-transform-logical-assignment-operators',
    ],
  });
  return code;
}

function main() {
  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const prepared = stripImportsAndExport(source);
  const compiled = compile(prepared);

  const rawHtml = fs.readFileSync(HTML_FILE, 'utf8');
  const usesCRLF = rawHtml.includes('\r\n');
  const html = usesCRLF ? rawHtml.replace(/\r\n/g, '\n') : rawHtml;

  const startIdx = html.indexOf(APP_MARKER_START);
  if (startIdx === -1) {
    throw new Error(
      `Could not find the "${APP_MARKER_START.trim()}" marker in index.html`
    );
  }
  const contentStart = startIdx + APP_MARKER_START.length;
  const endIdx = html.indexOf(APP_MARKER_END, contentStart);
  if (endIdx === -1) {
    throw new Error(
      `Could not find the closing "</script>" marker after the App block in index.html`
    );
  }

  const before = html.slice(0, contentStart);
  const after = html.slice(endIdx);

  const appScript =
    `${compiled}\n` +
    `    ReactDOM.createRoot(document.getElementById('root'))\n` +
    `      .render(React.createElement(App));`;

  const next = `${before}${appScript}${after}`;
  fs.writeFileSync(HTML_FILE, usesCRLF ? next.replace(/\n/g, '\r\n') : next);
  console.log(
    `Built ${path.relative(ROOT, HTML_FILE)} from ${path.relative(ROOT, SOURCE_FILE)}`
  );
}

main();
