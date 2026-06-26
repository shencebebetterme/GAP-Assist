# GAP Reference Assistant

This workspace contains a local VS Code extension for GAP.

Features:

- GAP language registration for `.g`, `.gap`, `.gd`, `.gi`, and `.tst` files.
- TextMate syntax highlighting for GAP comments, strings, keywords, constants, operators, declarations, and function calls.
- Semantic highlighting for documented GAP reference symbols.
- Hover documentation for GAP reference manual functions and operations generated from the local GAP 4.15.1 reference manual HTML files.
- Hover links that open the configured local manual page.

## Use In VS Code

Open this folder in VS Code and press `F5` to launch an Extension Development Host, or run VS Code with:

```powershell
code --extensionDevelopmentPath "C:\Users\Ce\Documents\codex_playground\GAP_frontend"
```

Open `examples/sample.g`, then hover names such as `SymmetricGroup`, `Size`, or `IsGroup`.

Hover descriptions are hard-wrapped by default. Adjust `gapReference.hover.wrapColumn` in VS Code settings if you prefer wider or narrower documentation lines.

## Regenerate Documentation Data

The checked-in hover data is generated from:

```text
C:\Programs\GAP-4.15.1\runtime\opt\gap-4.15.1\doc\ref
```

Regenerate it with:

```powershell
npm run extract-docs
```

Or pass a different manual directory:

```powershell
node scripts/extract-gap-docs.js "C:\path\to\gap\doc\ref"
```

If the manual moves after installation, update `gapReference.manualPath` in VS Code settings so hover links open the correct local HTML files.

## Validate

```powershell
npm run validate
```

The generated documentation snippets come from the installed GAP reference manual. Keep GAP documentation licensing in mind if you redistribute the extension.
