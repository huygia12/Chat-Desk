import { useEffect, useState } from "react";
import client from "../api/client";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

const resolveApiFileUrl = (url) => {
  if (!url) return "";

  try {
    const parsed = new URL(url, API_URL);
    if (parsed.pathname.startsWith("/api/files/")) {
      return `${API_URL}${parsed.pathname}${parsed.search}`;
    }
    return parsed.href;
  } catch {
    return url;
  }
};

const isApiFileUrl = (url) => {
  if (!url) return false;

  try {
    return new URL(url, API_URL).pathname.startsWith("/api/files/");
  } catch {
    return false;
  }
};

export function useFileObjectUrl(url) {
  const [fileUrl, setFileUrl] = useState("");

  useEffect(() => {
    const resolvedUrl = resolveApiFileUrl(url);
    if (!resolvedUrl) {
      setFileUrl("");
      return undefined;
    }

    if (!isApiFileUrl(resolvedUrl)) {
      setFileUrl(resolvedUrl);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";
    setFileUrl("");

    client
      .get(resolvedUrl, {
        responseType: "blob",
        signal: controller.signal,
      })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        setFileUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFileUrl(resolvedUrl);
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return fileUrl;
}
