import type { Theme } from "../types";

const fluentBlue = "#0078d4";
const fluentBlueDark = "#004578";
const dotnetPurple = "#512bd4";

export const defaultTheme: Theme = {
  id: "dotnet",
  name: ".NET Blue",
  accent: fluentBlue,
  // WeChat dark mode (mp-darkmode) only clamps tinted light backgrounds to a still-bright gray, while
  // neutral grays are inverted and translucent tints stay translucent; so avoid opaque tinted backgrounds.
  accentSoft: "rgba(0,120,212,0.07)",
  heading: fluentBlueDark,
  text: "#242424",
  muted: "#616161",
  border: "rgba(0,120,212,0.22)",
  codeBg: "#f7f7f7",
  inlineCodeColor: dotnetPurple,
  inlineCodeBg: "rgba(81,43,212,0.07)",
  fontFamily: "system",
  bodyFontSize: 16,
  bodyLineHeight: 1.8,
  paragraphSpacing: 18,
  bodyTextAlign: "left",
  letterSpacing: 0.2,
  firstLineIndent: 0,
  headings: {
    h1: { fontSize: 24, color: fluentBlueDark, align: "left", decoration: "plain" },
    h2: { fontSize: 20, color: fluentBlueDark, align: "left", decoration: "left-bar" },
    h3: { fontSize: 17, color: "#005a9e", align: "left", decoration: "plain" },
    h4: { fontSize: 16, color: "#005a9e", align: "left", decoration: "plain" },
    h5: { fontSize: 15, color: "#005a9e", align: "left", decoration: "plain" },
    h6: { fontSize: 14, color: "#616161", align: "left", decoration: "plain" },
  },
  unorderedListStyle: "disc",
  orderedListStyle: "decimal",
  listSpacing: 4,
  strongStyle: "color",
  linkStyle: "bottom-border",
  blockquoteStyle: "left-bar",
  codeStyle: "soft",
  codeHighlightTheme: "vs",
  codeFontSize: 13,
  codeLineHeight: 1.65,
  tableStyle: "soft-header",
  imageStyle: "rounded",
  dividerStyle: "solid",
  imageSpacing: 24,
  imageCaptionAlign: "center",
  imageCaptionSize: 13,
  radius: 6,
};
