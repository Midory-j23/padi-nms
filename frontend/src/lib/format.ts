import { useMemo } from "react";
import { useI18n } from "./i18n";

export function isUp(status: unknown) {
  // The device list sends 1/0, but the single-device endpoint can send true/false.
  if (typeof status === "string") return ["1", "true", "up"].includes(status.toLowerCase());
  return status === 1 || status === true;
}

/** Locale-aware formatting. Persian uses Persian digits and the Jalali calendar. */
export function useFormat() {
  const { lang, t } = useI18n();
  return useMemo(() => {
    const locale = lang === "fa" ? "fa-IR" : undefined;
    const nf = (digits: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const n0 = nf(0), n1 = nf(1), n2 = nf(2);
    const num = (v: number, digits = 0) => (digits === 0 ? n0 : digits === 1 ? n1 : digits === 2 ? n2 : nf(digits)).format(v);

    const pct = (v: number, digits = 0) =>
      new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v / 100);

    const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" });
    const timeFmt = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });

    const uptime = (seconds?: number) => {
      if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "—";
      const d = Math.floor(seconds / 86400);
      const h = Math.floor((seconds % 86400) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (d > 0) return t("{d} d {h} h", { d: n0.format(d), h: n0.format(h) });
      if (h > 0) return t("{h} h {m} min", { h: n0.format(h), m: n0.format(m) });
      return t("{m} min", { m: n0.format(m) });
    };

    const duration = (seconds: number) =>
      seconds < 60 ? t("{s} s", { s: n0.format(Math.round(seconds)) }) : uptime(seconds);

    const epoch = (e?: number | null) => (e ? dateTimeFmt.format(new Date(e * 1000)) : "—");

    // LibreNMS log and alert timestamps arrive as "YYYY-MM-DD HH:MM:SS" strings.
    const dateString = (s?: string) => {
      if (!s) return "—";
      const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? s : dateTimeFmt.format(d);
    };

    const clock = (d: Date) => timeFmt.format(d);

    // UNVERIFIED: the *_rate fields are assumed to be bytes per second.
    const bitrate = (bytesPerSec?: number) => {
      if (bytesPerSec === undefined) return "—";
      const bits = bytesPerSec * 8;
      if (bits >= 1e9) return `${num(bits / 1e9, 2)} Gbit/s`;
      if (bits >= 1e6) return `${num(bits / 1e6, 1)} Mbit/s`;
      if (bits >= 1e3) return `${num(bits / 1e3)} kbit/s`;
      return `${num(Math.round(bits))} bit/s`;
    };

    const speed = (bitsPerSec?: number) => {
      if (!bitsPerSec) return "—";
      if (bitsPerSec >= 1e9) return `${num(bitsPerSec / 1e9, bitsPerSec % 1e9 ? 1 : 0)} Gbit/s`;
      if (bitsPerSec >= 1e6) return `${num(bitsPerSec / 1e6, bitsPerSec % 1e6 ? 1 : 0)} Mbit/s`;
      return `${num(bitsPerSec / 1e3)} kbit/s`;
    };

    return { num, pct, uptime, duration, epoch, dateString, clock, bitrate, speed };
  }, [lang, t]);
}
