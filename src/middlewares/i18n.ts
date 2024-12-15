import i18next from "i18next";
import middleware from "i18next-http-middleware";
import en from "../locales/en.json" assert { type: "json" };
import pt from "../locales/pt.json" assert { type: "json" };

i18next.use(middleware.LanguageDetector).init({
  resources: {
    en: { translation: en },
    pt: { translation: pt }
  },
  fallbackLng: "en", // Default language
  preload: ["en", "pt"], // Preload languages
  detection: {
    order: ["header"], // Detection priority
  caches: ['cookie']
  },
});

export const i18n = {
  ...i18next,
  middleware: () => middleware.handle(i18next),
  t: i18next.t.bind(i18next),
};

export type Translator = typeof i18next.t