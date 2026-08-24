import React from "react";
/* Espejo navegable de components/ para que los UI kits corran en el navegador sin bundler.
   La fuente de verdad son los archivos de components/; aquí solo se reexponen en window.AFN. */
const { useState, useEffect, useId } = React;

const cacheIconos = {};

const Button = ({ variante = "primario", talla = "md", ancho, deshabilitado, iconoIzq, children, onClick, style }) => {
  const [h, setH] = useState(false), [p, setP] = useState(false);
  const pal = {
    primario: ["var(--accion-primaria)", "var(--texto-sobre-marca)", "transparent", "var(--accion-primaria-hover)", "var(--accion-primaria-activa)", "var(--resplandor-marca)"],
    secundario: ["var(--superficie-2)", "var(--texto-1)", "var(--borde-suave)", "var(--noche-700)", "var(--noche-800)", "none"],
    fantasma: ["transparent", "var(--texto-1)", "transparent", "var(--superficie-2)", "var(--superficie-1)", "none"],
    peligro: ["var(--error-500)", "#2A0C0A", "transparent", "#FF837A", "#E8574C", "none"]
  }[variante];
  const t = { sm: [36, 14, "var(--texto-sm)"], md: [44, 20, "var(--texto-sm)"], lg: [52, 26, "var(--texto-md)"] }[talla];
  return <button onClick={onClick} disabled={deshabilitado}
    onMouseEnter={() => setH(true)} onMouseLeave={() => { setH(false); setP(false); }}
    onMouseDown={() => setP(true)} onMouseUp={() => setP(false)}
    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: t[0], padding: `0 ${t[1]}px`,
      width: ancho ? "100%" : "auto", borderRadius: talla === "sm" ? "var(--radio-sm)" : "var(--radio-md)",
      border: "1px solid " + (deshabilitado ? "transparent" : pal[2]),
      background: deshabilitado ? "var(--noche-800)" : p ? pal[4] : h ? pal[3] : pal[0],
      color: deshabilitado ? "var(--noche-500)" : pal[1], fontFamily: "var(--font-sans)", fontSize: t[2], fontWeight: 600,
      letterSpacing: "-0.01em", lineHeight: 1, cursor: deshabilitado ? "not-allowed" : "pointer",
      boxShadow: deshabilitado || h ? "none" : pal[5], transform: p && !deshabilitado ? "scale(var(--escala-presion))" : "none",
      transition: "background var(--dur-instante) var(--ease-estandar), transform var(--dur-instante) var(--ease-estandar)", ...style }}>
    {iconoIzq}{children}</button>;
};

/* Iconos Lucide (ISC) traídos del CDN e inyectados en línea para que hereden currentColor. */
const Icono = ({ n, s = 20, color = "currentColor", op = 1 }) => {
  const [svg, setSvg] = useState(cacheIconos[n] || null);
  useEffect(() => {
    if (cacheIconos[n]) { setSvg(cacheIconos[n]); return; }
    let vivo = true;
    fetch(`https://unpkg.com/lucide-static@0.441.0/icons/${n}.svg`)
      .then(r => r.text())
      .then(t => { cacheIconos[n] = t; if (vivo) setSvg(t); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [n]);
  const marca = svg
    ? svg.replace(/width="24"/, `width="${s}"`).replace(/height="24"/, `height="${s}"`).replace(/stroke-width="2"/, 'stroke-width="1.75"')
    : "";
  return <span aria-hidden="true" style={{ width: s, height: s, display: "inline-grid", placeItems: "center", color, opacity: op, flex: "0 0 auto" }}
    dangerouslySetInnerHTML={{ __html: marca }} />;
};

const IconButton = ({ etiqueta, talla = 44, variante = "fantasma", children, onClick, style }) => {
  const [h, setH] = useState(false);
  return <button aria-label={etiqueta} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ width: talla, height: talla, display: "inline-grid", placeItems: "center", borderRadius: "var(--radio-md)",
      border: "1px solid " + (variante === "secundario" ? "var(--borde-suave)" : "transparent"),
      background: h ? "var(--superficie-2)" : variante === "secundario" ? "var(--superficie-2)" : "transparent",
      color: "var(--texto-1)", cursor: "pointer", padding: 0, ...style }}>{children}</button>;
};

const Badge = ({ tono = "neutro", mono, children, style }) => {
  const t = { neutro: ["var(--superficie-2)", "var(--texto-2)", "var(--borde-suave)"],
    marca: ["var(--violeta-500)", "var(--texto-sobre-marca)", "transparent"],
    exito: ["rgba(45,212,191,0.14)", "var(--aqua-500)", "rgba(45,212,191,0.3)"],
    alerta: ["rgba(242,185,75,0.14)", "var(--alerta-500)", "rgba(242,185,75,0.32)"],
    error: ["rgba(255,106,94,0.14)", "var(--error-500)", "rgba(255,106,94,0.32)"] }[tono];
  return <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: "var(--radio-pill)",
    background: t[0], color: t[1], border: `1px solid ${t[2]}`, fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: "var(--texto-2xs)", fontWeight: mono ? 500 : 600, letterSpacing: mono ? "var(--track-etiqueta)" : 0,
    textTransform: mono ? "uppercase" : "none", whiteSpace: "nowrap", ...style }}>{children}</span>;
};

