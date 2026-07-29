import type { NextConfig } from 'next';
import path from 'node:path';

// 本项目始终从 web/ 目录启动 next dev，用 cwd 得到绝对根目录，避免相对路径警告，
// 也避免用 import.meta.url（被 Next 转译后指向 .next，会导致 root 解析错误、编译卡死）
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // 本项目是 monorepo 式的子目录，显式指定 turbopack 绝对根目录，避免多 lockfile 警告
  turbopack: { root: projectRoot },
  // 允许服务端使用 Node 内置模块（fs/path/child_process 用于文件工具）
  serverExternalPackages: ['@openai/agents', '@openai/agents-extensions'],
};

export default nextConfig;
