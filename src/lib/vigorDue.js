// Definisi checkpoint & tipe GH Vigor — dipakai Vigor.jsx dan pengingat di Home
// (VigorReminder.jsx) supaya keduanya selalu sepakat soal GH mana yang tampil
// dan kapan sebuah checkpoint dianggap "due".

export const HST_CHECKPOINTS = [7, 11, 14, 18, 33, 38, 45, 54];
export const HST_NEAR_RANGE  = 2;
export const HST_DUE_RANGE   = 3;

export const TIPE_GH = [
  {
    key: "drip", label: "Drip", icon: "💧", color: "#1E88E5",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS"))   { const n = parseInt(upper.replace("BERGAS","").trim());   return n >= 1 && n <= 8 && n !== 6; }
      if (upper.startsWith("COLOMADU")) { const n = parseInt(upper.replace("COLOMADU","").trim()); return n >= 1 && n <= 4; }
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim());  return n === 12 || n === 14 || n === 15 || n === 16 || n === 17 || n === 18 || n === 19 || n === 20 || n === 21; }
      return false;
    },
  },
  {
    key: "kolam", label: "Kolam", icon: "🏊", color: "#00897B",
    pattern: (gh) => {
      const upper = gh.toUpperCase().trim();
      if (upper === "SAWAHAN TUNNEL 1") return true;
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return (n >= 1 && n <= 11) || n === 13 || n === 22; }
      if (upper.startsWith("SAWAHAN")) { const n = parseInt(upper.replace("SAWAHAN","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "rnd", label: "RnD", icon: "🧪", color: "#6D4C41",
    pattern: (gh) => gh.toUpperCase().trim() === "OPEN FIELD 1",
  },
];

export function isVigorGH(gh) {
  return TIPE_GH.some(t => t.pattern(gh));
}

// Checkpoint yang sedang due untuk HST ini (HST cp .. cp+3), atau null.
export function dueCheckpoint(hst) {
  if (hst === null || hst === undefined) return null;
  return HST_CHECKPOINTS.find(cp => hst >= cp && hst <= cp + HST_DUE_RANGE) ?? null;
}
