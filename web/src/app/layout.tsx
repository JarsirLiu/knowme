import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SuperAgent',
  description: '本地 coding agent · 基于 openai-agents-js + ai-sdk-ui',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: '#ffffff',
          color: '#1a1a1a',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {children}
      </body>
    </html>
  );
}
