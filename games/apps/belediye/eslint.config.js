// ESLint: JS ve typescript-eslint önerilenleri; biçim kuralları Prettier'de (eslint-config-prettier kapatır)
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", ".cache/", "node_modules/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // localStorage, ses ve tarayıcı kapatma denemelerinde hatayı yutmak bilerek
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `a && b()` ve `c ? f() : g()` kısa yazımları kodun alışkanlığı
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
    },
  },
  { files: ["src/**"], languageOptions: { globals: globals.browser } },
  { files: ["tools/**", "test/**", "*.js"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // sayfaya ya da new Function'a metin olarak gömülen düz betikler: üst düzey adları dışarıdan okunur
  { files: ["tools/meydan.js", "tools/portrait.js"], languageOptions: { sourceType: "script" } },
  prettier,
);
