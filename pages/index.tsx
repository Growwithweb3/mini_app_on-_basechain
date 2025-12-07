import Head from 'next/head';
import dynamic from 'next/dynamic';

// Dynamically import Game component with SSR disabled
// This prevents server-side rendering issues with browser APIs (Image, Canvas, etc.)
const Game = dynamic(() => import('@/components/Game').then((mod) => ({ default: mod.Game })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center">
        <div className="text-2xl font-bold mb-2">Loading Base the Shooter...</div>
        <div className="text-gray-400">Preparing your game</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Base the Shooter</title>
        <meta name="description" content="Base the Shooter - A 2D shooter game" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="screen-orientation" content="landscape" />
        <meta name="orientation" content="landscape" />
        <link rel="icon" href="/images/icon.png" />
        {/* Open Graph tags for social sharing */}
        <meta property="og:title" content="Base the Shooter" />
        <meta property="og:description" content="A 2D shooter game - Control Base and fight against enemies across 3 levels!" />
        <meta property="og:type" content="website" />
      </Head>
      <main>
        <Game />
      </main>
    </>
  );
}

