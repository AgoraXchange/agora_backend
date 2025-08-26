/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'chat-bg': '#121212',
        'chat-header': '#1e1e1e',
        'message-bubble': '#2a2a2a',
        'message-text': '#ffffff',
        'agent-gpt4': '#7C3AED',
        'agent-claude': '#3B82F6',
        'agent-gemini': '#10B981',
        'agent-judge': '#F59E0B',
        'agent-synthesizer': '#EF4444',
        'progress-bg': '#374151',
        'progress-fill': '#10B981',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'typing': 'typing 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        typing: {
          '0%, 60%, 100%': { opacity: '1' },
          '30%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}