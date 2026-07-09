'use strict';

/**
 * 解析飞书请求中的目标信息（URL、Method、Headers、Body）。
 *
 * 优先级：
 *   1. 自定义 Header（X-Target-URL, X-Target-Method, X-Target-Headers）
 *   2. JSON Body 多路径回退（按配置的路径链依次尝试）
 *
 * 返回 { targetUrl, targetMethod, targetHeaders, targetBody, source }
 * 若解析失败，返回 { error: string }
 */
function parseTargetInfo(req, config) {
  const p = config.parsing;

  // ---- 第 1 步：从 Header 提取 ----
  const headerUrl = req.headers[p.headerTargetUrl.toLowerCase()];
  if (headerUrl) {
    const headerMethod = req.headers[p.headerTargetMethod.toLowerCase()] || req.method;
    let headerHeaders = {};

    const rawHeaderHeaders = req.headers[p.headerTargetHeaders.toLowerCase()];
    if (rawHeaderHeaders) {
      try {
        const decoded = Buffer.from(rawHeaderHeaders, 'base64').toString('utf-8');
        headerHeaders = JSON.parse(decoded);
      } catch {
        return { error: `Invalid base64 JSON in header "${p.headerTargetHeaders}"` };
      }
    }

    return {
      targetUrl: headerUrl,
      targetMethod: headerMethod.toUpperCase(),
      targetHeaders: headerHeaders,
      targetBody: null,
      source: 'header',
    };
  }

  // ---- 第 2 步：从 JSON Body 多路径回退 ----
  if (req.body && typeof req.body === 'object') {
    const bodyUrl = resolveJsonPathChain(req.body, p.bodyTargetUrlPaths);

    if (bodyUrl !== undefined) {
      const bodyMethod = resolveJsonPathChain(req.body, p.bodyTargetMethodPaths) || req.method;
      const bodyHeaders = normalizeHeaders(resolveJsonPathChain(req.body, p.bodyTargetHeadersPaths));
      const bodyBody = normalizeBody(resolveJsonPathChain(req.body, p.bodyTargetBodyPaths));
      return {
        targetUrl: bodyUrl,
        targetMethod: bodyMethod.toUpperCase(),
        targetHeaders: bodyHeaders,
        targetBody: bodyBody,
        source: 'body',
      };
    }
  }

  // ---- 未提供 ----
  return { error: `Missing target URL. Provide via "${p.headerTargetUrl}" header or one of body paths: ${p.bodyTargetUrlPaths.join(', ')}` };
}

/**
 * 沿路径链依次取值，返回第一个非 undefined 的值。
 *
 * @param {object} obj - 源对象
 * @param {string[]} paths - 路径数组，如 ['target_url', 'data.target_url', 'content.0.url']
 * @returns {*|undefined}
 */
function resolveJsonPathChain(obj, paths) {
  if (!Array.isArray(paths)) return undefined;
  for (const path of paths) {
    const value = resolveJsonPath(obj, path);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * 按点号分隔的路径从 JSON 对象中取值。
 * 支持数字索引自动访问数组元素：
 *   resolveJsonPath({ items: [{ url: 'x' }] }, 'items.0.url') → 'x'
 *
 * @param {object} obj
 * @param {string} path - 如 'a.b.0.c' 或 'a.b.c'
 * @returns {*|undefined}
 */
function resolveJsonPath(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined;

    // 若 key 为纯数字且 current 是数组，按索引访问
    const index = isArrayIndex(key);
    if (index !== -1 && Array.isArray(current)) {
      current = current[index];
    } else {
      current = current[key];
    }

    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * 判断字符串是否为非负整数数组索引。是则返回数字，否则返回 -1。
 */
function isArrayIndex(key) {
  if (/^\d+$/.test(key)) {
    const n = parseInt(key, 10);
    if (n >= 0 && n < 2 ** 32 - 1) return n;
  }
  return -1;
}

/**
 * 将 target_headers 归一化为对象。
 *
 * 飞书可能传三种格式：
 *   - ""（空字符串）→ {}
 *   - '{"Authorization":"Bearer x"}'（JSON 字符串）→ 自动 parse
 *   - {"Authorization":"Bearer x"}（已是对象）→ 原样返回
 */
function normalizeHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

/**
 * 将 target_body 归一化。
 *
 * 飞书可能传：
 *   - undefined → null（未指定，使用原始 body）
 *   - ""（空字符串）→ null（未指定，使用原始 body）
 *   - 其它值 → 原样使用
 */
function normalizeBody(raw) {
  if (raw === undefined || raw === '') return null;
  return raw;
}

module.exports = { parseTargetInfo, resolveJsonPath, resolveJsonPathChain };
