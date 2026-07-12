/**
 * Translate a raw AI / network error into a friendly, actionable Chinese message.
 *
 * This is the single source of truth for AI error presentation, shared by both
 * the renderer (chat, editor AI actions, template generation) and the main
 * process (provider response normalization). Previously these lived as three
 * near-identical copies that drifted apart.
 */

export function formatAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const m = message.toLowerCase();

  if (/timeout|超时|abort/i.test(m)) {
    return '请求超时了。模型或中转服务可能响应较慢，请稍后重试，或检查 Base URL 与模型名是否正确。';
  }
  if (/image_url|图片输入|unsupported.*image|image.*unsupported|multimodal|vision|expected.*text|unknown variant/i.test(m)) {
    return '当前模型或接口不支持图片输入。请切换到支持视觉/多模态的模型，或移除图片后只发送文字。';
  }
  if (/401|unauthorized|api key|apikey|密钥|鉴权|认证|token/i.test(m)) {
    return 'API 鉴权失败。请检查 API Key 与 Base URL 是否匹配，并重新保存配置。';
  }
  if (/403|forbidden/i.test(m)) {
    return '没有访问该模型的权限（403）。请确认 API Key 具备对应模型权限。';
  }
  if (/404|not found/i.test(m)) {
    return '找不到该模型或接口（404）。请确认模型名（注意部分服务区分大小写）与 Base URL 是否正确。';
  }
  if (/429|rate limit|too many requests|频率|限流/i.test(m)) {
    return '请求过于频繁（429）。请稍后重试，或降低并发。';
  }
  if (/余额|quota|insufficient|credit/i.test(m)) {
    return '账号额度可能不足，请检查服务商余额或套餐。';
  }
  if (/econnrefused|enotfound|fetch failed|network|网络|连接|econn|socket/i.test(m)) {
    return '无法连接到模型服务。请检查网络、Base URL 或中转服务是否可用。';
  }
  if (/context length|maximum context|token limit|上下文|超长/i.test(m)) {
    return '请求超出模型的上下文长度上限。请缩短输入，或开启摘要/分段处理。';
  }
  if (/model.*not exist|unknown model|invalid model|模型不存在/i.test(m)) {
    return '模型不存在或不可用。请核对模型名。';
  }
  if (/json|parse/i.test(m)) {
    return '服务返回了无法解析的响应，可能是中间层代理异常。';
  }
  return message || 'AI 请求失败，请稍后重试。';
}
