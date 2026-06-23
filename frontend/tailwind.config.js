/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 暖白纸张调：ink 作表面 ramp（浅→深），paper 作文字 ramp（深→浅）
        ink: {
          950: "#f5f0e6", // 主背景：暖奶油
          900: "#fbf8f0", // 面板表面
          850: "#f1ebdd", // 悬停表面
          800: "#e7dfce", // 图标悬停 / 微底
          700: "#ddd5c2", // 边框
          600: "#c8bfa9", // 分隔 / 悬停边框
        },
        paper: {
          DEFAULT: "#2a2620", // 主文字：暖墨黑
          muted: "#6c6557",
          faint: "#9a9282",
        },
        // 主色：朱砂橙（深一档，浅底上对比足）
        cinnabar: {
          DEFAULT: "#cf4a26",
          hover: "#e2603a",
          soft: "#f4ddd3", // 浅桃色徽章底
          glow: "rgba(207,74,38,0.18)",
        },
        sage: "#5a8f4d", // 成功：深一档鼠尾草
        rose: "#c43d52", // 危险：玫红
        amber: "#b8841f", // 等待：深琥珀
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
