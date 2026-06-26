"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_DOC_DIR = "C:\\Programs\\GAP-4.15.1\\runtime\\opt\\gap-4.15.1\\doc\\ref";
const OUTPUT_FILE = path.join(__dirname, "..", "data", "gap-docs.json");
const MAX_BLOCKS = 5;
const MAX_PARAGRAPHS = 4;
const MAX_DESCRIPTION_LENGTH = 1600;

const KEYWORDS = [
  "and",
  "atomic",
  "break",
  "catch",
  "continue",
  "do",
  "elif",
  "else",
  "end",
  "fail",
  "false",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "infinity",
  "local",
  "mod",
  "not",
  "od",
  "or",
  "readonly",
  "readwrite",
  "rec",
  "repeat",
  "return",
  "then",
  "true",
  "try",
  "until",
  "while"
];

function main() {
  const docDir = path.resolve(process.argv[2] || process.env.GAP_REF_DOC || DEFAULT_DOC_DIR);
  if (!fs.existsSync(docDir)) {
    fail(`GAP reference manual directory does not exist: ${docDir}`);
  }

  const chapterFiles = fs
    .readdirSync(docDir)
    .filter((file) => /^chap\d+\.html$/.test(file))
    .sort(compareChapterFiles);

  if (chapterFiles.length === 0) {
    fail(`No chapter HTML files found in ${docDir}`);
  }

  const entriesByName = {};
  const seen = new Set();

  for (const file of chapterFiles) {
    const fullPath = path.join(docDir, file);
    const html = fs.readFileSync(fullPath, "utf8");
    const chapterTitle = chapterTitleFromHtml(html);
    const sections = extractSections(html, file, chapterTitle);

    for (const section of sections) {
      for (const entry of section.entries) {
        const key = `${entry.name}\u0000${entry.signature}\u0000${entry.file}\u0000${entry.anchor}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        if (!entriesByName[entry.name]) {
          entriesByName[entry.name] = [];
        }
        entriesByName[entry.name].push(entry);
      }
    }
  }

  const names = Object.keys(entriesByName).sort((left, right) => left.localeCompare(right));
  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      manualPath: docDir,
      generator: "scripts/extract-gap-docs.js",
      filesRead: chapterFiles.length
    },
    keywords: KEYWORDS,
    names,
    entries: entriesByName
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(`${OUTPUT_FILE}.tmp`, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(`${OUTPUT_FILE}.tmp`, OUTPUT_FILE);

  console.log(`Extracted ${seen.size} GAP reference entries for ${names.length} names from ${chapterFiles.length} chapters.`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

function extractSections(html, file, chapterTitle) {
  const sections = [];
  const sectionPattern =
    /<p><a id="([^"]+)" name="[^"]*"><\/a><\/p>\s*<h5>([\s\S]*?)<\/h5>([\s\S]*?)(?=<p><a id="[^"]+" name="[^"]*"><\/a><\/p>\s*<h[345]|<div class="chlinkprevnextbot"|<\/body>)/g;
  let match;

  while ((match = sectionPattern.exec(html)) !== null) {
    const [, anchor, rawHeading, body] = match;
    const heading = cleanText(rawHeading);
    const sectionNumber = sectionNumberFromHeading(heading);
    const title = heading.replace(sectionNumber, "").trim();
    const hoverBlocks = extractHoverBlocks(body);
    const description = hoverBlocks
      .filter((block) => block.type === "paragraph")
      .map((block) => markdownToPlainText(block.markdown))
      .join("\n\n");
    const entries = extractFunctionBlocks(body).map((func) => ({
      name: func.name,
      kind: func.kind,
      signature: func.signature,
      description,
      blocks: hoverBlocks,
      section: sectionNumber,
      title,
      chapterTitle,
      file,
      anchor
    }));

    if (entries.length > 0) {
      sections.push({
        anchor,
        heading,
        entries
      });
    }
  }

  return sections;
}

function extractFunctionBlocks(body) {
  const blocks = [];
  const blockPattern = /<div class="func">([\s\S]*?)<\/div>/g;
  let match;

  while ((match = blockPattern.exec(body)) !== null) {
    const block = match[1];
    const leftMatch = /<td class="tdleft">([\s\S]*?)<\/td>/.exec(block);
    if (!leftMatch) {
      continue;
    }

    const nameMatch = /<code class="func">(?:&#8227;\s*)?([\s\S]*?)<\/code>/.exec(leftMatch[1]);
    if (!nameMatch) {
      continue;
    }

    const name = cleanText(nameMatch[1]);
    if (!name) {
      continue;
    }

    const kindMatch = /<td class="tdright">\(&nbsp;([\s\S]*?)&nbsp;\)<\/td>/.exec(block);
    const kind = kindMatch ? cleanText(kindMatch[1]).toLowerCase() : "";
    const signature = cleanSignature(cleanText(leftMatch[1]));

    blocks.push({
      name,
      kind,
      signature
    });
  }

  return blocks;
}

function extractHoverBlocks(body) {
  const withoutSignatures = body.replace(/<div class="func">[\s\S]*?<\/div>/g, " ");
  const blocks = [];
  const blockPattern = /<p>([\s\S]*?)<\/p>|<div class="example"><pre>([\s\S]*?)<\/pre><\/div>/g;
  let paragraphCount = 0;
  let match;

  while ((match = blockPattern.exec(withoutSignatures)) !== null) {
    if (match[1] !== undefined) {
      if (paragraphCount >= MAX_PARAGRAPHS) {
        continue;
      }

      const markdown = cleanParagraphMarkdown(match[1]);
      if (!markdown) {
        continue;
      }

      blocks.push({
        type: "paragraph",
        markdown
      });
      paragraphCount += 1;
    } else if (match[2] !== undefined) {
      const code = cleanPreText(match[2]);
      if (!code) {
        continue;
      }

      blocks.push({
        type: "example",
        code
      });
    }

    if (blocks.length >= MAX_BLOCKS || blocksTextLength(blocks) >= MAX_DESCRIPTION_LENGTH) {
      break;
    }
  }

  return blocks;
}

function blocksTextLength(blocks) {
  return blocks.reduce((sum, block) => sum + (block.markdown || block.code || "").length, 0);
}

function cleanSignature(text) {
  return text
    .replace(/^‣\s*/, "")
    .replace(/\s+([)\],])/g, "$1")
    .replace(/([(,[])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>\s*<p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanParagraphMarkdown(html) {
  return htmlToMarkdown(html)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function cleanPreText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(html) {
  return decodeHtml(
    html
      .replace(/<code class="(?:func|code|keyw)">([\s\S]*?)<\/code>/g, (_, content) => `\`${cleanText(content)}\``)
      .replace(/<var class="Arg">([\s\S]*?)<\/var>/g, (_, content) => `_${cleanText(content)}_`)
      .replace(/<strong class="pkg">([\s\S]*?)<\/strong>/g, (_, content) => `**${cleanText(content)}**`)
      .replace(/<em>([\s\S]*?)<\/em>/g, (_, content) => `_${cleanText(content)}_`)
      .replace(/<span class="SimpleMath">([\s\S]*?)<\/span>/g, (_, content) => `_${cleanText(content)}_`)
      .replace(/<span class="RefLink">([\s\S]*?)<\/span>/g, (_, content) => cleanText(content))
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
  );
}

function markdownToPlainText(markdown) {
  return markdown
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function decodeHtml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function chapterTitleFromHtml(html) {
  const titleMatch = /<title>GAP \(ref\) - Chapter \d+: ([\s\S]*?)<\/title>/.exec(html);
  return titleMatch ? cleanText(titleMatch[1]) : "";
}

function sectionNumberFromHeading(heading) {
  const match = /^\d+(?:\.\d+)*(?:-\d+)?/.exec(heading);
  return match ? match[0] : "";
}

function compareChapterFiles(left, right) {
  return chapterNumber(left) - chapterNumber(right);
}

function chapterNumber(file) {
  const match = /^chap(\d+)\.html$/.exec(file);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
