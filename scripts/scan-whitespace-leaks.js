/**
 * Guard: scan all app TSX files (src/** + root App.tsx) for the two ways a
 * raw string can land as a child of a non-Text host and trigger RN's
 * "Text strings must be rendered within a <Text> component":
 *
 *  1. Whitespace-only JSXText WITHOUT a newline (Babel keeps same-line
 *     whitespace, e.g. closing tag + spaces + a JSX comment).
 *  2. A JSX expression container that is a string/template literal, e.g.
 *     a string-literal expression directly under a View (safe inside
 *     <Text> only).
 *
 * Usage: node scripts/scan-whitespace-leaks.js   (exit 1 if any found)
 */
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

const APP = path.join(__dirname, "..");
const files = [];
(function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walkDir(p);
    } else if (entry.name.endsWith(".tsx")) files.push(p);
  }
})(path.join(APP, "src"));
// Root App.tsx also renders JSX.
const rootApp = path.join(APP, "App.tsx");
if (fs.existsSync(rootApp)) files.push(rootApp);

const hostIsText = (tag) => tag === "Text" || tag === "Animated.Text";

function walk(node, report) {
  if (!node || typeof node !== "object") return;
  if (node.type === "JSXElement") {
    const tag = node.openingElement.name && node.openingElement.name.name;
    const isTextHost = hostIsText(tag);
    for (const child of node.children) {
      if (isTextHost) continue;
      if (
        child.type === "JSXText" &&
        child.value.trim() === "" &&
        !child.value.includes("\n")
      ) {
        report.push({
          line: child.loc.start.line,
          value: JSON.stringify(child.value),
          tag,
          kind: "whitespace JSXText",
        });
      }
      if (
        child.type === "JSXExpressionContainer" &&
        child.expression &&
        (child.expression.type === "StringLiteral" ||
          child.expression.type === "TemplateLiteral")
      ) {
        report.push({
          line: child.loc.start.line,
          value: srcSlice(child),
          tag,
          kind: "string literal expression",
        });
      }
    }
    for (const c of node.children) walk(c, report);
    return;
  }
  if (node.type === "JSXFragment") {
    for (const c of node.children) walk(c, report);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const v = node[key];
    if (Array.isArray(v)) for (const x of v) walk(x, report);
    else walk(v, report);
  }
}

let src = "";
const srcSlice = (n) => src.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 60);

let total = 0;
for (const file of files) {
  src = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (e) {
    console.log("SKIP (parse):", path.relative(APP, file), e.message);
    continue;
  }
  const report = [];
  walk(ast, report);
  if (report.length) {
    total += report.length;
    console.log(`\n${path.relative(APP, file)}:`);
    report.forEach((r) =>
      console.log(`  L${r.line}: ${r.kind} ${r.value} inside <${r.tag}>`),
    );
  }
}
console.log(`\n${total} raw-string-in-non-Text-host risk(s) found.`);
process.exit(total ? 1 : 0);
