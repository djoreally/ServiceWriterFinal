type SocialMetaInput = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  siteName?: string;
};

function upsertMetaByProperty(property: string, content: string): void {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertMetaByName(name: string, content: string): void {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export function toAbsoluteUrl(urlOrPath: string): string {
  try {
    return new URL(urlOrPath, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

export function applySocialMeta(input: SocialMetaInput): void {
  const url = input.url ? toAbsoluteUrl(input.url) : window.location.href;
  const image = input.image ? toAbsoluteUrl(input.image) : toAbsoluteUrl("/og-image.png");

  if (input.title) {
    document.title = input.title;
    upsertMetaByProperty("og:title", input.title);
    upsertMetaByProperty("twitter:title", input.title);
  }

  if (input.description) {
    upsertMetaByName("description", input.description);
    upsertMetaByProperty("og:description", input.description);
    upsertMetaByProperty("twitter:description", input.description);
  }

  upsertMetaByProperty("og:url", url);
  upsertMetaByProperty("twitter:url", url);
  upsertMetaByProperty("og:image", image);
  upsertMetaByProperty("twitter:image", image);

  if (input.siteName) {
    upsertMetaByProperty("og:site_name", input.siteName);
  }
}
