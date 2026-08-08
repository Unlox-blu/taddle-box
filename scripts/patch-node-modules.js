/**
 * Temporary local patch (re-applied after any `npm install` wipes node_modules):
 *   node scripts/patch-node-modules.js
 *
 * react-native-controlled-mentions v3.1.0 `useMentions` builds `textInputProps`
 * with ONLY onChangeText/onSelectionChange/children — dropping the caller's
 * style / placeholder / multiline / placeholderTextColor / etc. The typed
 * text then inherits the TextInput default (black) and is invisible on dark
 * themes. We forward the remaining props into textInputProps. The two
 * non-TextInput props (containerStyle / suggestionPosition) are destructured
 * out so they never reach TextInput.
 */
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..");
const p = path.join(
  APP,
  "node_modules/react-native-controlled-mentions/dist/hooks/use-mentions.js",
);
let s = fs.readFileSync(p, "utf8");
const before = s;

// Normalize: strip any leftover from an earlier patch shape.
s = s.replace(/let _omit = \{\};\n/, "");
s = s.replace(
  /\.\.\.\(_omit = \{\}, Object\.keys\(rest\)\.forEach\(\(k\) => \{ if \(k !== 'containerStyle' && k !== 'suggestionPosition'\) _omit\[k\] = rest\[k\]; \}\), _omit\),\n/,
  "...rest,\n",
);

// Ensure the signature destructures the two non-TextInput props + ...rest.
s = s.replace(
  /const useMentions = \(\{ value, onChange, triggersConfig = _mention_utils_1\.emptyObject, patternsConfig = _mention_utils_1\.emptyObject, onSelectionChange(?:, containerStyle, suggestionPosition)?(?:, \.\.\.rest)?,? \}\) => \{/,
  "const useMentions = ({ value, onChange, triggersConfig = _mention_utils_1.emptyObject, patternsConfig = _mention_utils_1.emptyObject, onSelectionChange, containerStyle, suggestionPosition, ...rest }) => {",
);

// Ensure textInputProps spreads rest before the built-in callbacks.
if (!/const textInputProps = \{\n\s*\.\.\.rest,/.test(s)) {
  s = s.replace(
    /const textInputProps = \{\n(\s*)onChangeText: handleTextChange,/,
    (_m, ind) =>
      "const textInputProps = {\n" +
      ind +
      "...rest,\n" +
      ind +
      "onChangeText: handleTextChange,",
  );
}

if (s !== before) {
  fs.writeFileSync(p, s);
  console.log("OK  patched use-mentions.js (prop forwarding)");
} else {
  console.log("OK  use-mentions.js already patched");
}
