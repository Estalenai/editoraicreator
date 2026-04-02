export function navigateToEditorRoute(href: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.location.assign(href);
}
