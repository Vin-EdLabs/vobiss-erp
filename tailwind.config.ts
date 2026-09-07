import type { Config } from "tailwindcss";

export default {
	darkMode: ['selector', '[data-theme="dark"]'],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
			boxShadow: {
				card: 'var(--shadow)',
				'sidebar-item': 'inset 2px 0 0 var(--sidebar-active-border)',
			},
			colors: {
				'vobiss-accent': 'var(--accent)',
				'vobiss-accent-hover': 'var(--accent-hover)',
				'vobiss-sidebar': 'var(--sidebar-bg)',
				'vobiss-success': 'var(--success)',
				'vobiss-warning': 'var(--warning)',
				'vobiss-danger': 'var(--danger)',
				'vobiss-surface': 'var(--surface)',
				'vobiss-muted': 'var(--text-muted)',
				border: 'var(--border)',
				input: 'var(--border)',
				ring: 'var(--accent)',
				background: 'var(--page-bg)',
				foreground: 'var(--text-primary)',
				primary: {
					DEFAULT: 'var(--primary)',
					foreground: 'var(--primary-text)'
				},
				secondary: {
					DEFAULT: 'var(--surface-secondary)',
					foreground: 'var(--text-primary)'
				},
				destructive: {
					DEFAULT: 'var(--danger)',
					foreground: '#FFFFFF'
				},
				muted: {
					DEFAULT: 'var(--surface-secondary)',
					foreground: 'var(--text-muted)'
				},
				accent: {
					DEFAULT: 'var(--accent-light)',
					foreground: 'var(--accent-text)'
				},
				popover: {
					DEFAULT: 'var(--surface)',
					foreground: 'var(--text-primary)'
				},
				card: {
					DEFAULT: 'var(--surface)',
					foreground: 'var(--text-primary)'
				},
				sidebar: {
					DEFAULT: 'var(--sidebar-bg)',
					foreground: 'var(--sidebar-text)',
					primary: 'var(--primary)',
					'primary-foreground': 'var(--primary-text)',
					accent: 'var(--sidebar-active-bg)',
					'accent-foreground': 'var(--sidebar-text-active)',
					border: 'var(--border)',
					ring: 'var(--accent)'
				}
			},
			borderRadius: {
				lg: 'var(--radius-lg)',
				md: 'var(--radius)',
				sm: 'var(--radius-sm)',
				xl: 'var(--radius-xl)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'ops-border-pulse': {
					'0%, 100%': { opacity: '0.55' },
					'50%': { opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'ops-border-pulse': 'ops-border-pulse 3s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