const Tag = ({ activo, onClick, children, style }) => (
  <span onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px",
    borderRadius: "var(--radio-pill)", background: activo ? "var(--violeta-500)" : "var(--superficie-2)",
    color: activo ? "var(--texto-sobre-marca)" : "var(--texto-2)",
    border: `${activo ? 2 : 1}px solid ${activo ? "var(--violeta-400)" : "var(--borde-suave)"}`,
    fontSize: "var(--texto-xs)", fontWeight: 500, cursor: onClick ? "pointer" : "default", ...style }}>{children}</span>
);

const Card = ({ padding = 24, borde = true, elevada, children, style }) => (
  <div style={{ background: elevada ? "var(--superficie-elevada)" : "var(--superficie-1)",
    border: borde ? "1px solid var(--borde-suave)" : "none", borderRadius: "var(--radio-xl)", padding,
    boxShadow: elevada ? "var(--sombra-2), var(--anillo-interno)" : "none", ...style }}>{children}</div>
);

const Avatar = ({ nombre = "", talla = 40, tono = "marca", style }) => (
  <span style={{ width: talla, height: talla, borderRadius: "var(--radio-pill)", display: "inline-grid", placeItems: "center",
    flex: "0 0 auto", background: tono === "neutro" ? "var(--noche-700)" : "var(--violeta-700)", color: "var(--texto-1)",
    fontSize: Math.round(talla * 0.36), fontWeight: 700, letterSpacing: "-0.02em", ...style }}>
    {nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase()}</span>
);

const Input = ({ etiqueta, valor, onChange, placeholder, ayuda, error, sufijo, mono, style }) => {
  const [f, setF] = useState(false); const id = useId();
  return <div style={{ display: "grid", gap: 8, ...style }}>
    {etiqueta && <label htmlFor={id} style={{ fontSize: "var(--texto-xs)", fontWeight: 600, color: "var(--texto-2)" }}>{etiqueta}</label>}
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48, padding: "0 14px", borderRadius: "var(--radio-md)",
      background: "var(--superficie-1)", border: `${f || error ? 2 : 1}px solid ${error ? "var(--error-500)" : f ? "var(--violeta-400)" : "var(--borde-suave)"}`,
      boxShadow: f ? "var(--anillo-foco)" : "none" }}>
      <input id={id} value={valor} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--texto-1)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: "var(--texto-md)" }} />
      {sufijo}
    </div>
    {(error || ayuda) && <span style={{ fontSize: "var(--texto-2xs)", color: error ? "var(--error-500)" : "var(--texto-3)" }}>{error || ayuda}</span>}
  </div>;
};

const Switch = ({ activo, onChange, etiqueta, descripcion, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 44, ...style }}>
    <span style={{ display: "grid", gap: 2, flex: 1 }}>
      <span style={{ fontSize: "var(--texto-sm)", fontWeight: 500 }}>{etiqueta}</span>
      {descripcion && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{descripcion}</span>}
    </span>
    <button role="switch" aria-checked={!!activo} aria-label={etiqueta} onClick={() => onChange && onChange(!activo)}
      style={{ width: 48, height: 28, flex: "0 0 auto", borderRadius: "var(--radio-pill)",
        border: "1px solid " + (activo ? "var(--violeta-400)" : "var(--borde-fuerte)"),
        background: activo ? "var(--violeta-500)" : "var(--superficie-2)", padding: 2, cursor: "pointer",
        transition: "background var(--dur-rapida) var(--ease-estandar)" }}>
      <span style={{ display: "block", width: 22, height: 22, borderRadius: 999, background: activo ? "#fff" : "var(--noche-300)",
        transform: `translateX(${activo ? 20 : 0}px)`, transition: "transform var(--dur-rapida) var(--ease-salida)" }} />
    </button>
  </div>
);

