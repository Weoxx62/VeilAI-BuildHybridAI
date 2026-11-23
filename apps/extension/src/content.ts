// VeilAI Manifest V3 Content Script (Zero external imports — classic MV3 bundle)
// Never reads or transmits page data automatically. Only responds on explicit user click
// from the VeilAI Side Panel (`VEILAI_CAPTURE_TAB`).

interface CaptureResponse {
  ok: boolean;
  title: string;
  url: string;
  surfaceHint: "gmail" | "github" | "docs" | "webpage";
  text: string;
}

function extractSmartPageContent(): CaptureResponse {
  const url = window.location.href;
  const host = window.location.hostname;
  const title = document.title || host;

  // 1. User's explicit selection always takes priority
  const selection = window.getSelection()?.toString().trim() ?? "";
  let surfaceHint: CaptureResponse["surfaceHint"] = "webpage";
  if (host.includes("mail.google.com")) surfaceHint = "gmail";
  else if (host.includes("github.com")) surfaceHint = "github";
  else if (host.includes("docs.google.com")) surfaceHint = "docs";

  if (selection.length >= 12) {
    return {
      ok: true,
      title: `${title} (Selection)`,
      url,
      surfaceHint,
      text: selection.slice(0, 7500),
    };
  }

  // 2. Gmail compose draft or open thread body
  if (surfaceHint === "gmail") {
    const compose = document.querySelector<HTMLElement>(
      'div[aria-label="Message Body"], div[role="textbox"][contenteditable="true"]',
    );
    if (compose?.innerText.trim()) {
      return {
        ok: true,
        title: `Gmail Draft: ${title}`,
        url,
        surfaceHint,
        text: compose.innerText.trim().slice(0, 7500),
      };
    }
    const thread = document.querySelector<HTMLElement>(".a3s.aiL");
    if (thread?.innerText.trim()) {
      return {
        ok: true,
        title: `Gmail Thread: ${title}`,
        url,
        surfaceHint,
        text: thread.innerText.trim().slice(0, 7500),
      };
    }
  }

  // 3. GitHub PR diff / code block / issue body
  if (surfaceHint === "github") {
    const diffLines = Array.from(
      document.querySelectorAll<HTMLElement>(".blob-code-inner"),
    )
      .slice(0, 180)
      .map((el) => el.innerText)
      .join("\n")
      .trim();

    if (diffLines.length >= 20) {
      return {
        ok: true,
        title: `GitHub Diff: ${title}`,
        url,
        surfaceHint,
        text: diffLines.slice(0, 7500),
      };
    }
    const commentBody = document.querySelector<HTMLElement>(".comment-body");
    if (commentBody?.innerText.trim()) {
      return {
        ok: true,
        title: `GitHub PR: ${title}`,
        url,
        surfaceHint,
        text: commentBody.innerText.trim().slice(0, 7500),
      };
    }
  }

  // 4. Generic focused textarea / editable or visible main article
  const active = document.activeElement as HTMLTextAreaElement | HTMLElement | null;
  if (active && active instanceof HTMLTextAreaElement && active.value.trim()) {
    return {
      ok: true,
      title,
      url,
      surfaceHint,
      text: active.value.trim().slice(0, 7500),
    };
  }

  const main =
    document.querySelector<HTMLElement>("main, article, [role='main']") ??
    document.body;
  const fallbackText = (main?.innerText ?? "").trim().slice(0, 7500);

  return {
    ok: fallbackText.length > 0,
    title,
    url,
    surfaceHint,
    text: fallbackText,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "VEILAI_CAPTURE_TAB") {
    sendResponse(extractSmartPageContent());
    return true;
  }
  return false;
});
