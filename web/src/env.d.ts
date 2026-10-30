/** 构建时注入的页面目录和 GitHub 数据快照地址。 */
declare const __IFB_SITE_BASE__: string;
declare const __IFB_RAW_BASE__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
