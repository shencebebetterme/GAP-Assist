"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_GAP_ROOT = "C:\\Programs\\GAP-4.15.1\\runtime\\opt\\gap-4.15.1";
const DEFAULT_DOC_DIR = path.join(DEFAULT_GAP_ROOT, "doc", "ref");
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
  const inputPath = path.resolve(process.argv[2] || process.env.GAP_REF_DOC || DEFAULT_DOC_DIR);
  const { gapRoot, refManual, manuals } = discoverManuals(inputPath);

  const entriesByName = {};
  const seen = new Set();
  let filesRead = 0;

  for (const manual of manuals) {
    for (const file of manual.chapterFiles) {
      const fullPath = path.join(manual.manualPath, file);
      const html = fs.readFileSync(fullPath, "utf8");
      const chapterTitle = chapterTitleFromHtml(html, manual);
      const sections = manual.format === "legacy"
        ? extractLegacySections(html, file, chapterTitle, manual)
        : extractSections(html, file, chapterTitle, manual);
      filesRead += 1;

      for (const section of sections) {
        for (const entry of section.entries) {
          const key = `${entry.name}\u0000${entry.signature}\u0000${entry.manualId}\u0000${entry.file}\u0000${entry.anchor}`;
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
  }

  const names = Object.keys(entriesByName).sort((left, right) => left.localeCompare(right));
  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      manualPath: refManual.manualPath,
      gapRoot,
      generator: "scripts/extract-gap-docs.js",
      filesRead,
      manuals: manuals.map(({ chapterFiles, ...manual }) => ({
        ...manual,
        filesRead: chapterFiles.length
      }))
    },
    keywords: KEYWORDS,
    names,
    entries: entriesByName
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(`${OUTPUT_FILE}.tmp`, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(`${OUTPUT_FILE}.tmp`, OUTPUT_FILE);

  const packageManualCount = manuals.filter((manual) => manual.type === "package").length;
  console.log(`Extracted ${seen.size} GAP documentation entries for ${names.length} names from ${filesRead} chapters.`);
  console.log(`Manuals read: 1 reference manual and ${packageManualCount} package manuals.`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

function discoverManuals(inputPath) {
  const resolvedInput = path.resolve(inputPath);
  const inputRefManual = path.join(resolvedInput, "doc", "ref");
  const refManualPath = fs.existsSync(inputRefManual) ? inputRefManual : resolvedInput;
  if (!fs.existsSync(refManualPath)) {
    fail(`GAP reference manual directory does not exist: ${refManualPath}`);
  }

  const gapRoot = fs.existsSync(inputRefManual)
    ? resolvedInput
    : deriveGapRootFromRefManual(refManualPath);

  const refManual = createManual({
    id: "ref",
    type: "reference",
    label: "GAP reference manual",
    manualPath: refManualPath,
    gapRoot
  });
  if (refManual.chapterFiles.length === 0) {
    fail(`No chapter HTML files found in ${refManualPath}`);
  }

  const manuals = [refManual];
  if (process.env.GAP_DOCS_INCLUDE_PACKAGES !== "0" && gapRoot) {
    const packageRoot = path.resolve(process.env.GAP_PKG_DIR || path.join(gapRoot, "pkg"));
    manuals.push(...discoverPackageManuals(packageRoot, gapRoot));
  }

  return { gapRoot, refManual, manuals };
}

function deriveGapRootFromRefManual(refManualPath) {
  const parent = path.basename(path.dirname(refManualPath)).toLowerCase();
  const basename = path.basename(refManualPath).toLowerCase();
  if (parent === "doc" && basename === "ref") {
    return path.dirname(path.dirname(refManualPath));
  }
  return undefined;
}

function discoverPackageManuals(packageRoot, gapRoot) {
  if (!fs.existsSync(packageRoot)) {
    return [];
  }

  return fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => discoverPackageManualsForPackage(packageRoot, entry.name, gapRoot))
    .sort((left, right) => left.packageName.localeCompare(right.packageName) || left.id.localeCompare(right.id));
}

function discoverPackageManualsForPackage(packageRoot, packageName, gapRoot) {
  const packagePath = path.join(packageRoot, packageName);
  const gapDocPath = path.join(packagePath, "doc");
  if (fs.existsSync(gapDocPath)) {
    const gapDocManual = createManual({
      id: `pkg:${packageName}`,
      type: "package",
      format: "gapdoc",
      label: `${packageName} package manual`,
      packageName,
      manualPath: gapDocPath,
      gapRoot
    });
    if (gapDocManual.chapterFiles.length > 0) {
      return [gapDocManual];
    }
  }

  return discoverLegacyPackageManualPaths(packagePath).map((manualPath) => {
    const suffix = legacyManualIdSuffix(packagePath, manualPath);
    return createManual({
      id: suffix ? `pkg:${packageName}:${suffix}` : `pkg:${packageName}`,
      type: "package",
      format: "legacy",
      label: suffix ? `${packageName} package ${suffix} manual` : `${packageName} package manual`,
      packageName,
      manualPath,
      gapRoot
    });
  });
}

function discoverLegacyPackageManualPaths(packagePath) {
  const candidates = [
    path.join(packagePath, "htm"),
    path.join(packagePath, "doc", "htm", "ref"),
    path.join(packagePath, "doc", "htm", "tut")
  ];
  return candidates.filter((manualPath) => {
    return fs.existsSync(manualPath) && fs.readdirSync(manualPath).some(isLegacyChapterHtmlFile);
  });
}

function legacyManualIdSuffix(packagePath, manualPath) {
  const relative = normalizeRelativePath(path.relative(packagePath, manualPath)).toLowerCase();
  if (relative === "htm" || relative === "doc/htm/ref") {
    return "";
  }
  return relative.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createManual({ id, type, format = "gapdoc", label, packageName, manualPath, gapRoot }) {
  const chapterFiles = fs.readdirSync(manualPath)
    .filter(format === "legacy" ? isLegacyChapterHtmlFile : isChapterHtmlFile)
    .sort(compareChapterFiles);
  return {
    id,
    type,
    format,
    label,
    packageName,
    manualPath,
    manualRelativePath: gapRoot ? normalizeRelativePath(path.relative(gapRoot, manualPath)) : undefined,
    chapterFiles
  };
}

function extractSections(html, file, chapterTitle, manual) {
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
      manualId: manual.id,
      manualLabel: manual.label,
      manualType: manual.type,
      manualRelativePath: manual.manualRelativePath,
      packageName: manual.packageName,
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

function extractLegacySections(html, file, chapterTitle, manual) {
  const sections = [];
  const sectionPattern =
    /<h2>\s*<a\s+name\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/a>\s*<\/h2>([\s\S]*?)(?=<h2>\s*<a\s+name\s*=|<\/body>)/gi;
  let match;

  while ((match = sectionPattern.exec(html)) !== null) {
    const [, sectionAnchor, rawHeading, body] = match;
    const heading = cleanText(rawHeading);
    const sectionNumber = sectionNumberFromHeading(heading);
    const title = heading.replace(sectionNumber, "").trim();
    const hoverBlocks = extractLegacyHoverBlocks(body);
    const description = hoverBlocks
      .filter((block) => block.type === "paragraph")
      .map((block) => markdownToPlainText(block.markdown))
      .join("\n\n");
    const entries = extractLegacyFunctionBlocks(body, sectionAnchor).map((func) => ({
      name: func.name,
      kind: func.kind,
      signature: func.signature,
      description,
      blocks: hoverBlocks,
      section: sectionNumber,
      title,
      chapterTitle,
      manualId: manual.id,
      manualLabel: manual.label,
      manualType: manual.type,
      manualRelativePath: manual.manualRelativePath,
      packageName: manual.packageName,
      file,
      anchor: func.anchor || sectionAnchor
    }));

    if (entries.length > 0) {
      sections.push({
        anchor: sectionAnchor,
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

function extractLegacyFunctionBlocks(body, sectionAnchor) {
  const blocks = [];
  const blockPattern =
    /(?:<a\s+name\s*=\s*"([^"]+)"\s*><\/a>\s*)?<li>\s*([\s\S]*?)(?=<p\b|<a\s+name\s*=|<li\b|<\/(?:ul|ol)>|<\/body>)/gi;
  let match;

  while ((match = blockPattern.exec(body)) !== null) {
    const [, anchor, rawSignature] = match;
    const parsed = parseLegacySignature(rawSignature);
    if (!parsed) {
      continue;
    }

    blocks.push({
      anchor: anchor || sectionAnchor,
      name: parsed.name,
      kind: parsed.kind,
      signature: parsed.signature
    });
  }

  return blocks;
}

function parseLegacySignature(rawSignature) {
  if (!/<code\b/i.test(rawSignature)) {
    return undefined;
  }

  let signature = cleanSignature(cleanText(rawSignature));
  if (!signature) {
    return undefined;
  }

  const kindMatch = /\s+([A-Z])$/.exec(signature);
  const kind = kindMatch ? legacyKindFromCode(kindMatch[1]) : "";
  if (kindMatch) {
    signature = signature.slice(0, kindMatch.index).trim();
  }

  const nameMatch = /^([A-Za-z_][A-Za-z0-9_!]*)\s*(?:\(|$)/.exec(signature);
  if (!nameMatch) {
    return undefined;
  }

  return {
    name: nameMatch[1],
    kind,
    signature
  };
}

function legacyKindFromCode(code) {
  return (
    {
      A: "attribute",
      C: "category",
      F: "function",
      G: "global variable",
      O: "operation",
      P: "property",
      R: "representation",
      V: "variable"
    }[code] || ""
  );
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

function extractLegacyHoverBlocks(body) {
  const withoutSignatures = body.replace(
    /(?:<a\s+name\s*=\s*"[^"]+"\s*><\/a>\s*)?<li>\s*<code>[\s\S]*?(?=<p\b|<a\s+name\s*=|<li\b|<\/(?:ul|ol)>|<\/body>)/gi,
    " "
  );
  const blocks = [];
  const state = { paragraphCount: 0 };
  const blockPattern = /<pre>([\s\S]*?)<\/pre>/gi;
  let cursor = 0;
  let match;

  while ((match = blockPattern.exec(withoutSignatures)) !== null) {
    appendLegacyParagraphBlocks(withoutSignatures.slice(cursor, match.index), blocks, state);

    const code = cleanPreText(match[1]);
    if (code) {
      blocks.push({
        type: "example",
        code
      });
    }

    if (blocks.length >= MAX_BLOCKS || blocksTextLength(blocks) >= MAX_DESCRIPTION_LENGTH) {
      return blocks;
    }

    cursor = blockPattern.lastIndex;
  }

  appendLegacyParagraphBlocks(withoutSignatures.slice(cursor), blocks, state);
  return blocks;
}

function appendLegacyParagraphBlocks(html, blocks, state) {
  const normalized = html
    .replace(/<h[1-6]\b[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\n\n")
    .replace(/<p\b[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");

  for (const rawParagraph of normalized.split(/\n{2,}/)) {
    if (state.paragraphCount >= MAX_PARAGRAPHS) {
      return;
    }
    if (blocks.length >= MAX_BLOCKS || blocksTextLength(blocks) >= MAX_DESCRIPTION_LENGTH) {
      return;
    }

    const markdown = cleanParagraphMarkdown(rawParagraph);
    if (!markdown) {
      continue;
    }

    blocks.push({
      type: "paragraph",
      markdown
    });
    state.paragraphCount += 1;
  }
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

function chapterTitleFromHtml(html, manual) {
  const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(html);
  if (!titleMatch) {
    return manual.label;
  }

  const title = cleanText(titleMatch[1]);
  const chapterMatch = /(?:GAP \([^)]+\) - )?Chapter [^:]+:\s*([\s\S]*)/.exec(title);
  return chapterMatch ? chapterMatch[1].trim() : title;
}

function sectionNumberFromHeading(heading) {
  const match = /^(?:\d+|[A-Z])(?:\.\d+)*(?:-\d+)?/.exec(heading);
  return match ? match[0] : "";
}

function compareChapterFiles(left, right) {
  const leftKey = chapterSortKey(left);
  const rightKey = chapterSortKey(right);
  if (leftKey.kind !== rightKey.kind) {
    return leftKey.kind - rightKey.kind;
  }
  if (leftKey.value !== rightKey.value) {
    return leftKey.value < rightKey.value ? -1 : 1;
  }
  return left.localeCompare(right);
}

function chapterSortKey(file) {
  const match = /^chap([A-Za-z0-9]+)\.html?$/i.exec(file);
  const chapter = match ? match[1] : "";
  if (/^\d+$/.test(chapter)) {
    return { kind: 0, value: Number.parseInt(chapter, 10) };
  }
  return { kind: 1, value: chapter.toUpperCase() };
}

function isChapterHtmlFile(file) {
  if (!/^chap[A-Za-z0-9]+\.html$/i.test(file)) {
    return false;
  }
  return !/^chap(?:Ind|Bib)\.html$/i.test(file);
}

function isLegacyChapterHtmlFile(file) {
  return /^CHAP[A-Z0-9]+\.htm$/i.test(file);
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
