/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 暖白纸张调：ink 作表面 ramp（浅→深），paper 作文字 ramp（深→浅）
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          muted: "rgb(var(--paper-muted) / <alpha-value>)",
          faint: "rgb(var(--paper-faint) / <alpha-value>)",
        },
        // 主色：朱砂橙（深一档，浅底上对比足）
        cinnabar: {
          DEFAULT: "rgb(var(--cinnabar) / <alpha-value>)",
          hover: "rgb(var(--cinnabar-hover) / <alpha-value>)",
          soft: "rgb(var(--cinnabar-soft) / <alpha-value>)",
          glow: "rgb(var(--cinnabar) / 0.18)",
        },
        sage: "rgb(var(--sage) / <alpha-value>)",
        rose: "rgb(var(--rose) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightish: "-0.015em",
      },
      transitionTimingFunction: {
        // 多元动画曲线：弹性回弹 + 阶跃感，拒绝单一 ease-in-out
        overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        settle: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        rowIn: {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "slide-up": "slideUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in-right": "slideInRight 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        "fade-in": "fadeIn 0.3s ease-out both",
        "row-in": "rowIn 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "spin-slow": "spin 1.4s linear infinite",
      },
      backgroundImage: {
        "grain": "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        "vignette": "radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.45) 100%)",
      },
    },
  },
  plugins: [],
};