const StatCard = ({ etiqueta, valor, delta, tono = "neutro", nota, style }) => (
  <div style={{ background: "var(--superficie-1)", border: "1px solid var(--borde-suave)", borderRadius: "var(--radio-xl)",
    padding: 20, display: "grid", gap: 8, ...style }}>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-3xs)", letterSpacing: "var(--track-etiqueta)",
      textTransform: "uppercase", color: "var(--texto-3)" }}>{etiqueta}</span>
    <span style={{ fontSize: "var(--texto-3xl)", fontWeight: 800, letterSpacing: "var(--track-display)", lineHeight: 1.05 }}>{valor}</span>
    {(delta || nota) && <span style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: "var(--texto-2xs)" }}>
      {delta && <span style={{ fontWeight: 600, color: tono === "positivo" ? "var(--aqua-500)" : tono === "negativo" ? "var(--error-500)" : "var(--texto-3)" }}>{delta}</span>}
      {nota && <span style={{ color: "var(--texto-3)" }}>{nota}</span>}</span>}
  </div>
);

const ProgressBar = ({ valor = 0, max = 100, etiqueta, meta, style }) => (
  <div style={{ display: "grid", gap: 8, ...style }}>
    {(etiqueta || meta) && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--texto-2xs)" }}>
      <span style={{ color: "var(--texto-2)" }}>{etiqueta}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--texto-3)" }}>{meta}</span></div>}
    <div style={{ height: 8, borderRadius: 999, background: "var(--superficie-2)", overflow: "hidden" }}>
      <div style={{ width: Math.min(100, valor / max * 100) + "%", height: "100%", borderRadius: 999,
        background: "var(--violeta-500)", transition: "width var(--dur-media) var(--ease-salida)" }} /></div>
  </div>
);

const ListRow = ({ medio, titulo, subtitulo, valor, valorSecundario, derecha, onClick, style }) => {
  const [h, setH] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, padding: "12px 16px",
      background: h && onClick ? "var(--superficie-2)" : "transparent", borderRadius: "var(--radio-md)",
      cursor: onClick ? "pointer" : "default", transition: "background var(--dur-instante) var(--ease-estandar)", ...style }}>
    {medio}
    <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: "var(--texto-sm)", fontWeight: 600, letterSpacing: "-0.01em" }}>{titulo}</span>
      {subtitulo && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{subtitulo}</span>}
    </div>
    {(valor || valorSecundario) && <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
      {valor && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-sm)", fontWeight: 500 }}>{valor}</span>}
      {valorSecundario && <span style={{ fontSize: "var(--texto-2xs)", color: "var(--texto-3)" }}>{valorSecundario}</span>}</div>}
    {derecha}
  </div>;
};

const NivelNodo = ({ nivel = 1, personas = 0, comision, activo, onClick, style }) => {
  const [h, setH] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: "var(--radio-lg)",
      background: activo || h ? "var(--superficie-2)" : "var(--superficie-1)",
      border: `${activo ? 2 : 1}px solid ${activo ? "var(--violeta-400)" : "var(--borde-suave)"}`,
      cursor: onClick ? "pointer" : "default", ...style }}>
    <span style={{ width: 40, height: 40, flex: "0 0 auto", borderRadius: 12, background: "var(--violeta-500)",
      opacity: Math.max(0.2, 1 - (nivel - 1) * 0.22), display: "grid", placeItems: "center",
      fontFamily: "var(--font-mono)", fontSize: "var(--texto-sm)", fontWeight: 700, color: "#fff" }}>{nivel}</span>
    <div style={{ display: "grid", gap: 2, flex: 1 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-3xs)", letterSpacing: "var(--track-etiqueta)",
        textTransform: "uppercase", color: "var(--texto-3)" }}>Nivel {nivel}</span>
      <span style={{ fontSize: "var(--texto-sm)", fontWeight: 600 }}>{personas} personas</span>
    </div>
    {comision && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--texto-sm)", color: "var(--aqua-500)" }}>{comision}</span>}
  </div>;
};

