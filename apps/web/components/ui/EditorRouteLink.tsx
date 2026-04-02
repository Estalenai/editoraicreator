import type { AnchorHTMLAttributes, ReactNode } from "react";

type EditorRouteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

export function EditorRouteLink({ href, children, ...props }: EditorRouteLinkProps) {
  return (
    <a href={href} {...props} data-editor-nav="hard">
      {children}
    </a>
  );
}
