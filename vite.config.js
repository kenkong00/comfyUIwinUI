import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { HttpsProxyAgent } from 'https-proxy-agent'

const PROXY_PORT = process.env.PROXY_PORT || '10808'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5177,
    // 关键：开发服务器一律不进浏览器磁盘缓存。
    // 否则 Chrome/Edge 复用损坏的缓存条目时会抛 ERR_CACHE_READ_FAILURE（表现为 200 但页面白屏）。
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Host', '127.0.0.1:8188');
            proxyReq.setHeader('Origin', 'http://127.0.0.1:8188');
          });
        }
      },
      '/api/save-image': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // 主项目后端 (端口 3007)：前端 API 统一走同源代理，
      // 这样局域网内手机/平板访问 http://<本机IP>:5177 时，浏览器请求仍指向本机 3007，而非自身 localhost。
      '/server': {
        target: 'http://localhost:3007',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/server/, '')
      },
      // 下载服务 (端口 3006)
      '/dl': {
        target: 'http://localhost:3006',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dl/, '')
      },
      '/ai-api': {
        target: 'https://openrouter.ai/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-api/, ''),
        timeout: 30000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Host', 'openrouter.ai');
          });
          proxy.on('error', (err, req, res) => {
            console.error('OpenRouter代理错误:', err.message);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: '代理连接超时,请检查网络' }));
            }
          });
        }
      },
      '/siliconflow-api': {
        target: 'https://api.siliconflow.cn/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/siliconflow-api/, ''),
        timeout: 30000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Host', 'api.siliconflow.cn');
          });
          proxy.on('error', (err, req, res) => {
            console.error('SiliconFlow代理错误:', err.message);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: '代理连接超时,请检查网络' }));
            }
          });
        }
      },
      '/openai-api': {
        target: 'https://api.openai.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai-api/, ''),
        timeout: 30000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Host', 'api.openai.com');
          });
          proxy.on('error', (err, req, res) => {
            console.error('OpenAI代理错误:', err.message);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: '代理连接超时,请检查网络' }));
            }
          });
        }
      },
      '/aliyun-api': {
        target: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aliyun-api/, ''),
        timeout: 60000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('🔄 阿里云代理请求:', req.method, req.url);
            proxyReq.setHeader('Host', 'dashscope.aliyuncs.com');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('✅ 阿里云代理响应:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ 阿里云代理错误:', err.message, req.url);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: '阿里云代理连接失败',
                details: err.message,
                suggestion: '请检查网络连接或API密钥'
              }));
            }
          });
        }
      },
      '/google-api': {
        target: 'https://generativelanguage.googleapis.com/v1beta',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/google-api/, ''),
        timeout: 60000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('🔄 Google代理请求:', req.method, req.url);
            proxyReq.setHeader('Host', 'generativelanguage.googleapis.com');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('✅ Google代理响应:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ Google代理错误:', err.message, req.url);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Google API 连接超时',
                details: err.message,
                suggestion: 'Google 服务需要特殊网络环境，请：1. 开启VPN后重试 2. 或使用 OpenRouter 选择 Gemini 模型'
              }));
            }
          });
        }
      },
      '/google-proxy-api': {
        target: 'https://generativelanguage.googleapis.com/v1beta',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/google-proxy-api\/v1beta/, ''),
        timeout: 60000,
        proxyTimeout: 120000,
        agent: new HttpsProxyAgent(`http://127.0.0.1:${PROXY_PORT}`),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('❌ Google代理(本地代理)错误:', err.message, req.url);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: '本地代理连接失败',
                details: err.message,
                suggestion: `请确保本地代理已开启并监听端口 ${PROXY_PORT}`
              }));
            }
          });
        }
      },
      '/lmstudio-api': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lmstudio-api/, '/v1'),
        timeout: 60000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('🔄 LM Studio代理请求:', req.method, req.url);
            proxyReq.setHeader('Host', '127.0.0.1:1234');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('✅ LM Studio代理响应:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ LM Studio代理错误:', err.message, req.url);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'LM Studio代理连接失败',
                details: err.message,
                suggestion: '请确保 LM Studio 已启动并运行在 http://127.0.0.1:1234' 
              }));
            }
          });
        }
      },
      '/modelscope-api': {
        target: 'https://api-inference.modelscope.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/modelscope-api/, '/v1'),
        timeout: 60000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('🔄 魔塔社区代理请求:', req.method, req.url);
            proxyReq.setHeader('Host', 'api-inference.modelscope.cn');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('✅ 魔塔社区代理响应:', proxyRes.statusCode, req.url);
          });
          proxy.on('error', (err, req, res) => {
            console.error('❌ 魔塔社区代理错误:', err.message, req.url);
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: '魔塔社区代理连接失败',
                details: err.message,
                suggestion: '请检查网络连接或API密钥' 
              }));
            }
          });
        }
      }
    }
  }
})
