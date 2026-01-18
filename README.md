# Workplace Inspector

An AI-powered workplace safety analysis tool built with Next.js App Router that provides detailed safety insights for different workplace environments.

## Features

- **Multiple Analysis Modes**: 
  - Kitchen / Food Safety (HACCP-focused)
  - Warehouse / Storage Safety
  - Office Safety & Ergonomics
- **Drag & Drop Upload**: Easy image upload with drag and drop support
- **AI Analysis**: Powered by OpenAI's Vision model for comprehensive workplace safety analysis
- **Structured Results**: Analysis broken down into clear sections:
  - What I See
  - What This Means
  - Possible Issues
  - What You Can Do Next
  - Risk Level Assessment
- **File Validation**: Supports PNG/JPG files up to 10MB
- **Responsive Design**: Built with Tailwind CSS and shadcn/ui components

## Analysis Modes

### Kitchen / Food Safety
- Cross-contamination risks
- Food labeling and dating
- Temperature control
- Cleanliness standards
- HACCP compliance

### Warehouse / Storage
- Stacking safety
- Emergency exit access
- Trip hazards
- Proper labeling
- Equipment maintenance

### Office Safety
- Ergonomic setup
- Cable management
- Fire safety
- Workspace organization
- Lighting adequacy

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **AI**: OpenAI Vision API
- **File Upload**: react-dropzone
- **Language**: TypeScript

## Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd explain-my-screenshot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Add your OpenAI API key to `.env.local`:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. Go to `/tools/explain-my-screenshot`
2. Select your analysis mode (Kitchen, Warehouse, or Office)
3. Upload a workplace photo by dragging and dropping or clicking to select
4. Click "Analyze Workplace" to get safety analysis
5. View the structured analysis results with risk assessment

## API Routes

- `POST /api/explain-screenshot` - Accepts image files and analysis mode, returns structured workplace safety analysis

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)

## Deployment

This app can be deployed on Vercel, Netlify, or any platform that supports Next.js.

Make sure to set the `OPENAI_API_KEY` environment variable in your deployment platform.

## License

MIT