#!/usr/bin/env node
/**
 * phantom-sweep.mjs — repo-wide phantom reference scanner for ServiceWriterFinal.
 *
 * Finds every place the code references a database table / column / function
 * that production does not have (or that the generated types misdescribe).
 *
 * Usage:
 *   node scripts/phantom-sweep.mjs extract [--out extraction.json] [--roots src,app]
 *   node scripts/phantom-sweep.mjs check --census live-schema-census.json
 *        [--extraction extraction.json] [--out report.json] [--register register.md]
 *        [--only-tables appointments,service_records]
 *
 * `extract` is purely static: it parses TypeScript with the compiler API and
 * SQL migrations with a scanner, and writes an extraction JSON.
 * `check` diffs an extraction against a LIVE census JSON of the shape:
 *   { "tables": { "<table>": ["col", ...] },
 *     "functions": [ {"name": "...", "args": "...", "body_len": n, "body_md5": "..."} ],
 *     "triggers": [ {"table": "...", "trigger": "...", "function": "..."} ],
 *     "partial": false }
 * and exits 1 when any STATIC-CERTAIN code phantom is found.
 * Set "partial": true in a census to suppress table-absence verdicts for
 * tables the census does not cover (smoke tests against a subset census).
 *
 * The census is the ONLY schema truth. Generated types and migrations are
 * inputs being diffed, never schema sources.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  console.error('phantom-sweep: cannot resolve the "typescript" package. Run from a checkout with dependencies installed (npm ci).');
  process.exit(2);
}

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* ---------------------------------- utils --------------------------------- */

function md5hex(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue;
      walkFiles(p, exts, out);
    } else if (exts.some((e) => ent.name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Split on `sep` at paren/bracket depth 0, respecting '...' "..." quotes. */
function splitTopLevel(str, sep = ',') {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      cur += ch;
      if (ch === quote && str[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/* --------------------------- PostgREST select parser --------------------------- */

const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg', 'bool_and', 'bool_or', 'json_agg', 'jsonb_agg']);

/**
 * Parse a PostgREST select string.
 * Returns { wildcard, columns:[{name,raw}], embeds:[{table,alias,hint,select}], aggregates:[{fn,column,raw}], raw }
 * Embed columns validate against the EMBEDDED table; aggregates against the base table.
 */
function parseSelectString(raw) {
  const out = { wildcard: false, columns: [], embeds: [], aggregates: [], raw };
  const items = splitTopLevel(raw, ',');
  for (let item of items) {
    item = item.trim();
    if (!item) continue;
    if (item === '*') { out.wildcard = true; continue; }
    let spread = false;
    if (item.startsWith('...')) { spread = true; item = item.slice(3).trim(); }
    const parenIdx = topLevelIndex(item, '(');
    if (parenIdx !== -1) {
      const head = item.slice(0, parenIdx).trim();
      const closeIdx = item.lastIndexOf(')');
      const inner = item.slice(parenIdx + 1, closeIdx === -1 ? undefined : closeIdx);
      // head forms: [alias:]name[!hint]
      let namePart = head;
      let alias = null;
      const colonIdx = topLevelColon(namePart);
      if (colonIdx !== -1) { alias = namePart.slice(0, colonIdx).trim(); namePart = namePart.slice(colonIdx + 1).trim(); }
      let hint = null;
      const bangIdx = namePart.indexOf('!');
      if (bangIdx !== -1) { hint = namePart.slice(bangIdx + 1).trim(); namePart = namePart.slice(0, bangIdx).trim(); }
      const baseName = stripQuotes(namePart);
      if (!spread && AGGREGATES.has(baseName.toLowerCase()) && !alias) {
        const innerTrim = inner.trim();
        if (innerTrim === '*' || innerTrim === '') out.aggregates.push({ fn: baseName, column: null, raw: item });
        else {
          const col = plainColumnName(innerTrim);
          out.aggregates.push({ fn: baseName, column: col, raw: item });
        }
        continue;
      }
      // embedded resource
      out.embeds.push({ table: baseName, alias, hint, spread, select: parseSelectString(inner), raw: item });
      continue;
    }
    const col = plainColumnName(item);
    if (col) out.columns.push({ name: col, raw: item });
  }
  return out;
}

function topLevelIndex(s, ch) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote && s[i - 1] !== '\\') quote = null; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { if (c === ch && depth === 0) return i; depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ch && depth === 0) return i;
  }
  return -1;
}

function topLevelColon(s) {
  // alias colon: a ':' not part of '::' cast
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ':' ) {
      if (s[i + 1] === ':') { i++; continue; }
      return i;
    }
  }
  return -1;
}

/** Reduce a plain select item / filter value to its base column name. */
function plainColumnName(item) {
  let s = item.trim();
  const colonIdx = topLevelColon(s);
  if (colonIdx !== -1 && !s.startsWith('"')) s = s.slice(colonIdx + 1).trim(); // alias:col
  const castIdx = s.indexOf('::');
  if (castIdx !== -1) s = s.slice(0, castIdx);
  const arrowIdx = s.indexOf('->');
  if (arrowIdx !== -1) s = s.slice(0, arrowIdx);
  s = stripQuotes(s.trim());
  if (!s || s === '*') return null;
  return s;
}

/** Parse a PostgREST .or()/.and() filter string into column references. */
function parseOrStringColumns(str, out = []) {
  for (let seg of splitTopLevel(str, ',')) {
    seg = seg.trim();
    if (!seg) continue;
    const m = seg.match(/^(?:not\()?([A-Za-z_][\w]*)\./);
    if (m) { out.push(m[1]); continue; }
    const nested = seg.match(/^(?:and|or)\((.*)\)$/s);
    if (nested) parseOrStringColumns(nested[1], out);
  }
  return out;
}

/* ------------------------------ code extraction ------------------------------ */

const FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'like', 'ilike', 'filter', 'contains', 'containedBy', 'overlaps', 'textSearch']);
const CHAIN_METHODS = new Set(['select', 'insert', 'update', 'upsert', 'delete', ...FILTER_METHODS, 'match', 'or', 'and', 'order']);

function isTestPath(p) {
  return /(^|\/)(__tests__|__mocks__)(\/|$)/.test(p) || /\.(test|spec)\.(ts|tsx)$/.test(p);
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function unwrap(node) {
  let n = node;
  while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n))) n = n.expression;
  return n;
}

function stringLiteralValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, dynamic: false };
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    let dynamic = false;
    for (const span of node.templateSpans) {
      dynamic = true;
      text += '${…}' + span.literal.text;
    }
    return { text, dynamic };
  }
  return null;
}

/** Extract static keys of an object literal (or array of them). */
function payloadKeys(node) {
  if (!node) return { keys: [], spread: false, unresolved: true };
  const n = unwrap(node);
  if (ts.isArrayLiteralExpression(n)) {
    const acc = { keys: [], spread: false, unresolved: false };
    if (n.elements.length === 0) return { keys: [], spread: false, unresolved: true };
    for (const el of n.elements) {
      const sub = payloadKeys(el);
      acc.keys.push(...sub.keys);
      acc.spread = acc.spread || sub.spread;
      acc.unresolved = acc.unresolved || sub.unresolved;
    }
    acc.keys = [...new Set(acc.keys)];
    return acc;
  }
  if (!ts.isObjectLiteralExpression(n)) return { keys: [], spread: false, unresolved: true };
  const keys = [];
  let spread = false;
  let unresolved = false;
  for (const prop of n.properties) {
    if (ts.isSpreadAssignment(prop)) { spread = true; continue; }
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
      const nameNode = prop.name;
      if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) keys.push(nameNode.text);
      else unresolved = true;
    }
  }
  return { keys, spread, unresolved };
}

function extractCodeFile(filePath, rootLabel) {
  const text = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(REPO_ROOT, filePath);
  const test = isTestPath(rel);
  const sites = [];
  const rpcs = [];

  const isFromCall = (node) =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(unwrap(node.expression)) &&
    unwrap(node.expression).name.text === 'from';

  // Pass A: discover .from() sites.
  const fromCalls = [];
  const findFrom = (node) => {
    if (isFromCall(node)) fromCalls.push(node);
    ts.forEachChild(node, findFrom);
  };
  findFrom(sf);

  const siteByFromNode = new Map();
  for (const call of fromCalls) {
    const arg = call.arguments[0];
    const lit = arg ? stringLiteralValue(arg) : null;
    const site = {
      id: `${rel}:${lineOf(sf, call)}`,
      file: rel,
      root: rootLabel,
      line: lineOf(sf, call),
      test,
      table: lit && !lit.dynamic ? lit.text : null,
      tableDynamic: !lit || lit.dynamic,
      tableExpr: lit ? null : (arg ? arg.getText(sf).slice(0, 80) : null),
      selects: [],       // {parsed|null, raw, dynamic, line}
      filters: [],       // {column, method, line, via}
      payloads: [],      // {method, keys, spread, unresolved, line}
      onConflicts: [],   // {columns:[], line}
      methodsSeen: [],
    };
    sites.push(site);
    siteByFromNode.set(call, site);
  }

  // Variable bindings: name -> site, scoped by enclosing function/block node range.
  const bindings = [];
  const collectBindings = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const inner = [];
      const hunt = (n) => { if (isFromCall(n)) inner.push(n); ts.forEachChild(n, hunt); };
      hunt(node.initializer);
      if (inner.length === 1 && siteByFromNode.has(inner[0])) {
        let scope = node.parent;
        let cur = node;
        while (cur.parent) {
          cur = cur.parent;
          if (ts.isFunctionLike(cur) || ts.isBlock(cur) || ts.isSourceFile(cur)) { scope = cur; break; }
        }
        bindings.push({ name: node.name.text, site: siteByFromNode.get(inner[0]), scopeStart: scope.getStart(sf), scopeEnd: scope.getEnd() });
      }
    }
    ts.forEachChild(node, collectBindings);
  };
  collectBindings(sf);

  const bindingFor = (identNode) => {
    const pos = identNode.getStart(sf);
    let best = null;
    for (const b of bindings) {
      if (b.name === identNode.text && pos >= b.scopeStart && pos <= b.scopeEnd) {
        if (!best || b.scopeStart >= best.scopeStart) best = b;
      }
    }
    return best ? best.site : null;
  };

  // Chain base resolution: descend a method-call chain to its root.
  const chainBase = (callNode) => {
    let cur = callNode;
    while (ts.isCallExpression(cur)) {
      const expr = unwrap(cur.expression);
      if (!ts.isPropertyAccessExpression(expr)) return cur;
      const obj = unwrap(expr.expression);
      if (ts.isCallExpression(obj)) {
        if (isFromCall(obj)) return obj;
        cur = obj;
        continue;
      }
      return obj;
    }
    return cur;
  };

  const attachMethod = (site, methodName, callNode) => {
    site.methodsSeen.push(methodName);
    const args = callNode.arguments;
    const line = lineOf(sf, callNode);
    if (methodName === 'select') {
      const lit = args[0] ? stringLiteralValue(args[0]) : null;
      if (!lit) { site.selects.push({ parsed: null, raw: args[0] ? args[0].getText(sf).slice(0, 120) : null, dynamic: true, line }); return; }
      site.selects.push({ parsed: lit.dynamic ? null : parseSelectString(lit.text), raw: lit.text, dynamic: lit.dynamic, line });
      return;
    }
    if (methodName === 'insert' || methodName === 'update' || methodName === 'upsert') {
      const pk = payloadKeys(args[0]);
      site.payloads.push({ method: methodName, keys: pk.keys, spread: pk.spread, unresolved: pk.unresolved, line });
      if (methodName === 'upsert' && args[1] && ts.isObjectLiteralExpression(unwrap(args[1]))) {
        for (const prop of unwrap(args[1]).properties) {
          if (ts.isPropertyAssignment(prop) && prop.name.text === 'onConflict') {
            const v = stringLiteralValue(prop.initializer);
            if (v && !v.dynamic) site.onConflicts.push({ columns: v.text.split(',').map((s) => s.trim()).filter(Boolean), line });
          }
        }
      }
      return;
    }
    if (methodName === 'match') {
      const pk = payloadKeys(args[0]);
      for (const k of pk.keys) site.filters.push({ column: k, method: 'match', line, via: 'match' });
      return;
    }
    if (methodName === 'or' || methodName === 'and') {
      const lit = args[0] ? stringLiteralValue(args[0]) : null;
      if (lit && !lit.dynamic) {
        for (const col of parseOrStringColumns(lit.text)) site.filters.push({ column: col, method: methodName, line, via: 'or-string' });
      }
      return;
    }
    if (FILTER_METHODS.has(methodName) || methodName === 'order') {
      const lit = args[0] ? stringLiteralValue(args[0]) : null;
      if (lit && !lit.dynamic) site.filters.push({ column: lit.text, method: methodName, line, via: 'arg' });
      return;
    }
  };

  // Pass B: every chain-method call — resolve its chain base.
  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const expr = unwrap(node.expression);
      if (ts.isPropertyAccessExpression(expr)) {
        const mName = expr.name.text;
        if (CHAIN_METHODS.has(mName)) {
          const base = chainBase(node);
          if (base && isFromCall(base) && siteByFromNode.has(base)) attachMethod(siteByFromNode.get(base), mName, node);
          else if (base && ts.isIdentifier(base)) {
            const site = bindingFor(base);
            if (site) attachMethod(site, mName, node);
          }
        }
        if (mName === 'rpc') {
          const nameArg = node.arguments[0];
          const lit = nameArg ? stringLiteralValue(nameArg) : null;
          const rpc = {
            id: `${rel}:${lineOf(sf, node)}`,
            file: rel, root: rootLabel, line: lineOf(sf, node), test,
            name: lit && !lit.dynamic ? lit.text : null,
            nameDynamic: !lit || lit.dynamic,
            argKeys: null, argsUnresolved: false,
          };
          if (node.arguments[1]) {
            const pk = payloadKeys(node.arguments[1]);
            rpc.argKeys = pk.keys;
            rpc.argsUnresolved = pk.unresolved || pk.spread;
          } else rpc.argKeys = [];
          rpcs.push(rpc);
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);

  return { sites, rpcs };
}

