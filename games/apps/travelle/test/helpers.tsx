import { render as rtlRender, type RenderResult } from "@testing-library/react";
import { LocaleProvider } from "../src/i18n/index.tsx";

/** Every screen needs a language; jsdom reports en-US, so tests run in English. */
export function render(ui: React.ReactElement): RenderResult {
  return rtlRender(ui, {
    wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
  });
}
