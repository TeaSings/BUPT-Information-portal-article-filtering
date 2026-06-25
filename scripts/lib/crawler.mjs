import path from "node:path";
import { launchBrowser } from "./browser.mjs";
import { pathExists } from "./fs-utils.mjs";
import { parseDateFromText } from "./date-utils.mjs";

const navText = new Set([
  "首页",
  "登录",
  "退出",
  "更多",
  "更多>>",
  "上一页",
  "下一页",
  "尾页",
  "English",
  "部门导航",
  "个人中心"
]);

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isBlockedUrl(url, config) {
  if (!url || !/^https?:\/\//i.test(url)) return true;
  const lower = new URL(url).pathname.toLowerCase();
  return config.crawler.blockedFileExtensions.some((extension) =>
    lower.endsWith(extension)
  );
}

function isSameHost(url, baseUrl) {
  try {
    return new URL(url).host === new URL(baseUrl).host;
  } catch {
    return false;
  }
}

function isLikelyArticleUrl(url) {
  try {
    const parsed = new URL(url);
    return /(?:content|newscontent|gsggcontent)\.jsp/i.test(parsed.pathname) ||
      parsed.searchParams.has("wbnewsid");
  } catch {
    return false;
  }
}

function containsAny(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(String(keyword).toLowerCase()));
}

function scoreSectionEntry(link, section) {
  const text = `${link.text} ${link.href}`.toLowerCase();
  let score = 0;
  for (const hint of section.entryTextHints || []) {
    if (text.includes(String(hint).toLowerCase())) score += 6;
  }
  for (const hint of section.entryHrefHints || []) {
    if (text.includes(String(hint).toLowerCase())) score += 4;
  }
  if (link.text.length <= 12) score += 2;
  return score;
}

function scoreArticleCandidate(candidate, section, targetDate) {
  let score = 0;
  const text = `${candidate.text} ${candidate.contextText} ${candidate.url}`;
  if (candidate.date === targetDate) score += 100;
  if (candidate.date && candidate.date !== targetDate) score -= 100;
  if (!candidate.date) score += 3;
  if (containsAny(text, section.entryTextHints || [])) score += 4;
  if (containsAny(text, section.entryHrefHints || [])) score += 4;
  if (/info|detail|article|content|news|notice|tz|xw/i.test(candidate.url)) score += 4;
  if (candidate.text.length >= 8 && candidate.text.length <= 80) score += 4;
  if (/20\d{2}|月|日|\d{1,2}[-/.]\d{1,2}/.test(candidate.contextText)) score += 3;
  return score;
}

async function safeGoto(page, url, config) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.crawler.navigationTimeoutMs
  });
  await page.waitForLoadState("networkidle", {
    timeout: Math.min(config.crawler.navigationTimeoutMs, 10000)
  }).catch(() => {});
}

async function extractLinks(page, config) {
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
      const row = anchor.closest("li, tr, article, section, .item, .list-item, .news, .notice, .media, div");
      return {
        href: anchor.getAttribute("href") || "",
        absoluteHref: anchor.href || "",
        text: anchor.innerText || anchor.textContent || anchor.getAttribute("title") || "",
        title: anchor.getAttribute("title") || "",
        contextText: row ? row.innerText || row.textContent || "" : ""
      };
    })
  );

  const pageUrl = page.url();
  const baseUrl = config.portal.baseUrl;
  return links
    .map((link) => {
      const url = resolveUrl(link.absoluteHref || link.href, pageUrl);
      return {
        url,
        text: cleanText(link.text || link.title),
        title: cleanText(link.title),
        contextText: cleanText(link.contextText)
      };
    })
    .filter((link) => {
      if (!link.url || isBlockedUrl(link.url, config)) return false;
      if (config.crawler.includeSameHostOnly && !isSameHost(link.url, baseUrl)) return false;
      if (!link.text || navText.has(link.text)) return false;
      if (link.text.length < 4 || link.text.length > 160) return false;
      return true;
    });
}