function extractCode(roots) {
  const allSites = [];
  const allRpcs = [];
  let files = 0;
  for (const root of roots) {
    const dir = path.join(REPO_ROOT, root);
    for (const f of walkFiles(dir, ['.ts', '.tsx'])) {
      files++;
      try {
        const { sites, rpcs } = extractCodeFile(f, root);
        allSites.push(...sites);
        allRpcs.push(...rpcs);
      } catch (err) {
        console.error(`phantom-sweep: extraction failed for ${f}: ${err.message}`);
      }
    }
  }
  return { sites: allSites, rpcs: allRpcs, filesScanned: files };
}

/* ------------------------------- types parsing ------------------------------- */

function typeProps(typeNode) {
  if (!typeNode) return null;
  if (ts.isTypeLiteralNode(typeNode)) {
    const map = new Map();
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) map.set(member.name.text, member.type);
    }
    return map;
  }
  return null;
}

/** Parse a generated supabase types file into { tables, views, functions } per schema. */
function parseTypesFile(filePath) {
  const result = { tables: {}, views: {}, functions: {} };
  if (!fs.existsSync(filePath)) return result;
  const text = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  let dbType = null;
  const find = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') dbType = node.type;
    ts.forEachChild(node, find);
  };
  find(sf);
  if (!dbType) return result;
  const schemas = typeProps(dbType);
  if (!schemas) return result;
  for (const [schemaName, schemaType] of schemas) {
    if (schemaName === '__InternalSupabase') continue;
    const schemaProps = typeProps(schemaType);
    if (!schemaProps) continue;
    const tables = typeProps(schemaProps.get('Tables'));
    if (tables) {
      for (const [tName, tType] of tables) {
        const rowProps = typeProps(typeProps(tType)?.get('Row'));
        result.tables[tName] = rowProps ? [...rowProps.keys()] : [];
      }
    }
    const views = typeProps(schemaProps.get('Views'));
    if (views) {
      for (const [vName, vType] of views) {
        const rowProps = typeProps(typeProps(vType)?.get('Row'));
        result.views[vName] = rowProps ? [...rowProps.keys()] : [];
      }
    }
    const fns = typeProps(schemaProps.get('Functions'));
    if (fns) {
      for (const [fName, fType] of fns) {
        const argsProps = typeProps(typeProps(fType)?.get('Args'));
        result.functions[fName] = argsProps ? [...argsProps.keys()] : [];
      }
    }
  }
  return result;
}

/* --------------------------- SQL function extraction --------------------------- */

const TYPE_ALIASES = {
  varchar: 'character varying', 'character varying': 'character varying',
  int: 'integer', int4: 'integer', integer: 'integer',
  int8: 'bigint', bigint: 'bigint', int2: 'smallint', smallint: 'smallint',
  bool: 'boolean', boolean: 'boolean',
  float8: 'double precision', 'double precision': 'double precision', float4: 'real', real: 'real',
  timestamptz: 'timestamp with time zone', 'timestamp with time zone': 'timestamp with time zone',
  timestamp: 'timestamp without time zone', 'timestamp without time zone': 'timestamp without time zone',
  serial: 'integer', bigserial: 'bigint', smallserial: 'smallint',
  dec: 'numeric', decimal: 'numeric', numeric: 'numeric',
};

/** Normalize an argument list (pg identity-args shape) for cross-source comparison. */
function normalizeArgs(argListRaw) {
  if (!argListRaw || !argListRaw.trim()) return '';
  return splitTopLevel(argListRaw, ',')
    .map((seg) => {
      let s = seg.trim().toLowerCase().replace(/\s+/g, ' ');
      s = s.replace(/\s+default\s+.*$/, '');
      s = s.replace(/^(inout|in|out|variadic)\s+/, '');
      const tokens = s.split(' ');
      let name = null;
      let type = s;
      if (tokens.length >= 2 && !s.includes('(') || tokens.length >= 3) {
        // heuristic: first token is a name when the remainder looks like a type
        const rest = tokens.slice(1).join(' ');
        if (/^(character|timestamp|double|time|date|interval)\b/.test(rest) || TYPE_ALIASES[rest] || /^[a-z_][\w]*(\[\])?$/.test(rest)) {
          name = tokens[0];
          type = rest;
        }
      } else if (tokens.length >= 2 && s.includes('(')) {
        name = tokens[0];
        type = tokens.slice(1).join(' ');
      }
      type = type.replace(/\(([^)]*)\)/g, '').trim();
      type = TYPE_ALIASES[type] || type;
      return name ? `${name} ${type}` : type;
    })
    .join(', ');
}

