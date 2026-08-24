// Afilianet · preset de Tailwind, tokens 1.0.0
// tailwind.config.js →  presets: [require("./afilianet.preset.js")]
const t = require("./afilianet.tokens.json");
const px = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? v + "px" : v]));

module.exports = {
  theme: {
    extend: {
      colors: {
        violeta: t.color.violeta,
        noche: t.color.noche,
        aqua: t.color.aqua,
        exito: t.semantico.exito.base,
        alerta: t.semantico.alerta.base,
        error: t.semantico.error.base,
        info: t.semantico.info.base
      },
      fontFamily: { sans: t.tipografia.familia.sans.split(","), mono: t.tipografia.familia.mono.split(",") },
      fontSize: px(t.tipografia.escala),
      fontWeight: t.tipografia.peso,
      spacing: px(t.espaciado),
      borderRadius: px(t.radio),
      boxShadow: { 1: t.sombra["1"], 2: t.sombra["2"], 3: t.sombra["3"], 4: t.sombra["4"], marca: t.sombra.resplandorMarca, foco: t.sombra.anilloFoco },
      transitionDuration: t.movimiento.duracion,
      transitionTimingFunction: t.movimiento.curva
    }
  }
};
