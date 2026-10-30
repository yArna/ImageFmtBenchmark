/** 页面资源跟随 Pages 子路径，图片资源在发布版从固定的 GitHub 提交读取。 */
export function siteAssetUrl(file: string): string {
  return __IFB_SITE_BASE__ + file.replace(/^\/+/, '');
}

/** 与本地开发中间件保持相同的数据版本及路径编码规则。 */
export function buildImagePreviewUrl(kind: 'source-image' | 'result-file', file: string, version = ''): string {
  const encoded = file.split('/').map(encodeURIComponent).join('/');
  const base = __IFB_RAW_BASE__
    ? `${__IFB_RAW_BASE__}${kind === 'source-image' ? 'images' : 'result'}/`
    : `/${kind}/`;
  return `${base}${encoded}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
}
