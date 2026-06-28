"use strict";

const MAX_HOVER_FIELDS = 8;

function formatInferenceMarkdown(hover) {
  if (!hover || !hover.symbol) {
    return "";
  }

  const symbol = hover.symbol;
  const type = symbol.type;
  const displayName = symbol.name || hover.word.text;
  const lines = [];

  lines.push("```gap");
  if (isFunctionType(type)) {
    lines.push(formatCompactFunctionSignature(symbol, type));
  } else {
    lines.push(`${displayName}: ${formatTypeExpression(type)}`);
  }
  lines.push("```");

  if (isFunctionType(type)) {
    appendFunctionDocumentation(lines, symbol.documentation || (type && type.documentation));
  } else {
    appendValueMembers(lines, type);
  }

  return trimBlankLines(lines).join("\n");
}

function formatCompactFunctionSignature(symbol, type) {
  const returnType = symbol.returnType || (type && type.returnType);
  const params = signatureParameterEntries(symbol, type).map(formatSignatureParameterText).join(", ");
  return `function(${params}) -> ${formatTypeExpression(returnType)}`;
}

function signatureParameterEntries(symbol, type) {
  if (Array.isArray(symbol.parameters) && symbol.parameters.length > 0) {
    return symbol.parameters.map((parameter, index) => ({
      name: parameter.name || `arg${index + 1}`,
      type: parameter.type
    }));
  }

  const names = Array.isArray(type && type.parameters) ? type.parameters : [];
  const parameterTypes = Array.isArray(type && type.parameterTypes) ? type.parameterTypes : [];
  const count = Math.max(names.length, parameterTypes.length);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    entries.push({
      name: names[index] || `arg${index + 1}`,
      type: parameterTypes[index]
    });
  }
  return entries;
}

function formatSignatureParameterText(parameter) {
  return `${parameter.name}: ${formatSignatureTypeText(parameter.type)}`;
}

function formatSignatureTypeText(type) {
  if (!type) {
    return "GAP object";
  }
  if (isGenericTypeLabel(type.label)) {
    return labelFromFilters(type.filters || [], meaningfulFilterLabel(type.filters || []) || "GAP object");
  }
  return formatTypeExpression(type);
}

function appendFunctionDocumentation(lines, documentation) {
  if (!documentation) {
    return;
  }

  const summary = Array.isArray(documentation.summary) ? documentation.summary.filter(Boolean) : [];
  const params = Array.isArray(documentation.params) ? documentation.params : [];
  const returns = Array.isArray(documentation.returns) ? documentation.returns.filter(Boolean) : [];
  if (summary.length === 0 && params.length === 0 && returns.length === 0) {
    return;
  }

  lines.push("", "**Documentation**", "");
  for (const line of summary) {
    lines.push(`> ${escapeMarkdown(line)}`);
  }
  if (summary.length > 0 && (params.length > 0 || returns.length > 0)) {
    lines.push(">");
  }
  for (const parameter of params) {
    const text = parameter.text ? ` ${escapeMarkdown(parameter.text)}` : "";
    lines.push(`> **@param** \`${escapeCode(parameter.name)}\`${text}`);
  }
  for (const item of returns) {
    lines.push(`> **@returns** ${escapeMarkdown(item)}`);
  }
}

function appendValueMembers(lines, type) {
  const rows = formatValueMemberRows(type);
  if (rows.length === 0) {
    return;
  }

  lines.push("", "**Members**", "", "```gap");
  for (const row of rows) {
    lines.push(row);
  }
  lines.push("```");
}

function formatValueMemberRows(type) {
  if (!type) {
    return [];
  }

  const rows = [];
  if (type.element) {
    rows.push(`element: ${formatTypeExpression(type.element)}`);
  }
  if (type.fields) {
    const fieldEntries = Object.entries(type.fields).slice(0, MAX_HOVER_FIELDS);
    for (const [name, fieldType] of fieldEntries) {
      rows.push(`.${name}: ${formatTypeExpression(fieldType)}`);
    }
    const remaining = Object.keys(type.fields).length - fieldEntries.length;
    if (remaining > 0) {
      rows.push(`# ${remaining} more fields`);
    }
  }
  return rows;
}

function formatTypeExpression(type) {
  if (!type) {
    return "unknown";
  }
  if (isFunctionType(type)) {
    const params = Array.isArray(type.parameters) ? type.parameters.join(", ") : "";
    return `function(${params}) -> ${formatTypeExpression(type.returnType)}`;
  }

  const base = formatBaseTypeLabel(type);
  if (type.element) {
    return `${base}[${formatTypeExpression(type.element)}]`;
  }
  return base;
}

function formatBaseTypeLabel(type) {
  if (!type) {
    return "unknown";
  }
  if (isGenericTypeLabel(type.label)) {
    return labelFromFilters(type.filters || [], type.label || "GAP object");
  }
  return type.label || "GAP object";
}

function isFunctionType(type) {
  return Boolean(type && type.returnType);
}

function isGenericTypeLabel(label) {
  return !label
    || /^argument \d+$/.test(label)
    || label === "parameter"
    || label === "unknown parameter"
    || label === "unknown local"
    || label === "unknown GAP object";
}

function meaningfulFilterLabel(filters) {
  const meaningful = (filters || []).filter((filter) => filter !== "IsObject");
  return meaningful.length === 1 ? meaningful[0] : "";
}

function labelFromFilters(filters, fallback) {
  if (filters.includes("IsString")) {
    return "string";
  }
  if (filters.includes("IsBool")) {
    return "boolean";
  }
  if (filters.includes("IsInt") || filters.includes("IsPosInt") || filters.includes("IsNonnegativeInt")) {
    return "integer";
  }
  if (filters.includes("IsRat")) {
    return "rational";
  }
  if (filters.includes("IsPermGroup")) {
    return "permutation group";
  }
  if (filters.includes("IsGroup")) {
    return "group";
  }
  if (filters.includes("IsMagmaWithInverses")) {
    return "group";
  }
  if (filters.includes("IsRingElement") || filters.includes("IsScalar")) {
    return "ring element";
  }
  if (filters.includes("IsPerm")) {
    return "permutation";
  }
  if (filters.includes("IsList")) {
    return "list";
  }
  if (filters.includes("IsListOrCollection")) {
    return "list or collection";
  }
  if (filters.includes("IsCollection")) {
    return "collection";
  }
  if (filters.includes("IsRecord")) {
    return "record";
  }
  if (filters.includes("IsFunction")) {
    return "function";
  }
  return fallback;
}

function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}

function escapeCode(text) {
  return String(text).replace(/`/g, "\\`");
}

function trimBlankLines(lines) {
  const result = [...lines];
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

module.exports = {
  formatInferenceMarkdown
};
