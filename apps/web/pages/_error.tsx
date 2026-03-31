import NextError from "next/error";
import type { NextPageContext } from "next";

type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  return <NextError statusCode={statusCode} />;
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};