/** Parse census/pg identity args into just the argument NAMES. */
function censusArgNames(argsStr) {
  if (!argsStr || !argsStr.trim()) return [];
  const norm = normalizeArgs(argsStr);
  if (!norm) return [];
  return splitTopLevel(norm, ',').map((seg) => {
    const tokens = seg.trim().split(' ');
    return tokens.length >= 2 ? tokens[0] : null;
  }).filter(Boolean);
}

function scanSqlFunctions(migrationsDir) {
  const files = walkFiles(migrationsDir, ['.sql']).sort();
  const defs = new Map(); // key name|normArgs -> latest def
  const byName = new Map(); // name -> [keys]
  const drops = [];
  let defCount = 0;

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file);
    const events = [];
    const createRe = /create\s+(or\s+replace\s+)?function\s+([a-zA-Z_][\w.]*)\s*\(/gi;
    let m;
    while ((m = createRe.exec(text)) !== null) events.push({ kind: 'create', idx: m.index, match: m });
    const dropRe = /drop\s+function\s+(if\s+exists\s+)?([a-zA-Z_][\w.]*)\s*(\(([^)]*)\))?/gi;
    while ((m = dropRe.exec(text)) !== null) events.push({ kind: 'drop', idx: m.index, match: m });
    events.sort((a, b) => a.idx - b.idx);

    for (const ev of events) {
      if (ev.kind === 'drop') {
        const name = ev.match[2].split('.').pop();
        drops.push({ name, args: ev.match[4] || null, file: rel });
        continue;
      }
      const rawName = ev.match[2];
      const name = rawName.split('.').pop();
      // balanced parens for the arg list
      let i = ev.match.index + ev.match[0].length; // just after '('
      let depth = 1;
      const argStart = i;
      while (i < text.length && depth > 0) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') depth--;
        i++;
      }
      const argsRaw = text.slice(argStart, i - 1);
      // find AS <dollar-tag> or AS '...'
      const rest = text.slice(i, i + 4000);
      const asMatch = rest.match(/^\s*(?:returns\s+[\s\S]*?)?\bas\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/i);
      let body = null;
      let bodyStart = -1;
      if (asMatch) {
        const tag = asMatch[1];
        bodyStart = i + asMatch.index + asMatch[0].length;
        const closeIdx = text.indexOf(tag, bodyStart);
        if (closeIdx !== -1) body = text.slice(bodyStart, closeIdx);
      }
      const langMatch = text.slice(i, bodyStart === -1 ? i + 2000 : bodyStart).match(/language\s+(\w+)/i);
      const def = {
        name,
        argsRaw: argsRaw.trim(),
        argsNormalized: normalizeArgs(argsRaw),
        language: langMatch ? langMatch[1].toLowerCase() : null,
        body,
        bodyLen: body === null ? null : [...body].length,
        bodyMd5: body === null ? null : md5hex(Buffer.from(body, 'utf8')),
        file: rel,
      };
      defCount++;
      const key = `${name}|${def.argsNormalized}`;
      defs.set(key, def);
      if (!byName.has(name)) byName.set(name, []);
      const keys = byName.get(name);
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return { functions: [...defs.values()], definitionCount: defCount, distinctNames: byName.size, drops, filesScanned: files.length };
}

/* ------------------------- function-body field references ------------------------- */

const NOT_A_VAR = new Set(['public', 'pg_catalog', 'information_schema', 'auth', 'storage', 'extensions', 'vault', 'net', 'cron', 'select', 'insert', 'update', 'delete', 'from', 'where', 'and', 'or', 'not', 'case', 'when', 'then', 'else', 'end', 'if', 'loop', 'for', 'in', 'is', 'null', 'true', 'false', 'new', 'old', 'tg', 'found']);

