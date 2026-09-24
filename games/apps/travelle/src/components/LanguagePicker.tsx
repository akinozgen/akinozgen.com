import { LANGUAGES, type Language } from "@travelle/geo";
import { useLocale } from "../i18n/index.tsx";
import { LANGUAGE_NAMES } from "../i18n/strings.ts";

export function LanguagePicker(): React.ReactElement {
  const { language, setLanguage, t } = useLocale();

  return (
    <label className="lang">
      <span className="visually-hidden">{t("language")}</span>
      <select
        className="lang__select"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {LANGUAGES.map((option) => (
          <option key={option} value={option}>
            {LANGUAGE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