async function discoverSectionEntries(page, config) {
  const links = await extractLinks(page, config);
  const entries = new Map();

  for (const section of config.portal.sections) {
    const configured = (section.startUrls || []).map((url) => ({
      section,
      url: resolveUrl(url, config.portal.baseUrl),
      source: "configured",
      score: 999
    }));

    if (configured.length > 0) {
      entries.set(section.name, uniqueBy(configured, (entry) => entry.url));
      continue;
    }

    const discovered = links
      .map((link) => ({
        section,
        url: link.url,
        source: link.text,
        score: scoreSectionEntry(link, section)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.crawler.maxSectionEntryUrls);

    const values = uniqueBy([...configured, ...discovered], (entry) => entry.url);
    entries.set(section.name, values.length ? values : [{
      section,
      url: config.portal.baseUrl,
      source: "portal-home",
      score: 1
    }]);
  }

  return entries;
}

async function detectLogin(page) {
  const url = page.url().toLowerCase();
  const hasPassword = await page.locator("input[type='password']").count().catch(() => 0);
  if (hasPassword > 0) return true;
  if (url.includes("login") || url.includes("cas") || url.includes("authserver")) return true;

  const text = cleanText(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""));
  return /统一身份认证|账号登录|用户登录|请输入.*密码/.test(text);
}

async function extractCandidatesFromSection(page, section, config, targetDate) {
  const links = await extractLinks(page, config);
  return links
    .filter((link) => isLikelyArticleUrl(link.url))
    .map((link) => {
      const combined = `${link.text} ${link.title} ${link.contextText}`;
      const date = parseDateFromText(combined, targetDate);
      const candidate = {
        section: section.name,
        sectionLabel: section.label,
        url: link.url,
        text: link.text || link.title,
        contextText: link.contextText,
        date
      };
      return {
        ...candidate,
        score: scoreArticleCandidate(candidate, section, targetDate)
      };
    })
    .filter((candidate) => candidate.score > -50)
    .sort((a, b) => b.score - a.score);
}

async function readArticle(page, candidate, config, targetDate) {
  try {
    await safeGoto(page, candidate.url, config);
  } catch (error) {
    return {
      ...candidate,
      title: candidate.text,
      date: candidate.date,
      source: "",
      content: "",
      excerpt: "",
      readError: error.message
    };
  }

  const extracted = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const selectors = [
      ".v_news_content",
      ".wp_articlecontent",
      ".TRS_Editor",
      ".article-content",
      ".article_content",
      ".news-detail",
      ".notice-detail",
      ".detail-content",
      ".content-detail",
      ".zhengwen",
      ".main_con",
      ".content_con",
      ".text",
      "article",
      "main",
      ".article",
      ".detail",
      ".content",
      "#content"
    ];

    const titleNode = document.querySelector("h1, .title, .article-title, .news-title, .detail-title, h2");
    const title = clean(titleNode ? titleNode.innerText || titleNode.textContent : document.title);

    const candidates = selectors
      .map((selector) => ({ selector, node: document.querySelector(selector) }))
      .filter((candidate) => candidate.node)
      .map((candidate) => ({
        selector: candidate.selector,
        text: clean(candidate.node.innerText || candidate.node.textContent || "")
      }))
      .filter((candidate) => candidate.text.length >= 20);

    const fullText = clean(document.body ? document.body.innerText || document.body.textContent || "" : "");

    return {
      title,
      bodyText: candidates[0]?.text || fullText,
      fullText,
      pageTitle: clean(document.title)
    };
  });

  const bodyText = cleanText(extracted.bodyText);
  const articleDate =
    candidate.date ||
    parseDateFromText(`${extracted.title} ${bodyText} ${extracted.fullText}`, targetDate);

  const sourceMatch = cleanText(extracted.fullText).match(/(?:来源|发布单位|发布部门|作者)[:：]\s*([^\s，。；;]{2,30})/);
  const title = cleanText(extracted.title || candidate.text || extracted.pageTitle);

  return {
    ...candidate,
    title,
    date: articleDate,
    source: sourceMatch ? sourceMatch[1] : "",
    content: bodyText,
    excerpt: bodyText.slice(0, 600)
  };
}

export async function crawlPortal({ config, targetDate, headless, debug = false }) {
  const browser = await launchBrowser(config, { headless });
  const storageState = config.runtime.authStatePath;
  const hasStorage = await pathExists(storageState);

  const context = await browser.newContext({
    locale: "zh-CN",
    timezoneId: config.portal.timezone,
    storageState: hasStorage ? storageState : undefined,
    viewport: { width: 1365, height: 900 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(config.crawler.navigationTimeoutMs);

  try {
    await safeGoto(page, config.portal.baseUrl, config);

    if (await detectLogin(page)) {
      return {
        ok: false,
        needLogin: true,
        targetDate,
        message: "Portal login is required or the saved login state expired.",
        articles: [],
        debug: { currentUrl: page.url(), hasStorage }
      };
    }

    const entriesBySection = await discoverSectionEntries(page, config);
    const allCandidates = [];

    for (const section of config.portal.sections) {
      const entries = entriesBySection.get(section.name) || [];
      for (const entry of entries) {
        if (debug) console.log(`[section] ${section.label}: ${entry.url}`);
        await safeGoto(page, entry.url, config).catch((error) => {
          console.warn(`[warn] Cannot open section ${entry.url}: ${error.message}`);
        });
        const candidates = await extractCandidatesFromSection(page, section, config, targetDate);
        allCandidates.push(...candidates);
      }
    }

    const candidates = uniqueBy(allCandidates, (candidate) => candidate.url)
      .filter((candidate) => !candidate.date || candidate.date === targetDate)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.crawler.maxArticlePages);

    const articles = [];
    for (const candidate of candidates) {
      if (debug) console.log(`[article] ${candidate.sectionLabel}: ${candidate.text}`);
      const article = await readArticle(page, candidate, config, targetDate);
      if (article.date === targetDate) articles.push(article);
    }

    return {
      ok: true,
      needLogin: false,
      targetDate,
      crawledAt: new Date().toISOString(),
      articles: uniqueBy(articles, (article) => `${article.date}:${article.url || article.title}`),
      debug: {
        authState: path.relative(config.runtime.repoRoot, storageState),
        candidates: candidates.length,
        sections: Object.fromEntries(
          Array.from(entriesBySection.entries()).map(([name, entries]) => [
            name,
            entries.map((entry) => ({ url: entry.url, source: entry.source, score: entry.score }))
          ])
        )
      }
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
