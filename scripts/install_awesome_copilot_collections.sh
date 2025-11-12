#!/usr/bin/env bash
set -euo pipefail

# Installer for selected awesome-copilot collections (frontend, testing, database, security)
# Downloads raw files from the GitHub awesome-copilot repo into this repository.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="$ROOT_DIR"

declare -a files=(
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/angular.instructions.md|instructions/angular.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/nodejs-javascript-vitest.instructions.md|instructions/nodejs-javascript-vitest.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/electron-angular-native.chatmode.md|chatmodes/electron-angular-native.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/expert-react-frontend-engineer.chatmode.md|chatmodes/expert-react-frontend-engineer.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/nextjs-tailwind.instructions.md|instructions/nextjs-tailwind.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/nextjs.instructions.md|instructions/nextjs.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/reactjs.instructions.md|instructions/reactjs.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/tanstack-start-shadcn-tailwind.instructions.md|instructions/tanstack-start-shadcn-tailwind.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/playwright-generate-test.prompt.md|prompts/playwright-generate-test.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/playwright-explore-website.prompt.md|prompts/playwright-explore-website.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/vuejs3.instructions.md|instructions/vuejs3.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/ai-prompt-engineering-safety-review.prompt.md|prompts/ai-prompt-engineering-safety-review.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/java-junit.prompt.md|prompts/java-junit.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/csharp-nunit.prompt.md|prompts/csharp-nunit.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/playwright-python.instructions.md|instructions/playwright-python.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/playwright-tester.chatmode.md|chatmodes/playwright-tester.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/playwright-typescript.instructions.md|instructions/playwright-typescript.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/tdd-green.chatmode.md|chatmodes/tdd-green.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/tdd-red.chatmode.md|chatmodes/tdd-red.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/tdd-refactor.chatmode.md|chatmodes/tdd-refactor.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/ms-sql-dba.chatmode.md|chatmodes/ms-sql-dba.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/ms-sql-dba.instructions.md|instructions/ms-sql-dba.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/postgresql-code-review.prompt.md|prompts/postgresql-code-review.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/postgresql-dba.chatmode.md|chatmodes/postgresql-dba.chatmode.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/postgresql-optimization.prompt.md|prompts/postgresql-optimization.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/sql-code-review.prompt.md|prompts/sql-code-review.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/sql-sp-generation.instructions.md|instructions/sql-sp-generation.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/prompts/sql-optimization.prompt.md|prompts/sql-optimization.prompt.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/a11y.instructions.md|instructions/a11y.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/object-calisthenics.instructions.md|instructions/object-calisthenics.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/performance-optimization.instructions.md|instructions/performance-optimization.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/security-and-owasp.instructions.md|instructions/security-and-owasp.instructions.md"
    "https://raw.githubusercontent.com/github/awesome-copilot/main/instructions/self-explanatory-code-commenting.instructions.md|instructions/self-explanatory-code-commenting.instructions.md"
)

echo "Installing awesome-copilot collection assets into: $DEST_DIR"

for entry in "${files[@]}"; do
    url="${entry%%|*}"
    path="${entry##*|}"
    dest="$DEST_DIR/$path"
    dir="$(dirname "$dest")"
    mkdir -p "$dir"
    echo "Downloading $url -> $path"
    # Use curl with fail and location
    if curl -fsSL "$url" -o "$dest"; then
        echo "  -> saved $path"
    else
        echo "  -> FAILED to download $url" >&2
        exit 2
    fi
done

echo "All assets downloaded."
echo "Next steps: review files in prompts/, instructions/, chatmodes/ and commit them."

exit 0