function extractBodyRefs(fn) {
  const body = fn.body || '';
  const varTables = new Map(); // var -> {table, source}
  // DECLARE .. BEGIN section
  const declMatch = body.match(/\bdeclare\b([\s\S]*?)\bbegin\b/i);
  if (declMatch) {
    for (const stmt of declMatch[1].split(';')) {
      const dm = stmt.trim().match(/^"?([a-zA-Z_][\w]*)"?\s+(.+)$/s);
      if (!dm) continue;
      const [, varName, typePart] = dm;
      const rt = typePart.trim().match(/^([a-zA-Z_][\w.]*)\s*%\s*rowtype/i);
      if (rt) varTables.set(varName.toLowerCase(), { table: rt[1].split('.').pop().toLowerCase(), source: 'rowtype-decl' });
    }
  }
  // SELECT ... INTO var FROM table
  const intoRe = /\binto\s+"?([a-zA-Z_][\w]*)"?\b[\s\S]{0,600}?\bfrom\s+"?([a-zA-Z_][\w.]*)"?/gi;
  let im;
  while ((im = intoRe.exec(body)) !== null) {
    const v = im[1].toLowerCase();
    if (!varTables.has(v)) varTables.set(v, { table: im[2].split('.').pop().toLowerCase(), source: 'select-into' });
  }
  // FROM / JOIN aliases
  const aliasRe = /\b(?:from|join)\s+"?([a-zA-Z_][\w.]*)"?(?:\s+(?:as\s+)?"?([a-zA-Z_][\w]*)"?)?/gi;
  const SQL_AFTER_TABLE = new Set(['where', 'on', 'left', 'right', 'inner', 'outer', 'full', 'join', 'cross', 'group', 'order', 'limit', 'offset', 'union', 'using', 'natural', 'lateral', 'returning', 'values', 'set']);
  let am;
  while ((am = aliasRe.exec(body)) !== null) {
    const table = am[1].split('.').pop().toLowerCase();
    if (am[2]) {
      const alias = am[2].toLowerCase();
      if (!SQL_AFTER_TABLE.has(alias) && !varTables.has(alias)) varTables.set(alias, { table, source: 'from-alias' });
    }
    // the table name itself qualifies columns too (appointments.status)
    if (!varTables.has(table)) varTables.set(table, { table, source: 'table-qualifier' });
  }
  // references var.field
  const refs = [];
  const refRe = /\b([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\b/g;
  let rm;
  const seen = new Set();
  while ((rm = refRe.exec(body)) !== null) {
    const after = body[rm.index + rm[0].length];
    if (after === '(') continue; // function call, not a field
    const v = rm[1].toLowerCase();
    const field = rm[2].toLowerCase();
    if (NOT_A_VAR.has(v) && v !== 'new' && v !== 'old') continue;
    const key = `${v}.${field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ var: v, field, resolution: varTables.get(v) || null, triggerVar: v === 'new' || v === 'old' });
  }
  return { refs, unresolvedVars: [...new Set(refs.filter((r) => !r.resolution && !r.triggerVar).map((r) => r.var))] };
}

/* ------------------------------------ diff ------------------------------------ */

const CRITICAL_TABLES = new Set(['appointments', 'invoices', 'invoice_items', 'payments', 'payment_provider_records', 'work_orders', 'service_records']);
const CRITICAL_FN_RE = /(start|complete|closeout|invoice|payment|card_fee|charge|refund)/i;

function diffAll(census, extraction, opts = {}) {
  const partial = census.partial === true;
  const onlyTables = opts.onlyTables ? new Set(opts.onlyTables) : null;
  const censusTables = new Map(Object.entries(census.tables || {}).map(([k, v]) => [k, new Set(v)]));
  const censusFns = census.functions || [];
  const censusFnByName = new Map();
  for (const f of censusFns) {
    if (!censusFnByName.has(f.name)) censusFnByName.set(f.name, []);
    censusFnByName.get(f.name).push(f);
  }
  const tableKnown = (t) => censusTables.has(t) && (!onlyTables || onlyTables.has(t));
  const tableInScope = (t) => !onlyTables || onlyTables.has(t);

  const P = {
    phantomTables: [], phantomColumns: [], phantomEmbedColumns: [], phantomFilters: [],
    phantomPayloadKeys: [], phantomRpcs: [], phantomRpcArgs: [], phantomFunctionFields: [],
    unresolved: [], // {kind, site, detail}
    counts: {},
  };

  const checkSelect = (site, table, parsed, viaPath) => {
    const cols = censusTables.get(table);
    if (!cols) return;
    for (const c of parsed.columns) {
      if (!cols.has(c.name)) P.phantomColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table, column: c.name, via: viaPath, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(table) });
    }
    for (const a of parsed.aggregates) {
      if (a.column && !cols.has(a.column)) P.phantomColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table, column: a.column, via: `${viaPath} (aggregate ${a.fn})`, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(table) });
    }
    for (const emb of parsed.embeds) {
      if (!tableKnown(emb.table)) {
        if (!partial && tableInScope(emb.table)) P.phantomEmbedColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table: emb.table, column: null, via: `${viaPath} embed of ${table}`, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(emb.table), note: 'embedded table absent from census' });
        continue;
      }
      const embCols = censusTables.get(emb.table);
      for (const c of emb.select.columns) {
        if (!embCols.has(c.name)) P.phantomEmbedColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table: emb.table, column: c.name, via: `${viaPath} embed in ${table}`, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(emb.table) });
      }
      for (const a of emb.select.aggregates) {
        if (a.column && !embCols.has(a.column)) P.phantomEmbedColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table: emb.table, column: a.column, via: `${viaPath} embed aggregate in ${table}`, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(emb.table) });
      }
      // nested embeds (depth 2) — recurse one more level via generic walk
      const walkNested = (sel, hostTable) => {
        for (const e2 of sel.embeds) {
          if (!tableKnown(e2.table)) continue;
          const c2 = censusTables.get(e2.table);
          for (const c of e2.select.columns) {
            if (!c2.has(c.name)) P.phantomEmbedColumns.push({ site: site.id, file: site.file, line: site.line, test: site.test, table: e2.table, column: c.name, via: `${viaPath} nested embed in ${hostTable}`, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(e2.table) });
          }
          walkNested(e2.select, e2.table);
        }
      };
      walkNested(emb.select, emb.table);
    }
  };

  for (const site of extraction.code.sites) {
    if (site.tableDynamic) { P.unresolved.push({ kind: 'dynamic-table', site: site.id, detail: site.tableExpr }); continue; }
    const t = site.table;
    if (!tableKnown(t)) {
      if (!partial && tableInScope(t)) P.phantomTables.push({ site: site.id, file: site.file, line: site.line, test: site.test, table: t, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(t) });
    } else {
      for (const sel of site.selects) {
        if (sel.dynamic || !sel.parsed) { P.unresolved.push({ kind: 'dynamic-select', site: site.id, detail: (sel.raw || '').slice(0, 80) }); continue; }
        checkSelect(site, t, sel.parsed, 'select');
      }
      const baseCols = censusTables.get(t);
      const embedTablesAtSite = new Set();
      for (const sel of site.selects) if (sel.parsed) for (const e of sel.parsed.embeds) embedTablesAtSite.add(e.table);
      for (const f of site.filters) {
        const raw = f.column;
        let col = raw;
        let host = t;
        const dot = raw.lastIndexOf('.');
        if (dot > 0 && !raw.includes('->')) {
          const qual = raw.slice(0, dot);
          col = raw.slice(dot + 1);
          if (qual === t) host = t;
          else if (embedTablesAtSite.has(qual)) host = qual;
          else if (tableKnown(qual)) host = qual;
        }
        const hostCols = censusTables.get(host);
        if (hostCols && !hostCols.has(col)) P.phantomFilters.push({ site: site.id, file: site.file, line: f.line, test: site.test, table: host, column: col, raw, method: f.method, via: f.via, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(host) });
      }
      for (const p of site.payloads) {
        if (p.unresolved && p.keys.length === 0) { P.unresolved.push({ kind: 'dynamic-payload', site: site.id, detail: p.method }); continue; }
        for (const k of p.keys) {
          if (!baseCols.has(k)) P.phantomPayloadKeys.push({ site: site.id, file: site.file, line: p.line, test: site.test, table: t, column: k, method: p.method, spread: p.spread, evidence: p.spread ? 'STATIC-CERTAIN (partial payload — spread present)' : 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(t) });
        }
        if (p.spread) P.unresolved.push({ kind: 'spread-payload', site: site.id, detail: p.method });
      }
      for (const oc of site.onConflicts) {
        for (const c of oc.columns) if (!baseCols.has(c)) P.phantomPayloadKeys.push({ site: site.id, file: site.file, line: oc.line, test: site.test, table: t, column: c, method: 'upsert onConflict', spread: false, evidence: 'STATIC-CERTAIN', critical: CRITICAL_TABLES.has(t) });
      }
    }
    // selects can also hang off dynamic chains on known tables via rpc-less paths; selects on unknown tables are covered by phantomTables.
  }

  for (const rpc of extraction.code.rpcs) {
    if (rpc.nameDynamic) { P.unresolved.push({ kind: 'dynamic-rpc-name', site: rpc.id, detail: null }); continue; }
    const entries = censusFnByName.get(rpc.name);
    if (!entries) {
      if (!partial) P.phantomRpcs.push({ site: rpc.id, file: rpc.file, line: rpc.line, test: rpc.test, name: rpc.name, evidence: 'STATIC-CERTAIN', critical: CRITICAL_FN_RE.test(rpc.name) });
      continue;
    }
    if (rpc.argsUnresolved) { P.unresolved.push({ kind: 'dynamic-rpc-args', site: rpc.id, detail: rpc.name }); continue; }
    const valid = new Set();
    for (const e of entries) for (const n of censusArgNames(e.args)) valid.add(n);
    for (const k of rpc.argKeys || []) {
      if (!valid.has(k)) P.phantomRpcArgs.push({ site: rpc.id, file: rpc.file, line: rpc.line, test: rpc.test, name: rpc.name, arg: k, evidence: 'STATIC-CERTAIN', critical: CRITICAL_FN_RE.test(rpc.name) });
    }
  }

  /* types diff */
  const typesDiff = { claimTableAbsent: [], claimColumnAbsent: [], prodColumnMissingFromTypes: [], claimViewAbsent: [] };
  for (const [srcName, parsed] of Object.entries(extraction.types || {})) {
    for (const [t, cols] of Object.entries(parsed.tables)) {
      if (!tableKnown(t)) {
        if (!partial && tableInScope(t)) typesDiff.claimTableAbsent.push({ source: srcName, table: t });
        continue;
      }
      const live = censusTables.get(t);
      for (const c of cols) if (!live.has(c)) typesDiff.claimColumnAbsent.push({ source: srcName, table: t, column: c });
      const claimed = new Set(cols);
      for (const c of live) if (!claimed.has(c)) typesDiff.prodColumnMissingFromTypes.push({ source: srcName, table: t, column: c });
    }
    for (const v of Object.keys(parsed.views)) {
      if (!censusTables.has(v) && !partial) typesDiff.claimViewAbsent.push({ source: srcName, view: v });
    }
  }

  /* functions diff */
  const censusKey = new Map();
  for (const f of censusFns) censusKey.set(`${f.name}|${normalizeArgs(f.args)}`, f);
  const fnDiff = { match: [], drifted: [], argsDrift: [], absentInProd: [], absentInRepo: [] };
  const repoFnByKey = new Map();
  for (const fn of extraction.functions.functions) repoFnByKey.set(`${fn.name}|${fn.argsNormalized}`, fn);
  for (const [key, fn] of repoFnByKey) {
    const live = censusKey.get(key);
    if (live) {
      if (fn.bodyMd5 && live.body_md5 === fn.bodyMd5) fnDiff.match.push({ name: fn.name, args: fn.argsNormalized, file: fn.file });
      else fnDiff.drifted.push({ name: fn.name, args: fn.argsNormalized, file: fn.file, repoMd5: fn.bodyMd5, repoLen: fn.bodyLen, prodMd5: live.body_md5, prodLen: live.body_len });
      continue;
    }
    const sameName = censusFnByName.get(fn.name);
    if (sameName && sameName.length) fnDiff.argsDrift.push({ name: fn.name, repoArgs: fn.argsNormalized, prodArgs: sameName.map((e) => e.args), file: fn.file });
    else if (!partial) fnDiff.absentInProd.push({ name: fn.name, args: fn.argsNormalized, file: fn.file });
  }
  const repoNames = new Set(extraction.functions.functions.map((f) => f.name));
  for (const f of censusFns) if (!repoNames.has(f.name)) fnDiff.absentInRepo.push({ name: f.name, args: f.args });

  /* field refs in MATCHED function bodies (repo body == prod body) */
  const triggersByFn = new Map();
  for (const tr of census.triggers || []) {
    if (!triggersByFn.has(tr.function)) triggersByFn.set(tr.function, new Set());
    triggersByFn.get(tr.function).add(tr.table);
  }
  const matchedKeys = new Set(fnDiff.match.map((m) => `${m.name}|${m.args}`));
  let unresolvedRefVars = 0;
  for (const fn of extraction.functions.functions) {
    const refs = fn.fieldRefs || { refs: [], unresolvedVars: [] };
    unresolvedRefVars += refs.unresolvedVars.length;
    if (!matchedKeys.has(`${fn.name}|${fn.argsNormalized}`)) continue;
    for (const r of refs.refs) {
      let tables = [];
      if (r.triggerVar) tables = [...(triggersByFn.get(fn.name) || [])];
      else if (r.resolution) tables = [r.resolution.table];
      else continue;
      for (const t of tables) {
        const cols = censusTables.get(t);
        if (cols && !cols.has(r.field)) {
          P.phantomFunctionFields.push({ function: fn.name, file: fn.file, var: r.var, field: r.field, table: t, resolution: r.triggerVar ? 'trigger NEW/OLD' : r.resolution.source, evidence: 'STATIC-CERTAIN', critical: CRITICAL_FN_RE.test(fn.name) || CRITICAL_TABLES.has(t) });
        }
      }
    }
  }

  P.counts = {
    phantomTables: P.phantomTables.length,
    phantomColumns: P.phantomColumns.length,
    phantomEmbedColumns: P.phantomEmbedColumns.length,
    phantomFilters: P.phantomFilters.length,
    phantomPayloadKeys: P.phantomPayloadKeys.length,
    phantomRpcs: P.phantomRpcs.length,
    phantomRpcArgs: P.phantomRpcArgs.length,
    phantomFunctionFields: P.phantomFunctionFields.length,
    typesClaimTableAbsent: typesDiff.claimTableAbsent.length,
    typesClaimColumnAbsent: typesDiff.claimColumnAbsent.length,
    typesProdColumnMissing: typesDiff.prodColumnMissingFromTypes.length,
    functionsMatch: fnDiff.match.length,
    functionsDrifted: fnDiff.drifted.length,
    functionsArgsDrift: fnDiff.argsDrift.length,
    functionsAbsentInProd: fnDiff.absentInProd.length,
    functionsAbsentInRepo: fnDiff.absentInRepo.length,
    unresolved: P.unresolved.length,
    unresolvedRefVars,
  };
  P.codePhantomTotal =
    P.phantomTables.length + P.phantomColumns.length + P.phantomEmbedColumns.length +
    P.phantomFilters.length + P.phantomPayloadKeys.length + P.phantomRpcs.length +
    P.phantomRpcArgs.length + P.phantomFunctionFields.length;
  return { phantoms: P, typesDiff, fnDiff };
}

/* ---------------------------------- register ---------------------------------- */

function renderRegister(report, extraction, censusMeta) {
  const { phantoms: P, typesDiff, fnDiff } = report;
  const L = [];
  L.push('# Phantom Sweep Register — 2026-11-10');
  L.push('');
  L.push(`Generated by \`scripts/phantom-sweep.mjs\` against the live schema census (${censusMeta}).`);
  L.push('The census is ground truth; generated types and migrations were diffed against it, never used as schema sources.');
  L.push('Evidence classes: STATIC-CERTAIN = the reference is a static literal fully parsed and the target is absent from the census. UNRESOLVED = dynamic/template/spread construction the static pass cannot settle — listed in the backlog, never guessed.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Class | Count |');
  L.push('|---|---|');
  const rows = [
    ['Phantom tables (.from targets absent live)', P.counts.phantomTables],
    ['Phantom select columns', P.counts.phantomColumns],
    ['Phantom embedded-select columns', P.counts.phantomEmbedColumns],
    ['Phantom filter/order columns', P.counts.phantomFilters],
    ['Phantom write-payload keys', P.counts.phantomPayloadKeys],
    ['Phantom RPC names', P.counts.phantomRpcs],
    ['Phantom RPC argument keys', P.counts.phantomRpcArgs],
    ['Phantom field refs in matched function bodies', P.counts.phantomFunctionFields],
    ['**Total confirmed code phantoms**', P.codePhantomTotal],
    ['Types claim table prod lacks', P.counts.typesClaimTableAbsent],
    ['Types claim column prod lacks', P.counts.typesClaimColumnAbsent],
    ['Prod columns missing from types', P.counts.typesProdColumnMissing],
    ['Functions MATCH (repo body == prod body)', P.counts.functionsMatch],
    ['Functions DRIFTED (prod body != repo body)', P.counts.functionsDrifted],
    ['Functions ARGS-DRIFT (name live, signature differs)', P.counts.functionsArgsDrift],
    ['Functions in repo, absent in prod', P.counts.functionsAbsentInProd],
    ['Functions in prod, absent in repo', P.counts.functionsAbsentInRepo],
    ['UNRESOLVED code sites (dynamic table/select/payload/rpc)', P.counts.unresolved],
    ['UNRESOLVED function-body variables', P.counts.unresolvedRefVars],
  ];
  for (const [k, v] of rows) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push(`Extraction coverage: ${extraction.code.filesScanned} TS files, ${extraction.code.sites.length} .from() sites, ${extraction.code.rpcs.length} .rpc() sites, ${extraction.functions.filesScanned} SQL files, ${extraction.functions.definitionCount} function definitions (${extraction.functions.distinctNames} distinct names, latest definition per signature kept).`);
  L.push('');

  const all = [];
  const addAll = (arr, kind) => { for (const e of arr) all.push({ ...e, kind }); };
  addAll(P.phantomTables, 'table');
  addAll(P.phantomColumns, 'select column');
  addAll(P.phantomEmbedColumns, 'embed column');
  addAll(P.phantomFilters, 'filter column');
  addAll(P.phantomPayloadKeys, 'payload key');
  addAll(P.phantomRpcs, 'rpc');
  addAll(P.phantomRpcArgs, 'rpc arg');
  addAll(P.phantomFunctionFields, 'function field');

  const fmt = (e) => {
    if (e.kind === 'function field') return `- **${e.function}** — \`${e.var}.${e.field}\` resolves to \`${e.table}\` (via ${e.resolution}); prod \`${e.table}\` has no \`${e.field}\`. (${e.file}) [${e.evidence}]`;
    if (e.kind === 'table') return `- \`${e.table}\` — .from() target absent from census. ${e.site} [${e.evidence}]`;
    if (e.kind === 'rpc') return `- rpc \`${e.name}\` — no such function in census. ${e.site} [${e.evidence}]`;
    if (e.kind === 'rpc arg') return `- rpc \`${e.name}\` arg \`${e.arg}\` — not in the census signature. ${e.site} [${e.evidence}]`;
    return `- \`${e.table}.${e.column ?? ''}\` (${e.kind}${e.method ? ` via ${e.method}` : ''}) — absent from prod \`${e.table}\`. ${e.site} [${e.evidence}]`;
  };

  const crit = all.filter((e) => e.critical && !e.test);
  const reach = all.filter((e) => !e.critical && !e.test);
  const testOnly = all.filter((e) => e.test);
  L.push('## (i) Money / lifecycle-critical paths');
  L.push('');
  if (!crit.length) L.push('_None found._'); else for (const e of crit) L.push(fmt(e));
  L.push('');
  L.push('## (ii) Reachable app paths');
  L.push('');
  if (!reach.length) L.push('_None found._'); else for (const e of reach) L.push(fmt(e));
  L.push('');
  L.push('## (iii) Test-only references (not reachable from the running app)');
  L.push('');
  if (!testOnly.length) L.push('_None found._'); else for (const e of testOnly) L.push(fmt(e));
  L.push('');
  L.push('## (iv) Types-only drift');
  L.push('');
  if (typesDiff.claimTableAbsent.length) { L.push('### Types claim a table production lacks'); for (const e of typesDiff.claimTableAbsent) L.push(`- \`${e.table}\` (${e.source})`); L.push(''); }
  if (typesDiff.claimColumnAbsent.length) { L.push('### Types claim a column production lacks'); for (const e of typesDiff.claimColumnAbsent) L.push(`- \`${e.table}.${e.column}\` (${e.source})`); L.push(''); }
  if (typesDiff.prodColumnMissingFromTypes.length) { L.push('### Production has a column the types lack'); for (const e of typesDiff.prodColumnMissingFromTypes) L.push(`- \`${e.table}.${e.column}\` (${e.source})`); L.push(''); }
  if (!typesDiff.claimTableAbsent.length && !typesDiff.claimColumnAbsent.length && !typesDiff.prodColumnMissingFromTypes.length) L.push('_None found._\n');
  L.push('## (v) Drifted functions — chair capture needed (prod body differs from repo; repo-side analysis does not describe prod)');
  L.push('');
  if (!fnDiff.drifted.length && !fnDiff.argsDrift.length) L.push('_None found._');
  for (const e of fnDiff.drifted) L.push(`- **${e.name}** (${e.args}) — repo len ${e.repoLen} md5 ${e.repoMd5} vs prod len ${e.prodLen} md5 ${e.prodMd5}. Repo def: ${e.file}`);
  for (const e of fnDiff.argsDrift) L.push(`- **${e.name}** — signature drift: repo \`(${e.repoArgs})\` vs prod \`(${e.prodArgs.join(') / (')})\`. Repo def: ${e.file}`);
  L.push('');
  L.push('## Functions in repo but absent in prod');
  L.push('');
  if (!fnDiff.absentInProd.length) L.push('_None._'); else for (const e of fnDiff.absentInProd) L.push(`- **${e.name}** (${e.args}) — ${e.file}`);
  L.push('');
  L.push('## Functions in prod but absent in repo (off-books surface)');
  L.push('');
  if (!fnDiff.absentInRepo.length) L.push('_None._'); else for (const e of fnDiff.absentInRepo) L.push(`- **${e.name}** (${e.args})`);
  L.push('');
  L.push('## UNRESOLVED backlog (static pass cannot settle — not counted as phantoms)');
  L.push('');
  const byKind = {};
  for (const u of P.unresolved) { byKind[u.kind] = byKind[u.kind] || []; byKind[u.kind].push(u); }
  for (const [kind, arr] of Object.entries(byKind)) {
    L.push(`### ${kind} — ${arr.length}`);
    for (const u of arr.slice(0, 60)) L.push(`- ${u.site}${u.detail ? ` — ${String(u.detail).slice(0, 80)}` : ''}`);
    if (arr.length > 60) L.push(`- … and ${arr.length - 60} more`);
    L.push('');
  }
  L.push(`Function-body variables the resolver could not tie to a table: **${P.counts.unresolvedRefVars}** (their field references are unchecked, not cleared).`);
  L.push('');
  L.push('## Re-run');
  L.push('');
  L.push('```bash');
  L.push('node scripts/phantom-sweep.mjs check --census <live-schema-census.json> --out report.json --register phantom-sweep-register.md');
  L.push('```');
  L.push('Exits non-zero when any STATIC-CERTAIN code phantom exists. Refresh the census from production first; a stale census manufactures phantoms.');
  L.push('');
  return L.join('\n');
}

/* ------------------------------------- CLI ------------------------------------- */

function buildExtraction(roots) {
  const code = extractCode(roots);
  const types = {
    'types.ts': parseTypesFile(path.join(REPO_ROOT, 'src/integrations/supabase/types.ts')),
    'types.production.ts': parseTypesFile(path.join(REPO_ROOT, 'src/integrations/supabase/types.production.ts')),
  };
  const fnScan = scanSqlFunctions(path.join(REPO_ROOT, 'supabase/migrations'));
  for (const fn of fnScan.functions) fn.fieldRefs = extractBodyRefs(fn);
  return {
    meta: { generatedAt: new Date().toISOString(), repoHead: process.env.SWEEP_HEAD || null, roots },
    code,
    types,
    functions: fnScan,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0] || 'extract';
  const opt = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  }
  const roots = typeof opt.roots === 'string' ? opt.roots.split(',') : ['src', 'app'];

  if (mode === 'extract') {
    const extraction = buildExtraction(roots);
    const out = typeof opt.out === 'string' ? opt.out : null;
    if (out) fs.writeFileSync(out, JSON.stringify(extraction, null, 1));
    console.log(`extract: ${extraction.code.filesScanned} files, ${extraction.code.sites.length} from-sites, ${extraction.code.rpcs.length} rpc-sites, types tables: ${Object.keys(extraction.types['types.ts'].tables).length}/${Object.keys(extraction.types['types.production.ts'].tables).length}, functions: ${extraction.functions.functions.length} latest defs from ${extraction.functions.definitionCount} definitions`);
    return;
  }

  if (mode === 'check') {
    if (!opt.census || opt.census === true) { console.error('check requires --census <path>'); process.exit(2); }
    const census = JSON.parse(fs.readFileSync(opt.census, 'utf8'));
    let extraction;
    if (typeof opt.extraction === 'string' && fs.existsSync(opt.extraction)) extraction = JSON.parse(fs.readFileSync(opt.extraction, 'utf8'));
    else extraction = buildExtraction(roots);
    const report = diffAll(census, extraction, { onlyTables: typeof opt['only-tables'] === 'string' ? opt['only-tables'].split(',') : null });
    if (typeof opt.out === 'string') fs.writeFileSync(opt.out, JSON.stringify(report, null, 1));
    if (typeof opt.register === 'string') {
      const meta = `tables: ${Object.keys(census.tables || {}).length}, functions: ${(census.functions || []).length}, triggers: ${(census.triggers || []).length}${census.partial ? ', PARTIAL census' : ''}`;
      fs.writeFileSync(opt.register, renderRegister(report, extraction, meta));
    }
    console.log(JSON.stringify(report.phantoms.counts, null, 1));
    console.log(`codePhantomTotal: ${report.phantoms.codePhantomTotal}`);
    process.exit(report.phantoms.codePhantomTotal > 0 ? 1 : 0);
  }

  console.error(`unknown mode "${mode}" — use extract | check`);
  process.exit(2);
}

main();
