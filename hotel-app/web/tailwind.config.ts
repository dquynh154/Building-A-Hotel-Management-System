import type { Config } from "tailwindcss";

export default {
    content: ["./src/**/*.{js,jsx,ts,tsx,mdx}"],
    theme: {
        extend: {
            fontFamily: {
                // Toàn site: Geist, fallback VN = Montserrat
                sans: [
                    "var(--font-geist-sans)",
                    "var(--font-brand)",
                    "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans", "sans-serif",
                ],
                // Headline: Montserrat
                brand: [
                    "var(--font-brand)",
                    "var(--font-geist-sans)",
                    "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans", "sans-serif",
                ],
                mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
            },
        },
    },
    plugins: [],
} satisfies Config;
