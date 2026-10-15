import type { ApiError } from "./api.ts";

/** The shortest password a new account takes, checked here before Firebase is asked. */
export const MIN_PASSWORD = 8;

/** What went wrong, in a few words the player can act on. */
const FIREBASE: Record<string, string> = {
  "auth/invalid-credential": "E-posta ya da şifre yanlış.",
  "auth/wrong-password": "E-posta ya da şifre yanlış.",
  "auth/user-not-found": "E-posta ya da şifre yanlış.",
  "auth/invalid-login-credentials": "E-posta ya da şifre yanlış.",
  "auth/email-already-in-use": "Bu e-postayla açılmış bir hesap var. Giriş yapmayı dene.",
  "auth/weak-password": `Şifre en az ${MIN_PASSWORD} karakter olmalı.`,
  "auth/password-does-not-meet-requirements": `Şifre en az ${MIN_PASSWORD} karakter olmalı.`,
  "auth/invalid-email": "Bu e-posta adresi geçerli görünmüyor.",
  "auth/missing-email": "E-posta adresini yaz.",
  "auth/missing-password": "Şifreni yaz.",
  "auth/too-many-requests": "Çok fazla deneme oldu. Biraz bekleyip yeniden dene.",
  "auth/network-request-failed": "Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene.",
  "auth/user-disabled": "Bu hesap kapatılmış.",
  "auth/popup-blocked": "Açılır pencere engellendi. Tarayıcında izin verip yeniden dene.",
  "auth/user-mismatch": "Bu, açık olan hesap değil.",
  "auth/requires-recent-login": "Güvenlik için yeniden giriş yapman gerekiyor.",
  "auth/account-exists-with-different-credential": "Bu e-postayla başka bir yoldan açılmış bir hesap var.",
};

export const SOMETHING_WRONG = "Bir şeyler ters gitti. Yeniden dene.";
export const OFFLINE = "Bağlantı kurulamadı. İnternetini kontrol edip yeniden dene.";

export function firebaseMessage(code: string): string {
  return FIREBASE[code] ?? SOMETHING_WRONG;
}

/** Firebase's error code ("auth/…"), or "" for anything else. */
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

/** For whatever a sign-in step threw: Firebase's complaint, or Firebase itself that wouldn't download. */
export function problemOf(error: unknown): string {
  const code = errorCode(error);
  if (code) return firebaseMessage(code);
  return error instanceof TypeError ? OFFLINE : SOMETHING_WRONG;
}

export function accountMessage(error: ApiError): string {
  switch (error) {
    case "ag":
      return "Sunucuya ulaşılamadı. Biraz sonra yeniden dene.";
    case "token":
      return "Giriş doğrulanamadı. Yeniden dene.";
    case "eski":
      return "Giriş zaman aşımına uğradı. Yeniden giriş yap.";
    case "oturum":
      return "Oturumun kapanmış. Yeniden giriş yap.";
    case "ad":
      return "Bu ad kullanılamaz.";
    case "dogrulanmadi":
      return "E-posta adresin henüz doğrulanmamış.";
    default:
      return SOMETHING_WRONG;
  }
}
