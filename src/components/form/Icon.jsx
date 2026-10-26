import {
  ArrowLeft, Check, CircleAlert, CircleCheck, CloudOff, Info, TriangleAlert,
  Sun, CloudSun, Cloud, Cloudy, CloudRain,
  Plus, X, Search, Copy, ChevronDown, ChevronUp, Upload,
  Scale, Droplets, Sprout, ClipboardCheck, ClipboardList, SprayCan, ShieldCheck, Bug, Map,
  Minus, Download, Camera,
} from "lucide-react";

// Daftar ikon yang dipakai — import eksplisit supaya bundle hanya membawa ikon ini.
// Tambah di sini saat menu baru butuh ikon lain. Ikon menu (bottom bar) juga dari sini.
const ICONS = {
  ArrowLeft, Check, CircleAlert, CircleCheck, CloudOff, Info, TriangleAlert,
  Sun, CloudSun, Cloud, Cloudy, CloudRain,
  Plus, X, Search, Copy, ChevronDown, ChevronUp, Upload,
  Scale, Droplets, Sprout, ClipboardCheck, ClipboardList, SprayCan, ShieldCheck, Bug, Map,
  Minus, Download, Camera,
};

// Satu pintu untuk ikon Lucide — nama pakai PascalCase Lucide ("CloudSun", "ArrowLeft").
export default function Icon({ name, size = 20, strokeWidth = 1.75, ...rest }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
