# ARETE Frontend

AI-powered fair interview platform built with Next.js 14.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Video**: LiveKit (@livekit/components-react)
- **Code Editor**: Monaco Editor (@monaco-editor/react)
- **Icons**: Lucide React
- **Animations**: Framer Motion

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with fonts
│   ├── page.tsx                 # Landing page
│   ├── interview/[id]/          # Interview session page
│   ├── dashboard/[id]/          # Results dashboard page
│   └── globals.css              # Global styles
├── components/
│   ├── interview/               # Interview-related components
│   │   ├── LiveKitRoom.tsx     # Video conferencing
│   │   ├── CodeEditor.tsx      # Code editor integration
│   │   └── InterviewControls.tsx
│   ├── dashboard/               # Dashboard components
│   │   ├── ScoreCard.tsx       # Interview scores
│   │   └── FairnessReport.tsx  # Bias detection report
│   └── ui/                      # Shared UI components
├── lib/
│   ├── fonts.ts                 # Font configurations
│   └── mockData.ts              # Mock data for development
└── Configuration files

```

## Fonts

- **Headings**: Outfit
- **Body**: Nunito Sans
- **Code**: JetBrains Mono

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# LiveKit Configuration
NEXT_PUBLIC_LIVEKIT_URL=your_livekit_url
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Development Notes

- This project uses the Next.js App Router (not Pages Router)
- All components are TypeScript
- TailwindCSS is configured with custom theme colors and fonts
- Import aliases are configured with `@/*` pointing to the root directory