const Tabs = ({ opciones = [], valor, onChange, ancho, style }) => (
  <div role="tablist" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: "var(--radio-md)",
    background: "var(--superficie-1)", border: "1px solid var(--borde-suave)", width: ancho ? "100%" : "auto", ...style }}>
    {opciones.map(o => (
      <button key={o} role="tab" aria-selected={o === valor} onClick={() => onChange && onChange(o)}
        style={{ flex: ancho ? 1 : "0 0 auto", height: 36, padding: "0 16px", borderRadius: "var(--radio-sm)", border: "none",
          background: o === valor ? "var(--violeta-500)" : "transparent",
          color: o === valor ? "var(--texto-sobre-marca)" : "var(--texto-2)", fontFamily: "var(--font-sans)",
          fontSize: "var(--texto-xs)", fontWeight: 600, cursor: "pointer",
          transition: "background var(--dur-instante) var(--ease-estandar)" }}>{o}</button>))}
  </div>
);

const Sheet = ({ abierta, titulo, onCerrar, children, pie }) => abierta ? (
  <div onClick={onCerrar} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end",
    background: "rgba(12,10,20,0.62)", zIndex: 40 }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: "var(--superficie-elevada)",
      borderRadius: "var(--radio-2xl) var(--radio-2xl) 0 0", borderTop: "1px solid var(--borde-suave)",
      boxShadow: "var(--sombra-4), var(--anillo-interno)", padding: "16px 20px 28px", display: "grid", gap: 16,
      animation: "afn-subir var(--dur-media) var(--ease-salida)" }}>
      <span style={{ width: 40, height: 4, borderRadius: 999, background: "var(--borde-fuerte)", margin: "0 auto" }} />
      {titulo && <h3 style={{ fontSize: "var(--texto-xl)", fontWeight: 800, letterSpacing: "var(--track-titulo)" }}>{titulo}</h3>}
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
      {pie}
    </div>
  </div>) : null;

const Toast = ({ mensaje, tono = "neutro", accion, onAccion }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radio-md)",
    background: "rgba(28,23,48,0.94)", border: "1px solid " + (tono === "exito" ? "rgba(45,212,191,0.4)" : tono === "error" ? "rgba(255,106,94,0.4)" : "var(--borde-suave)"),
    boxShadow: "var(--sombra-3)", color: "var(--texto-1)", fontSize: "var(--texto-sm)" }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, flex: "0 0 auto",
      background: tono === "exito" ? "var(--aqua-500)" : tono === "error" ? "var(--error-500)" : "var(--violeta-400)" }} />
    <span style={{ flex: 1 }}>{mensaje}</span>
    {accion && <button onClick={onAccion} style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
      color: "var(--violeta-300)", fontFamily: "var(--font-sans)", fontSize: "var(--texto-xs)", fontWeight: 600 }}>{accion}</button>}
  </div>
);

const EmptyState = ({ titulo, descripcion, accion, ideograma = "../../assets/logo/ideograma-violeta.svg" }) => (
  <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center", padding: "40px 24px",
    background: "var(--superficie-1)", border: "1px solid var(--borde-suave)", borderRadius: "var(--radio-xl)" }}>
    <img src={ideograma} width="40" height="40" alt="" style={{ opacity: 0.5 }} />
    <div style={{ display: "grid", gap: 8, maxWidth: "40ch" }}>
      <span style={{ fontSize: "var(--texto-lg)", fontWeight: 700, letterSpacing: "var(--track-titulo)" }}>{titulo}</span>
      {descripcion && <span style={{ fontSize: "var(--texto-sm)", color: "var(--texto-2)" }}>{descripcion}</span>}
    </div>
    {accion}
  </div>
);

window.AFN = { Button, IconButton, Icono, Badge, Tag, Card, Avatar, Input, Switch, StatCard, ProgressBar, ListRow, NivelNodo, Tabs, Sheet, Toast, EmptyState };
